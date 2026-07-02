# Acquisition 模块设计文档

## 设计定位

Acquisition 负责“联系人进入系统之前”的所有采集链路。它把手动创建、名片扫描、名片复核、二维码、活动参会者、外部联系人、邮件日历线索、推荐联系人和重复合并统一成可复核的 contact draft。这个模块的产物不是最终联系人，而是带来源、证据、置信度和确认状态的候选关系。

设计原则是先保留来源，再允许进入联系人库。任何 live provider 都不能绕过人工确认直接写联系人记录。

## 子能力范围

- `contact-acquisition-draft-pipeline`：统一 contact draft 生命周期。
- `manual-contact-creation-mock`：手动记录来源。
- `business-card-scan-ocr-mock`：模拟名片 OCR；live 模式已可从 remote `contacts` 和 `evidence` 中的 `business_card_ocr` 来源记录派生 OCR preview 和 extracted contact draft，但不请求相机、不调用 OCR provider、不上传图片、不写联系人或 contactDrafts。
- `business-card-review-and-confirm-flow`：人工复核名片字段；live 模式已可从 remote `contacts` 和 `evidence` 中的 `business_card_ocr` 来源记录派生 review drafts，但不调用 OCR provider、不写联系人或 contactDrafts。
- `qr-scan-connect-mock`：二维码连接；live 模式已可从 remote `contacts` 和 `evidence` 中的 `qr_scan` 来源记录派生 connection drafts，但不请求相机、不调用 QR decoder、不写联系人或连接。
- `event-attendee-import-mock`：活动参会者导入；live 模式已可从 remote `events`、`attendees`、`eventParticipantIntents`、`networkPeople`、`contacts`、`evidence` 组合生成参会者名单和待复核 contact drafts。
- `external-contacts-import-mock`：通讯录、Google Contacts、CSV 或客户名单导入；live 模式已可从 remote `networkPeople`、`contacts` 和 `evidence` 派生 source-backed 外部联系人候选和 review drafts，但不执行真实 provider sync 或联系人写入。
- `email-and-calendar-relationship-signal-mock`：邮件和日历线索；live 模式已可从 remote `conversations`、`messages`、`contacts` 和 `evidence` 派生关系信号，但不调用 Gmail、Google Calendar 或 Microsoft Graph。
- `referral-and-recommended-contact-confirm-mock`：推荐联系人。
- `duplicate-detection-and-merge-mock`：重复检测与合并建议。

## 契约与数据边界

主契约在 `features/acquisition/contract.ts`，各子能力补充自己的 DTO、错误码和 provenance 字段。最重要的统一输出是 contact draft：它必须包含 source type、source label、captured fields、evidence、status、confidence、confirmation state 和 no-side-effect 标记。

`features/acquisition/service-factory.ts` 注册了所有采集子服务。调用方应使用 `createContactAcquisitionServices()` 或具体 `create...Service()`，不能直接 import mock service。

contact draft pipeline 已有 live storage 边界：`features/acquisition/live-service.ts` 读取 live graph，把显式 `contactDrafts` 记录和从活动参会者派生出的草稿统一成 `ContactAcquisitionDraft`。字段解释、确认状态、provenance 和 no-side-effect 标记仍归 acquisition contract 管理；shared storage 只保存通用 record envelope 和 feature payload。

## Mock 行为

Mock 使用本地 fixture 模拟真实采集入口。名片扫描不会调用 OCR；外部联系人不会访问通讯录；邮件日历不会请求邮箱或 calendar API；重复合并不会读真实数据库。每个 mock 都必须返回稳定结果，并明确写出哪些外部动作没有发生。

## Live 替换方案

每个采集子能力可以单独替换 live。名片扫描可接 OCR provider；外部联系人可接 Google/Microsoft/CSV parser；邮件日历可接授权后的 mailbox/calendar API。替换时必须先经过 mapper，把 provider payload 转成 acquisition contract。页面仍然只看 draft 和 review state。

business card scan OCR 的第一版 live 实现是 source-backed scan preview boundary：`features/acquisition/storage/business-card-scan-live-record-provider.ts` 读取 remote `contacts` 和 `evidence`，`features/acquisition/live-business-card-scan-service.ts` 从 `source.type="business_card_ocr"` 的联系人记录派生 capture metadata、OCR extraction 和 extracted contact draft。draft id 使用 `business-card-review:live:<contactId>`，方便人工复核边界接手；scan 和 draft lookup 都不请求相机权限，不调用 OCR provider，不上传图片，不写 `contacts` 或 `contactDrafts`，不发通知。

活动参会者导入的第一版 live 实现是 storage-backed：`features/acquisition/storage/event-attendee-live-record-provider.ts` 只读 remote live record collections，`features/acquisition/live-event-attendee-import-service.ts` 负责把它们转成 acquisition contract。它不调用 organizer feed，不写联系人库，不执行 bulk import，不发通知；`importEventAttendees` 在当前阶段只表示生成待确认草稿。

