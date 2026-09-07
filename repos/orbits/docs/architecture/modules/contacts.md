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
- Contacts live provider 保留全图读取 API，同时为列表和详情提供 focused reads：列表按 search input 缩小 contact set 后只读取 listed contacts 与其 connections 引用的 evidence；详情按 `contactId` 只读取该 contact、对应 connection 和相关 evidence。
- 联系人详情页不是新的数据层。它组合 Contacts、Connections 和 Analysis 三个 feature service；live 模式下先按 `contactId` 读取一次 shared focused graph，再把同一 graph 复用给 contact detail、connection evidence 和 relationship value scoring，避免重复读取全量 `contacts` / `connections` / `evidence`。
- `/app/contacts/[id]` 现在通过 `loadAppContactDetailRoute` 初始化页面。页面 adapter 只负责把 route success model 映射到既有详情 UI 的 `OrbitContactsViewModel` 形状；空态、pending 和 failure 通过 shared `StateView` 展示。
- `/app/contacts/pipeline`、`/app/contacts/graph` 和 `/app/contacts/intros` 现在也通过 `loadAppContactsRouteViewModel` 读取 live-capable contacts payload。它们的 `contacts-subroute-route-adapter.tsx` 只是旧 UI 兼容层：把 contacts payload 映射成既有 `OrbitContactsViewModel`，不新增 storage 查询、不读取 fixture、不绕过 contacts service。
- 复核后的名片草稿通过独立的 `BusinessCardContactWriteService` 写入 `contacts`。`POST /api/contacts/business-card/confirm` 要求显式 `confirmed=true`、纠正后的字段、图片摘要和 evidence ids；服务用 draft id 派生稳定 contact id，实现同草稿幂等。
- 写入前按规范化邮箱，再按姓名/公司组合检查现有联系人。命中重复项时返回 `duplicate_review` 并执行零写入；成功创建使用现有关系阶段 `captured` 和 `business_card_ocr` source。原始名片图片不属于 Contacts 数据。

如果 live storage 未配置，feature service 和 page-level route 都必须返回受控失败，不能回退到 mock 数据。

## Web 归档状态修复（2026-09-07）

- 列表、子路由与详情的页面适配器将联系人 `status: archived` 映射为独立的 `archived / 已归档` 展示状态，不再解释为 `partnered / 已合作`。列表按原始状态枚举判断，不解析翻译后的 `statusLabel`。
- 归档联系人保留在列表、看板和图谱数据中；可按归档状态筛选或搜索，计数与详情标签采用同一含义。已有 `partnered` 展示值保持兼容，不迁移任何存储数据。
- 本次只修正 Web 展示语义，没有修改共享 API、契约或 App。App 的完整关系四阶段、阶段编辑、行业与导航同步仍是后续任务，不能据此标记整个人脉模块对齐完成。
- 验证覆盖真实适配器、列表搜索与分组、列表／看板／详情的 React 渲染；新增 8 项回归从失败转为通过。连同周边测试共 40 项通过，Web 全量类型检查通过；未执行真实账号跨端回读或生产部署。
- 基线维护：移除只约束 `actorId` 属性简写的旧源码断言（actor 传递已有 focused provider 行为测试），更新二维码来源的运行时中文预期，以匹配现行本地化规则。

## Web 主行业展示修复（2026-09-07）

- 列表 route view model 保留现有契约的 `primaryIndustryId` 与 `primaryIndustryLabel`。列表、子路由及详情优先用稳定行业 ID 从共享字典取得名称；没有 ID 时只接受明确提供的主行业名称，不再从地区、自定义标签或旧简介推断。
- 缺少主行业的联系人保留在分布中，归入“未分类”，但不计入行业数；行业数不受图表前六项展示上限影响。城市保留为独立 `location` 并继续可搜索，自定义标签继续作为标签／话题。主行业编辑入口与服务端四维分析接入不在本次范围。
- 共用展示层按中／英／日语言转换同一行业 ID，并保持卡片和资料区名称一致；没有行业 ID 的旧资料文案不被该展示层覆盖。共享 API、字典及 App 文件均未修改，没有迁移存量联系人。
- 新增 8 项回归覆盖内存 provider → 真实 live 查询服务 → route → 两套页面适配器、详情、三语名称、城市搜索、行业计数、表盘未分类及旧资料保留；与周边回归共 51 项通过。真实账号跨端回读和生产部署仍未执行。

## 热拔插边界

调用方必须通过 `features/contacts/service-factory.ts` 获取 list/search/filter、detail/tag/status 和 business-card contact-write 服务。真实联系人存储可以独立接入，不改变页面或 API route。
