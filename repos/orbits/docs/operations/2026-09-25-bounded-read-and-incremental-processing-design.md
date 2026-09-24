# 核心读取边界与增量处理设计

日期：2026-09-25。状态：**修订方案已获执行授权，分批实施中；未部署**。

2026-09-25 执行修订：用户接受复审后要求“根据这个更新计划，然后彻底执行”。本地代码、契约、测试和必要诊断进入执行；生产部署、任务停启、归属修复和付费仍单独确认。实施账本见 `2026-09-25-bounded-read-execution.md`，不把本设计中的可选结构视作必须一次性建设。

依据：本轮本地代码扫描、GitNexus 查询/context、既有审计及定向测试。源码基线 `26b3d5fc`。执行阶段已只读重新确认生产仍为 `02ec26f0`；访问了 Neon 控制台用量，没有读取 Neon 业务数据、修改云配置或停止任务。具体证据和未完成项以执行账本为准。

本文件是对《2026-09-25-neon-egress-audit.md》的实施设计补充。原报告的合成数据成本仍只是增长机制证据，不代表生产各来源占比。本设计不承诺固定用户规模始终容纳在免费额度内。

## 1. 设计结论

保留 PostgreSQL、现有领域服务、Web/API、App 和队列。不先上微服务、Redis、Kafka、全域事件溯源或跨实例流量计费系统。

按两个层次改造：

1. **先把交互读取做正确**：服务端派生身份 → SQL 权限过滤 → SQL 排序/分页/聚合 → 窄字段 → 返回。优先独立角标、会话摘要、联系人分页和跟进 actor scope；低流量阶段可用数据库内聚合，不必立即维护所有计数器。
2. **再消除重复业务扫描**：领域写入与待处理事件同事务提交，worker 按对象增量投影；提醒以持久到期意图、generation 和租约处理。GET 不生成历史业务记录，低频恢复也只扫未完成/到期状态。

四条验收不变量：

- 其他 actor 的数据扩大 10 倍，不增加当前 actor 的业务 payload 返回量。
- 历史消息、已处理通知增加 10 倍，不增加角标返回量；数据库内部执行成本也单独检查。
- 浏览一页只传该页及其必要关联数据；全局统计由独立聚合提供，不用当前页冒充全量。
- 无业务变化、无到期工作时，仅发生廉价状态检查，不传输全域历史 payload。

## 2. 本轮扫描发现与已有能力

以下 Web 路径相对于本仓库，App 路径相对于 `repos/orbit-app`。