contact draft pipeline 的第一版 live 实现同样是 storage-backed：`features/acquisition/storage/contact-draft-live-record-provider.ts` 读取 `contactDrafts`、`events`、`attendees`、`eventParticipantIntents`、`networkPeople` 和 `evidence`。`listContactDrafts()` 会返回显式草稿，并从 live attendee graph 派生 `event_import` 草稿。`confirmContactDraft()` 只把已确认草稿 upsert 到 `contactDrafts` collection，返回 downstream contact candidate；它不会直接写 `contacts` collection。

manual contact creation 的第一版 live 实现复用同一个 contact draft storage boundary：`features/acquisition/live-manual-service.ts` 把手动输入的姓名、组织、角色、note、tags 和 follow-up hint 写成统一 `contactDrafts` payload，并在 manual contract 中返回 `ManualContactDraft`。确认 manual draft 时只更新 `contactDrafts` 中的草稿状态和确认 evidence；不执行 duplicate lookup，不写最终 `contacts`。

duplicate detection and merge 的第一版 live 实现是只读 review boundary：`features/acquisition/storage/duplicate-merge-live-record-provider.ts` 读取 remote `contactDrafts`、`contacts` 和 `evidence`，`features/acquisition/live-merge-service.ts` 用 email 与 name+organization 规则生成重复候选和 field-level merge decisions。`applyMergeSuggestion()` 只返回确认预览和 provenance，不写 `contacts`，不执行 destructive merge，不发通知。

referral and recommended contact 的第一版 live 实现同样是 review-only：`features/acquisition/storage/referral-live-record-provider.ts` 读取 remote `matchRecommendations`、`networkPeople`、`contacts` 和 `evidence`，`features/acquisition/live-referral-service.ts` 把它们映射为推荐联系人和 referral contact drafts。确认推荐联系人只返回确认预览和 evidence DTO，不写 `contacts`，不发外联，不做多跳社交图发现。

external contacts import 的第一版 live 实现也是 review-only：`features/acquisition/storage/external-import-live-record-provider.ts` 读取 remote `networkPeople`、`contacts` 和 `evidence`，`features/acquisition/live-external-import-service.ts` 把 `personKind="external_contact"` 的 records 映射为外部联系人候选和 external contact drafts。现阶段 source kind 使用稳定确定性规则映射到 `phone`、`google_contacts`、`csv`、`existing_customer_list`，用于测试现有 contract；它不读取手机通讯录，不同步 Google Contacts，不解析 CSV，不执行 customer-list job，不写 `contacts` 或 `contactDrafts`。

email/calendar signal 的第一版 live 实现是 metadata-backed review boundary：`features/acquisition/storage/email-calendar-live-record-provider.ts` 读取 remote `conversations`、`messages`、`contacts` 和 `evidence`，`features/acquisition/live-email-calendar-service.ts` 把已进入 Orbit live store 的消息/会话元数据映射为关系信号。确认 signal 只返回确认预览和 evidence DTO；不调用 Gmail、Google Calendar 或 Microsoft Graph，不 ingest 新消息正文，不写关系、不发通知、不执行外部动作。

business card review 的第一版 live 实现是 source-backed review boundary：`features/acquisition/storage/business-card-review-live-record-provider.ts` 读取 remote `contacts` 和 `evidence`，`features/acquisition/live-business-card-review-service.ts` 从 `source.type="business_card_ocr"` 的联系人记录派生可复核字段。更新复核和确认都只返回 preview/evidence payload；不调用 OCR provider，不写 `contacts` 或 `contactDrafts`，不发通知。

QR scan connect 的第一版 live 实现是 source-backed review boundary：`features/acquisition/storage/qr-live-record-provider.ts` 读取 remote `contacts` 和 `evidence`，`features/acquisition/live-qr-service.ts` 从 `source.type="qr_scan"` 的联系人记录派生可确认的 QR connection draft。scan 和 confirm 都只返回 preview/candidate/evidence payload；不请求相机权限，不调用 QR decoder 或 signature verifier，不查外部关系图，不写 `contacts`、`connections` 或 `contactDrafts`，不发通知。

## API 与页面使用

主要产品入口是 `/app/contacts/new`。API 路径包括 contact draft 创建、确认、名片扫描、外部导入、QR、推荐和重复合并。页面应展示用户能理解的来源和待确认字段，不展示 raw evidence id，除非在技术 provenance 展开区。

## 测试要求

- contract 测试覆盖 source type、draft status、confirmation 和错误码。
- 每个 mock 子能力测试 no external provider calls。
- API envelope 测试覆盖 success、empty、pending、failure。
- `/app/contacts/new` 测试确认采集入口可见，且确认前无联系人写入。
- live 替换测试必须证明 provider payload 不进入页面。

## 团队协作规则

Acquisition 团队可以并行拆分子能力。名片扫描、外部导入、QR、邮件日历和重复合并互不直接 import 对方 fixture。跨子能力合并时，通过 draft contract 和 service factory 组合。
