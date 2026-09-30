const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const VERSION = '0.6.0';
const PORT = Number(process.env.PORT || 10000);
const BMS_HOST = process.env.BMS_HOST || 'bms.biancoprecast.com.au';
const TCP_TIMEOUT_MS = Number(process.env.TCP_TIMEOUT_MS || 4500);
const ENABLE_WRITES = /^(1|true|yes)$/i.test(process.env.ENABLE_WRITES || 'false');

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
      {id:'diff',name:'Concrete - Ambient Differential',kind:'signed32Analog',highRegister:7502,register:7503,units:'°C'}
    ],
    outputs:[
      {id:'boilerEnable',name:'Boiler Override',kind:'uint16',register:8115,units:'0/1',writable:true,min:0,max:1},
      {id:'pumpEnable',name:'Pump Override',kind:'uint16',register:8113,units:'0/1',writable:true,min:0,max:1},
      {id:'lossWaterFlow',name:'Loss of Water Flow',kind:'uint16',register:8117,units:'0/1',writable:false},
      {id:'secondaryPump',name:'Secondary Pump',kind:'uint16',register:7117,units:'%',writable:true,min:0,max:100},
      {id:'appOverride',name:'AUTO / MANUAL',kind:'uint16',register:8111,units:'0/1',writable:true,min:0,max:1}
    ],
    variables:[
      {id:'ambientDifferential',name:'Ambient differential',kind:'uint16',register:952,units:'raw',note:'Known Bravo/T3000 variable register from the Windows project. Scaling is intentionally left raw until verified.'}
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
      {id:'diff',name:'Concrete - Ambient Differential',kind:'signed32Analog',highRegister:7502,register:7503,units:'°C'}
    ],
    outputs:[
      {id:'boilerEnable',name:'Boiler Override',kind:'uint16',register:8115,units:'0/1',writable:true,min:0,max:1},
      {id:'pumpEnable',name:'Pump Override',kind:'uint16',register:8113,units:'0/1',writable:true,min:0,max:1},
      {id:'lossWaterFlow',name:'Loss of Water Flow',kind:'uint16',register:8117,units:'0/1',writable:false},
      {id:'appOverride',name:'AUTO / MANUAL',kind:'uint16',register:8111,units:'0/1',writable:true,min:0,max:1}
    ],
    variables:[]
  }
};

