# acquisition 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/acquisition.md` |
| 中文镜像 | `knowledge/docs/zh/module-acquisition.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:acquisition` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 acquisition 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/acquisition/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Acquisition 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：Live 行为
- 第 6 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

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
- business card scan OCR 在 live 模式下读取 `contacts` 和 `evidence`，把 `business_card_ocr` 来源的联系人记录转成 capture metadata、OCR extraction 和 extracted contact draft。当前 scan/lookup 只返回 source-backed preview，不请求相机、不调用 OCR provider、不上传图片、不写 `contacts` 或 `contactDrafts`。
- duplicate detection and merge 在 live 模式下读取 `contactDrafts`、`contacts` 和 `evidence`，用确定性的 email 与 name+organization 规则生成重复候选和合并建议。当前 apply 只返回 review preview，不写 `contacts`，不执行 destructive merge，不发通知。
- referral recommendation 在 live 模式下读取 `matchRecommendations`、`networkPeople`、`contacts` 和 `evidence`，生成推荐联系人和 referral contact drafts。确认推荐联系人只返回 review preview，不写 `contacts`，不发送外联，也不做多跳社交图发现。
- external contacts import 在 live 模式下读取 `networkPeople`、`contacts` 和 `evidence`，把 `external_contact` records 转成 source-backed external candidates 和 review drafts。当前 import 只生成待复核草稿 payload，不读取手机通讯录、Google Contacts、CSV 或 customer-list provider，也不写 `contacts` 或 `contactDrafts`。
- email/calendar signal 在 live 模式下读取 `conversations`、`messages`、`contacts` 和 `evidence`，把已进入 live store 的消息/会话元数据转成 source-backed relationship signals。当前确认只返回 review preview，不调用 Gmail、Google Calendar 或 Microsoft Graph，不 ingest 新消息正文，不写关系、不发通知。
- business card review 在 live 模式下读取 `contacts` 和 `evidence`，把 `business_card_ocr` 来源的联系人记录转成待人工复核的名片字段。当前 review/update/confirm 都只返回 source-backed preview，不调用 OCR provider，不写 `contacts` 或 `contactDrafts`。
- QR scan connect 在 live 模式下读取 `contacts` 和 `evidence`，把 `qr_scan` 来源的联系人记录转成待确认的 QR connection draft。当前 scan/confirm 都只返回 source-backed preview，不请求相机、不调用 QR decoder 或 signature verifier、不查外部关系图、不写 `contacts`、`connections` 或 `contactDrafts`。
- `/app/contacts/new` 页面在 live 模式下通过 module mode 装配 acquisition 与 permission 子服务，并等待 async live 结果。页面首屏是只读工作台：可以展示草稿队列、名片 OCR 预览、QR 预览、活动参会者导入、外部联系人候选、邮件日历线索、推荐草稿、重复合并建议和权限状态；不能因为页面加载而创建 manual contact draft。手动草稿写入必须来自显式用户输入/action。

## 热拔插边界

调用方必须通过 `features/acquisition/service-factory.ts` 获取具体采集服务，或使用 `createContactAcquisitionServices()` 组合。每个采集子能力可以独立替换为 live 实现，不需要修改页面和 API route。
