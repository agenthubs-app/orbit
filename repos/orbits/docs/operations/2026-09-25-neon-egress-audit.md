# Neon 5 GB/月流量审计与治理方案

审计日期：2026-09-25（Asia/Tokyo）。性质：代码审计、生产部署元数据只读核对、本地 PostgreSQL 复现；没有修改业务代码、部署、云数据库或线上配置。

## 结论

流量容易耗尽的根本原因，是读取成本随数据总量、轮询次数和参与扫描的用户数一起增长，而系统尚未把这些成本约束在 SQL、接口、调度、环境和发布流程中。完整测试误连 Neon 会放大这个问题，但现有证据不能把旧项目的 7.59 GB 全部归因于测试。

已复现的主要机制：

1. 跟进读取在 SQL 侧没有 actor 过滤，完整读取 workspace 的 tasks、contacts、connections、evidence，再在 Node.js 内过滤用户。这条路径也用于旧通知信号刷新。
2. 会话列表先读取全部会话，再读取每个可访问会话的完整消息历史和已读状态，最后才在内存分页。App 部分前台页面每 15 秒为角标请求三个接口，其中包含该会话列表。
3. Bootstrap 和完整 dashboard 仍返回整批记录。SQL 摘要与联系人分页虽然在当前代码中存在，仍有未使用、兼容回退和响应附带大数组的问题。
4. 十分钟维护循环可以在无人操作时持续运行。旧通知路径对每个启用推送的 actor 重算信号；新通知路径也存在重复扫描和投影。
5. 生产仍运行较早的源码，当前主线部分降流量能力没有上线；监测、预算和测试隔离也不是端到端强制闭环。

将完整测试迁到本地是必要措施，但无法单独消除上述生产读取。

## 1. 证据范围、版本与历史事实

### 版本核对

| 对象 | 实际结果 |
| --- | --- |
| 本地源码 | `26b3d5fc5d063ec4b725da3edd7d42774e6877c8`，`chat-agent` |
| GitNexus | 绑定 `orbit`；索引时间 2026-09-24 23:46，`status` 显示覆盖的 4,904 个文件内容与当前一致 |
| Vercel 项目 | `orbit-staging-20260917` / `prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt` |
| 当前 Production target | `dpl_3UBsvmTRUMtYkFwujuhNmUw4ebpZ`，READY |
| Production 源码元数据 | `02ec26f0b8655011f900338eacc63881d378a76b`，分支 `codex/production-cutover-read-write-20260917` |
| 部署方式 | `redeploy`，originalDeploymentId=`dpl_5YSXNR4mGzsb1xWuZt6FfY4jUimV` |
| 本次检查的读取相关 env 条目 | Production/Preview 均有 `ORBIT_PG_READ_METRICS`；没有 `ORBIT_READ_BUDGET_*` 或维护间隔覆盖条目 |

以上来自 Vercel 部署与项目 API 的只读结果，并用本地 `git show 02ec26f0:...` 核对对应文件。部署元数据不是逐个构建文件的内容哈希证明，但足以发现当前 production target 与本地主线并非同一发布版本。

生产提交中不存在当前主线的以下文件：

- `features/sync/read-budget-gate.ts`
- `features/dashboard/storage/dashboard-summary-postgres-reader.ts`
- `app/api/_shared/conditional-read.ts`
- `features/sync/domain-registry.ts`

因此不能通过只设置环境变量启用尚未部署的熔断实现，也不能把本地条件请求测试通过当成线上已节流。生产已经包含早期联系人 scope/projection 和标准测试入口保护；并非完全没有优化。

GitNexus 查询/context/impact 已用于定位路径，但本索引存在 FTS 降级、动态分发缺边和明显同名误连；部分 impact 为 CRITICAL 且 `partial:true`。本文关键结论都回到源码和本地运行确认，没有把图谱缺少调用方解释为没有调用。没有修改共享业务符号或据截断结果放行发布。

### 历史用量不能混算

既有交接记录确认，早期 `orbit` / `wispy-smoke-15186904` 达到约 7.59 GB 传出、61.49 MB 存储，控制台显示 Free 限额暂停。2026-09-24 迁移的 `orange-forest-30108072` 则是约 47.78 MB 传出。组织汇总 7.95 GB 不能作为后者再次超额的证据。