| 链路 | 源码证据 | 当前问题或可复用能力 |
| --- | --- | --- |
| 身份解析 | `app/api/_shared/authenticated-actor.ts:119`；`features/account/storage/account-live-record-provider.ts:149` | 已由 session subject 查 profile/account；实际传入 identity，不应误判为每个 API 全量扫账号。canonical accountId 和原始 userId 必须继续区分 |
| 跟进 | `features/followups/storage/followup-live-record-provider.ts:271` | 四类集合 workspace 全读后按 actor/关联过滤；不能直接改成四个 `user_id=actor`，否则丢失合法关联联系人/证据 |
| 跟进结果 | `features/followups/live-service.ts:291,453` | 已存任务与关系建议合并、排序后才 LIMIT。只分页 tasks 会漏建议、重复建议或改变顺序 |
| Agent 信号 | `features/agent/signals/source-collector.ts:104` | 读取跟进图和完整活动列表，再按时间及规则生成候选；需要用途专用的候选读取，而不是缩小公共图后让所有业务复用 |
| 会话读取 | `features/relationship-communication/service.ts:351,419,768` | 全 workspace 会话；本人可访问会话逐个 binding/messages/read；最后分页。详情及 mark-read 同样依赖完整消息历史 |
| 会话写入 | 同文件 `:827,931`；`service-factory.ts` | message 与 conversation 分步写，service 只接通用 store；新增计数/版本前必须补真实事务入口，不能追加非原子计数写 |
| 通知刷新 | `app/api/inbox/notifications/handler.ts:20`；`features/notifications/inbox-business-refresh.ts:17` | 每次 list 先刷新提醒计划和多类业务投影；50 条分批不是总成本上限 |
| 通知列表（本轮新增发现） | `features/notifications/inbox-record-service.ts:78`；`storage/inbox-record-repository.ts:39` | repository 有 keyset，但 service 每次从头循环全部通知来算全局 unread，并逐条读取 sources。去掉 handler refresh 后仍然昂贵；SQL 还返回整个 payload，包含 operations 回执历史 |
| typed 默认值（修正旧报告范围） | `features/notifications/inbox-record-service-factory.ts:32` | HEAD 对非空 actor 默认启用，仅 disabled list 排除；生产基线 `02ec26f0` 则读取 `ORBIT_TYPED_INBOX_ACTORS` 白名单。`f069df7e` 改变了默认值，发布时成本可能扩散到更多账号 |
| 推送切换 | `features/notifications/delivery-pass.ts:87` | 后台是否走 typed 仍取决于持久 `notificationCutover` 状态，与上述 UI/API 默认启用开关不是同一件事 |
| 消息投递游标 | `features/notifications/typed-delivery-factory.ts:21` | 小于 50 条时位置退回 cutover.since；通知列表游标用于轮询投递也会回到开头。展示页游标不能代替变更消费位置 |
| 联系人 | `features/contacts/storage/contact-list-postgres-reader.ts:1543` | 已有 SQL 权限、筛选、facet、keyset；显式 limit 才走该路径。搜索兼容条件不满足可回退大结果 |
| App 联系人 | `src/api/endpoints.ts:705`；`src/screens/contacts/ContactsScreen.tsx:1713` | 路径 builder 没有 limit/cursor；还存在本地维度筛选，不能只补 limit 而保留依赖全量数据的筛选 |
| App 收件箱 | `src/screens/inbox/useNotificationInbox.ts`；`RelationshipInboxScreen.tsx:373` | 已支持通知/会话列表翻页，应复用；`loadMoreMessages` 实际加载的是会话页，不是单会话消息历史页 |
| App 角标 | `src/hooks/useRelationshipInboxBadgeCount.ts` | 前台聚焦时 15 秒请求会话、legacy notifications、typed inbox；与上述通知刷新及全历史计数叠加 |
| Dashboard/bootstrap | `features/mobile/contacts-dashboard-service.ts:120,232`；dashboard/bootstrap storage providers | 同请求图读取已有合并；部分入口仍要完整 aggregate、联系人和分析来源，不可直接去掉字段 |
| 简单私有列表 | `features/tasks/repository.ts:76`；`features/notes/repository.ts:27` | 已有 actor SQL 过滤，但本人历史仍全部读取；notes 有字段投影，仍缺交互列表分页 |
| 条件读取 | `app/api/_shared/conditional-read.ts`；App `src/api/client.ts:127` | 已有服务端 ETag 和 App 共享内存重放；不另造一套。当前 watermark 为 max+count，不是常数成本的版本行 |
| 私有增量同步 | `features/sync/domain-registry.ts`、`domain-read-service.ts`、`migrations.ts` | 仅 notes/tasks/personal-schedule；有 scope 游标、revision、tombstone、提交排序保护。不能把 contacts/messages 名字加进去就宣称支持 |
| 提醒执行 | `features/notifications/canonical-reminder-command-transaction.ts`、`canonical-reminder-wake.ts` | 已有事务意图、generation、lease token/epoch、SKIP LOCKED、到期查询、actor 公平游标和 25×10 批次；优先复用 |
| 提醒时效 | `canonical-reminder-wake.ts:291`、`:699` | 默认 publisher 不带延迟，future intent 要等到 due/repair 再被领取；已有 wake 不等于任意未来提醒都已精确按时唤醒 |
| 维护入口 | `features/operations/maintenance/configured.ts`、`http.ts`、`heartbeat.ts` | 开关只挡 bootstrap；HTTP/Cron 可直接跑 pass；已认领 tick 的 pass 在行锁释放后执行。不能用关开关代替完整停止验证 |

GitNexus 绑定的是根仓库 `orbit`，索引提交与上述代码基线相同；先前 status 的新增差异是审计文档。context 有缺符号、动态漏边和同名误连，本轮没有把缺边视为无依赖，关键链路均用源码核对。此设计不据不完整图谱批准任何代码变更；实施前逐符号重新执行 impact。

## 3. 权限边界：从身份到 SQL，而不是返回后过滤

### 3.1 统一输入，不统一业务授权规则

领域 reader 接收服务端构造的 `ReadScope`：workspaceId、canonical actorId、必要的授权版本。浏览器参数里的 actorId/workspaceId 不作为权限来源；原始 Auth.js subject 只用于确有需要的认证/集成身份。

不同数据不能使用一个通用的 `owner OR payload.accountId` 规则：

| 数据 | 必须检查的权限 |
| --- | --- |
| 私有 task/note/schedule | workspace、存储 owner、canonical entity owner/ID 一致及允许的生命周期 |
| 联系人 | 私有 owner 或合法关系连接带来的可见性；复用既有 contact authorization，保留 canonical lifecycle 权威 |
| 跟进关联证据 | 先选合法任务/关系/联系人，再按明确证据引用取记录；区分 record_id 与 payload.id，禁止姓名匹配和任意 JSON containsId 授权 |
| 共享会话 | actor 是 participant；当前 binding confirmed、conversation active、双方 ID 和 qualificationVersion 一致 |
| typed 通知 | notification owner + 各 source 当前可见性/状态/版本；动作仍在事务内重验，旧回执重放也不跳过授权 |

