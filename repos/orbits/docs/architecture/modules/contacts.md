# Contacts 模块

## 模块定位

Contacts 负责已确认联系人的列表、搜索、筛选、详情、标签和状态，是关系数据的核心业务对象。

## 期望行为

模块应提供联系人列表查询、详情读取、标签调整和状态更新，并保持与 acquisition、connections、events 和 analysis 的证据关系。

Contacts 也可以拥有 `contacts.recommend` 这类产品级工具策略。Relationship Search 可提供 evidence-backed candidates，但候选资格、排序、推荐理由、下一步动作和确认边界属于 Contacts 或 Recommendations，不属于 Search 或 Orbit AI。

当前基础 adapter 位于 `features/contacts/contact-recommendation-search.ts`，由 Orbit AI 的 `contacts.recommend` matcher 调用。

## Mock 行为

Mock 服务返回确定性的联系人、标签、状态、搜索结果和空/失败场景，不访问真实通讯录、CRM、数据库或外部网络。

## Live Store

Contacts live mode 读取共享 live storage 的 generated relationship graph：

- 列表、搜索和筛选从 `contacts`、`connections` 和 `evidence` 映射成联系人列表契约。
- 联系人详情从同一组 live records 映射成 detail/tag/status 契约；更新标签、状态、note 和 last interaction 目前仍是 preview，不写回联系人记录或生产 audit log。
- 联系人详情页不是新的数据层。它组合 Contacts、Connections 和 Analysis 三个 feature service；live 模式下先按 `contactId` 从 connection list 找到对应 connection，再读取 connection evidence 和 relationship value。
- `/app/contacts/[id]` 现在通过 `loadAppContactDetailRoute` 初始化页面。页面 adapter 只负责把 route success model 映射到既有详情 UI 的 `OrbitContactsViewModel` 形状；空态、pending 和 failure 通过 shared `StateView` 展示。
- `/app/contacts/pipeline`、`/app/contacts/graph` 和 `/app/contacts/intros` 现在也通过 `loadAppContactsRouteViewModel` 读取 live-capable contacts payload。它们的 `contacts-subroute-route-adapter.tsx` 只是旧 UI 兼容层：把 contacts payload 映射成既有 `OrbitContactsViewModel`，不新增 storage 查询、不读取 fixture、不绕过 contacts service。

如果 live storage 未配置，feature service 和 page-level route 都必须返回受控失败，不能回退到 mock 数据。

## 热拔插边界

调用方必须通过 `features/contacts/service-factory.ts` 获取 list/search/filter 和 detail/tag/status 服务。真实联系人存储可以独立接入，不改变页面或 API route。
