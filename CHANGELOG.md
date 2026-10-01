# Greenair BACnet Explorer Web v0.7.0 — Program Manager

- Added 16-slot PRG manager.
- Added local BIN/HEX load and export.
- Added exact 2000-byte program image normalisation.
- Added five 400-byte transfer block preview with SHA-256 hashes.
- Added guarded Controller Load and Send workflows with confirmation and verification plumbing.
- Added separate ENABLE_PROGRAM_WRITES safety gate.
- Controller program transport remains deliberately locked until the exact Temco/Bravo private-transfer envelope is verified; no unverified program bytes are written.
- Existing v0.6.3 live Modbus monitoring is preserved.
