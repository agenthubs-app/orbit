# Business Card Scan OCR Live Implementation

## 2026-09-08：纯文字输入边界

- 当前正式识别路径是上传图片后调用云 OCR；仅提交 `imageText`（包括空字符串）不代表已支持文字解析，live 服务现在明确返回 `BUSINESS_CARD_IMAGE_REQUIRED`，不再把已有联系人误当作这次文字的识别结果。
- 拒绝发生在存储读取和 OCR 请求之前。带图片的上传路径不变；未提供文字或图片的旧存储预览、按草稿 ID 回读及 mock 验证路径维持兼容。
- App 将撤下不成立的纯文字扫描入口，文字信息仍可通过手动录入；这不是新增文本 OCR，也不改变已保存联系人。
- 验证：扫描、云 OCR、mock 相关 28 项通过，0 跳过，Web 全量类型检查通过；用纯内存已有联系人夹具复现后修复，没有真实账号或云服务写入验收。

以下历史说明描述的是旧存储预览路径，不适用于后来加入的图片云 OCR 路径。

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