第一阶段为跟进实现专用 SQL scope reader，把现有集合选择下推：先 actor tasks/connections，派生 contact IDs，再取其合法 contacts/evidence。它先消除跨用户放大，不声称本人无限数据已分页。

**历史 accountId 兼容是迁移规则，不是永久信任 payload 的通行证。** 对行 owner 与 payload owner 冲突，建立本地负例、审计数量和待修复清单；不能为了结果一致保留越权，也不能擅自修生产归属。设计先明确冲突拒绝/隔离策略，再经授权迁移合法历史记录。

详情路径也应在 SQL 中带 scope，而非先取完整 foreign payload 再拒绝。认证失败不得进入业务 reader。客户端缓存键包含 baseURL/session/actor/workspace/查询参数/权限版本；退出和换号清理，304 前仍鉴权。

## 4. 分页边界：列表、统计、详情三种读取分开

### 4.1 共同协议

新读协议返回 `items、nextCursor、hasMore、asOf、readVersion`，需要总数的界面另提供准确 summary。默认建议 20 条、最多 50 条，正式阈值用代表性数据验证，不全仓库替换固定 LIMIT。

游标包含协议版本、actor/workspace、排序及筛选哈希、最后一个排序元组、可选读取 generation；签名/校验复用现有 cursor codec 模式。游标不是授权凭证，每页重新验证权限。

SQL 顺序必须含唯一 ID。例如 `ORDER BY occurred_at DESC, record_id DESC`，下一页比较同一元组；NULL、排序方向、Unicode/collation 和时间精度都必须一致。用 LIMIT+1 判 hasMore，不用深 OFFSET，也不在 Node 拉完后 slice。

**稳定排序不等于跨请求快照。** 可变联系人排序字段/会话活跃时间可能在翻页中移动。交互列表采用已声明的实时分页：去重、变更后刷新第一页、不承诺并发更新下的完整导出快照；要求稳定的列表可用 actor collection generation 变化时返回命名重置结果。严格导出另走授权快照任务，不能用 `updated_at <= asOf` 伪装历史版本。

### 4.2 联系人、跟进、任务和笔记

- 联系人复用现有 SQL reader。Web 的服务端 route adapter 和 App builder 都显式传页大小并消费 nextCursor。筛选下推，facet/total 仍按完整合法结果计算，不能用当前页推断全局筛选选项。
- 现有联系人 list DTO 含关联证据，20 条第一页仍可能很大。增加窄 list-item read projection：显示所需字段、计数、来源引用；完整证据/原文放详情接口。不得把旧字段静默置空，新旧契约并存过渡。
- 搜索兼容 fallback 记录原因/字节。先验证 SQL 搜索与当前业务排序等价、治理历史格式，再收紧；大结果不得在不告知的情况下截断为“完整结果”。
- 跟进拆为 `listFollowupPage`、`readFollowupDetail`、`readSignalCandidates`，而不是让每个调用者继续取 `readFollowupGraph`。
- 跟进页对 stored tasks 和 derived relationship suggestions 分别生成窄候选，再按现有规则去重、合并排序、分页。建议先用 SQL CTE/UNION + NOT EXISTS 表达“已有任务的 connection 不再建议”；只给最终页补联系人/证据。
- 复杂规则暂不能等价 SQL 化时，可建立可重建的 `followup_read_items` 投影：item_kind 区分任务与建议，保存 source ID/revision 和可排序字段。它不是任务权威表；不得自动把建议变成真实任务、伪造 dueAt 或改变关系阶段。首阶段不要求必建该表。
- tasks 的 canonical payload shape 校验要在候选 SQL 中排除 legacy 行，之后仍运行解码验证。notes 的列表投影继续保留，添加 SQL 页；笔记正文搜索在 DB 内完成，不能把大正文返回后搜索。
- 普通列表、AI 候选和后台扫描使用不同读取方法；AI 按目标对象与必要证据读取，不再把整图作为默认输入。真正全量分析改为用户明确触发的有界分批后台任务。

### 4.3 SQL LIMIT 之外还要控制字节

一行 JSON 聚合、单条长消息、大 sources 数组都能突破行数预算。列表字段必须有实际长度边界，大正文走独立分页/详情。

消息等变长对象可以先在 SQL 内选窄 ID/长度元数据，按累计字节挑选前缀，再 JOIN 取正文；至少保证合法的单条最大正文可读取。正文不截断冒充完整消息，超大对象用显式详情协议。HTTP 序列化之后报 PAGE_TOO_LARGE 只能作最后防线，不能当作已阻止数据库流量。

索引候选根据 EXPLAIN 验证后新增：actor+collection+排序元组；conversation+sequence；到期状态+nextAttemptAt+ID。已有 owner/target/connection 索引先复用。不要向索引 INCLUDE 完整 payload；不要直接把依赖时区的 text→timestamptz 转换当 immutable 表达式建索引。需要时在写入时存规范 typed 排序列/窄投影表。

