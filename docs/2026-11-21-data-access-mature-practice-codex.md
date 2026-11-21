**结论：Orbit 最值得先改的是“少读、少重复读、继续显示已读内容”。这些改动能同时改善速度和数据库流量。**

当前源码中，最明显的问题是：**打开一个小页面，会连带读取整份计划、多场活动或该用户全部笔记；多个接口还会重复读取相同的身份和业务资料。** 免费数据库休眠会增加久未访问后的首次等待，但不能单独解释每次切页都慢。

v3 的大方向正确，但应补上笔记、人脉和首页的读取问题；连接治理可以做，优先级应低于这些直接减少读取的改动。

本轮只读了文件和公开资料，未修改文件、未连接数据库、未运行应用或测试。以下“当前”指当前检出源码，不代表已经核实生产部署版本。

---

**一、成熟产品如何做到“点开就有”**

“点开就有”通常包含两个结果：**第一次打开需要的数据很少；再次打开先显示已有内容。** 它不要求每次点击都重新从数据库获取全部最新数据。

### 数据库：先把“找什么、拿多少”做对

这里的 **SQL**，就是服务器向数据库发出的一条查询指令。

| 做法 | 用在哪类产品、怎样起作用 | 公开依据 |
|---|---|---|
| 按常用查询设计字段和索引 | 人脉、项目、订单等业务产品。把所属用户、状态、日期、关联对象等经常筛选的条件设计清楚。**索引像目录，帮助数据库直接找到目标范围。** 常见列表按“用户＋状态＋时间＋唯一编号”读取。 | [PostgreSQL 多列索引](https://www.postgresql.org/docs/current/indexes-multicolumn.html) |
| 真正在数据库里分页 | 电商目录、消息、笔记、联系人列表。先取一页，例如 20–50 条；下一页从上次结束的位置继续。**游标就是记录“上次读到哪里”的位置标记。** 不是全部下载后再切成一页。 | [Shopify 分页](https://shopify.dev/docs/api/usage/pagination-graphql)、[PostgreSQL 分页及排序](https://www.postgresql.org/docs/current/queries-limit.html) |
| 列表只拿卡片需要的字段 | 业务后台、内容产品。列表拿标题、日期、摘要；打开详情才拿全文、历史和附件。数据越宽，每次传输和解析越贵。 | [Next.js 数据访问与最小返回字段](https://nextjs.org/docs/app/guides/authentication#using-data-transfer-objects-dto) |
| 计数在数据库里算 | 待办数量、报名人数、页签数字。返回一个数字，不把所有记录下载回来数。不过，**返回一个数字不代表数据库只处理了一行**；精确计数仍可能扫描整个符合条件的范围。 | [PostgreSQL 对 COUNT 成本的说明](https://www.postgresql.org/docs/current/functions-aggregate.html) |
| 热点汇总预先计算 | 报表、销售看板、反复显示的报名人数。**物化汇总就是把计算结果存下来，下次直接读。** 统计允许稍旧时可以用；简单人数也可以在报名、取消时同步维护一个计数字段。 | [PostgreSQL 物化视图](https://www.postgresql.org/docs/current/rules-materializedviews.html)、[Rails 计数字段](https://guides.rubyonrails.org/association_basics.html#counter-cache) |
| 复用连接，接受休眠的取舍 | 使用云函数的小团队产品。**连接池就是重复使用已经建立的数据库连接。** Neon 的连接池主要管理连接容量；应用连接池管理复用，两者不等于让数据库常驻。 | [Vercel 连接池指南](https://vercel.com/kb/guide/connection-pooling-with-functions)、[Neon 连接池](https://neon.com/docs/connect/connection-pooling) |

预先计算不是免费的：维护计数会增加少量写入，整份刷新物化视图也会重新读取原数据。**Orbit 应先用普通的小查询和数据库计数；只有确认某个汇总被频繁重复计算，才考虑保存汇总。** 不应为了几个数字新增高频定时刷新。

Neon 官方说明，免费档空闲五分钟后休眠，重新查询时需要唤醒。这是省成本与首次等待之间的交换；官方给出的通常唤醒量级也不能当作 Orbit 的实测保证。[Neon 休眠说明](https://neon.com/docs/introduction/scale-to-zero)

### 服务端：每次请求完成必要工作，并共用已经读过的数据

**没有“一次请求只能查一次库”的行业规定。** 对 Orbit 的简单列表，我会把“一次实时身份检查、一次分页、必要时一次小汇总”作为设计预算；复杂首页可以更多。重点是每次读取是否必要，以及查询次数会不会随着列表条数不断增加。

典型问题是 **N+1：先查出一批对象，再为每个对象各查一次关联信息。** 例如展示 30 人，就追加 30 次查询。成熟框架会把关联信息批量读取；Rails 官方直接展示了把逐条查询改为批量查询的做法。[Rails 批量加载](https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations)

登录校验通常集中在 **数据访问层——统一负责检查权限并读取数据的一组服务端函数**。同一个请求中的多个组件共用检查结果；下一次请求重新检查。Next.js 也建议把权威检查放在数据附近，并避免只靠页面外壳保护所有入口。[Next.js 认证指南](https://nextjs.org/docs/app/guides/authentication)

**对 Orbit，D31 意味着每个新的私有请求仍须查询实时撤销状态。** 单靠登录时签发的凭证、缓存几十秒的认证结果，都不能满足这个要求。可以优化的是重复检查，以及身份、注销状态分散在多次查询中的成本。

“按屏聚合”也很常见：为首页或详情准备一份恰好够用的答案，同时共用计划、联系人等基础资料。它不要求拆出新服务。Web 首次渲染可以直接调用这套读取服务，App 通过接口使用它。**只是把几个接口包装成一个接口，内部仍重复读取，收益就有限。** [面向前端的后端模式](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends)

服务端缓存适合公开活动资料、稳定字典、重复计算的业务摘要。**缓存失效，就是资料改变后让旧结果停止被复用。** 应按对象或用户准确作废；私有缓存返回前仍须完成本次请求的安全检查。Next.js 提供了缓存与更新机制，但仍需要应用定义正确的使用边界。[Next.js 缓存](https://nextjs.org/docs/app/getting-started/caching)

### 客户端：用户看到的内容，不必跟着每次请求一起消失

| 做法 | 哪类产品在用、实际作用 | 依据 |
|---|---|---|
| 先显示上次内容，需要时后台刷新 | 普通业务 Web、移动应用。刚读过且没有变化的数据可以直接复用；多个组件同时需要同一份数据，只发一次请求。 | [TanStack 新鲜期配置](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)、[SWR 请求去重](https://swr.vercel.app/docs/advanced/performance) |
| 本地数据库＋增量同步 | 高频使用、需要离线工作的协作工具。先从设备读取，联网后只补上发生变化的数据。 | 下方三个产品实例 |
| 乐观更新 | 待办、收藏、已读等交互。用户操作后先更新界面，失败再恢复；成功响应已经带回结果时，可以避免再查一次。 | [SWR 乐观更新与写后更新缓存](https://swr.vercel.app/docs/mutation) |
| 骨架屏 | 首次访问、设备没有旧内容时，先显示与最终布局相同的占位。它减少空白和跳动，**不会降低数据库读取量，也不等于内容已经出现。** | [Next.js 加载界面](https://nextjs.org/docs/app/api-reference/file-conventions/loading) |

三个产品的公开实现有所区别：

- **Linear**：客户端维护本地数据库，恢复联网后提交上次同步位置，只获取后续变化。[Linear 增量同步工程文章](https://linear.app/now/rebuilding-delta-sync-read-path)
- **Notion**：长期使用 SQLite 缓存加速页面；真正支持离线时，还必须保证页面依赖的数据完整，并处理持续同步和编辑冲突。[Notion 离线架构](https://www.notion.com/en-gb/blog/how-we-made-notion-available-offline)
- **Superhuman**：通过本地修改和待发送队列，让操作立即响应，再把变化同步到网络。这篇是其公开的早期架构说明，不代表全部当前实现。[Superhuman 离线架构](https://blog.superhuman.com/architecting-a-web-app-to-just-work-offline-part-1/)

这些能力会带来首次下载、设备存储、权限变化、删除传播、冲突处理等成本，不能把“增量同步”理解成天然更省数据库。

### 几百到几千用户的小团队，应该选择什么

对 Orbit，我建议的组合是：

**一个 Postgres、一套后端、按页面需要的小查询、正确索引、现有客户端缓存，以及必要的局部同步。**

这是基于成本和维护复杂度的建议，不是声称存在“千用户产品统一架构”的统计结论。小团队保留一套后端也有成熟实践支持；Basecamp 创始人的公开文章解释了为何大量独立服务更适合组织规模很大的团队。[The Majestic Monolith](https://signalvnoise.com/svn3/the-majestic-monolith/)

完整本地同步并非大厂专属，Linear 很早就在做；是否需要它，主要取决于产品体验。Orbit 当前更不划算的是分库分片、多地区读写、额外分布式缓存、自研完整同步引擎，以及为了低延迟长期预热数据库。

---

**二、对照源码，Orbit 为什么慢**

先澄清存储现状：Orbit 同时存在两类存储。

- 通用记录表 `orbit_records`：每行有所属空间、记录类型、所属用户等字段，业务内容放在 **JSON 载荷——一个可以容纳不同结构的数据包** 中。[表结构与索引](/Users/li/work/orbit/repos/orbits/shared/storage/migrations.ts:7)
- 功能自己的表：计划有 `plans / plan_items / plan_log`，活动有 `event_ops_*`，评估有 `event_assessments`。它们已经有独立字段和索引。[计划表](/Users/li/work/orbit/repos/orbits/features/plans/migrations.ts:26)、[活动目录索引](/Users/li/work/orbit/repos/orbits/features/events/event-operations/storage/migrations.ts:958)、[评估列表索引](/Users/li/work/orbit/repos/orbits/features/events/assessment/migrations.ts:78)

**通用表和 JSON 本身不能直接判为慢的根因。** 真正的问题是哪些条件在数据库里执行、返回多少内容，以及同一份资料被读取几遍。不能据此推导出需要整体重建数据库。

### 逐屏读取账本

下面是**源码静态估算，不是线上实测**。查询数按读取语句计算，暂不计事务开始／结束、首次结构检查、页面外壳通知、变更检查和 App 后台同步。

普通私有接口在业务查询前，通常已有：

`入口会话检查 → 注销门禁〔可能缓存命中〕 → 接口会话检查 → 查 profile → 查 account`

因此约为 **4–6 条查询**。同实例在途合并可能减少部分实际执行，兼容分支也会改变数量。[会话回调](/Users/li/work/orbit/repos/orbits/auth.ts:82)、[身份读取](/Users/li/work/orbit/repos/orbits/features/account/storage/account-live-record-provider.ts:361)

| 常用页面 | 一次打开大概做多少读取 | 读回什么、哪些没有显示 |
|---|---|---|
| **首页，默认布局** | 至少 **10 个不同资源接口**，同 URL 已有去重。仅公共校验逻辑就约 40–60 次，随后叠加待办、活动、计划等业务读取；有计划和活动时可进入上百条量级。 | 首页一张活动卡也会使用“我的活动”完整读取服务；待办小卡使用完整待办聚合。布局未返回前，部分卡片尚未挂载，又形成下一段等待。[首页装配](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/home/HomePlaceholder.tsx:50) |
| **Web 人脉列表** | 首屏逻辑上有全局汇总、列表、匹配汇总、目标关系 **4 次接口调用**。假设一个生效 v2 目标、没有生效 v1 计划、无搜索、未合并重复读取，约 **35–43 条读取查询**。 | 列表已经数据库分页；额外成本来自每个列表／汇总接口又读取计划和邀请关系。无筛选时还存在重复汇总调用。[页面读取](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/network/NetworkScreen.tsx:94)、[每次附带读取](/Users/li/work/orbit/repos/orbits/features/contacts/card-service.ts:130) |
| **活动列表** | Web 挂载即读评估、未来活动、过去活动、额度；“发现”再加目录。查询数随活动和评估数量增长，**有目标时可从数十条扩大到上百条**。 | “我的活动”先读过去180天到未来365天，每个来源最多200行，再挑10条；还会逐条取评估、重算分数。未选中的页签也已经读取。[列表入口](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/events/EventsScreen.tsx:97)、[活动筛选](/Users/li/work/orbit/repos/orbits/features/events/mine/service.ts:67)、[逐条评估](/Users/li/work/orbit/repos/orbits/features/events/mine/configured.ts:45) |
| **活动详情** | 有一个目标的常见成功路径，接口约为 **数十条、可达50条上下**；报名状态、缓存、主办方资料及会后分支会改变数量。 | 除活动本身，还读本人活动时间线、两条不同途径的计划上下文、联系人、主办方历史等。名单可见时，先读全场报名资料，最后通常只返回8位参加者。[详情装配](/Users/li/work/orbit/repos/orbits/features/events/journey/service.ts:162)、[全名单读取](/Users/li/work/orbit/repos/orbits/features/events/journey/live.ts:281) |
| **计划概览** | 以总共一个目标、需处理三场活动为例，概览与目标列表两个接口约 **35–50 条读取查询**；Web 页面在此前还会读摘要来选择目标。 | 概览内部重复读类型和日志；检查本月使用次数时，又逐个目标读取整份日志。为少量活动推荐还要装配活动事实。[概览](/Users/li/work/orbit/repos/orbits/features/plans/v2/service.ts:1147)、[逐目标日志](/Users/li/work/orbit/repos/orbits/features/plans/v2/service.ts:448) |
| **“该聊的人”类型详情** | 同样以上述三场活动举例，父概览可复用时约 **22–32 条**；不能复用、同时重新请求概览时，逻辑合计约 **50–70 条**。两接口是并行，等待时间不能直接相加。 | 为显示一个类型，读取所有类型的候选、相关联系人、计划日志和活动条目；整份概览还被用于步骤编号等小字段。[详情输入](/Users/li/work/orbit/repos/orbits/features/plans/v2/service.ts:549)、[Web 两请求](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/plan/PlanTypeDetailScreen.tsx:74)、[App 两请求](/Users/li/work/orbit/repos/orbit-app/src/screens/plan/PlanTypeScreen.tsx:90) |
| **Web 笔记** | 无搜索、无额外详情时，首屏 **4 个列表请求**；未合并时约 **20–28 条读取查询**。 | 每次底层都读取该用户全部笔记，包括正文，再筛选、排序、截20条。三个请求只为取页签数量，却也返回列表内容。若用户有1,000篇笔记，逻辑上可触发四次各1,000篇的读取；实际次数取决于在途合并。[全部读取](/Users/li/work/orbit/repos/orbits/features/notes/repository.ts:42)、[应用分页](/Users/li/work/orbit/repos/orbits/features/notes/service.ts:276)、[三个计数请求](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/memo/MemoWorkspace.tsx:135) |
| **待办** | 聚合10类来源。没有计划时是十几条量级；有计划和活动时可能达到 **30–50余条**，具体取决于来源数据。 | 普通任务、关系跟进已各用一条 SQL 做分页与计数，这是做得好的部分。额外成本主要在计划机会、草稿等来源；三组来源目前还依次等待。[聚合顺序](/Users/li/work/orbit/repos/orbits/features/todo/service.ts:48)、[跟进分页](/Users/li/work/orbit/repos/orbits/features/todo/followups.ts:35)、[计划来源](/Users/li/work/orbit/repos/orbits/features/todo/plan-sources.ts:79) |

表中的计划、活动数字是便于理解的**条件化样例**。当前不能知道生产用户实际有多少日志、候选和报名者，因此不能诚实地给出每屏固定“读取多少行”。

但源码已能确认增长方式：

- 笔记读取量随**本人全部笔记**增长。
- 计划读取量随**目标、完整日志、所有类型候选**增长；相关联系人一次最多取200位。
- 活动事实读取量随**活动数 × 每场报名者数**增长。一次活动事实读取，缓存命中仍通常要查报名路由和名单；未命中还需读活动资料。[活动事实缓存](/Users/li/work/orbit/repos/orbits/features/events/assessment/orbit-event-facts.ts:84)
- 计划最后最多保留20场活动，但普通路径的60天活动窗口查询**没有传 SQL 行数上限**，先取窗口内候选再截取。[窗口调用](/Users/li/work/orbit/repos/orbits/features/plans/v2/event-facts.ts:82)
- 人脉和待办的部分 SQL 虽然只返回一行汇总，数据库内部仍可能处理本人范围的大量记录和 JSON 内容；返回行数不能代替内部扫描量。

### 差距表

“改动大小”是相对范围：小＝局部调用或缓存修正；中＝需要改读取接口或查询；大＝涉及全入口安全迁移。

| 成熟做法 | Orbit 现状与源码依据 | 差距 | 改起来 | 对读取量 |
|---|---|---:|---:|---|
| 数据库筛选、分页，只返回列表字段 | 通用存储可以带条件和上限，但仍支持无上限读取；默认排序使用时间组合，不能假定现有单项索引完全匹配。[查询构造](/Users/li/work/orbit/repos/orbits/shared/storage/postgres-live-record-store.ts:222)、[已有索引](/Users/li/work/orbit/repos/orbits/shared/storage/migrations.ts:31) | 中，因调用方而异 | 中，逐热点处理 | 行数／字节可下降 |
| 一次读笔记页，一次返回各页签数量 | 笔记全量读取后应用分页，首屏还重复请求计数。[笔记筛选](/Users/li/work/orbit/repos/orbits/features/notes/service.ts:282) | **大** | 中 | **明显下降** |
| 人脉分页与必要上下文共用 | 分页已做好；每次分页和汇总仍重新加载计划、邀请资料。[附带上下文](/Users/li/work/orbit/repos/orbits/features/contacts/card-service.ts:130) | 中 | 小至中 | 查询数下降 |
| 一个类型只读本类型所需 | 类型详情复用整份计划输入；概览重复类型、日志，额度还有逐目标查询。[详情与概览](/Users/li/work/orbit/repos/orbits/features/plans/v2/service.ts:1147) | **大** | 中 | **查询、行数均下降** |
| 当前页签按需读取；关联信息批量加载 | 活动页同时读取未选中页签；名单、评估存在逐场／逐条读取。[挂载读取](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/events/EventsScreen.tsx:97)、[活动评分](/Users/li/work/orbit/repos/orbits/features/events/mine/configured.ts:45) | **大** | 小至中 | **明显下降** |
| 详情的小名单、计数各取所需 | 名单可见时读取整场报名资料，界面通常只显示8人。[读取](/Users/li/work/orbit/repos/orbits/features/events/journey/live.ts:281)、[截取](/Users/li/work/orbit/repos/orbits/features/events/journey/service.ts:234) | 大型活动时大 | 中 | 返回字节下降 |
| 每请求共用一次实时认证 | proxy 与接口重复检查，身份还分步读取；页面入口另查引导资料。[proxy](/Users/li/work/orbit/repos/orbits/proxy.ts:119)、[身份读取](/Users/li/work/orbit/repos/orbits/features/account/storage/account-live-record-provider.ts:361) | 跨所有页面的大差距 | **大，须保证D31** | 查询数下降 |
| 已读内容保留，新鲜时免请求 | Web已有60秒缓存；但计划概览、笔记列表仍从空状态发起读取，类型详情每次挂载仍请求。[缓存规则](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-last-answer.ts:25)、[计划概览](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/plan/PlanOverview.tsx:55) | 中至大 | 小至中 | 重访读取下降 |
| 首页小卡使用小摘要 | 首页会调用完整待办、我的活动等服务。秘书预览已有上限，但最多仍可查看500条通知来选少量卡片。[秘书读取](/Users/li/work/orbit/repos/orbits/features/notifications/secretary/preview-reader.ts:27) | 中至大 | 中 | 行数和重复读取下降 |
| 连接池按运行环境管理 | 已按进程复用，并非每请求新建全部连接池；当前源码空闲超时60秒，尚未接入 `attachDatabasePool`。[池复用](/Users/li/work/orbit/repos/orbits/shared/storage/configured-live-record-store.ts:215)、[超时](/Users/li/work/orbit/repos/orbits/shared/storage/database-runtime-profile.ts:24) | 耗时影响待测 | 接生命周期小，合池中至大 | 业务读取基本不变 |

两个边界尤其需要保留：

**活动详情不能简单把名单查询加上“只读8人”。** 页面还需要全场人数、认识的人数和匹配排序。正确做法是分别计算这些汇总，再返回排序后的少量卡片，避免把全员资料搬到应用里计算。

**App 已经有本地同步。** 人脉列表可从设备读取，笔记、任务、已报名活动等也有同步域；计划不在这些已列出的同步域中。[App 本地人脉列表](/Users/li/work/orbit/repos/orbit-app/src/screens/network/useNetworkList.ts:1)、[同步域](/Users/li/work/orbit/repos/orbit-app/src/data/sync/sync-domains.ts:11) 因此，Web 的首次取数账本不能直接套成每次 App 打开的成本。

### 登录、连接、冷启动、前端各在什么位置

当前 Web 的重要等待链是：

**服务端检查并返回页面 → 加载并运行页面脚本 → 客户端再请求业务接口 → 等数据到齐 → 显示内容。**

类型详情和活动详情都能从源码确认这种顺序。它会把前后两段等待串起来；接口之间用了并行，也消不掉前面的等待。[类型详情入口](/Users/li/work/orbit/repos/orbits/app/(app)/app/plans/[planId]/types/[itemId]/page.tsx:10)、[活动详情入口](/Users/li/work/orbit/repos/orbits/app/(app)/app/events/[id]/page.tsx:12)

连接重建、函数启动、数据库唤醒可能叠加，但有不同触发条件。若上一次实际查库确实只有15秒前，五分钟休眠就解释不了这次等待。

首次使用还可能执行结构检查：活动评估和邀请模块都在请求路径上准备迁移，这部分也不能算成“数据库查询本身慢”。[评估初始化](/Users/li/work/orbit/repos/orbits/features/events/assessment/configured.ts:157)、[邀请初始化](/Users/li/work/orbit/repos/orbits/features/invite-codes/configured.ts:177)

日本用户访问新加坡会产生网络等待；函数与数据库目前同区域，应继续避免把每条串行查询变成跨区域访问。**目前没有证据可以把总耗时按比例分配给网络、SQL、连接或前端。**

---

**三、最对症的四件事，以及与 v3 的差别**

**1．先取消已经确认的重复读取和未展示读取。**

计划读取中共用类型、日志、活动事实；类型详情直接提供步骤编号等小字段，取消为此重读整份概览。活动只读当前页签需要的列表，公共数字单独取；人脉避免重复汇总和重复加载计划关系。

这是最适合先交付的一组：范围相对可控，同时减少等待、查询和返回内容。

**2．把笔记分页、列表字段和活动汇总做到数据库里。**

笔记首屏应只取一页必要内容，一次返回三个页签数量；正文按详情需要读取。活动详情把人数、匹配统计与小名单分开处理；逐活动读取能批量的就批量。

计划的本月额度可以用针对本月的汇总查询，避免逐个目标下载完整日志。分数等依赖完整历史的逻辑应正确汇总，不能靠随意截断历史来“变快”。

**这是 v3 最明显的缺项：P1 主要集中在计划与活动，没有覆盖笔记的假分页，以及人脉、首页的连带成本。**

**3．统一一次请求内的身份与业务上下文，保持D31。**

每个新请求实时确认撤销状态，并共用身份结果；同一屏不要从不同服务反复装配同一个计划。所有最终入口都验证完成之后，才撤除 proxy 中重复的权威查询。

它影响所有页面，潜在收益大，但安全迁移范围也最大。**不能用跨请求认证缓存来换速度。**

**4．补齐现有客户端缓存，再处理首次打开的前后等待。**

计划概览、笔记等重访时先显示已有内容；新鲜时不读，写入后只作废受影响资源，避免小操作使整站重新读取。

Web 首次打开若仍受“页面返回后才取数据”影响，可以由服务端直接下发同一读取服务的首屏结果，并供客户端复用，避免随后再读一次。App 继续使用现有本地能力，优先补消费缺口。

这不要求现在扩大 Web 的持久存储范围。当前 Web 规则明确只保留内存缓存，整页刷新后旧结果会消失；更改这个范围属于另外的产品与安全决定。

与 v3 的顺序相比，我会做三处调整：

- 保留轻量测量，但把**笔记、人脉、首页**加入 P1。
- 把连接生命周期当作独立治理项，不把它排成主要提速收益的第二位。`attachDatabasePool` 主要防止函数挂起后遗留连接，**不保证建连次数或等待占比下降**。[Vercel 官方说明](https://vercel.com/kb/guide/connection-pooling-with-functions)
- 修正“缓存命中只比较报名人数”的设计：**人数相同也可能换人、改职业，匹配结果仍会改变。** 应使用可靠的资料版本或变更标记判断失效，不能只凭人数相同认定资料未变。[现有比较逻辑](/Users/li/work/orbit/repos/orbits/features/events/assessment/orbit-event-facts.ts:84)

另外，v3 的普通接口“3–5条前置SQL”应修正为通常约4–5条、兼容路径可到6条。它列出的调用链本身已经说明了这个数量。[v3 鉴权账本](/Users/li/work/orbit/docs/2026-11-21-data-access-redesign.md:33)

当前不划算的做法包括：整体迁走 JSON 记录表、全面合池、只为减少接口数新增一层服务、先引入独立缓存系统、重建完整同步引擎，以及常驻心跳、广泛预取或付费常驻。前几项应有测量依据，后三项也不符合本轮成本约束。

---

**最后，哪些已确认，哪些仍待测量**

**读代码确认的：**

- 上述表结构和索引定义、各页面调用链。
- 笔记全量读取后分页，以及首屏三个额外计数列表请求。
- 计划重复读取、逐目标日志查询、类型详情连带读取。
- 活动未选中页签读取、逐场名单读取、详情先取全名单再截取。
- 重复认证、已有连接池复用、已有 Web 缓存和 App 本地同步能力。
- 以上条件化 SQL 估算所依据的调用次数。

**属于推断、需要线上测量的：**

- 哪一项是实际耗时第一位，以及各项各占多少。
- 每屏真正执行的 SQL 总数、返回记录数和字节数；缓存、实例分布会改变结果。
- 生产数据库是否已具备源码定义的索引，以及查询实际是否使用它们。
- 当前部署是否包含刚读到的优化，前端脚本与绘制是否还有显著瓶颈。
- 每项优化能节省多少秒，以及按相同用户操作序列计算，数据库总进出流量是否下降。

测量应分别比较首次冷打开、连续切页、连接过期、数据库休眠和客户端缓存命中；同时记录主内容出现时间及数据库返回量。现有字节指标只是 JSON 序列化估算，不等于 Neon 计费流量；现有读取收据还会写数据库，所以应沿用 v3 提出的日志专用测量方式。[字节估算](/Users/li/work/orbit/repos/orbits/shared/storage/postgres-read-metrics.ts:118)、[收据写入](/Users/li/work/orbit/repos/orbits/shared/observability/read-receipts-sink.ts:76)