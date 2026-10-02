# v0.7.3 Private Transfer Analyzer

- Preserves all v0.7.2 Program Manager, Modbus and BACnet probe functionality.
- Adds offline BACnet ConfirmedPrivateTransfer packet analyzer.
- Extracts invoke ID, vendor ID, service number and serviceParameters.
- Detects Temco Vendor ID 148 and preserves raw parameter bytes for comparison.
- Adds PrivateTransfer metadata to BACnet reply diagnostics when decodable.
- Keeps program writes hard-locked until a real T3000 transaction proves the Temco transport envelope.