## 5. 消息与角标：先窄 SQL，再按需要维护计数

### 5.1 API 与消费者

以下新增名称是设计提议，尚不存在：

- `GET /api/inbox/summary`：messagesUnread、notificationsUnread、total、readVersion、validUntil；在一个服务端组合调用中选择正确通知来源，不让客户端同时猜 legacy/typed。
- `GET /api/relationship-communication/conversation-summaries?limit=20&cursor=…`：摘要，不含 messages 数组。
- 为现有 `/conversations/[id]/messages` 增加 GET，读取消息页；现有 POST 保留。GET 支持向前读历史或按 afterSeq 取新消息，两种方向游标不能混用。

旧 RelationshipConversationDTO 明确要求完整 messages；不要把空数组或最后一条塞回旧 DTO。新增窄类型与 schema，Web/App 迁移完成后才撤销旧重读入口。发送及 read receipt 的既有字段可保持，新增序号字段向后兼容。

App 首页/AI 页只订阅共享 summary；收件箱可见时取会话摘要/通知页，进入具体会话才取消息正文。沿用已有前台/失焦/换号保护和条件缓存。首期可保留 15 秒新鲜度目标，用廉价 summary 降成本；是否调整频率属于体验决定，不是架构正确性的前置条件。

共享协调器按 scope 合并在途请求，失败指数退避、抖动、限制并发；发送/已读/撤销后使相关 scope 失效。推送只作失效提示，不当作唯一事实源，也不要求先引入长连接基础设施。

### 5.2 第一阶段：SQL 内聚合即可先省掉历史正文

会话列表 SQL 先验证 participants/binding，再分页。当前页批量查询最后一条消息摘要与已读计数，不做逐会话三次往返；独立 badge 在 DB 内聚合，只返回数字。

这能大幅减少传输，但 COUNT 对长未读历史仍有 CPU/索引扫描成本。其收益和限制分开计量，不宣称“返回一个数字所以计算 O(1)”。

### 5.3 长期高频路径：原子维护窄摘要

实际数据增长使聚合昂贵时，启用同一事务内维护的结构（可从消息改造阶段一起建设，但不先推广到全部领域）：

| 提议结构 | 关键字段和约束 |
| --- | --- |
| conversation message order | workspace/conversation/message_id、单会话 seq、sender、recipient、recipient_seq；message_id 唯一，conversation+seq 唯一；正文仍由原消息记录持有 |
| conversation participant summary | workspace/actor/conversation 主键；received_count、read_received_count、last_read_message_seq、last_message_id、窄 preview、last_activity_at、binding version |

两人会话每次发送按固定锁序串行分配会话 seq，并只递增收件人的 received_count；同一 requestId 重放只返回已存回执，不再次增量。消息、顺序映射、摘要、版本及出站事件同事务提交。

已读动作验证指定 message 属于可访问会话，用该 message.seq 定位截至该位置的 incoming recipient_seq，再执行 `max(old, requested)`；`unread = received_count - read_received_count`。不能用全会话 seq 相减，因为本人发的消息不算本人未读。多设备乱序已读不得回退。

发送、已读、撤销与邀请接受必须统一事务入口及锁序；当前 service factory 缺少此端口，需要新增 transaction-aware repository。撤销后摘要即使尚有数据，SQL 仍以权威 binding 校验，不泄漏 preview；必要的摘要移除/计数失效与撤销同事务完成。

迁移旧消息时按现有 `(sentAt,messageId)` 顺序分配序号并转换 read pointer，记录无法解析的旧 pointer。按会话短事务迁移/切换写路径，不能在线全局长锁；新消息与回填不得竞争分配相同 seq。若支持未来删除/撤回消息，必须明确计数和占位语义后扩展，不假定永不删除。

## 6. 通知：查询、物化、投递分离

### 6.1 先修列表内全量扫描

把 `InboxRecordRepository` 拆出 `listVisiblePage`、`countUnread`、`getDetail`、`readSourceStatesBatch`。页面不能为了 unread 遍历所有历史；也不在每次分页从第一页重走。

需保持现有语义：

- category/history 筛选不改变全局 unreadCount；未来 scheduled 不显示为当前未读。
- suggestion/update 的 30 天窗口与 reminder 的未解决长期可见性不同。
- expiresAt、snooze、readAt 与 disposition 分离，不能用一个 status 代替。
- 来源 changed 时继续使用现有脱敏展示与动作限制；unavailable 默认列表排除、history 保留安全解释；不完整记录保持明确 integrity failure，不能默默吞掉。

推荐在既有 notification 权威记录旁增加窄 `inbox_read_index`（仅在 direct SQL 难以准确表达或计划成本不达标时采用）：owner、kind、occurred/scheduled/expires、disposition、readAt、revision，以及规范 source refs。按 sourceKind 批量 SQL JOIN 权威 task/schedule/appointment/batch/permission 数据判定可见性；count 不读取正文和 operations 回执。

