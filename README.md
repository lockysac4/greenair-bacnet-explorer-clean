# Greenair BACnet Explorer Web v0.7.2

This diagnostic build proves the BACnet/IP path before proprietary Temco program commands are enabled.

## BACnet defaults
- Host: `bms.biancoprecast.com.au`
- UDP port: `47808`
- Expected historical device instance: `110605`
- Temco Controls BACnet vendor ID: `148`

Environment overrides: `BACNET_HOST`, `BACNET_PORT`, `BACNET_DEVICE_INSTANCE`, `BACNET_PROBE_TIMEOUT_MS`.

## Safety
Program writes remain disabled. The PrivateTransfer connectivity test uses the ASHRAE-reserved Vendor ID 0 / Service Number 0 message intended for interoperability testing and does not use a Temco program command.
