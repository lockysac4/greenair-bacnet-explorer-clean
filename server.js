const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const VERSION = '0.5.0';
const PORT = Number(process.env.PORT || 10000);
const BMS_HOST = process.env.BMS_HOST || 'bms.biancoprecast.com.au';
const TCP_TIMEOUT_MS = Number(process.env.TCP_TIMEOUT_MS || 4500);

const systems = {
  planks: {
    id:'planks', name:'Bianco Planks', host:BMS_HOST,
    port:Number(process.env.PLANKS_PORT || 502), unitId:Number(process.env.PLANKS_UNIT_ID || 69),
    inputs:[
      {id:'in1',name:'Planks In',kind:'signed32Analog',highRegister:7484,register:7485,units:'°C'},
      {id:'in2',name:'Planks Out',kind:'signed32Analog',highRegister:7486,register:7487,units:'°C'},
      {id:'ambient',name:'Ambient',kind:'signed32Analog',highRegister:7488,register:7489,units:'°C'},
      {id:'concrete',name:'Planks Concrete',kind:'signed32Analog',highRegister:7490,register:7491,units:'°C'},
      {id:'tank',name:'Planks Tank',kind:'signed32Analog',highRegister:7492,register:7493,units:'°C'},
      {id:'diff',name:'Ambient - Concrete Differential',kind:'signed32Analog',highRegister:7502,register:7503,units:'°C'}
    ],
    outputs:[
      {id:'boilerOverride',name:'Boiler Override / Fault register',kind:'uint16',register:8115,units:'0/1'},
      {id:'pumpOverride',name:'Pump Override',kind:'uint16',register:8113,units:'0/1'},
      {id:'lossWaterFlow',name:'Loss of Water Flow',kind:'uint16',register:8117,units:'0/1'},
      {id:'secondaryPump',name:'Secondary Pump',kind:'uint16',register:7117,units:'%'},
      {id:'appOverride',name:'AUTO / MANUAL',kind:'uint16',register:8111,units:'0/1'}
    ],
    variables:[
      {id:'ambientDifferentialLegacy',name:'Ambient differential (legacy mapping)',kind:'uint16',register:952,units:'raw',note:'Known Bravo/T3000 variable mapping from the Windows project; decode/scaling to be verified live.'}
    ]
  },
  tbeams: {
    id:'tbeams', name:'Bianco T-Beams', host:BMS_HOST,
    port:Number(process.env.TBEAMS_PORT || 505), unitId:Number(process.env.TBEAMS_UNIT_ID || 68),
    inputs:[
      {id:'in1',name:'T-Beams In',kind:'signed32Analog',highRegister:7484,register:7485,units:'°C'},
      {id:'in2',name:'T-Beams Out',kind:'signed32Analog',highRegister:7486,register:7487,units:'°C'},
      {id:'ambient',name:'Ambient',kind:'signed32Analog',highRegister:8136,register:8137,units:'°C'},
      {id:'concrete',name:'T-Beams Concrete',kind:'signed32Analog',highRegister:7490,register:7491,units:'°C'},
      {id:'tank',name:'T-Beams Tank',kind:'signed32Analog',highRegister:7492,register:7493,units:'°C'},
      {id:'diff',name:'Ambient - Concrete Differential',kind:'signed32Analog',highRegister:7502,register:7503,units:'°C'}
    ],
    outputs:[
      {id:'boilerOverride',name:'Boiler Override / Fault register',kind:'uint16',register:8115,units:'0/1'},
      {id:'pumpOverride',name:'Pump Override',kind:'uint16',register:8113,units:'0/1'},
      {id:'lossWaterFlow',name:'Loss of Water Flow',kind:'uint16',register:8117,units:'0/1'},
      {id:'appOverride',name:'AUTO / MANUAL',kind:'uint16',register:8111,units:'0/1'}
    ],
    variables:[]
  }
};

let transactionId = 1;
const nextTx = () => { transactionId=(transactionId%0xffff)+1; return transactionId; };