不能把异步缓存的 `source_available=true` 直接当权限。页面/计数仍检查当前权威权限；可见性投影必须与权限变更同步失效，或者按 epoch/版本检测到陈旧后 fail closed。无法短期 SQL 等价表达的递归日程/discovery 来源，先保留批量权威适配，明确剩余成本，禁止假报已全面有界。

全局完整性检查移到写入/回填时认证，记录 actor 投影健康状态；迁移未完成或存在非法数据不能进入“正常空列表”。这避免为维持“历史任一非法记录都报错”的规则，每次请求重读所有正文。

### 6.2 再从 GET 移除物化

新的读路径只读通知投影。替代生产者齐备、历史回填完成、对账通过后，才移除 handler 中的 `refreshInboxBusinessRecords`。

需要覆盖的生产者矩阵：

| 事实变化 | 增量处理内容 |
| --- | --- |
| task、提醒计划创建/修改/完成/删除 | 更新/取消对应通知、到期意图和 source revision |
| recurring schedule/exception 改变 | 只重算该 series 的有限时间窗口，替换相关实例；计划窗口将耗尽前安排 next_expand_at，不能无限展开 |
| appointment 命令及历史事件 | 以 appointment/version 或事件 ID 生成通知；显式提醒优先，取消旧自动提醒 |
| 名片 v1/v2 批次状态变化 | 只处理变更批次，用既有 semantic key 幂等 upsert |
| OAuth 授权失效/恢复 | 授权写入或 expiresAt 定时工作触发；GET 不每次枚举全部授权 |
| shared message | 消息写事务产生投递事实，不再扫描自 cutover 起全部消息 |
| source 删除、关系撤销、权限变化 | 更新可见性/撤销信息，阻止旧事件恢复已失效内容 |
| 显式启用 discovery | 复用已有授权 generation、预算和作业机制，不因基础通知增量化自动调用 AI |

### 6.3 最小可靠 outbox，不建设全域事件平台

优先复用各领域已经原子提交的 outbox/wake。缺少可靠变更入口的通知来源，新增单一目的 `notification_projection_outbox`；不要挪用事件运营专用表的领域状态。

建议字段：event_id、workspace_id、actor_id/明确受众、source_kind/source_id/source_revision、event_kind、dedupe_key、available_at、state、attempts、lease_token/lease_until、last_error_code、created_at。事件只保存必要引用或必须保留的事件快照，不复制整个图；历史通知需要的版本事实不能仅靠后来读取“最新对象”恢复。

可靠性协议：

1. 领域写事务同时写业务记录和 outbox；唯一 dedupe_key 拦重复。写失败全部回滚，commit 后发布轻量唤醒。不能先写业务、再 best-effort 插 outbox。
2. worker 通过 `available_at <= now`、待处理状态、`FOR UPDATE SKIP LOCKED LIMIT B` 领取；短事务写 lease 后提交，外部调用不持有数据库锁。
3. 投影变更和 processed 标记尽量同事务；完成回写要求 token/generation 匹配，旧 worker 不覆盖新租约。崩溃后租约超时再领取，重复事件不重复通知/已读重置/推送。
4. 乱序依赖领域单调 revision/generation 比较。删除事件/tombstone 必须压住更早更新，不以字符串时间戳大小推断版本。
5. 外部 Push 无法与 PG 做原子提交，复用现有 delivery ledger、provider receipt、重试和不确定结果处理；不承诺跨外部服务 exactly-once。
6. outbox 按未完成状态领取，不用 `MAX(bigserial)` 作为无条件消费水位：序号分配顺序不等于事务提交顺序。展示页 cursor 与 worker checkpoint 分开。
7. 明确最大批次、墙钟预算、attempt 上限、退避、失败队列和人工重放；完成记录按恢复需求保留后清理，不能让“增量账本”无限长。

回填不能在 GET 首次访问时触发：先接可靠写入，再按 source ID keyset 分批建历史投影；worker/回填都按 revision 幂等。回填 checkpoint 使用独立任务状态，对并发更新、删除和失败可重入。恢复期间不重发历史 push。

## 7. 按变化读取：版本、权限、时间三个维度

### 7.1 不重新建设 App 同步框架

复用现有 notes/tasks/personal-schedule 同步、App local-sync repository、authorization epoch、scope 和 ETag 缓存。先让高频新摘要支持条件请求，不要求第一阶段把 contacts/messages 全部离线镜像。

需要廉价版本检查时，新增少量 actor/domain 版本行，由相关业务写入或投影提交同事务递增；不存在“数据写成功但版本没变”的旁路。摘要版本是投影实际完成版本，不用尚未消费的 outbox 最大 ID 假装已更新。