本轮未查询 Neon 业务数据，未重新执行云端全量导出。Vercel 有界日志查询仅拿到四条旧部署 maintenance 请求记录，时间间隔约 602 秒；没有取得能把历史 7.59 GB 按测试、页面、worker 精确拆分的完整字节账本。不能计算各来源的历史占比。

9 月 10 日的测试数据库审计还明确记录当次目标为本地 PostgreSQL，这不能拿来证明那次测试消耗了 Neon。环境误连是有代码依据的风险，需要逐次执行证据才能认定具体事故。

## 2. 流量模型与本地复现

Neon 的出站流量发生在数据库返回查询结果时。数据库内部扫描多少行、HTTP 最终返回多小、页面显示几条，是三个不同指标。

应用近似成本可拆为：

`月数据库出站 ≈ Σ(某路径调用次数 × 每次 SQL 返回字节) + 后台任务 + 验证/导出/维护 + 协议等开销`

本报告的测量是 pg 驱动解码结果的 JSON 字节，**不是 Neon 计费字节**。表中的场景是本地合成数据，不代表旧生产库或当前只有数百条记录的新库的实际单次成本；用于证明增长机制和相对差异。

### 现有性能测试复跑

测试使用新建本地库 `orbit_neon_audit_20260925`、随机 schema；未加载云连接。标准基准包含生成关系夹具和额外的 12 条规范任务、12 条笔记。

| 操作 | SQL 次数 | 返回行数 | 返回 JSON 字节 |
| --- | ---: | ---: | ---: |
| 联系人列表，不传 limit | 6 | 2,064 | 1,409,601 |
| 任务列表，最终业务结果 12 条 | 1 | 92 | 125,682 |
| 笔记列表 | 1 | 12 | 12,116 |
| 完整 dashboard | 1 | 5,068 | 3,570,222 |
| 活动列表 | 1 | 13 | 21,268 |

`tests/performance/read-cost-baseline.test.ts` 实际失败：联系人预算仍是 1,548 行 / 1,374,261 字节，本次为 2,064 行 / 1,409,601 字节，分别超出约 33.3% / 2.6%。这是需要处理的真实预算检查失败，没有通过提高基线掩盖。

### 新增临时诊断脚本

仅使用原有生成关系夹具，不追加上述 24 条任务/笔记，调用真实 SQL client/provider/service。因 fixture 不同，不能和上一表做逐字节相减比较。

| 操作 | SQL 次数 | 返回行数 | 数据库结果 JSON 字节 | 业务结果 JSON 字节 |
| --- | ---: | ---: | ---: | ---: |
| 联系人列表，不传 limit | 6 | 2,064 | 1,368,321 | 130,831 |
| 联系人第一页，limit=20 | 1 | 1 | 410,132 | 42,029 |
| 完整 dashboard，activityLimit=4 | 1 | 5,056 | 3,565,386 | 140,549 |
| dashboard summary，触发兼容回退 | 2 | 5,057 | 3,589,199 | 41,711 |
| bootstrap graph | 1 | 5,119 | 2,079,745 | 669,875 |
| followup graph | 4 | 5,043 | 7,750,356 | 2,196,684 |
| followup graph，新增其他用户 1,000 条联系人后 | 4 | 6,043 | 10,383,142 | 业务记录集合不变 |

最后一行每条新增联系人有 2,048 字节无关字段；当前用户的 tasks、contacts、connections、evidence 完整记录集合逐项一致。原 SQL 并列时间戳缺少稳定 ID 排序，插入后有返回顺序变化，因此诊断对完整记录排序后比较，未把顺序一致冒称已验证。

这直接证明：无关数据会增加该用户一次读取的传出费用。若后台对 N 个用户重复调用，成本还会乘以 N。

另一个关键点：联系人第一页只有 **1 个 SQL 结果行，却有 410 KB**，因为该行包含 JSON 聚合。仅限制 SQL 行数无法控制传出字节。

### 有效优化与回退边界

