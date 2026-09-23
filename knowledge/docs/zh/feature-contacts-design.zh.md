# contacts Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/contacts/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-contacts-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:contacts` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 contacts feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/contacts 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Contacts 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：Mock 行为
- 第 6 节：Live 替换方案
- 第 7 节：生命周期权威边界
- 第 8 节：推荐与搜索边界
- 第 9 节：API 与页面使用
- 第 10 节：名片确认写入
- 第 11 节：测试要求
- 第 12 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 设计定位

Contacts 负责已经进入系统的人脉列表、搜索筛选、详情标签和状态。它接收 Acquisition 确认后的联系人，也消费 Connections、Analysis 和 Followups 的上下文，但不负责采集入口本身。

这个模块的目标是让用户快速知道“现在应该看谁”和“为什么这个人值得处理”。

## 子能力范围

- `contacts-list-search-and-filter-mock`：联系人列表、搜索、来源筛选、价值标签筛选。
- `contact-detail-tag-and-status-mock`：联系人详情、标签、状态、备注、最后互动。

## 契约与数据边界

契约位于 `features/contacts/contract.ts`。核心 DTO 包括 contact summary、contact detail、public profile、source labels、value tags、status、next action 和 provenance。Contacts 不应暴露搜索索引 raw query、数据库 row 或外部 CRM payload。

Service factory 提供 list/search/filter 和 detail/tag/status services。

## Mock 行为

Mock 使用本地联系人 fixture。搜索和筛选是本地确定性规则，不访问真实搜索索引、数据库、邮箱或日历。Live 更新通过 actor-scoped provider 持久化标签、备注、最近互动和行业字段；状态仅在没有任何 owned Connection 且没有初始化标记时才写入 legacy detail state。

## Live 替换方案

Live 可以接联系人数据库、CRM、搜索服务和标签系统。搜索 provider 返回值必须映射为 contact summary。CRM 字段不能直接进入页面；需要先转成 Orbit 的 source、status、value 和 next action。

## 生命周期权威边界

- 带合法 version 或 ready 标记的唯一 owned `Connection` 是正式阶段读取权威，即使没有 ready marker 也不能被旧 detail state 覆盖。Contact 或 Connection 为 pending 时不得提升为正式阶段。读取保留 version/初始化标记，非法 version 失败关闭。
- 任意 owned Connection（包括 captured/旧无版本关系），或 Contact 的 pending/ready 标记，都会使 `PATCH /api/contacts/:id` 的显式 `status` 返回 conflict；混合请求在任何写入前拒绝。正常标签、备注、最近互动和行业编辑仍可用；不包含 status 的编辑保留原 private status，不顺带迁移状态。
- 只有无 Connection、无初始化标记的纯 legacy contact 保留 status 兼容写入。涉及正式生命周期元数据的重复 Connection 拒绝读取/写入，不任选其一；全无版本/标记的旧 fixture 多条关系保留历史上下文读取，但不作为正式阶段权威。`PATCH /api/connections/:id/stage` 仍是现有 no-write preview，不冒充正式阶段变更。

联系人详情 live mapper 还必须把来源和关系值转成人能读懂的标签。`qr_scan` 要显示成 QR scan 来源，`community_context` 要显示成 community context，`venture_capital` 等生成式主题要先映射为业务标签后再进入 `/app/contacts/[id]`。页面不能展示 `source:*` ID、snake_case 价值类型或 provider payload 字段。

## 推荐与搜索边界

Contacts 可以拥有 `contacts.recommend` 这类产品级能力：候选资格、排序、推荐理由、联系人动作和确认边界都应由 Contacts 或 Recommendations 决定。

Relationship Search 只负责检索已有关系证据中的候选项。Contacts 可以根据联系人场景构造 semantic query、keyword query、source/value/status filters 和 evidence constraints，再调用 Search；Search 返回候选后，Contacts 再做联系人级排序、解释和 action mapping。

当前 `features/contacts/contact-recommendation-search.ts` 提供基础的 feature-owned adapter：它把 query、conversation context 和 tool arguments 转成联系人推荐 criteria，调用 Relationship Search，再把结果映射成 source-backed candidates。Orbit AI 可以选择 `contacts.recommend` 工具并渲染 artifact，但人脉推荐策略应停在 Contacts/Recommendations 边界内。

`extractRuleCriteria` 的领域词表按 **live 关系数据实际词汇** 对齐（restaurant/餐饮、ecommerce/retail、enterprise_saas、investor/seed、marketing、manufacturing、tourism/旅游、education、ai 等），并把中文/英文说法改写成能在 Relationship Search 后端子串命中的英文关键词。这是刻意的：后端 `matchesQuery` 的分词器会剥离中日文字符，若不改写，中文 query 分词后为空、会匹配所有候选并退化成任意排序结果。新增领域时，关键词必须真实出现在候选的 `relationshipContext`/`sharedTopics` 等可搜索字段里。

Contacts 不应把推荐策略下放到 Search，也不应让 Orbit AI 长期拥有联系人推荐的业务规则。

## API 与页面使用

产品入口包括 `/app/contacts`、`/app/contacts/[id]` 和 `/app/contacts/new` 的后续复核。Contacts API 包括 list、detail、search 和状态更新。列表页应优先展示当前需要关注的人，而不是做成通讯录表格。

`/app/contacts/dashboard` 与列表页共享同一个 actor-scoped route model。页面必须
先取得当前 session 的 user id，再把它显式传给 Contacts loader；表盘中的总数、
强度、行业分布、关系图和待办都只能由该 view model 派生。演示 fixture、静态姓名、
静态人数或其他账户的聚合值不得进入已登录产品页面。

没有任何联系人或连接的账户应显示同一产品壳内的零数据状态，并提供添加联系人和
扫描名片入口。零数据不是错误，也不能用一组“看起来完整”的 demo 指标填充。

### 名片确认写入

Acquisition 的云端 OCR 只生成待复核草稿；真正创建联系人由 Contacts 的 `BusinessCardContactWriteService` 负责。`POST /api/contacts/business-card/confirm` 必须收到显式确认、纠正后的字段、图片摘要和至少一个 evidence id。服务用 draft id 派生稳定 contact id，先处理同草稿幂等，再按规范化邮箱和姓名/公司组合阻断重复写入。

成功创建的联系人使用现有领域阶段 `captured`，来源为 `business_card_ocr`。原始名片图片不进入 Contacts 存储。联系人确认与后续 Orbit 邀请是两个独立动作；联系人写入成功不代表邀请已发送。

## 测试要求

- list/search/filter 测试覆盖 query、source、tag、empty、failure。
- detail 测试覆盖 status、tags、notes、last interaction。
- API envelope 测试确认成功和失败形状稳定。
- 页面测试确认 raw evidence id 不出现在主用户流程。
- live 接入测试确认搜索索引结果被 mapper 收敛。
- dashboard 账户隔离测试确认 loader 收到 session user id，零联系人时显示真实
  empty state，且源码中不存在 demo 人名或静态业务人数。

## 团队协作规则

Contacts 团队不直接实现 OCR、QR、外部导入或推荐采集。那些入口归 Acquisition。联系人详情需要关系证据时调用 Connections，需要价值标签时调用 Analysis。