响应可采用私有条件缓存：版本含 actor/workspace、权限版本、locale/filter、DTO schema/deploy version。数据页与版本在一致数据库快照读取；不能先取得旧内容、再附上新版本而导致客户端长期缓存过期数据。

**时间本身也是变化来源。** 通知到期、snooze 到时、30 天窗口和首页日期边界，即使没有业务写入也会改变响应。ETag 必须包含时间有效边界，或返回 validUntil 并确保跨界后不再 304；到期 job 更新版本可辅助，但不能把可靠性完全押在准时 job 上。

### 7.2 扩展 contacts/messages 增量域的额外门槛

当前 sync trigger 虽给记录分配 revision，提交排序锁只覆盖指定三个集合；新增域还需要：全部 writer 纳入同一已验证协议、共享权限 membership 变更、撤销/tombstone、checkpoint 保留期与过期重置、正确 backfill。

不能直接按 `updated_at > lastSeen` 做可靠增量，也不能把现有序列读成提交日志。新增域应单独设计并测试提交乱序场景；不要为本轮读优化扩大全局写锁范围。旧客户端全量首次同步也应分批、可续传，而不是每次启动重来。

## 8. 到期调度：复用现有 wake，补足入口和索引

已有 canonical wake 的 generation、lease fencing、SKIP LOCKED、小批和 actor 轮转是基础；不重写其核心恢复语义。pure in_app 与 mixed/push 能力不同，不能把前者完成当成所有渠道完成。

实施步骤：

1. 盘点 reminder create/reschedule/cancel 是否全部走 canonical command transaction；typed snooze、recurring reconciliation 等旁路逐个接入，保证同事务保存 plan+wake/取消信息。
2. 根据实测为 pending.nextAttemptAt、leased.leaseExpiresAt 建适用索引或窄 typed 到期索引；验证空闲查询不扫描全部历史 intent。保留 25 actor×10 plan、失败隔离和公平性。
3. 按产品既有时效要求核实准时唤醒。现有 publisher 不带 provider delay，若采用延迟消息须验证队列允许时长；超出范围用有限 horizon + durable next_due_at。消息过早到达不得丢弃未来计划，也不能热重排。
4. maintenance 保留 due/retry/丢消息修复，不再每轮枚举全体推送用户做完整信号物化。其他名片/活动/密码重置补偿任务各自有 nextAttemptAt 和批次，不能一并停掉充当优化。
5. 新增停止协议时，区分启动开关、消费开关和具体任务开关。已执行 pass 可完成；取消旧链并不能中止它。共享队列的 canonical wake 不能被 heartbeat 开关误关。

停止旧链的 runbook 仅在独立授权后执行：记录部署/数据库/workspace/chain；阻止所有旧启动入口；条件式失效精确链；等待在途任务；确认 `ran/resent/superseded` 与新链状态；单独核对 Cron、本地和外部 scheduler；恢复走新链启动。零日志不等于零执行。

## 9. 首页和初始化：减少组合读取，而非减少可见业务

bootstrap 新版本只返回身份、必要配置、能力/域版本和小摘要，业务列表懒加载。既有客户端依赖整图的 bootstrap 保留迁移期，不暗改语义。

mobile contacts dashboard 拆为首屏必要 summary 与按 section 加载；网络分布、机会和分析报告仍保留各自准确语义。复用当前 SQL dashboard summary，先修历史时间兼容回退，再从消费者接线。

AI 分析的 source hash 若目前依赖完整 aggregate，改为领域版本/已验证摘要依赖时必须证明能覆盖全部输入变化；不能为省流量把来源不再变化的陈旧报告标为 fresh。大型全局统计初期 SQL 聚合，达到 CPU/延迟门槛再异步维护读模型。

## 10. 成本取证、局部预算和测试

### 10.1 先利用现成工具

在授权的云检查阶段，先确认当前部署/env/日志是否可用，再取 `postgres_read_metric`、pg_stat_statements 快照差值和 Neon 项目实际出站增量。保留采集覆盖率、reset/deallocation、部署和时间窗口。已有日志没有 queryId/route/job，也漏掉部分 client 和 RETURNING，不能直接称完整账本。

增量补充稳定的 operation/queryTemplate 标签及 RETURNING 结果计量，不记录 SQL 参数/业务正文。全请求成本包括 auth、版本、来源校验、重试，而不只业务主 SQL。pg_stat_statements 的 rows 包含 affected rows，不能替代网络字节；Log Drain 先核对套餐，没必要为取证先搭完整平台。

### 10.2 验收分开看传输、计算和正确性

候选预算供实现评审，不是现状承诺：summary 不含正文，业务读取返回约 1–5 KiB；20 条普通列表目标约 50–100 KiB；消息页按内容另设字节预算。最终阈值用真实长度分布、合法大字段和目标日活反推，不能拿中位数当硬上限。

测试矩阵：