- 联系人精确详情测试通过：旧 fallback 在合成数据上为 203 行 / 3,709,006 字节；当前 scoped path 为 6 行 / 2,469 字节，无关数据扩大十倍仍不增加。早期文档的 5 行 / 2,409 字节是旧版本数字。
- SQL dashboard 摘要在规范数据测试中，图读取 35,769 字节降至摘要 1,529 字节，确实有效。
- 同一摘要随着本人数据增加 1,000 条增长至 16,471 字节，仍非严格常数大小；摘要还带 provenance/evidence 集合。
- 原生成夹具含 `+00:00`、微秒等历史时间格式。摘要 SQL 的 `activity_order_safety` 只接受固定毫秒 UTC `...SSS Z` 形式（实际字符串无空格），不满足时抛 `DashboardSummaryRequiresGraphFallback`，provider 改读整图。这是本次 3.59 MB 摘要读的原因。

### 5 GB 为什么很容易用完

下列只是按十进制 5,000,000,000 字节做的量级演算，不是历史账单还原：

- 每次约 3.57 MB：约 1,400 次就是 5 GB，30 天平均每天约 47 次。
- 每次约 7.75 MB：约 645 次就是 5 GB，平均每天约 22 次。
- 十分钟一次意味着 30 天 4,320 次；假设一次后台扫描返回 1 MB，单这一项就是 4.32 GB。
- 前台每 15 秒调用三个接口，一小时约 720 次请求；每个请求都可能包含多个数据库查询。

因此少量开发者、浏览器验收、模拟器和后台扫描也能达到额度，并不需要大量真实用户。

## 3. 根因及代码位置

以下路径相对于 `repos/orbits`，App 路径另行注明。

### R1：SQL 读取边界晚于业务过滤

`features/followups/storage/followup-live-record-provider.ts:271` 的 `readFollowupGraph(actorId)` 对四个集合只传 workspace/collection，`belongsToActor` 在查询返回后执行。production `02ec26f0` 与当前文件的差别仅为显式加上 `limit: "unbounded"`，读取范围未缩小。

该路径可从跟进业务与 `features/agent/signals/source-collector.ts:104` 进入；后者还读取整个活动列表再判断未来七天。必须在数据库中先筛 owner/合法历史 accountId、到期条件和关联 ID，再返回需要的列；不能在客户端隐藏数据来解决。

`features/tasks/repository.ts:52` 也先读取 actor 的全部 task payload，再解码和丢弃旧格式行；本次 92 行才得到 12 条业务任务。

### R2：高频角标请求复用重型会话接口

App `src/hooks/useRelationshipInboxBadgeCount.ts:49` 在页面聚焦且前台时每 15 秒触发，`:89` 附近同时请求会话、legacy notifications、typed inbox。该 hook 用于首页与 AI 页面。已有后台/失焦停止逻辑，应保留，不把它误说为手机后台持续轮询。

`features/relationship-communication/service.ts:768` 的 `listConversations` 查询全部 workspace 会话，然后逐个校验 binding，调用 `conversationSnapshot`。`:351` 的 `messagesFor` 读取该会话完整消息历史；`:419` 再读取已读位置并在内存计算未读数。全部完成后 `slice(0, limit)` 才分页。

因此会话列表和角标成本随历史消息增长；这里的分页只限制最终响应，不限制数据库传出。production 与主线这条路径均存在。成熟设计需要独立的轻量未读计数/会话摘要读模型，消息详情使用游标分页。

### R3：读接口承担扫描和重复投影

`app/api/inbox/notifications/handler.ts:20` 在 typed inbox 对该 actor 启用时，每次 GET list 都先运行 `refreshInboxBusinessRecords`。

`features/notifications/inbox-business-refresh.ts:17` 刷新个人日程提醒，并用 `while(true)`/每页 50 条扫描提醒计划、名片批次、约谈等，逐条投影/upsert。分批读取控制单批内存，并不限制一次请求的总读取；部分扫描没有持久增量游标，约谈等使用 since/30 天窗口反复读历史。

`features/notifications/typed-delivery-factory.ts:18` 的后台 materialize 也调用同一刷新函数。消息扫描少于 50 条时又将位置设回 `cutover.since`，后续 pass 会重读同一窗口；幂等保证不重复产生业务结果，不能保证不重复消耗传输。

这是受功能开关、账号和数据量影响的成本来源，未证明所有生产用户均已启用。

### R4：后台恢复任务仍以周期性全量检查为基础

`features/operations/maintenance/heartbeat.ts:14` 默认 600 秒；`configured.ts:47` 仅以 `VERCEL=1` 和可选关闭开关决定是否 bootstrap，Preview 也可启动。已有 workspace 单链和 seq 去重，不能把它误说成每个实例必然各起一条无限链。