let transactionId = 1;
const nextTx = () => { transactionId=(transactionId%0xffff)+1; return transactionId; };
function makeRequest(unitId, fn, register, valueOrQty){
  const tx=nextTx(), req=Buffer.alloc(12);
  req.writeUInt16BE(tx,0); req.writeUInt16BE(0,2); req.writeUInt16BE(6,4); req.writeUInt8(unitId,6); req.writeUInt8(fn,7); req.writeUInt16BE(register,8); req.writeUInt16BE(valueOrQty,10);
  return {tx,req};
}
function socketExchange({host,port,request,tx,timeoutMs=TCP_TIMEOUT_MS}){
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host,port}); const chunks=[]; let settled=false;
    const finish=(err,val)=>{if(settled)return;settled=true;socket.destroy();err?reject(err):resolve(val)};
    socket.setTimeout(timeoutMs); socket.on('connect',()=>socket.write(request)); socket.on('timeout',()=>finish(new Error(`TCP timeout ${host}:${port}`))); socket.on('error',finish);
    socket.on('data',chunk=>{chunks.push(chunk);const buf=Buffer.concat(chunks);if(buf.length<9)return;const frameLength=6+buf.readUInt16BE(4);if(buf.length<frameLength)return;if(buf.readUInt16BE(0)!==tx)return finish(new Error('Modbus transaction ID mismatch'));finish(null,buf.subarray(0,frameLength));});
  });
}
async function modbusReadHolding({host,port,unitId,startRegister,quantity}){
  if(!Number.isInteger(quantity)||quantity<1||quantity>125)throw new Error('quantity must be 1..125');
  const {tx,req}=makeRequest(unitId,3,startRegister,quantity); const buf=await socketExchange({host,port,request:req,tx});
  const fn=buf.readUInt8(7); if(fn&0x80)throw new Error(`Modbus exception ${buf.readUInt8(8)}`); if(fn!==3)throw new Error(`Unexpected Modbus function ${fn}`);
  const byteCount=buf.readUInt8(8); if(byteCount!==quantity*2)throw new Error(`Unexpected byte count ${byteCount}`);
  const registers=[];for(let i=0;i<quantity;i++)registers.push(buf.readUInt16BE(9+i*2));
  return {registers,rawHex:buf.toString('hex').toUpperCase()};
}
async function modbusWriteSingle({host,port,unitId,register,value}){
  const {tx,req}=makeRequest(unitId,6,register,value); const buf=await socketExchange({host,port,request:req,tx});
  const fn=buf.readUInt8(7); if(fn&0x80)throw new Error(`Modbus exception ${buf.readUInt8(8)}`); if(fn!==6)throw new Error(`Unexpected Modbus function ${fn}`);
  if(buf.length<12||buf.readUInt16BE(8)!==register||buf.readUInt16BE(10)!==value)throw new Error('FC06 write verification echo mismatch');
  return {register:buf.readUInt16BE(8),value:buf.readUInt16BE(10),rawHex:buf.toString('hex').toUpperCase()};
}
function decodeSigned32(high,low,scale=1000){const u=(BigInt(high)<<16n)|BigInt(low);const s=(u&0x80000000n)?u-0x100000000n:u;return Number(s)/scale}
async function readPoint(system,point){
  if(point.kind==='signed32Analog'){const start=Math.min(point.highRegister,point.register),qty=Math.abs(point.register-point.highRegister)+1;const r=await modbusReadHolding({host:system.host,port:system.port,unitId:system.unitId,startRegister:start,quantity:qty});const hi=r.registers[point.highRegister-start],lo=r.registers[point.register-start];return {...point,value:decodeSigned32(hi,lo),raw:[hi,lo],ok:true};}
  if(point.kind==='uint16'){const r=await modbusReadHolding({host:system.host,port:system.port,unitId:system.unitId,startRegister:point.register,quantity:1});return {...point,value:r.registers[0],raw:[r.registers[0]],ok:true};}
  throw new Error(`Unsupported point kind ${point.kind}`);
}
async function readCategory(id,category){const s=systems[id];if(!s)throw new Error('Unknown system');const defs=s[category];if(!Array.isArray(defs))throw new Error('Unknown category');const started=Date.now(),points=[];for(const p of defs){try{points.push(await readPoint(s,p))}catch(e){points.push({...p,value:null,ok:false,error:e.message})}}const okCount=points.filter(p=>p.ok).length;return{id:s.id,name:s.name,category,host:s.host,port:s.port,unitId:s.unitId,online:defs.length?okCount>0:true,okCount,pointCount:points.length,elapsedMs:Date.now()-started,timestamp:new Date().toISOString(),points};}
async function connectionTest(s){const started=Date.now();try{const p=s.inputs[0],point=await readPoint(s,p);return{id:s.id,name:s.name,online:true,host:s.host,port:s.port,unitId:s.unitId,elapsedMs:Date.now()-started,sample:{name:p.name,value:point.value,units:p.units}}}catch(e){return{id:s.id,name:s.name,online:false,host:s.host,port:s.port,unitId:s.unitId,elapsedMs:Date.now()-started,error:e.message}}}
function getWritablePoint(system,id){return system.outputs.find(p=>p.id===id&&p.writable);}
async function guardedWrite(systemId,pointId,value){
  if(!ENABLE_WRITES)throw new Error('Writes are disabled on the server. Set ENABLE_WRITES=true in Render only after verification.');
  const s=systems[systemId];if(!s)throw new Error('Unknown system');const p=getWritablePoint(s,pointId);if(!p)throw new Error('Point is not on the write allow-list');
  if(!Number.isInteger(value)||value<p.min||value>p.max)throw new Error(`Value must be an integer from ${p.min} to ${p.max}`);
  const before=(await readPoint(s,p)).value; const wr=await modbusWriteSingle({host:s.host,port:s.port,unitId:s.unitId,register:p.register,value});
  const after=(await readPoint(s,p)).value;if(after!==value)throw new Error(`Write read-back mismatch: requested ${value}, controller returned ${after}`);
  return {ok:true,system:systemId,point:pointId,name:p.name,register:p.register,before,requested:value,readBack:after,write:wr,timestamp:new Date().toISOString()};
}
function hexdump(buf){const out=[];for(let i=0;i<buf.length;i+=16){const b=buf.subarray(i,i+16);out.push(i.toString(16).padStart(4,'0').toUpperCase()+'  '+[...b].map(x=>x.toString(16).padStart(2,'0').toUpperCase()).join(' ').padEnd(47)+'  '+[...b].map(x=>(x>=32&&x<=126)?String.fromCharCode(x):'.').join(''));}return out.join('\n');}
function decodeProgramBuffer(buf){const strings=[];let cur='';for(const b of buf){if((b>=32&&b<=126)||b===9){cur+=String.fromCharCode(b)}else{if(cur.trim().length>=3)strings.push(cur.trim());cur=''}}if(cur.trim().length>=3)strings.push(cur.trim());const unique=[...new Set(strings)];return{byteLength:buf.length,printableStrings:unique,preview:unique.join('\n'),hexDump:hexdump(buf),note:'Raw bytes are preserved. Printable text extraction works now; full Temco/Bravo token-to-Control-Basic decoding still requires the exact program memory/token map.'};}
function sendJson(res,status,obj){const body=Buffer.from(JSON.stringify(obj));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store'});res.end(body)}
function serveStatic(req,res){let rel=req.url.split('?')[0];if(rel==='/')rel='/index.html';const safe=path.normalize(rel).replace(/^([.][.][/\\])+/,'');const root=path.join(__dirname,'public'),file=path.join(root,safe);if(!file.startsWith(root)){res.writeHead(403);return res.end('Forbidden')}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}const ext=path.extname(file).toLowerCase();const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data)})}
async function readBody(req,max=1024*1024){return await new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size>max){reject(new Error('Request too large'));req.destroy();return}chunks.push(c)});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)})}

