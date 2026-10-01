# Greenair BACnet Explorer Web v0.7.0

Render-native Greenair controller explorer with live Bianco Modbus monitoring and a full 16-slot Program Manager.

## Program Manager

Program images are exactly 2000 bytes and are prepared as five 400-byte blocks. Local BIN/HEX import/export, hashing, decode inspection and backup are active.

Controller PRG Load/Send is intentionally safety-locked until the Temco/Bravo PrivateTransfer payload envelope is verified against the working Windows implementation/T3000 source. The UI and API are already wired so the verified adapter can be inserted without changing the workflow.

Program writes will require both `ENABLE_WRITES=true` and `ENABLE_PROGRAM_WRITES=true`, plus controller read-back verification.
