# Acquisition 模块

## 模块定位

Acquisition 负责联系人进入系统前的采集链路，包括手动创建、名片扫描、名片复核、二维码、活动参会者导入、外部联系人导入、邮件日历线索、推荐联系人和重复合并。

## 期望行为

模块应把多种联系人添加方式统一成可确认的 contact draft，并保留来源证据、复核状态和合并建议。真实实现可以接入 OCR、通讯录、活动系统和推荐服务，但输出契约应保持稳定。

## Mock 行为

Mock 服务使用本地 fixture 模拟各类采集入口。名片扫描、外部导入、邮件日历线索和推荐逻辑均为本地确定性结果，不执行真实 OCR、邮箱、日历、通讯录、网络或数据库写入。

## Live 行为

当前 live 已覆盖多条 storage-backed 边界：

- 活动参会者导入从 remote live records 读取 `events`、`attendees`、`eventParticipantIntents`、`networkPeople`、`contacts` 和 `evidence`，生成参会者名单和待确认草稿。
- contact draft pipeline 从 `contactDrafts` 读取显式草稿，也可以从活动参会者 graph 派生 `event_import` 草稿。确认草稿时只写回 `contactDrafts`，并返回 downstream contact candidate；最终联系人写入仍属于 contacts 模块。
- manual contact creation 在 live 模式下把手动输入写成统一 `contactDrafts` 草稿，并保留 manual note、tags、follow-up hint 和 source evidence。确认 manual draft 只更新 `contactDrafts`，不执行 duplicate lookup，也不直接写 `contacts`。
- business card scan OCR 保留从 `contacts` 和 `evidence` 派生 source-backed preview 的无图片路径；有图片时接受 JPEG/PNG/WebP（≤10 MiB），调用付费 Gemini Interactions API 的 `gemini-3.5-flash-lite`，以 `high` 图像分辨率、`minimal` thinking 和 strict JSON schema 生成 cloud OCR draft。
- 云端名片路径优先读取 `GEMINI_API_KEY`，兼容回退到 `GOOGLE_API_KEY`。原始图片只用于当次 provider 请求，不落库、不进入日志；服务只返回 SHA-256 摘要、结构化字段、token/耗时 provenance 和确定性复核问题。确认前 `contactWriteExecuted=false`，缺密钥或 provider 失败时显式失败且不回退 fixture。
- duplicate detection and merge 在 live 模式下读取 `contactDrafts`、`contacts` 和 `evidence`，用确定性的 email 与 name+organization 规则生成重复候选和合并建议。当前 apply 只返回 review preview，不写 `contacts`，不执行 destructive merge，不发通知。
- referral recommendation 在 live 模式下读取 `matchRecommendations`、`networkPeople`、`contacts` 和 `evidence`，生成推荐联系人和 referral contact drafts。确认推荐联系人只返回 review preview，不写 `contacts`，不发送外联，也不做多跳社交图发现。
- external contacts import 在 live 模式下读取 `networkPeople`、`contacts` 和 `evidence`，把 `external_contact` records 转成 source-backed external candidates 和 review drafts。当前 import 只生成待复核草稿 payload，不读取手机通讯录、Google Contacts、CSV 或 customer-list provider，也不写 `contacts` 或 `contactDrafts`。
- email/calendar signal 在 live 模式下读取 `conversations`、`messages`、`contacts` 和 `evidence`，把已进入 live store 的消息/会话元数据转成 source-backed relationship signals。当前确认只返回 review preview，不调用 Gmail、Google Calendar 或 Microsoft Graph，不 ingest 新消息正文，不写关系、不发通知。
- business card review 在 live 模式下读取 `contacts` 和 `evidence`，把 `business_card_ocr` 来源的联系人记录转成待人工复核的名片字段。当前 review/update/confirm 都只返回 source-backed preview，不调用 OCR provider，不写 `contacts` 或 `contactDrafts`。
- QR scan connect 在 live 模式下读取 `contacts` 和 `evidence`，把 `qr_scan` 来源的联系人记录转成待确认的 QR connection draft。当前 scan/confirm 都只返回 source-backed preview，不请求相机、不调用 QR decoder 或 signature verifier、不查外部关系图、不写 `contacts`、`connections` 或 `contactDrafts`。
- `/app/contacts/new` 页面在 live 模式下通过 module mode 装配 acquisition 与 permission 子服务，并等待 async live 结果。名片扫描是主采集入口：上传、云端识别、字段编辑、复核问题确认和联系人确认按顺序进行；联系人写入成功后才显示可选邀请。页面加载本身不能创建 draft、联系人或邀请。

## 热拔插边界

调用方必须通过 `features/acquisition/service-factory.ts` 获取具体采集服务，或使用 `createContactAcquisitionServices()` 组合。每个采集子能力可以独立替换为 live 实现，不需要修改页面和 API route。
