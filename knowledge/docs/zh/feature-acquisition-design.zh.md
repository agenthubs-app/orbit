# acquisition Feature 设计

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/acquisition/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-acquisition-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:acquisition` |

## 中文摘要

记录 acquisition feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/acquisition 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Acquisition 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：Mock 行为
- 第 6 节：Live 替换方案
- 第 7 节：API 与页面使用
- 第 8 节：测试要求
- 第 9 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 设计定位

Acquisition 负责“联系人进入系统之前”的所有采集链路。它把手动创建、名片扫描、名片复核、二维码、活动参会者、外部联系人、邮件日历线索、推荐联系人和重复合并统一成可复核的 contact draft。这个模块的产物不是最终联系人，而是带来源、证据、置信度和确认状态的候选关系。

设计原则是先保留来源，再允许进入联系人库。任何 live provider 都不能绕过人工确认直接写联系人记录。

## 子能力范围

- `contact-acquisition-draft-pipeline`：统一 contact draft 生命周期。
- `manual-contact-creation-mock`：手动记录来源。
- `business-card-scan-ocr-mock`：模拟名片 OCR。
- `business-card-review-and-confirm-flow`：人工复核名片字段。
- `qr-scan-connect-mock`：二维码连接。
- `event-attendee-import-mock`：活动参会者导入。
- `external-contacts-import-mock`：通讯录、Google Contacts、CSV 或客户名单导入。
- `email-and-calendar-relationship-signal-mock`：邮件和日历线索。
- `referral-and-recommended-contact-confirm-mock`：推荐联系人。
- `duplicate-detection-and-merge-mock`：重复检测与合并建议。

## 契约与数据边界

主契约在 `features/acquisition/contract.ts`，各子能力补充自己的 DTO、错误码和 provenance 字段。最重要的统一输出是 contact draft：它必须包含 source type、source label、captured fields、evidence、status、confidence、confirmation state 和 no-side-effect 标记。

`features/acquisition/service-factory.ts` 注册了所有采集子服务。调用方应使用 `createContactAcquisitionServices()` 或具体 `create...Service()`，不能直接 import mock service。

## Mock 行为

Mock 使用本地 fixture 模拟真实采集入口。名片扫描不会调用 OCR；外部联系人不会访问通讯录；邮件日历不会请求邮箱或 calendar API；重复合并不会读真实数据库。每个 mock 都必须返回稳定结果，并明确写出哪些外部动作没有发生。

## Live 替换方案

每个采集子能力可以单独替换 live。名片扫描可接 OCR provider；外部联系人可接 Google/Microsoft/CSV parser；邮件日历可接授权后的 mailbox/calendar API。替换时必须先经过 mapper，把 provider payload 转成 acquisition contract。页面仍然只看 draft 和 review state。

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