`configured-tasks.ts:119` 每轮通知恢复传 `refreshSignals:true`；`notifications/delivery-pass.ts:73` 枚举开启推送的 actor。未切 typed 的 actor 在 `:100` 刷新信号，进入 R1；typed 分支则进入 R3。无人访问时也可能读取，实际大小取决于 opt-in actor、切换状态及数据规模。没有 opt-in actor 时不会执行这些 per-actor 重读，不能把上述放大量当成所有项目固定底噪。

部分任务已有 due-only/小批保护，例如 `configured-canonical-reminder-maintenance.ts` 的到期 actor LIMIT 25、计划 LIMIT 10，不应推翻已有正确实现。

`scripts/run-maintenance-scheduler.ts:11` 加载环境后默认无限循环。脚本在开发者电脑运行，也可能因为连接配置而消耗远端流量。Preview、旧部署和独立 worker 需要跟随正式环境登记和撤销，单改域名并不会重写旧部署的配置快照。

### R5：优化接口没有覆盖所有消费者，并存在兼容回退

`features/mobile/contacts-dashboard-service.ts:120` 并行聚合七个 section；`:232` 使用完整 dashboard aggregate，`:242` 联系人列表不传 limit。当前已做 dashboard 同请求去重，不能把七个 loader 等同于七次完整图读取；但去重后仍可能读取一个完整图以及其他大列表。

`features/contacts/storage/contact-list-postgres-reader.ts:1543` 要求合法显式 limit 才使用页读取；无 limit 会回到完整列表。非空搜索且排序规则运行时不满足校验时，还可能走全量 fallback 保持搜索语义。production 旧页读取条件更窄：必须非空 query + limit，且无其他筛选条件。

`features/bootstrap/storage/bootstrap-live-record-provider.ts:522` 已投影字段，但未限制匹配行总量；`:731` 只合并在途读取，完成后清除。它不是跨请求缓存。

`features/dashboard/storage/dashboard-live-record-provider.ts:704` 处理摘要失败回退；`dashboard-summary-postgres-reader.ts:257` 为时间格式兼容检查。要补回退计数和原因观测，修正数据/读取语义后再收紧回退，不能直接抛弃历史合法记录。

### R6：测试边界存在，但覆盖不完整

`scripts/run-node-tests.mjs:4` 在加载测试前执行本地数据库检查；本轮远程 URL 拒绝与本地允许测试均通过。

然而 `shared/storage/live-database-config.ts:18` 只有显式 target=local 才走本地；很多真实 PG 测试直接使用 `ORBIT_EVENT_DATABASE_URL`，不经过 target 解析。`node --test`、自定义脚本、应用 E2E 指向云 API、以及测试加载阶段新增配置，都不能仅靠这个入口检查覆盖。

所以“测试进程在本机执行”不等于“测试不消耗 Neon”；必须同时确保 Web/API、数据库、队列、外部服务使用隔离测试依赖。

当前字面量审计在 `features/app/shared/scripts` 共发现 **75 个文件、171 处 `limit: "unbounded"`**。该数字不包含所有直接 SQL，也包含允许的内部/运维用途。测试只约束这些标记不增加，不能证明每个读取已优化。

### R7：可观测性、预算和发布没有闭环

`shared/storage/postgres-read-metrics.ts:61` 按 SELECT/WITH 等首词计量，遗漏普通 INSERT/UPDATE/DELETE RETURNING 的返回数据；通用 store 在 `postgres-live-record-store.ts:335/353/417/449` 返回完整 recordColumns。事件运营独立 PG client、维护 raw Pool 等也没有全部经过这一指标层。

现有指标没有稳定的业务 operation/query 模板维度，不能单凭聚合日志回答具体接口或任务消耗多少。部分通路没有覆盖，缺日志不能推断没消耗。

主线 `features/sync/read-budget-gate.ts` 是 opt-in、进程内、按分钟、事后累计的闸门，只在显式接线入口检查。serverless 多实例、冷启动、直接 SQL 和未覆盖 client 不共享一个项目总账；一次超大的首个查询也已经发生流量。不能把它描述成 5 GB/月硬上限。

当前条件 GET 能在业务读取前用水位判断返回 304，本轮本地六路由测试通过。但 `shared/storage/domain-watermark.ts` 的水位是 `max(updated_at)+count(*)` 聚合，不是 O(1) 版本行；虽返回字节小，仍可能扫描较多索引项。联系人/活动的 workspace 级失效也较粗。独立的业务版本行可进一步降低 CPU 与无谓失效，但必须和写入事务一致维护。

