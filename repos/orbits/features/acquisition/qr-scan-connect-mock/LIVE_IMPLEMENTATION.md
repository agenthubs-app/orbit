# QR Scan Connect Live Implementation

## Live Service Boundary

The storage-backed live implementation now lives in
`features/acquisition/live-qr-service.ts`.

The provider adapter lives in
`features/acquisition/storage/qr-live-record-provider.ts` and reads only the
remote live store collections needed for this capability:

- `contacts`
- `evidence`

The live path keeps the contract exported from
`features/acquisition/qr-contract.ts`: scan result, mutual connection context,
QR connection draft, confirmation payload, and failure definitions.

## Switch

Use `ORBIT_MODULE_MODE=live` with a configured remote live store. The service
factory wires this mode to `createLiveQrScanConnectService()` through
`createConfiguredStorageQrScanConnectProvider()`.

`hybrid` continues to fall back to mock until a dedicated hybrid QR policy is
added. `mock` remains the default when no module mode is configured.

## Current Live Inputs

- remote live store credentials and `ORBIT_WORKSPACE_ID`
- `contacts` records with `source.type === "qr_scan"`
- `evidence` records referenced by those contacts
- stable draft ids in the form `qr-draft:live:<contactId>`
- provenance records for the live store read, QR-sourced draft, and confirmation preview

The current live boundary does not request camera permission, call a QR decoder,
verify signatures, perform external relationship graph lookup, write contacts,
write connections, call AI providers, or deliver notifications.

## Privacy And Provenance

The live path preserves source evidence IDs, source labels, decoded live record
metadata, mutual context, and the operator confirmation requirement. Scan and
confirm both return source-backed previews only:

The privacy boundary is explicit: source-backed provenance is returned for
review, but no relationship data is written by scan or confirm.

- `liveDatabaseReadExecuted` is true after a configured live store read.
- `databaseWriteExecuted`, `contactWriteExecuted`, and
  `connectionWriteExecuted` remain false.
- `cameraRequested`, `qrDecoderProviderRequested`,
  `externalNetworkRequested`, `aiProviderRequested`, and
  `notificationDelivered` remain false.

Future camera, QR decoder, signature verifier, and real contact/connection
write implementations must keep the same confirmation boundary and add their
own replacement tests before enabling writes.

## Replacement Tests

Current replacement tests cover:

- live service reads source-backed QR contacts from remote-record-shaped storage
- no contact, connection, database, camera, decoder, external lookup, AI, or notification side effects
- live store unconfigured failure
- service factory live-mode registration
- API route mode resolution with `ORBIT_MODULE_MODE=live`
- demo mock behavior remaining stable

Additional tests are still needed before shipping device scanning:

- unreadable QR payload
- invalid signature
- camera permission denial
- QR decoder provider failure
- explicit contact and connection persistence after confirmation