function modbusReadHolding({host,port,unitId,startRegister,quantity,timeoutMs=TCP_TIMEOUT_MS}) {
  return new Promise((resolve,reject)=>{
    const tx=nextTx();
    const req=Buffer.alloc(12);
    req.writeUInt16BE(tx,0); req.writeUInt16BE(0,2); req.writeUInt16BE(6,4);
    req.writeUInt8(unitId,6); req.writeUInt8(3,7); req.writeUInt16BE(startRegister,8); req.writeUInt16BE(quantity,10);
    const socket=net.createConnection({host,port}); const chunks=[]; let settled=false;
    const finish=(err,value)=>{if(settled)return;settled=true;socket.destroy();err?reject(err):resolve(value)};
    socket.setTimeout(timeoutMs);
    socket.on('connect',()=>socket.write(req));
    socket.on('timeout',()=>finish(new Error(`TCP timeout ${host}:${port} unit ${unitId}`)));
    socket.on('error',err=>finish(err));
    socket.on('data',chunk=>{
      chunks.push(chunk); const buf=Buffer.concat(chunks); if(buf.length<9)return;
      const frameLength=6+buf.readUInt16BE(4); if(buf.length<frameLength)return;
      if(buf.readUInt16BE(0)!==tx)return finish(new Error('Modbus transaction ID mismatch'));
      const fn=buf.readUInt8(7); if(fn&0x80)return finish(new Error(`Modbus exception ${buf.readUInt8(8)}`));
      if(fn!==3)return finish(new Error(`Unexpected Modbus function ${fn}`));
      const byteCount=buf.readUInt8(8); if(byteCount!==quantity*2)return finish(new Error(`Unexpected byte count ${byteCount}`));
      const regs=[]; for(let i=0;i<quantity;i++)regs.push(buf.readUInt16BE(9+i*2));
      finish(null,{registers:regs,rawHex:buf.subarray(0,frameLength).toString('hex').toUpperCase()});
    });
  });
}

function decodeSigned32(high,low,scale=1000){const u=(BigInt(high)<<16n)|BigInt(low);const s=(u&0x80000000n)?u-0x100000000n:u;return Number(s)/scale}
async function readPoint(system,point){
  if(point.kind==='signed32Analog'){
    const start=Math.min(point.highRegister,point.register); const qty=Math.abs(point.register-point.highRegister)+1;
    const result=await modbusReadHolding({host:system.host,port:system.port,unitId:system.unitId,startRegister:start,quantity:qty});
    const hi=result.registers[point.highRegister-start],lo=result.registers[point.register-start];
    return {...point,value:decodeSigned32(hi,lo),raw:[hi,lo],rawHex:result.rawHex,ok:true};
  }
  if(point.kind==='uint16'){
    const result=await modbusReadHolding({host:system.host,port:system.port,unitId:system.unitId,startRegister:point.register,quantity:1});
    return {...point,value:result.registers[0],raw:[result.registers[0]],rawHex:result.rawHex,ok:true};
  }
  throw new Error(`Unsupported point kind ${point.kind}`);
}
async function readCategory(id,category){
  const system=systems[id]; if(!system)throw new Error('Unknown system');
  const defs=system[category]; if(!Array.isArray(defs))throw new Error('Unknown category');
  const started=Date.now(); const points=[];
  for(const point of defs){try{points.push(await readPoint(system,point))}catch(err){points.push({...point,value:null,ok:false,error:err.message})}}
  const okCount=points.filter(p=>p.ok).length;
  return {id:system.id,name:system.name,category,host:system.host,port:system.port,unitId:system.unitId,online:defs.length?okCount>0:true,okCount,pointCount:points.length,elapsedMs:Date.now()-started,timestamp:new Date().toISOString(),points};
}
async function connectionTest(system){const started=Date.now();try{const p=system.inputs[0],point=await readPoint(system,p);return{id:system.id,name:system.name,online:true,host:system.host,port:system.port,unitId:system.unitId,elapsedMs:Date.now()-started,sample:{name:p.name,value:point.value,units:p.units}}}catch(err){return{id:system.id,name:system.name,online:false,host:system.host,port:system.port,unitId:system.unitId,elapsedMs:Date.now()-started,error:err.message}}}