## 4. 成熟产品的落地方案

不需要先重写为微服务或更换数据库。保留现有 PostgreSQL、API、队列和已验证的权限/幂等逻辑，按高流量路径逐条替换读取实现。

| 顺序 | 交付内容 | 验收标准 |
| --- | --- | --- |
| P0：环境与发布 | dev/CI 使用专用本地 PostgreSQL；测试不注入生产密钥；云 smoke 独立入口和小数据；建立生产 commit/迁移/配置清单 | 完整回归在禁止外部网络的测试环境可运行；测试开始核对 host/database/schema；发布回读版本与目标一致；旧部署/worker 有清单 |
| P0：成本账本 | 统一所有 PG client 的结果计量，包含 RETURNING；标注 route/job/query 模板、deployment、rows、bytes、duration、retry、fallback | 能按日列出 Top 消耗来源；指标不记录正文/密钥；与 Neon 项目实际传出增量做对账，明确差额和采样率 |
| P1：跟进与通知信号 | owner/历史归属/到期过滤下推 SQL；按已选关系读关联联系人与证据；优先读 due/changed actor | 给其他用户增加 10 倍数据，当前用户结果和返回字节不随之增长；权限与提醒语义通过等价性验证 |
| P1：消息/角标 | 独立 badge count 与 conversation summary；DB 内分页；message history 游标分页；同设备共享刷新协调器 | 角标不返回消息正文；长历史增长不增加角标读取量；无变化走廉价版本请求；离开前台停止；失败退避和抖动 |
| P1：列表/首页 | Web/App 真正消费游标；bootstrap 最小身份/配置，业务懒加载；dashboard 使用计数/Top-N/分布读模型 | 看 20 条只取该页所需记录；全局统计仍正确；结果不因 LIMIT 丢失；1,000/10,000 条夹具下字节预算达标 |
| P1：摘要回退 | 记录并治理 timestamp/collation/search fallback；规范化与历史兼容一起验证；provenance 使用有界摘要/详情链接 | 规范数据命中 SQL 摘要；历史数据保持语义；回退率和回退字节可观测；不靠截断证据或悄悄漏结果降成本 |
| P2：通知物化与调度 | 业务写事务记录 outbox；按对象版本增量投影；持久游标单调前进；按 next_due_at 唤醒，小批 lease；保留低频修复扫漏 | GET 列表不重建全域历史；空闲 24 小时无业务 payload 全量读取；重复投递幂等；重启/丢消息仍恢复；提醒不因降频而延迟 |
| P2：全局预算控制 | 本地单次预算 + 服务端路由/actor限速 + 跨实例预算聚合 + Neon实际用量告警 | 达阈值暂停批量导出/测试/非必要刷新；核心操作保留预算；冷启动、多实例和重试不绕过策略；告警有动作和负责人 |
| 发布门禁 | 成本回归、分页/搜索/权限契约、同版本 Web/App 验证、少量云 smoke、分阶段发布/回退 | 当前超预算测试变绿且不是单纯调大阈值；部署证据证明新代码已运行；上线后按日比较实际传出 |

### 测试环境分层

- 本地/CI：单元、契约、真实 PostgreSQL 集成、迁移、并发、失败恢复、E2E、压力和成本增长测试。数据库主版本/扩展与生产对齐；每次使用专用数据库或独立 schema，并核验实际连接目标。CI 从源头不给生产凭据，以网络边界防绕过；允许的外部服务测试另设受控任务。
- 云 staging：独立项目/凭据、少量合成数据、默认关闭 Cron/队列消费与后台循环。仅验证 TLS/连接池、部署环境、迁移、认证、关键跨端流程和真实 provider 边界。现有 100 SQL/1 MiB 可作为单轮 smoke 的应用侧起始预算，但不能当 Neon 计费上限。
- Production：健康与极少量关键业务 smoke、可观测性和实际使用；不承载完整回归、大夹具和压力测试。迁移、备份和真实工作负载也要计入总预算。

不要把生产数据全量复制作为每轮本地测试的前置步骤。优先合成夹具，必要时一次性经批准生成脱敏代表样本，随后本地复用。

### 预算如何设定

