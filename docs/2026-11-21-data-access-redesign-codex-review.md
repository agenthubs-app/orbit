**结论：有条件通过。方向基本正确，但当前 v2 不能直接作为 P1–P3、P5 的实施规格。** 重复鉴权、连接重建、客户端取数瀑布确实存在；文档低估了业务层重复读取，又高估了合池、合接口对延迟的确定性收益。建议先做轻量 P0，并优先消除已能从代码确认的冗余读取。

本轮未修改文件、未连接数据库、未运行应用测试或压测。GitNexus `orbit` 索引落后于当前 HEAD，以下关键判断均回读当前源码；文档中的生产耗时未独立复测。

以下按必须修改的重要性排序。

1. **P2 必须补全安全边界，才能撤掉中间件的权威校验。**

   DAL 集中鉴权符合 [Next.js 官方建议](https://nextjs.org/docs/app/guides/authentication)，但“枚举 API 和 Server Action，检查包装器”不足以保证全覆盖，遗漏了 **RSC 页面、服务端组件，以及可返回会话资料的 Auth.js 出口**。

   例如类型详情页直接调用 `auth()` 后返回页面，并未经过 actor 包装器：[page.tsx:10](/Users/li/work/orbit/repos/orbits/app/(app)/app/plans/[planId]/types/[itemId]/page.tsx:10)。而当前查库发生在 `auth.ts` 的 JWT 回调中：[auth.ts:82](/Users/li/work/orbit/repos/orbits/auth.ts:82)。方案必须明确：这段查库迁到哪里、哪些调用改用新 DAL、`/api/auth/session` 如何继续拒绝旧会话。不能整体把 `/api/auth/**` 当作无须权威校验的公开接口。

   **尤其不能让新查询进入跨请求去重。** 现有代码专门给每次撤销检查生成唯一 key，避免“撤销提交后的新请求，复用提交前尚未结束的查询”：见 [session-revocation.ts:83](/Users/li/work/orbit/repos/orbits/features/auth/session-revocation.ts:83)。新 DAL 即使用了 React cache 或 ALS，底层若仍按用户共享在途 Promise，D31 仍可能被破坏。

   React cache 用于一次 RSC 渲染是正确方向；Route Handler 用 ALS 也可行，但须做到：

   - 每个入口建立独立 `run()` 作用域，立即保存鉴权 Promise，避免并行调用各查一次。
   - 缓存不能跨 HTTP 请求，也不能假定跨 proxy、页面函数实例共享。
   - 私有业务缓存命中之前，仍须完成本请求的实时校验。
   - 保留账号注销门禁的路径、方法例外，以及 canonical account/workspace 归属语义。

   当前 layout 还需要会话来初始化 `SessionProvider` 和导航壳，因此“不以 layout 作为安全总闸”合理，不能简单删除它需要的身份读取：[layout.tsx:28](/Users/li/work/orbit/repos/orbits/app/(app)/app/layout.tsx:28)。

   验收必须覆盖真实页面、API、Action 的完整入口，以及跨实例撤销、并发请求、存储故障。现有部分集成测试直接调用 proxy 并断言拒绝，迁移后需要改成验证最终入口，不能只原样保留：[session-revocation-auth-integration.test.ts:119](/Users/li/work/orbit/repos/orbits/tests/pages/session-revocation-auth-integration.test.ts:119)。

   **P6 应删除。** 用户已经明确禁止放宽 D31，不应继续保留“以后再议”。

2. **P1 直接合并连接池存在具体的并发退化风险。**

   计划仓储读取会先借出一条连接，开启只读事务，直到整个回调完成才归还：[repository.ts:631](/Users/li/work/orbit/repos/orbits/features/plans/v2/repository.ts:631)。但回调中的 `buildDetail()` 又调用 `reviewBudget()`：[service.ts:457](/Users/li/work/orbit/repos/orbits/features/plans/v2/service.ts:457)，后者目前通过另一个事务池查询配额：[service-factory.ts:56](/Users/li/work/orbit/repos/orbits/features/plans/v2/service-factory.ts:56)。

   **如果直接把两池合成 `max=5`，5 个概览请求可以各持有一条连接，再一起等待第二条连接，直至超时。** 必须先排查这类嵌套借连接，改成传递已有 executor，或把独立查询移出持有连接的范围。文档所谓“事务数受各自 `withTransaction` 控制”不能代替这项分析。

   另外，现有池已经按进程缓存，并非每次请求都创建全部池：[configured-live-record-store.ts:215](/Users/li/work/orbit/repos/orbits/shared/storage/configured-live-record-store.ts:215)。全仓库找到九处构造器，也不等于一次页面请求会使用九个池。

   `attachDatabasePool` 值得接入，但它主要解决挂起时空闲连接的生命周期问题，**不会消除新实例的第一次建连，也不能让不同函数实例共用一个池**。[Vercel 官方说明](https://vercel.com/kb/guide/connection-pooling-with-functions)

   建议把 P1 拆开：先给现有池接生命周期管理、保留错误监听；再处理共享池及事务依赖。合并时还要统一连接配置、关闭所有权和计量层，避免某模块关闭共享池，或同条 SQL 被重复计量。

   **直连可以暂时保留，但容量论证不成立。** 200 人在线不能推出只有 4–8 个实例；还需考虑函数分布、滚动部署、后台任务及连接持有时间。`901` 是一次探针读数，告警阈值不能脱离实际算力配置制定；Neon 的连接上限随 compute 大小变化。[Neon 连接池文档](https://neon.com/docs/connect/connection-pooling)

3. **“为什么慢”的判断需要补上业务读取成本，修正鉴权账本。**

   重复鉴权成立，但“三次串行往返”不是准确描述。常见私有 API 的逻辑链是：

   `proxy 会话检查 → 注销门禁〔可能命中缓存〕 → handler 会话检查 → profiles → accounts`

   身份读取本身通常就是两步，兼容路径还会多一步：[account-live-record-provider.ts:361](/Users/li/work/orbit/repos/orbits/features/account/storage/account-live-record-provider.ts:361)。页面导航还可能增加引导检查，其中又解析 actor、读取 profile：[proxy.ts:119](/Users/li/work/orbit/repos/orbits/proxy.ts:119)、[profile-onboarding-access.server.ts:43](/Users/li/work/orbit/repos/orbits/app/(app)/app/profile/profile-onboarding-access.server.ts:43)。相反，同一次 RSC 渲染中的部分检查已经有 React cache，不能把 layout、page 每次调用都算成独立 SQL。

   文档漏掉的更值得优先处理的成本包括：

   - **计划内部重复读。** `overview()` 先构建完整详情，再构建 `overviewInput`；两者重复读取类型和日志。类型详情也复用整份计划的输入读取，包括全部类型的候选、相关联系人及活动条目：[service.ts:1147](/Users/li/work/orbit/repos/orbits/features/plans/v2/service.ts:1147)、[service.ts:549](/Users/li/work/orbit/repos/orbits/features/plans/v2/service.ts:549)。
   - **活动事实扇出。** 计划先加载外部评估、活动窗口、本人活动和逐活动事实；活动事实的“缓存命中”仍会重新读取名单：[event-facts.ts:82](/Users/li/work/orbit/repos/orbits/features/plans/v2/event-facts.ts:82)、[orbit-event-facts.ts:84](/Users/li/work/orbit/repos/orbits/features/events/assessment/orbit-event-facts.ts:84)。这些成本可能远大于两条简单鉴权 SQL。
   - **未选中页签也读取。** 活动页挂载时同时读取评估列表、未来活动、过去活动、可用性；“探す”另行读取目录：[EventsScreen.tsx:97](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/events/EventsScreen.tsx:97)。活动目录内部还会构建计划上下文，并逐场判断最多 40 场活动：[journey/service.ts:101](/Users/li/work/orbit/repos/orbits/features/events/journey/service.ts:101)。
   - **冷路径还包含运行时迁移检查。** 活动评估首次使用会执行迁移准备，不能把所有冷耗时归因于 TLS：[configured.ts:157](/Users/li/work/orbit/repos/orbits/features/events/assessment/configured.ts:157)。

   这些是源码能确认的冗余或串行依赖；是否占生产耗时第一位，仍需 P0 分解。

   包体积、水合和绘制也不能排除，但目前证据不足以判为主因。本地生产构建产物明显旧于本次代码，不能据此报告当前包大小。P0 应补浏览器资源加载、JS 执行和主内容绘制，而不只测服务端 SQL。

4. **P3 有价值，但收益算法错误，且存在更小的改法。**

   当前 Web 类型详情的两条请求已经是 `Promise.all`，并且会复用新鲜的父计划缓存：[PlanTypeDetailScreen.tsx:74](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-2026/plan/PlanTypeDetailScreen.tsx:74)。App 也并行请求类型详情与 `overviewRecent`：[PlanTypeScreen.tsx:90](/Users/li/work/orbit/repos/orbit-app/src/screens/plan/PlanTypeScreen.tsx:90)。

   因此，**两个并行接口合为一个，不会自动少一个串行网络 RTT**。它能减少鉴权、连接竞争和重复工作；若只是服务端继续并行调用原来的两个重服务，页面仍然等待最慢者。文档中 App“接口耗时 × 接口数”的口径也应改为按依赖链计算。

   此外，客户端 BFF 仍保留 `RSC → JS/水合 → 接口` 的前置瀑布。仅靠合接口，不能解释或保证“5.6s → 2.0s”。[方案收益表:168](/Users/li/work/orbit/docs/2026-11-21-data-access-redesign.md:168)应改成待验证假设，删除固定冷启动下限及“之后保证都是热请求”的表述。

   **更小的优先方案：**

   - 类型详情已有 plan、types、log，可直接从这些已读数据生成所需的 Step 序号、统计等小字段，让两端不再为了这些字段请求整份概览。
   - 在一次计划读取中复用类型、日志和活动事实，避免重复查询。
   - 活动页按当前页签读取，保留确实需要的公共计数。
   - 补齐现有客户端缓存的新鲜期、在途去重和写后失效。

   这些修改同时减少等待和数据库读取。新增视图接口应留给实际存在跨模块首屏依赖的屏幕。Web 是否服务端下发首屏数据，也不应因 App 共用 API 就被一概排除；两端可以共用同一读取服务，Web 首次渲染调用该服务。

5. **“不多读数据库”的目标合理，目前的保证还不充分。**

   P0 可以做到不新增 SQL，但**不能直接把现有读取收据采样率调成全量**：当前生产装配包含数据库 writer，会向 `orbit_read_receipts` 插入记录：[read-receipts-configured.ts:14](/Users/li/work/orbit/repos/orbits/shared/observability/read-receipts-configured.ts:14)、[read-receipts-sink.ts:76](/Users/li/work/orbit/repos/orbits/shared/observability/read-receipts-sink.ts:76)。方案应明确采用日志专用通道，并限制记录期限和 CPU 开销。

   计量也须修正：

   - 当前字节数是返回行的 JSON 序列化估算，不能等同 Neon 实际进出流量：[postgres-read-metrics.ts:118](/Users/li/work/orbit/repos/orbits/shared/storage/postgres-read-metrics.ts:118)。
   - 区分连接等待、实际建连、SQL、渲染；并行 SQL 耗时之和不能当页面墙钟时间。
   - 固定同一版本、数据、操作序列，分别测新实例、连接过期、数据库休眠、客户端缓存命中。当前池已是 **60 秒 idle timeout**，15 秒样本不足以解释当前行为：[database-runtime-profile.ts:24](/Users/li/work/orbit/repos/orbits/shared/storage/database-runtime-profile.ts:24)。
   - 日总查询数需按访问量归一化，同时保留总量护栏，不能直接用不同流量两天的绝对数判断优化成败。

   P3 还有三个增加读取的入口：聚合缓存一处过期就整屏重读；预取取消后的无效读取；父数据缓存缺失后再补请求。应保留资源级新鲜度，并保证直接打开子页面也能完整取数。**在当前约束下，按下预取应先不做**，文档估计的“额外读取小于 5%”没有证据。

   “直接接入现有变更游标”也不成立：目前区域只有 inbox、contacts、tasks、calendar、memo、agent，没有 plans/events：[change-tokens.ts:18](/Users/li/work/orbit/repos/orbits/shared/storage/change-tokens.ts:18)。补充失效机制及其读取成本必须进入方案。

6. **P5 做法 B 按现有描述不能可靠预热，应删除或重写。**

   例如整点查询得知 55 分钟后有活动，然后预热一次；Neon Free 空闲 5 分钟后便再次休眠，活动开始时仍是冷库。[Neon 官方说明](https://neon.com/docs/introduction/scale-to-zero)

   当前小时维护任务本身已经访问数据库，整点再发一条预热查询通常没有额外作用：[configured-tasks.ts:65](/Users/li/work/orbit/repos/orbits/features/operations/maintenance/configured-tasks.ts:65)。而真实用户轮询会因页面不可见、空闲而停止，不能保证活动期间一直有流量：[orbit-change-watch.ts:85](/Users/li/work/orbit/repos/orbits/app/(app)/app/orbit-change-watch.ts:85)。

   若以后确需预热，应是临近真实入场时间、次数有硬上限、自动结束的活动级一次性触发，并计算调度查询及唤醒成本。它最多减少数据库唤醒等待，不能保证页面/API 函数实例已热。当前最简单的选择是暂不做 P5。

推荐调整后的顺序如下：

| 顺序 | 工作 | 判断 |
|---|---|---|
| 1 | 轻量 P0，修正基线与测量口径 | 先做，避免按错误归因重构 |
| 2 | 计划读取去重、取消无关页签读取、补齐现有缓存 | **小改中性价比最高，且直接减少读取** |
| 3 | 给现有池接 `attachDatabasePool` | 独立做连接治理，不承诺消除冷启动 |
| 4 | 建立统一 DAL，完成全入口验证后再撤 proxy 查库 | 公共收益潜力最大，安全迁移要求最高 |
| 5 | 修复嵌套借连接后分批合池；按实测选择 BFF | 不宜一次全局切换 |
| 6 | P5 暂缓；P4 另评估；删除 P6 | 保持成本和 D31 约束 |

验收应以“主内容更早出现、同场景 SQL/返回量不增加、真实流量不明显增加、D31 完整成立”为准，不能只靠接口数量变成 1、类型检查或截图一致。