const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(u.pathname==='/api/status')return sendJson(res,200,{ok:true,app:'Greenair BACnet Explorer Web',version:VERSION,transport:'Modbus TCP via Render',writesEnabled:ENABLE_WRITES,systems:Object.values(systems).map(s=>({id:s.id,name:s.name,host:s.host,port:s.port,unitId:s.unitId}))});
  if(u.pathname==='/api/connect')return sendJson(res,200,{ok:true,timestamp:new Date().toISOString(),results:await Promise.all(Object.values(systems).map(connectionTest))});
  const cat=u.pathname.match(/^\/api\/system\/(planks|tbeams)\/(inputs|outputs|variables)$/);if(cat)return sendJson(res,200,await readCategory(cat[1],cat[2]));
  const raw=u.pathname.match(/^\/api\/raw\/(planks|tbeams)$/);if(raw){const s=systems[raw[1]],register=Number(u.searchParams.get('register')),quantity=Math.min(125,Math.max(1,Number(u.searchParams.get('quantity')||1)));if(!Number.isInteger(register)||register<0||register>65535)return sendJson(res,400,{error:'register must be 0..65535'});const r=await modbusReadHolding({host:s.host,port:s.port,unitId:s.unitId,startRegister:register,quantity});return sendJson(res,200,{system:s.id,register,quantity,...r});}
  const wr=u.pathname.match(/^\/api\/system\/(planks|tbeams)\/write$/);if(wr&&req.method==='POST'){const body=JSON.parse((await readBody(req)).toString('utf8')||'{}');return sendJson(res,200,await guardedWrite(wr[1],String(body.pointId||''),Number(body.value)));}
  if(u.pathname==='/api/program/decode'&&req.method==='POST'){const body=JSON.parse((await readBody(req)).toString('utf8')||'{}');const hex=String(body.hex||'').replace(/[^0-9a-f]/gi,'');if(!hex||hex.length%2)return sendJson(res,400,{error:'Enter an even number of hexadecimal characters'});const buf=Buffer.from(hex,'hex');return sendJson(res,200,{ok:true,rawHex:buf.toString('hex').toUpperCase(),...decodeProgramBuffer(buf)});}
  if(u.pathname.startsWith('/api/'))return sendJson(res,404,{error:'API route not found'});serveStatic(req,res);
}catch(e){console.error('[Explorer]',e);sendJson(res,500,{error:e.message||String(e)})}});
server.listen(PORT,'0.0.0.0',()=>{console.log(`Greenair BACnet Explorer Web v${VERSION}`);console.log(`Listening on 0.0.0.0:${PORT}`);console.log(`Writes: ${ENABLE_WRITES?'ENABLED':'LOCKED'}`);for(const s of Object.values(systems))console.log(`${s.name} -> ${s.host}:${s.port} unit ${s.unitId}`)});
