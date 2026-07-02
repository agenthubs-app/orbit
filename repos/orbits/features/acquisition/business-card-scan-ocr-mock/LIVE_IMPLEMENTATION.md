# Business Card Scan OCR Live Implementation

## Live Service Boundary

The storage-backed live implementation now lives in
`features/acquisition/live-business-card-scan-service.ts`.

The provider adapter lives in
`features/acquisition/storage/business-card-scan-live-record-provider.ts` and
reads only the remote live store collections needed for this capability:

- `contacts`
- `evidence`

The live path keeps the contract exported from
`features/acquisition/business-card-contract.ts`: capture metadata, OCR
extraction, extracted contact draft, source evidence, and failure definitions.

## Switch

Use `ORBIT_MODULE_MODE=live` with a configured remote live store. The service
factory wires this mode to `createLiveBusinessCardScanOcrService()` through
`createConfiguredStorageBusinessCardScanOcrProvider()`.

`hybrid` continues to fall back to mock until a dedicated hybrid scan policy is
added. `mock` remains the default when no module mode is configured.

## Current Live Inputs

- remote live store credentials and `ORBIT_WORKSPACE_ID`
- `contacts` records with `source.type === "business_card_ocr"`
- `evidence` records referenced by those contacts
- stable draft ids in the form `business-card-review:live:<contactId>`, so the
  business-card review boundary can take over after scan preview
- provenance records for the live store read, OCR preview, and extracted draft

The current live boundary does not request camera permission, call an OCR
provider, upload images to a storage bucket, perform AI extraction, write
contacts, write contactDrafts, or deliver notifications.

## Privacy And Provenance

The privacy boundary is explicit: source-backed provenance is returned for
review, but no relationship data is written by scan or draft lookup.

- `liveDatabaseReadExecuted` is true after a configured live store read.
- `databaseWriteExecuted`, `contactWriteExecuted`, and `storageWriteExecuted`
  remain false.
- `cameraRequested`, `uploadStorageRequested`, `ocrProviderRequested`,
  `aiProviderRequested`, and `notificationDelivered` remain false.

Future camera permission, OCR provider, storage bucket, and real contact write
implementations must keep the same confirmation boundary and add replacement
tests before enabling writes.

## Replacement Tests

Current replacement tests cover:

- live service reads source-backed business-card OCR contacts from
  remote-record-shaped storage
- no contact, contactDraft, database, camera, upload storage, OCR provider, AI,
  or notification side effects
- live store unconfigured failure
- service factory live-mode registration
- API route mode resolution with `ORBIT_MODULE_MODE=live`
- demo mock behavior remaining stable

Additional tests are still needed before shipping device scanning:

- unreadable card image
- camera permission denial
- OCR provider failure
- image upload/storage failure
- explicit contact persistence after confirmation