先使用项目实际账期的 5 GB 和剩余天数计算剩余额度，再给业务、后台、验证和预留量分配预算。建议开发期至少预留 20%，目标可先按约 4 GB/月控制；以 30 天估算约 133 MB/天，但真实分配应使用当前账期长度和活跃用户数。

单操作上限通过“目标活跃量 × 每人每日操作次数 × 每操作字节 + 后台底噪”反推。可先评审：轻量 badge/版本请求数据库返回几 KB、20 条列表数十 KB、首屏约 100 KB 量级。它们是设计目标，不是当前已达到的保证；详情正文单独分页/按需读，避免为了预算破坏业务。

50%/80% 应用于实际累计用量和消耗速度预测：达到一半时核查异常增长，达到 80% 时停止非必要测试/批量操作并保留业务预算。实现前，这只是操作规则。应用侧计数由于协议差异、延迟和旁路不能承诺绝对不越界。

生产稳定性要求高时，优化后仍应按真实容量评估付费资源和成本上限；免费硬额度不宜成为唯一可用性保障。重建项目和反复迁库不是日常容量治理方案。本报告不执行升级。

### 容易误判的措施

- SQL 增加索引主要减少计算和延迟；返回同样数据时，不能自动减少出站流量。
- HTTP gzip、浏览器少显示几条、Node.js `.slice()`，都发生在数据库数据已传出之后。
- 在同地域部署不等于现有公网数据库连接的传出自动免费。
- 服务实例内短期去重不能替代跨请求的按版本缓存；缓存要绑定 actor/workspace/权限纪元/查询参数，防止越权或陈旧权限。
- 不直接把十分钟改成数小时：应先把到期提醒和可靠唤醒接好，再减少恢复扫描。
- 不直接把所有无界读取改成固定 20 条；管理导出、全局计数、关联证据、完整列表各有不同语义。

## 5. 验证结果与可复现性

本次稳定配置下复跑的现有测试共 14 项：13 通过、1 失败、0 跳过。唯一失败为联系人读取预算回归。具体为：

- `tests/performance/read-cost-baseline.test.ts`
- `tests/services/contact-scoped-read-postgres.test.ts`
- `tests/api/conditional-routes-postgres.test.ts`
- `tests/architecture/local-test-database-boundary.test.ts`
- `tests/audits/unbounded-list-reads.test.ts`
- `tests/services/read-projection-parity-postgres.test.ts`

最后一个文件硬编码允许数据库名 `orbit_cutover_test_20260917`，因此在既有该本地专用库的随机 schema 中验证；未修改现有 public 业务表。其余在新建 `orbit_neon_audit_20260925` 中验证。测试结束均清理自己创建的 schema；新诊断库已检查只剩空 public，保留以便复现。

首轮 `env -i` 清空了默认用户名，未显式写数据库用户，连接被本地 PG 拒绝；另有摘要测试因数据库名硬编码拒绝。已改用显式本地用户并遵循指定测试库再执行。这些配置失败未计作产品缺陷，也未冒充通过。

临时只读成本调用脚本（建种子仅发生在本地随机 schema）：`/tmp/orbit-neon-egress-audit.X1hSB3/cost-probe.mts`。脚本复用现有生产 provider/service，打印计数，不包含生产连接串。首次比较暴露并列时间戳的返回顺序变化，最终以完整记录集合等价验证无关数据放大；未改业务实现或放宽已有仓库预算断言。

后续实施优先顺序：环境/版本/计量 → 跟进和消息角标热路径 → 列表与摘要消费者 → 通知增量投影/到期调度 → 跨实例预算与发布门禁。按单条链路提交和灰度验证，不一次性替换整个存储层。

## 参考依据

- [Neon 免费套餐及出站查询优化说明](https://neon.com/blog/how-to-make-the-most-of-neons-free-plan)：5 GB/月 egress，减少不必要列和 RETURNING。
- [PostgreSQL 16 pg_stat_statements](https://www.postgresql.org/docs/16/pgstatstatements.html)：辅助统计调用次数、返回/影响行数与执行时间；它不能直接给出 Neon 网络计费字节，也不会还原未采集的历史。
- 仓库历史记录：`docs/operations/2026-09-10-test-database-readonly-audit.md`、`docs/operations/production-cutover-20260917.md`、`docs/operations/postgres-read-metrics.md`。
