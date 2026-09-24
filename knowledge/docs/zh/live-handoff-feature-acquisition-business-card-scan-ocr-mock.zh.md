# acquisition 能力 Live 交接：business card scan ocr mock

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/acquisition/business-card-scan-ocr-mock/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-acquisition-business-card-scan-ocr-mock.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:acquisition` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 acquisition 模块中 business card scan ocr mock 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/acquisition/business-card-scan-ocr-mock。目录级实时行为仍以 service factory、API route 和测试为准。

## 结构化阅读入口

- 第 1 节：Business Card Scan OCR Live 实现
- 第 2 节：2026-09-08：纯文字输入边界
- 第 3 节：Live 服务 边界
- 第 4 节：源标题：Switch
- 第 5 节：当前 Live Inputs
- 第 6 节：Privacy 和 Provenance
- 第 7 节：Replacement 测试

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

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
