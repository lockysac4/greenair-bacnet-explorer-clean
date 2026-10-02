# Greenair BACnet Explorer Web v0.7.3

This build advances the Programs transport investigation without enabling proprietary writes.

## New in v0.7.3
- PrivateTransfer Capture Analyzer in Diagnostics.
- Accepts a BACnet/IP BVLC frame or raw ConfirmedPrivateTransfer APDU in hex.
- Extracts APDU type, invoke ID, Vendor ID, service number and exact serviceParameters bytes.
- Detects Temco Controls Vendor ID 148.
- Richer BACnet reply classification includes decoded PrivateTransfer metadata where possible.
- Preserves the v0.7.2 BACnet Who-Is and no-effect Vendor 0 / Service 0 probes.
- Preserves the known-good signed 32-bit input handling, including the T-Beams ambient point.

## Safety
Program writes remain disabled. Capture analysis is offline only and does not transmit the pasted packet. The existing no-effect PrivateTransfer connectivity test remains Vendor ID 0 / Service Number 0.

## Next proof step
Capture one T3000 program read transaction and paste its BACnet PrivateTransfer request/reply hex into Diagnostics. Once Vendor 148, service number and parameters are verified from the real controller transaction, the Program Manager transport can be implemented against that verified envelope.
