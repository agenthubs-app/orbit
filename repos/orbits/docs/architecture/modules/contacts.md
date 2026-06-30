# Contacts 模块

## 模块定位

Contacts 负责已确认联系人的列表、搜索、筛选、详情、标签和状态，是关系数据的核心业务对象。

## 期望行为

模块应提供联系人列表查询、详情读取、标签调整和状态更新，并保持与 acquisition、connections、events 和 analysis 的证据关系。

Contacts 也可以拥有 `contacts.recommend` 这类产品级工具策略。Relationship Search 可提供 evidence-backed candidates，但候选资格、排序、推荐理由、下一步动作和确认边界属于 Contacts 或 Recommendations，不属于 Search 或 Orbit AI。

当前基础 adapter 位于 `features/contacts/contact-recommendation-search.ts`，由 Orbit AI 的 `contacts.recommend` matcher 调用。

## Mock 行为

Mock 服务返回确定性的联系人、标签、状态、搜索结果和空/失败场景，不访问真实通讯录、CRM、数据库或外部网络。

## 热拔插边界

调用方必须通过 `features/contacts/service-factory.ts` 获取 list/search/filter 和 detail/tag/status 服务。真实联系人存储可以独立接入，不改变页面或 API route。
