# v0.7.1

- Added production Program Transport Bridge interface.
- Added strict timeout/error handling for program transport.
- Added exact SHA-256 validation for loaded controller images.
- Send now automatically reloads the selected PRG slot and compares all 2000 bytes.
- A program Send cannot report success unless read-back is byte-for-byte identical.
- Preserved 16 PRG slots and 5 x 400-byte block preparation.
- Preserved server write locks; program writes need both write gates enabled.
- No guessed Temco PrivateTransfer payloads are transmitted by this build.
