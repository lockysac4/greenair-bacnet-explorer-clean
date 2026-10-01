# v0.7.2 BACnet Read Probe

- Preserves all v0.7.1 Program Manager and Modbus functionality.
- Adds read-only BACnet/IP Who-Is / I-Am diagnostics.
- Adds ASHRAE-reserved ConfirmedPrivateTransfer Vendor 0 / Service 0 no-effect test.
- Adds raw TX/RX hex packet logging and BACnet APDU classification.
- Adds offline ConfirmedPrivateTransfer frame preview endpoint for protocol development.
- Temco vendor ID documented as 148.
- Program sends remain hard-locked until Temco service parameters are verified.
