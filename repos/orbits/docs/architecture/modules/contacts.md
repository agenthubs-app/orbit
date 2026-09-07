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
- 联系人详情从同一组 live records 映射成 detail/tag/status 契约；支持写入的 live provider 在成功前持久化并回读标签、状态、note、last interaction 和主要行业。主要行业写入联系人主记录，其余详情状态按 actor 隔离；mock 预览不能作为持久化证据。
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

## Web 关系进展入口用词（2026-09-08）

- 对齐 App 的“关系进展”名称：现行 pipeline 页的桌面／窄屏标题、共享侧栏、联系人列表／操作记录窄屏导航和联系人详情下一步链接统一用词；英文对应 `Relationship progress`。
- 保留 `/app/contacts/pipeline` 及旧导航路径映射、人数标记、既有布局和只读说明，不更改 API 或阶段值。历史未装配的 pipeline／导入侧栏组件不作为本次业务同步基准。
- App 对应术语版本 `b45641788` 同时保留“待跟进”旧数据别名。Web 的四阶段、阶段写入、关联待办仍待接入，本次不代表这些业务已对齐。
- 10 项中／英真实页面渲染回归先失败后通过，覆盖链接名称与目的地、两种宽度的标题和侧栏人数；周边共 52 项通过，Web 类型检查通过。未执行真实账号写入或跨端回读。

## Web 主要行业编辑（2026-09-08）

联系人详情的桌面与窄屏联系方式卡片提供同一个行业编辑弹窗，沿用原有样式与焦点管理。选项来自共享的固定三语字典；没有分类时仍可编辑。保存仅 PATCH `/api/contacts/:id` 的 `primaryIndustryId`，清空明确发送 `null`，不随请求覆盖标签、备注或关系阶段。

弹窗打开期间，新的服务端页面数据不能改写未保存选择；浏览器整页重载不保留本地草稿。保存期间锁住重复点击；失败保留选择并显示重试提示。只有响应中的联系人 ID 和行业值均匹配才显示成功，详情直接展示服务端确认的值；关闭后重新打开沿用已保存值，之后收到新的服务端页面数据则以新数据为准。离开弹窗后晚到结果不再修改页面。

验证包括真实页面双入口渲染、编辑交互、PATCH handler → live service → 内存存储的保存／清空及新实例回读，确认标签与状态不变。浏览器脚本 `tests/pages/app-contact-industry-editor.browser.mjs` 在隔离 mock 预览中检查 1440px／390px 的失败、重试、清空、重开和键盘焦点；全部浏览器 API 被拦截，不访问业务数据库。本项不修改共享契约或 App，不执行行业迁移，也不宣称真实账号的跨端同步已验收。

## 旧标签移除兼容（2026-09-08）

live 与 mock 的标签校验不再把 `removeTags` 算作新增标签：已存在的超长标签、一次移除超过 20 个旧标签均可处理。`tags` 替换及 `addTags` 新增仍执行原有数量与长度限制。内存 live provider 回归确认移除后其他标签保留、冷读一致，非法新增零写入。本项不迁移或主动删除用户标签；只有用户提交的移除请求才会改变数据。

## 热拔插边界

调用方必须通过 `features/contacts/service-factory.ts` 获取 list/search/filter、detail/tag/status 和 business-card contact-write 服务。真实联系人存储可以独立接入，不改变页面或 API route。