- 数据轴：其他用户 1/10/100 倍；本人历史 100/1,000/10,000；新变更 0/1/20；due 0/1/超过批次；超长合法正文/证据。
- 权限：owner 冲突、合法共享、revoked binding、跨 workspace、伪造/过期 cursor、不同账号同 ID、history 脱敏、source 删除。
- 分页：同时间戳、NULL、微秒/offset、Unicode 搜索、筛选改变、并发插入/修改、翻到末页、响应大小限制；全局计数不随页数变化。
- 并发：两次相同发送、发送与已读、已读乱序、撤销与发送、outbox 重复/乱序、commit 后 publish 失败、租约过期后旧 worker 回写。
- 时间：scheduled 激活、expires 过期、snooze、30 天边界、时区/DST、recurring horizon 扩展，无业务写入时版本仍正确。
- 后台：空闲无 payload 扫描、积压批次能持续推进、热点 actor 不饿死其他 actor、毒数据不堵全部任务、正常渠道无重复外发。
- 跨端：新旧 App/Web、分页全部结果、摘要与详情、Web→App/App→Web 已读与撤销回读、304 本地无缓存时恢复。
- 成本：返回 rows/bytes、SQL 次数、fallback、执行计划/扫描行/缓冲访问、P95 延迟、锁等待、worker backlog。返回小不意味着数据库计算小。

完整数据/压力/故障测试仅本地或隔离 CI；生产凭据不进入这些环境，直接 node/script 也不能绕过。云验证仅小数据明确操作预算，不跑线上新旧双读全量影子压测。

联系人 1,548→2,064 行预算变化已在执行阶段完成固定夹具因果定位：旧 `1618d772` scope reader 与当前 reader 得到相同联系人结果，新增 516 条 evidence record-ID 行、35,340 字节恰好解释全部差额。保留可运行脚本 `scripts/diagnostics/neon-egress-local-probe.ts`；仅更新该项有解释的基线，未放宽其他预算。

### 10.3 本轮实际验证

在 `env -i` 下只运行以下四个现有文件，未注入云连接：

- `tests/services/inbox-record-service.test.ts`
- `tests/capabilities/relationship-communication.test.ts`
- `tests/services/maintenance-heartbeat.test.ts`
- `tests/services/canonical-reminder-wake-queue.test.ts`

结果：28 项，27 通过、0 失败、1 跳过。跳过的是需要显式本地数据库的 heartbeat PG 集成测试。本轮没有跑全量、没有执行新的 SQL 设计、没有证明新方案性能达标。既有测试验证了通知分类不改变全局未读、来源权限、未来/过期、消息资格与幂等、队列消息协议等需保留的业务语义。

## 11. 分阶段实施与发布门

| 阶段 | 具体交付 | 退出条件 |
| --- | --- | --- |
| A：固定事实和成本 | 当前部署/API flag/后台 cutover/worker 清单；已有日志与统计差值；容量模型；固定 fixture 定位联系人预算失败 | 分清生产事实与 HEAD 能力；量化前台轮询、操作、后台、一次性工作。无历史账本则明确无法追溯，不阻塞已证明的局部修复 |
| A′：独立低成本交付 | 独立消息未读接口和 App 角标消费；legacy 通知及跟进 SQL scope；可靠且不改变时效的刷新合并/节流候选 | 无历史正文参与消息角标；无跨 actor payload 放大；旧接口仍兼容。不得用简单 COUNT 替代来源授权或将所有提醒延迟 N 分钟 |
| B：SQL scope 与窄读取 | 跟进 actor scope；会话摘要/badge SQL；通知独立 count 与来源批量校验 | 权限等价/负例通过，跨用户增长不放大；无 messages 正文参与 badge；通知列表不全历史遍历 |
| C：消费者真正分页 | 联系人 Web/App、会话/消息页、tasks/notes、dashboard/bootstrap 分离 | 页面/筛选/总数契约正确；旧客户端可用；请求数据随页大小而非历史量增长 |
| D：按证据选择增量方案 | 按来源选择复用可靠事件/变更记录、到期意图或必要的事务 outbox；来源失效、recurring horizon、backfill/reconcile | 不强制建设八类 outbox 或所有投影表；但替代入口必须完整、崩溃恢复和取消可靠，之后才能删除对应 GET 刷新 |
| E：到期与高频摘要 | 复用 wake、清理写旁路、到期索引/唤醒；按实测引入消息计数摘要和 actor 版本 | 空闲无历史扫描，提醒时效/公平性/并发通过；GET 版本跨时间边界正确 |
| F：发布与运营 | 小规模 canary、实际用量对比、退路、按活跃量容量模型 | 每个部署回读 commit/配置/迁移版本；实际业务和成本均达标；容量与套餐单独决定 |

阶段 A′/B/C 按实测热点微调。legacy 接口同样由角标高频调用，且读取五类 workspace 集合，必须列入前置治理；白名单账号数不能替代调用量，API 白名单也不能代表后台持久 cutover。D 按来源推进，**替代生产者验收前不能先删对应物化调用**。不把全部表投影化当作 B 的前置条件，也不等完工才评估生产容量。

