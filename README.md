# Greenair BACnet Explorer Web v0.7.1 - Program Transport Bridge

This build preserves the live Render -> Modbus TCP explorer and completes the Program Manager workflow around a verified Temco/Bravo program transport adapter.

## Program workflow
- 16 PRG slots
- exact 2000-byte images
- 5 x 400-byte transfer blocks
- SHA-256 image and block checksums
- Controller Load through a verified bridge
- Controller Send through a verified bridge
- automatic Controller Load after Send
- byte-for-byte verification of all 2000 bytes
- a Send is reported successful only after the read-back image exactly matches

## Safety gates
Controller Load remains unavailable unless `PROGRAM_BRIDGE_URL` is configured.
Controller Send additionally requires both `ENABLE_WRITES=true` and `ENABLE_PROGRAM_WRITES=true`.

The bridge must implement:
- `POST /program/load`
- `POST /program/send`

The bridge is where the verified Temco/Bravo BACnet PrivateTransfer framing lives. This web application deliberately does not invent that proprietary payload.

Optional `PROGRAM_BRIDGE_TOKEN` adds `Authorization: Bearer <token>` to bridge calls.