function decodeProgramBuffer(buf){
  const printable=[]; let current='';
  for(const b of buf){if((b>=32&&b<=126)||b===9){current+=String.fromCharCode(b)}else{if(current.trim().length>=3)printable.push(current.trim());current=''}}
  if(current.trim().length>=3)printable.push(current.trim());
  const lines=[]; for(const s of printable){if(!lines.includes(s))lines.push(s)}
  return {byteLength:buf.length,printableStrings:lines,preview:lines.join('\n'),note:'Heuristic preview only. Full Temco/Bravo token decode is the next decoder stage; raw bytes are preserved exactly.'};
}

function sendJson(res,status,obj){const body=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store'});res.end(body)}
function serveStatic(req,res){let rel=req.url.split('?')[0];if(rel==='/')rel='/index.html';const safe=path.normalize(rel).replace(/^([.][.][/\\])+/,'');const file=path.join(__dirname,'public',safe);if(!file.startsWith(path.join(__dirname,'public'))){res.writeHead(403);return res.end('Forbidden')}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}const ext=path.extname(file).toLowerCase();const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data)})}
async function readBody(req,max=1024*1024){return await new Promise((resolve,reject)=>{let size=0;const chunks=[];req.on('data',c=>{size+=c.length;if(size>max){reject(new Error('Request too large'));req.destroy();return}chunks.push(c)});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)})}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(u.pathname==='/api/status')return sendJson(res,200,{ok:true,app:'Greenair BACnet Explorer Web',version:VERSION,transport:'Modbus TCP via Render',readOnly:true,systems:Object.values(systems).map(s=>({id:s.id,name:s.name,host:s.host,port:s.port,unitId:s.unitId}))});
    if(u.pathname==='/api/connect'){const results=await Promise.all(Object.values(systems).map(connectionTest));return sendJson(res,200,{ok:results.some(r=>r.online),timestamp:new Date().toISOString(),results})}
    const cat=u.pathname.match(/^\/api\/system\/(planks|tbeams)\/(inputs|outputs|variables)$/); if(cat)return sendJson(res,200,await readCategory(cat[1],cat[2]));
    const raw=u.pathname.match(/^\/api\/raw\/(planks|tbeams)$/); if(raw){const s=systems[raw[1]],register=Number(u.searchParams.get('register')),quantity=Math.min(64,Math.max(1,Number(u.searchParams.get('quantity')||1)));if(!Number.isInteger(register)||register<0||register>65535)return sendJson(res,400,{error:'register must be 0..65535'});const result=await modbusReadHolding({host:s.host,port:s.port,unitId:s.unitId,startRegister:register,quantity});return sendJson(res,200,{system:s.id,host:s.host,port:s.port,unitId:s.unitId,register,quantity,...result})}
    if(u.pathname==='/api/program/decode'&&req.method==='POST'){const body=await readBody(req);let input;try{input=JSON.parse(body.toString('utf8'))}catch{return sendJson(res,400,{error:'JSON body required'})}const hex=String(input.hex||'').replace(/[^0-9a-f]/gi,'');if(!hex||hex.length%2)return sendJson(res,400,{error:'Enter an even number of hexadecimal characters'});const buf=Buffer.from(hex,'hex');return sendJson(res,200,{ok:true,rawHex:buf.toString('hex').toUpperCase(),...decodeProgramBuffer(buf)})}
    if(u.pathname.startsWith('/api/'))return sendJson(res,404,{error:'API route not found'});
    serveStatic(req,res);
  }catch(err){console.error('[Explorer]',err);sendJson(res,500,{error:err.message||String(err)})}
});
server.listen(PORT,'0.0.0.0',()=>{console.log(`Greenair BACnet Explorer Web v${VERSION}`);console.log(`Listening on 0.0.0.0:${PORT}`);for(const s of Object.values(systems))console.log(`${s.name} -> ${s.host}:${s.port} unit ${s.unitId}`)});
