# Greenair BACnet Explorer Web v0.6.0 FULL

Render-native web explorer for the Bianco Bravo/T3000 controllers using the proven Modbus TCP path from the production TrendLog.

## Live systems
- Planks: `bms.biancoprecast.com.au:502`, Unit 69
- T-Beams: `bms.biancoprecast.com.au:505`, Unit 68

## Included
- live Inputs with 3-second refresh
- Outputs/Controls with strict server allow-list
- writes locked by default (`ENABLE_WRITES=false`)
- FC06 write + read-back verification when enabled
- Variables
- PID read workspace
- Schedule read workspace
- Program raw block + decoder workspace
- local descriptor overrides + JSON export
- raw register reader
- diagnostics/status
- Print / PDF via browser
- link to production TrendLog

## Important
The exact Bravo program memory/token map is not yet verified. Program writes remain disabled and the current decoder preserves raw bytes while extracting readable strings and a hex dump.

## Render
- Build: `npm install`
- Start: `npm start`
- Health check: `/api/status`
- Root directory: blank

Keep `ENABLE_WRITES=false` until the read pages are verified after deployment.
