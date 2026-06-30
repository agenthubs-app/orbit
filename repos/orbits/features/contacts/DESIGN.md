# Contacts 模块设计文档

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

Mock 使用本地联系人 fixture。搜索和筛选是本地确定性规则，不访问真实搜索索引、数据库、邮箱或日历。更新状态、标签或备注只能返回 preview 或 mock result，不写真实联系人库。

## Live 替换方案

Live 可以接联系人数据库、CRM、搜索服务和标签系统。搜索 provider 返回值必须映射为 contact summary。CRM 字段不能直接进入页面；需要先转成 Orbit 的 source、status、value 和 next action。

## 推荐与搜索边界

Contacts 可以拥有 `contacts.recommend` 这类产品级能力：候选资格、排序、推荐理由、联系人动作和确认边界都应由 Contacts 或 Recommendations 决定。

Relationship Search 只负责检索已有关系证据中的候选项。Contacts 可以根据联系人场景构造 semantic query、keyword query、source/value/status filters 和 evidence constraints，再调用 Search；Search 返回候选后，Contacts 再做联系人级排序、解释和 action mapping。

当前 `features/contacts/contact-recommendation-search.ts` 提供基础的 feature-owned adapter：它把 query、conversation context 和 tool arguments 转成联系人推荐 criteria，调用 Relationship Search，再把结果映射成 source-backed candidates。Orbit AI 可以选择 `contacts.recommend` 工具并渲染 artifact，但人脉推荐策略应停在 Contacts/Recommendations 边界内。

Contacts 不应把推荐策略下放到 Search，也不应让 Orbit AI 长期拥有联系人推荐的业务规则。

## API 与页面使用

产品入口包括 `/app/contacts`、`/app/contacts/[id]` 和 `/app/contacts/new` 的后续复核。Contacts API 包括 list、detail、search 和状态更新。列表页应优先展示当前需要关注的人，而不是做成通讯录表格。

## 测试要求

- list/search/filter 测试覆盖 query、source、tag、empty、failure。
- detail 测试覆盖 status、tags、notes、last interaction。
- API envelope 测试确认成功和失败形状稳定。
- 页面测试确认 raw evidence id 不出现在主用户流程。
- live 接入测试确认搜索索引结果被 mapper 收敛。

## 团队协作规则

Contacts 团队不直接实现 OCR、QR、外部导入或推荐采集。那些入口归 Acquisition。联系人详情需要关系证据时调用 Connections，需要价值标签时调用 Analysis。