容量模型：月出站 = 日后台基线 × 月天数 + 各用户群（日活 × 月天数 × [每日前台秒数/轮询间隔 × 每轮数据库返回字节 + 各主动操作次数 × 单次数据库返回字节]）+ 导出/回填等一次性预算。区分 typed/legacy，覆盖鉴权、来源校验、重试及所有数据库 client；使用项目实际增量校准，不把 HTTP 大小当数据库出站。以题设 5 GB 为规划上限，初始建议预算 3.5 GB、保留 1.5 GB 余量，属于待验证的工程预算而非计费硬闸门。阶段退出同时要求正确性、实际流量预测和目标增长数据下的成本达标；目标日活未给定时输出多档容量，不擅自假定。

刷新节流仅为可选过渡：按 workspace/actor 原子领取、成功时间与租约分离、失败可重试；处理写入失效和时间触发（尤其会前 30 分钟通知），不以统一 TTL 改变提醒时效。分别覆盖 GET 和后台调用者；在持续访问假设下 15 秒→5 分钟只代表该刷新调用量约降 95%，不代表总出站降幅。

typed 列表 COUNT 必须与 present/sourceAccess 的来源权限、版本、时间和生命周期语义等价；SQL/批量来源适配未完成前不得用朴素 unread COUNT 替代。分页需找到 limit+1 条可见结果，保留完整性故障语义。普通 updated_at 游标不是可靠变更日志，删除、晚提交和仅时间变化必须各有覆盖。

发布采用 expand→migrate→switch→contract：新增兼容读接口/索引→原子双写投影→分批回填→本地等价与小规模 canary→Web/App 切消费者→旧入口流量观察→最后收紧/移除。双写指一个数据库事务，不是两次独立提交。回滚时保留新增列/表，关闭新读入口即可；不能立即 drop 回填数据或让仍在运行的旧 writer 绕过新一致性协议。

437 个提交不是一个“读取优化发布包”。发布候选要核实迁移、依赖和 `f069df7e` 默认启用 typed inbox 的成本变化。可选依赖闭包明确的小补丁发布或经完整验收的集成发布，不能仅按文件 cherry-pick，也不能自动整体升级主线。恢复白名单只限制 API 覆盖，不代表后台停止；还须检查客户端能力/回退和持久 cutover。不得仅凭白名单宣称容量达标。

### 修改范围建议（实施时逐项 impact）

- Web：followup provider/service、signals source collector；relationship communication service/factory/repository 与新 GET；inbox handler/service/repository/source adapters；contacts page reader及页面 route adapters；mobile dashboard/bootstrap；领域写事务/outbox；maintenance 各入口。
- 存储：只增加确认需要的索引/窄投影/版本行与事务端口；不先重写通用 store，也不统一覆盖所有领域锁序。
- 共享契约：新增窄摘要/页 DTO 和 runtime schema；遵循零运行时依赖及 contract-check；App 使用既有 `sync:contract` 生成，禁止手改副本。
- App：contacts path 与列表分页、badge coordinator、会话摘要与消息页、通知分页刷新；保留 scope/abort/foreground/read receipt 防护。
- 文档交接：记录 Web/API commit、App bundle、另一端影响、迁移、未完成项及真实联验范围；仅 typecheck 不能标业务对齐完成。

## 12. 待批准的边界与明确不做

本设计默认保留现有可见性、搜索完整性、通知/提醒语义；不以降低刷新时效为主要手段。以下动作实施前需要单独确认：生产停哪些任务及允许时间、历史归属/损坏记录修复、提醒时效目标变更、旧客户端退役期限、云付费与部署。

无需用户决定的工程事项由实现阶段查明：SQL 计划、源写入口覆盖、实际索引、fixture 预算原因、版本依赖、日志取证可用性。它们是明确的验证任务，不是假定用户必须设计数据库。

不做：反复迁库续免费额度、用缓存掩盖越权、静默截断列表、把建议写成真实任务、为了“停止”关闭整个共享队列、以数据库暂停替代可用性保障、扩大 AI 调用授权。

## 参考

- 既有审计：`2026-09-25-neon-egress-audit.md`（历史实测与账单归因限制）。
- PostgreSQL [LIMIT/OFFSET 与唯一排序](https://www.postgresql.org/docs/16/queries-limit.html)。
- PostgreSQL [SELECT / SKIP LOCKED](https://www.postgresql.org/docs/16/sql-select.html)：队列式竞争领取适用，不能用来保证普通业务列表完整快照。
- PostgreSQL [序列操作](https://www.postgresql.org/docs/16/functions-sequence.html)：序列值不是可回滚、无间隙的事务提交记录；本设计对提交乱序的约束来自事务与序列语义分析。
