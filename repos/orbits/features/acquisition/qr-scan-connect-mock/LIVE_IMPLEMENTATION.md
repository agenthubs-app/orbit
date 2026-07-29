# QR Scan Connect Live Implementation

## Live Service Boundary

The storage-backed live implementation now lives in
`features/acquisition/live-qr-service.ts`.

The actor-scoped draft adapter lives in
`features/acquisition/storage/contact-draft-live-record-provider.ts`. Confirmed
records use the source-agnostic writer in
`features/contacts/storage/contact-write-live-record-provider.ts`.

- scan stages one `contactDrafts` record
- confirm writes one `contacts` record
- confirm writes one `connections` record
- scan and confirmation source facts are stored in `evidence`

The live path keeps the contract exported from
`features/acquisition/qr-contract.ts`: scan result, mutual connection context,
QR connection draft, confirmation payload, and failure definitions.

## Switch

Use `ORBIT_MODULE_MODE=live` with a configured remote live store. The service
factory wires this mode to `createLiveQrScanConnectService()` through
the configured actor-scoped draft and relationship record providers.

`hybrid` continues to fall back to mock until a dedicated hybrid QR policy is
added. `mock` remains the default when no module mode is configured.

## Current Live Inputs

- remote live store credentials and `ORBIT_WORKSPACE_ID`
- operator-supplied `orbit-qr:` text
- stable actor-and-payload-derived draft, contact, and connection ids
- provenance records for staging, confirmation, and persisted source evidence

The current live boundary does not request camera permission, call a QR decoder,
verify signatures, perform external relationship graph lookup, call AI
providers, or deliver notifications. The operator must review the unsigned
fields before contact and connection persistence.

## Privacy And Provenance

The live path preserves the submitted source fields, a SHA-256 payload digest,
mutual context, and the operator confirmation requirement.

The privacy boundary is explicit: scan writes only an actor-owned pending draft;
contact and connection writes remain behind explicit confirmation.

- `liveDatabaseReadExecuted` is true after the actor-scoped draft read.
- `databaseWriteExecuted` reports whether the current scan or confirmation
  created or updated a record.
- `contactWriteExecuted` and `connectionWriteExecuted` report current-request
  writes while stable IDs make retries idempotent.
- `cameraRequested`, `qrDecoderProviderRequested`,
  `externalNetworkRequested`, `aiProviderRequested`, and
  `notificationDelivered` remain false.

Future camera, QR decoder, and signature verifier implementations must keep the
same confirmation boundary and add their own replacement tests before enabling
those device or trust claims.

## Replacement Tests

Current replacement tests cover:

- submitted QR fields are staged exactly once as an actor-owned draft
- confirmation persists one contact, connection, and evidence set
- repeated scan/confirmation and partial-write retry remain idempotent
- actor isolation and duplicate review
- no camera, decoder, signature, external lookup, AI, or notification claims
- actor, draft store, and relationship writer unconfigured failures
- service factory live-mode registration
- API route mode resolution with `ORBIT_MODULE_MODE=live`
- demo mock behavior remaining stable

Additional tests are still needed before shipping device scanning:

- unreadable QR payload
- invalid signature
- camera permission denial
- QR decoder provider failure
