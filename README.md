# Greenair BACnet Explorer Web v0.6.2 FULL

Clean rebuild from v0.6.1 with cache-busting and Programs UX fixes.

## Changes
- Version stamp v0.6.2 across server and UI.
- Static files served with no-store/no-cache headers to prevent stale Render/browser UI.
- Programs page no longer errors when no hex is loaded.
- Programs page starts with a clear waiting-for-data state.
- Overview shows a visible BUILD v0.6.2 badge.
- Existing live Modbus transport, inputs, outputs, variables, PIDs, schedules, raw reader, diagnostics, and guarded write architecture preserved.

Writes remain locked unless ENABLE_WRITES=true is explicitly set in Render.
