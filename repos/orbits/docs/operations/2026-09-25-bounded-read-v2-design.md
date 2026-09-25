# V2：单账号数据增长下的有界读取、缓存与增量处理

日期：2026-09-25。状态：**用户已批准实现与本地验证，分批执行中；不包含生产发布/数据迁移或手机安装。** 进度见 [V2 执行记录](2026-09-25-bounded-read-v2-execution.md)。下文“本轮”描述保留设计时点，不代表后续实现状态。

一句话：有 10 万联系人时，看第一页仍只读这一页；数据没变时复用小结果；变了一个对象时只更新相关结果。缓存失效不允许触发全量图读取。

## 1. 依据、范围与版本

- 主线扫描：`/Users/li/work/orbit`，`chat-agent`，`2ba858f1`。GitNexus `orbit` 索引与该提交及覆盖文件一致。
- 已发布后端代码：`46e438ea`，不是主线全部代码；发布记录见 [执行账本](2026-09-25-bounded-read-execution.md)。本轮未重新查询云端部署或配置。
- 上轮基准：旧生产 `02ec26f0` 对照 `46e438ea`，使用已有 9 月 24 日备份的本地副本，262 条记录、4 个账号。复现脚本及报告在隔离发布分支提交 `9ba16055`，路径分别为 `scripts/diagnostics/production-snapshot-read-benchmark.ts`、`docs/operations/2026-09-25-production-snapshot-egress-benchmark.md`。
- 30 联系人账号的一轮角标：232,296 B → 仅后端更新 224,633 B → 使用新客户端接口 7,695 B；独立请求口径，包含数据库身份解析，不含 TLS/连接建立。不能把它当项目月账单。
- 样本没有关系沟通消息、typed 通知、提醒计划；这些领域的大数据收益必须另做本地非空与增长试验，不能借用空数据结果。
- 本文承接旧[长期设计](2026-09-25-bounded-read-and-incremental-processing-design.md)，以本文的阶段顺序和条件门取代“一次建设全部结构”的理解。原业务、权限及幂等约束继续有效。
- 手机更新按用户要求暂不执行。设计给出 Web/API 与 App 消费交接，不假定手机已经加载新代码。

不在范围：微服务拆分、Kafka、全库重建、全域离线镜像、改通知业务口径、自动放开 typed、付费升级、停维护链、删除生产数据。

## 2. 本次源码核对：不能靠缓存掩盖的问题

路径以 Web 仓库为基准；App 路径为其自身相对路径。

| 位置 | 已核实事实 | V2 决定 |
|---|---|---|
| `app/api/contacts/handler.ts` | 只有传 limit 才传分页输入，兼容旧版不分页；条件请求依赖 workspace 多集合水位 | 新窄分页协议，不暗改旧响应；HTTP 与 Web 服务端 loader 都迁移 |
| `features/contacts/storage/contact-list-postgres-reader.ts:1543` | 已有 SQL 权限、游标、facet；搜索环境不兼容会走 fallback，返回关联 evidence/detail 数据 | 复用筛选语义，拆窄列表与详情；新路径不得无限 fallback |
| `app/(app)/app/contacts/page.tsx`、`contacts-route-view-model.ts` | Web 页面直接调用服务 loader，不是简单请求 contacts API | 只改 API 不算完成，RSC/SSR loader 必须用同一分页 reader |
| App `src/api/endpoints.ts:705` | contactsListPath 没有 limit/cursor | 另交接分页参数、加载更多、全局筛选迁移；不自动安装 App |
| `features/followups/live-service.ts:453` | 图转 stored tasks + derived suggestions，合并/排序/过滤后出结果 | 新增用途专用 reader，不给公共图强行 LIMIT |
| `features/relationship-communication/service.ts:768` | 全会话读取、逐会话快照，再 slice；快照包含消息 | 新摘要页与历史消息页，保留旧 DTO 兼容 |
| `features/notifications/inbox-bounded-list.ts` | 列表能提前停，但过滤大量不可用项仍会多翻；unreadPage 遍历全部未读来源并调用 access | 精确全局计数与页面分开；来源状态批量/SQL 内解析，不能只改 LIMIT |
| `features/notifications/inbox-business-refresh.ts` | list 前投影业务数据；时间经过也可能产生新提醒 | 按来源接齐变化及到期入口后，才能移除该来源 GET 刷新 |
| `features/notifications/typed-delivery-factory.ts` | 后台 materialize 也调 refresh；消息不足 50 条时游标回到 cutover.since | 前台和后台一起治理；展示游标不充当可靠消费游标 |
| `shared/storage/domain-watermark.ts` | 实际 SQL 为 max(updated_at)+count，联系人是 workspace 域 | 返回一行不等于常数成本；不能当可靠单调版本或缓存正确性的充分保证 |
| `app/api/_shared/conditional-read.ts` | 身份在条件读取前解析；算水位与 produce 是分开的读取；无时间有效边界字段 | 新版本协议必须绑定一致快照、权限和时间，不直接复用为强一致缓存 |
| App `src/hooks/useRelationshipInboxBadgeCount.ts` | 新版仍每轮三个请求，typed limit=1；每个 hook 有自己的 timer | 一份摘要、一次认证、scope 共享协调；不重复请求未选中的 legacy 来源 |
| `features/notifications/canonical-reminder-wake.ts` | 已有 generation、lease token/epoch、nextAttemptAt | 复用既有机制，补入口和唤醒验证，不另造提醒执行系统 |

图分析：`createStorageFollowupTaskProvider` 为 **CRITICAL**，直达 configured provider，继续影响任务页、关系任务 API、Agent 信号和通知投递。不能在原图上截断而要求所有消费者适应。`refreshInboxBusinessRecords` 图上仅出现 typed-delivery 的 materialize 调用，但实际 handler 通过可替换函数调用它；这是动态漏边的具体例子，不按图上的 LOW 判定整个迁移低风险。其他查询有空流程/同名歧义，均以源码补核；实施仍须逐符号 impact，不能把本文当预先授权的代码安全证明。

## 3. 目标与非目标

### 必须达成的不变量

1. **冷读有边界**：关闭所有缓存，首页/列表仍只从 PG 返回当前页窄字段及有限关联，不能返回全图再 slice。
2. **本人历史不放大列表返回量**：固定页大小和内容长度，合法历史从 100 增至 10,000 再至 100,000，单页返回字节基本稳定。
3. **后台按工作量收费**：处理量跟变更对象/到期任务数量相关，不跟全部联系人数量乘轮询次数相关。
4. **缓存不是授权**：每次网络读取都认证并检查当前权限；动作提交再校验当前业务状态。
5. **不偷改体验**：原有 15 秒前台刷新目标先保留；不把所有提醒延后 N 分钟来达到预算。
6. **不静默丢数据**：旧客户端仍获原契约；新协议明确分页、部分加载、失败和重置，不能把残缺列表称为完整。

这里的“固定成本”主要指应用侧读取量/传输量。索引检索、复杂筛选、精确 COUNT 仍有数据库内部成本，要单独检查执行计划，不宣称所有 SQL 都 O(1)。

## 4. 有界读接口：摘要、列表、详情三类分离

以下端点是**提议名称，不是现有接口**。实现前检查冲突并补 shared contract/schema；既有两个 unread-summary 继续保留。

| 接口/服务 | 内容 | 默认边界 |
|---|---|---|
| `GET /api/inbox/summary` | messagesUnread、notificationsUnread、notificationMode、asOf；启用强版本后附 readVersion/validUntil | 不返回通知项/消息正文；认证一次；服务端只选 legacy 或 typed 一种通知模式 |
| `GET /api/contacts/page` | 姓名、组织、阶段、头像引用、有限预览等窄卡片 | 默认 30，最大 50；limit+1；正文、全 evidenceIds、operations 不返回 |
| `GET /api/contacts/summary` | 总数和全局筛选 facet | 与页面分开；只在首载、筛选或失效时取，不随每个下一页重复计算 |
| `GET /api/followups/page` | 按既有规则合并的任务与建议摘要 | 默认 30，最大 50；统计另外计算 |
| `GET /api/relationship-communication/conversation-summaries` | 对方、最后消息预览、最后活动时间、本会话未读数 | 默认 20，最大 50，无 messages 数组 |
| 现有 conversations/[id]/messages 新增 GET | 该会话的历史页或新消息页 | 默认 30，最大 50；向前/向后游标分开；权限先于正文读取 |
| typed 新只读页面适配 | 当前页 items、nextCursor、asOf | 与全局未读计数分离；旧 list 包装层仍保持原响应 |

统一响应沿用 ApiEnvelope；page data 使用 items、nextCursor、hasMore、asOf。只有已完成一致性机制的域才返回 readVersion，不能先填无意义占位版本。公开响应不暴露内部 permission epoch 或租约信息。

### 4.1 联系人

- 2026-09-25 用户进一步确认：**私人联系人只能由记录所有者查看**。`user_id = actor` 且 payload.accountId 缺省/NULL 或一致；本人拥有的关系、任务、通知引用均不能授予读取他人联系人记录的权限。该决定取代此前允许合法关系读取外部联系人摘要的假设，适用于列表、详情、编辑及聚合引用。合法双方聊天仍按会话成员资格授权；不自动修改旧数据归属。
- 复用已有权限/筛选/排序规则，在 SQL 内先选合法 ID 和排序键，再 JOIN 本页需要的窄字段。
- 当前页面所需的“下一步”等预览设明确字节/字符上限；SQL 侧投影，别先返回完整 JSON 再截断。预览与完整正文分字段/端点，不截断后冒充原文。
- 现有读取附带的证据正文、完整关系历史、详情 state 改为点击详情后按需取。关联列表同样分页，不能给 30 个联系人各附上无限历史。
- 全局 facet/total 不从当前页生成。可先 SQL 聚合、后按实测缓存，不能用 O(1) 返回行数掩盖重复全域聚合。
- 搜索 fallback 必须提供有界数据库候选选择；不支持的输入在新协议返回明确校验/能力错误并给可用交互，不回退全量下载。Unicode、中文/日文、排序兼容先做等价性测试，不能简单删除 fallback。
- Web 服务端 loader 与 HTTP reader 共享领域服务；首屏复用服务端已取的数据，不在 hydration 后立即再请求同一页。
- App 当前依赖本地全量筛选的维度要迁到服务端；多选/导出不得把“已加载 30 条”当全体。全量导出另走显式、有预算的分批任务，不属于页面刷新。

### 4.2 跟进与任务

- 2026-09-25 用户追加确认：跟进任务/关系连接必须由当前 actor 拥有，关联 `accountId` 不能独立授予访问。具体为 `user_id = actor`，且 payload.accountId 缺省/NULL 或与 actor 一致；缺少行所有者、只有关联账号匹配、归属冲突均拒绝。该决定覆盖下面“保持原权限语义”的旧假设，但不改其他业务的共享授权，也不自动修复/重归属旧数据。
- 不修改 `readFollowupGraph()` 的既有完整语义。新增 `listFollowupPage()`、`readFollowupDetail()`、`readSignalCandidates()` 并逐调用方迁移。
- 任务和建议的排除、优先级、日期及排序规则以现有 `payloadFor/relationshipSuggestions` 为 oracle。SQL 窄候选 CTE/UNION + NOT EXISTS 实现同一规则，最终全局排序后分页；只给本页补必要联系人字段。
- “只取 tasks 前 30 条再算建议”不可接受。建议不能偷偷写成已确认任务，也不能为了排序捏造截止日期。
- 详情只读目标及明确引用证据；Agent 信号/AI 使用用途限定候选及证据窗口。真正全量分析保留显式后台任务，而非首页副作用。
- 若规则无法等价下推或冷读 CPU 不达标，再启用可重建 `followup_read_items`，不是第一阶段强制建表。启用前必须有生产者覆盖、revision、删除与回填方案。

### 4.3 会话和消息

- SQL 先检查参与者、当前 confirmed binding、qualification 与生命周期，再分页会话。
- 对这一页批量读取最后消息预览和未读计数，不做每会话 3 次应用往返；无预览权限时不能先取正文再拒绝。
- 首期沿用现有消息排序语义，使用稳定复合键分页；若没有可靠递增序号，不能把时间戳游标当不会漏消息的实时消费流。前台恢复刷新最新窗口；严格增量需后续事务化消息序号。
- 首期不强制引入 participant counter。若 COUNT 在大量消息下成为 CPU 瓶颈，才增加同事务消息序号、收件序号与参与者摘要；发送幂等、已读单调推进、撤销须同事务，不能做 best-effort +1/-1。

### 4.4 游标与一致性

游标绑定 workspace/actor、协议版本、过滤排序哈希和最后一个排序元组；签名并重验当前权限。唯一 ID 必须作排序兜底，NULL/时区/字符排序一致。

交互页采用实时分页：修改排序字段后客户端丢弃后续页、刷新第一页并按 ID 去重；不承诺并发更新时无遗漏的历史快照。需要完整静态导出时另用一致快照任务。`updated_at <= asOf` 不是历史快照。

## 5. 缓存：明确采用什么，不采用什么

### 5.1 第一批：客户端小结果缓存 + 在途合并

复用 App 已有 conditionalCache、in-flight GET、scope/Abort/换号保护；Web 使用页面级资源协调，不引入第二套离线数据库。查不到现成通用库的情况下，先复用封装而非为这一批安装新框架。

- 键：baseURL/environment + session generation + actor/workspace + resource + 规范化筛选/排序/页游标 + DTO 版本/语言。日志不保存原始 cookie/token。
- 同一作用域共享摘要 timer，多个组件只订阅，不各自发三组请求；同 URL/身份合并在途读取。
- 标签页隐藏/原生后台不轮询；重新聚焦按既有新鲜度要求校验。失败退避加抖动，不并发堆积；旧请求不能覆盖新作用域。
- 本机写成功后，利用确认回执更新当前项并使相关页/摘要失效。跨设备靠前台校验/后续失效提示，不能假设本地 invalidate 会通知其他设备。
- 非敏感已验证 UI 可以显示带加载标记的旧内容；换号立即清除，401/403 后不能继续以成功状态重放旧私有内容。网络缓存永远不代替服务端权限校验。
- 默认不放宽 15 秒目标；不要把“缓存 15 秒”和“每 15 秒轮询”叠加成最高 30 秒却不说明。

### 5.2 第二批：版本化服务器缓存，先只覆盖已封闭的热点域

第一批冷读通过后才加，不先缓存完整图。初始采用**有内存上限和 TTL 的进程内缓存**作为机会性加速；多实例不共享命中，不据此承诺命中率或免费容量。

新增窄结构的候选定义：`actor_domain_read_state(workspace_id, actor_id, domain, revision, auth_epoch, updated_at)`，复合主键。优先 inbox summary；随后按完整依赖覆盖情况扩展 contacts。auth_epoch 可引用现有可靠权限版本，不强行重复创建。

启用条件和协议：

1. 该域所有影响响应的写入，以及关系/权限撤销，都在权威事务中递增对应版本；一个事务同域合并一次。批量/导入/修复/旧客户端/后台写入也必须覆盖。版本是单调变化标识，不要求连续。
2. 共享记录影响谁，版本就更新谁；少量两个参与者可直接更新。大范围授权变动可用 workspace 权限 epoch 兜底，宁可失效范围宽，也不漏撤权。固定锁序，避免跨 actor 更新死锁。
3. 每次请求先认证，再从权威数据库读取当前 scope/权限版本/域 revision 的小结果。缓存键含这些版本以及查询、语言、DTO/deploy 版本；没有可靠权限版本的域，先不使用跨请求私有结果缓存。
4. 缓存 miss 时，在同一只读一致快照中读取版本与有界结果，按**该快照版本**写缓存。并发提交后新请求读取新版本，不会命中旧 key；单请求以快照时刻为准。禁止旧结果贴上新版本。
5. 缓存条目带 validUntil。过期、snooze 唤醒、日期切换等最早时间边界到达时，必须重读/重算，不能只依赖业务写入。最早边界应来自可索引窄时间字段，而不是为查边界又拉全图。
6. 相同版本的 miss 在进程内 single-flight；失败条目不缓存，TTL 和 LRU 限制对象及总内存。无需跨实例锁来保证正确性，因为 miss 本身便宜。
7. 版本/权限检查失败：不返回未经重新验证的缓存；可执行经过认证的有界直读，或显式暂不可用，不能自动回到无界旧图。

ETag 由相同版本/权限/查询/表示版本/时间有效段派生；304 前仍认证、校验最新版本和时间边界。私有 HTTP 响应保持 `private`，不将账号数据交给共享 CDN 公共缓存。普通字体/图片等公共资源不受此限制。

当前 max(updated_at)+count 只保留原适用路径，不扩展成强版本：相同时间戳、其他行非最大时间更新、硬删除加插入等都可能让不同状态得到相同聚合；它也可能因其他用户写入反复失效。强缓存迁移以 writer 覆盖为门，不靠定时 TTL 掩盖。

### 5.3 何时才加共享缓存

只有满足以下事实才评估 Redis 或托管共享缓存：冷读与增量已通过；生产重复读确占预算显著部分；多实例导致进程缓存命中不足；预计节省明显高于缓存成本/运维成本。先记录命中、miss、版本检查、单次成本，不凭用户总数直接上 Redis。

Next.js 的缓存包装不会自动把现有 pg.query 变成安全的私有缓存，revalidateTag 的 stale-while-revalidate 也不等于立即撤销权限。当前 package 为 Next 16.2.9，配置未启用 cacheComponents；不为了本方案顺带迁移渲染模式。以后采用框架 Data Cache 时也必须通过上述版本/权限协议，查对应安装版本行为，不直接照最新在线示例粘贴。

## 6. 通知：把“读取、生成、投递”分开

### 6.1 先解决列表和计数的残余扫描

- 旧生产和主线对于来源失效占位/隐藏、integrity failure、archived 的语义不同。本批优化先保持已选发布基线语义，不借降流量改变产品规则。
- 增加按 source kind 的批量状态读取，输出 ID/revision/availability 等窄状态，避免返回 task/note/appointment 完整 payload。批量状态同样需要权限，不能使用缓存的 available=true 代替授权。
- 新页面只取候选页并按来源类型批量验证。为稀疏有效项设置每请求最多 200 候选的显式边界（提议初值），耗尽后返回 continuation/partialScan，不能循环到所有历史；新客户端继续取下一页，旧契约不能悄悄套此语义。
- 全局 unread 必须精确，不能只数已扫描页或遇到 200 就停止。简单来源在 SQL 中 JOIN 权威状态后 COUNT；复杂来源无法等价表达时，先保留明确的成本状态，不宣称 typed summary 有界或扩大 rollout。
- 若递归日程/多来源校验使精确计数仍无法满足预算，启用窄 `inbox_read_index` + source 反向引用作为该来源的必要结构。写入或撤权同步使关联投影 dirty/不可用，重建后才标有效；接口显式报告 rebuilding，不能把未知计数伪装成零。
- 删除/撤权优先 fail closed；投影异步期间仍用权威授权检查。大量依赖对象的失效先按 epoch 整体挡住，再分批修复，不能在一次写请求中返回无限 fan-out 的 payload。

### 6.2 生产者逐来源接线，不一次建八套 outbox

| 来源 | 触发时机 | 最小工作单元 | 不能遗漏 |
|---|---|---|---|
| 联系人/关系/任务 | 保存、完成、归档、删除、撤销 | 一个实体及明确依赖 | 建议不等于任务；任务完成不自动推进关系阶段 |
| 显式提醒计划 | 创建、改期、取消及 fireAt | 一个 plan/generation | 取消压住旧任务；重试不重复通知 |
| 周期日程 | series/exception 改变及窗口补齐到期 | 一个 series 的有限窗口 | next_expand_at；不展开无限未来 |
| 约谈 | 命令提交、自动提醒 fireAt | 一个 appointment/version | 显式提醒优先；错过短窗口时不能静默丢失 |
| 名片 v1/v2 | 批次状态提交 | 一个 batch/revision | 同 semantic key 幂等，不每页枚举全部批次 |
| 集成授权 | 授权更改、expiresAt | 一个授权/版本 | 时间到期也要触发；不需要用户打开页面 |
| 消息/通知投递 | 权威提交后的投递意图 | 一个接收者/事件 | 新消息顺序、重放、撤权、未确定外部投递结果 |
| discovery | 原有显式授权/作业 | 原有工作单元 | 不因基础迁移启动 AI 或增加模型开销 |

优先复用已存在且验证过的事务 outbox/wake。缺少可靠变化记录的来源，新增**一个专用 projection work 表**，而非通用事件平台：event_id、scope、source_kind/id/revision、kind、dedupe_key、available_at、state、attempts、lease_token/until、error_code。为 queued 的 available_at 与 expired lease 建索引。

业务写入和工作项必须同事务；事务后通知队列只是加速，失败仍可由小批扫描 pending 恢复。worker 以 SKIP LOCKED 领取小批，释放事务再执行外部操作，完成用 lease token/generation fencing；幂等投影与完成标记同事务。

若只需“最终最新状态”，可按 source 合并工作项，完成时 CAS 比较 generation；处理期间发生新变更不能被旧 worker 清掉。若必须保留每个约谈事件/消息的通知，则保留每事件 ID，不合并丢历史。乱序按权威 revision 判断，删除 tombstone 压住旧更新。

不使用 MAX(bigserial) 或裸 updated_at 作可靠消费水位；分配序号不等于提交顺序。投递不能继续复用展示 cursor 并在尾页复位；用持久未完成投递事实/消费状态，原 delivery ledger 继续负责去重与重试。

### 6.3 安全移除 GET refresh 的门

每个来源单独完成：所有 writer/到期入口覆盖 → 小批回填 → 新旧集合/计数/动作对账 → 并发与故障测试 → 小范围切换。未完成的来源不移除 GET 刷新、不对外宣称全链路已增量化。

过渡期只允许对**有可靠变更版本和到期边界的来源**使用持久 lease/last_success/next_due_at 合并重复刷新；先检查版本和最早到期，无变化且未到期才跳过。单纯“每 5 分钟刷新一次”不采用。没有变化版本的来源不能用定时节流冒充可靠增量。

后台 materialize、scheduler、maintenance 的同来源入口一并迁移，否则前台省下的读取会在后台继续发生。新 worker 的暂停开关必须同时阻止领取和续排，不能复用只限制 bootstrap 的 heartbeat 开关冒称完整停止。

## 7. 到期任务的保证

复用 canonical command transaction 和 wake 的 generation/lease/fencing。增加的任务不得绕过改期/取消验证，也不能改为浏览器计时器。

- 初始每批 50、每次 pass 最多 200 项并有墙钟预算（提议参数，按本地任务耗时校准）；到期索引空闲检查不读历史正文。保留 actor 公平性，不能让大账号饿死小账号。
- 根据既有提醒承诺验证真实唤醒机制；尚未证明队列支持何种延迟，不先依赖任意时长 delayed message。可使用持久 next_due_at + 有界周期恢复作为兜底，明确调度误差目标。
- worker 停顿超过原窗口后恢复，要有逾期策略（补站内记录/不再外推等按现有业务确认），不能因为 now 超过开始时间就默默跳过。
- 本方案不修改维护链或付费；调度精度、队列配置与云部署必须在对应发布批次单独验证。

## 8. 可单独验收的实施批次

| 批次 | 做什么 | 退出条件 | 不等待什么 |
|---|---|---|---|
| P0：冻结基准 | 固定 46e 发布语义、引入上轮本地脚本；补非空数据/真实 sourceAccess/完整 handler 的增长基准，区分 Web loader/App/API/worker | 基准可复现；每路线 SQL/行/字节/耗时；旧客户端比例和目标新鲜度列为实测缺项 | 不需要云压测、Redis 或新表 |
| P1a：最小摘要 | 新统一 summary，legacy 模式仅两类窄计数且身份一次；复用已有接口；Web/新版 App 共享请求入口 | 冷读无正文、业务计数一致；不再对同账号同时取三种完整来源；typed 未过门不扩大开启 | 不等待联系人分页、全来源 outbox |
| P1b：大账号冷读 | 联系人窄分页 + Web loader；会话摘要/历史页；跟进页单独按规则迁移 | 100/1万/10万本人数据下单页字节达标，权限/搜索/排序/全局统计一致；旧协议未破坏 | 各领域可独立发布，不等待缓存 |
| P2：重复读缓存 | 客户端复用先落地；writer 封闭的域上版本/权限/时间协议，再加有界服务器缓存 | 多实例、撤权、写读竞态、时钟边界通过；缓存关闭仍满足 P1；真实命中率可观测 | 无需 Redis；未封闭的域继续廉价直读 |
| P3：增量与到期 | 按真实成本排名逐来源接事务工作项/到期，回填对账后移除前后台扫描 | 已迁移来源闲置无全量读；一次变化只处理相关对象；故障恢复无丢失/重复业务效果 | 不必一次覆盖八类，未迁移来源保留明确状态 |
| P4：必要时扩容 | 可选窄投影、参与者计数、共享缓存、SSE/推送失效提示 | 实测证明某一层仍是成本/延迟瓶颈，且收益超过复杂度 | 不能仅因为“成熟产品都有”就建设 |

P3 可与不同模块 P1/P2 并行推进，但不在同一符号/表上无协调修改。不用整个项目等待单一来源的复杂授权难题。完成定义按批次和真实运行版本记录，而非“写完所有文档”。

实现触点：contacts handler/provider/SQL reader/Web route adapter；followups provider/live-service/任务及 Agent 调用者；relationship-communication service/factory/新 handlers；inbox bounded-list/repository/source adapters/业务刷新/typed-delivery；conditional-read/domain-watermark；共享契约/schema；App endpoints、角标 hook、inbox/contacts screens。实际每批改动前重新做影响分析，不能全目录无差别重写。

## 9. 性能预算、测试与 5 GB 容量模型

### 9.1 初始验收预算（设计目标，不是已有实测）

十进制 B/KB；统一计完整请求的 PG 返回数据，包含身份、来源校验、版本检查、RETURNING。JSON 与本地 wire 分列，不相加。HTTP/TLS/连接与平台计费另做校准。

| 操作 | 初始目标 |
|---|---|
| 不变状态的统一摘要检查 | ≤4 KB/请求；禁止业务正文及 GET 物化；新鲜度仍按 15 秒目标 |
| 摘要冷读/变化后读 | ≤8 KB/请求；精确计数不往 Node 搬所有未读 source metadata |
| 联系人/跟进 30 条摘要页 | ≤64 KB/请求，页外正文为 0；首屏额外 summary 单独入账 |
| 20 条会话摘要 | ≤32 KB/请求；历史消息正文为 0 |
| 消息历史/大详情 | 单独字节预算，建议 128 KB/页起测；合法超大单项必须有显式读取方式，不能隐形截断正文 |
| 无变化后台 pass | 只读有限状态/到期索引，无业务图 payload；频率乘请求成本单独计月额 |

预算不能靠缩窄页面业务定义或少算 authentication 达成。COUNT、复杂搜索和全局 facet 另测 EXPLAIN ANALYZE BUFFERS（仅本地），区分数据库扫描行数与应用返回行数。基准环境标明；暂不把某台开发机毫秒数当线上 SLO。

测试矩阵：

- 同一 actor 100/10,000/100,000 联系人，独立增加其他 actor 数据；固定页内容/页大小，字节增长容差目标 ≤10%。
- 10 万已读历史、1 万未读、大量 unavailable source、单条大正文、多来源重复引用；验证零/非零计数、稀疏页 continuation。
- 断网/冷缓存/多实例/同时 miss/事务回滚/写入后进程崩溃；缓存失效不可触发无界回退。
- 换号、同账号换服务器、权限撤销、关系解绑、旧 304、不同语言/筛选；数据不跨 scope 泄漏。
- 到期、snooze、30 天窗口、跨午夜/时区/DST、worker 停顿及重试；时间驱动正确性独立于业务写入。
- 写期间回填、删后旧事件重放、lease 超时旧 worker 完成、重复消息/通知投递、读指针乱序。
- 当前合法关联及旧 production 的占位/归档口径对照；App contract sync + Web SSR loader 测试，不能只跑 API 单元测试。

### 9.2 容量预算

继续使用 `scripts/diagnostics/egress-capacity-model.ts`，不再自建预算系统。

`月流量 = 天数 × Σ(各用户每日前台秒数 / 轮询秒数 × 每轮完整成本 + 各操作次数 × 各操作成本) + 后台 + 回填/导出 + 连接等校准差额`。

示例仅用于决策：15 秒、每天 1 小时、每轮 4 KB，再加每人每天 5 次各 50 KB 的操作，后台/一次性全项目 0.25 GB/月：

| 日活 | 月度模型 GB |
|---:|---:|
| 10 | 0.613 |
| 50 | 2.065 |
| 100 | 3.880 |
| 1,000 | 36.550 |

按用户讨论的 5 GB/月规划，建议把 3.5 GB 设为内部目标，留 30% 余量。这不是声称当前套餐条款已重新核验，也不是硬限额。上述 100 DAU 示例已超过内部目标，不能因低于 5 就宣称安全；实际图片、AI、其他模块、TLS 等还可能增加。

跨过目标时，先按真实排名检查重复请求、后台扫描和冷读；如果单位成本已经合理，再由业务决定调整新鲜度、使用增量通知或付费。不能承诺“用户无限增长仍免费”。不得悄悄把轮询改慢来让模型通过。

生产观测需要 route/job/domain、query hash、rows/bytes/耗时、cache hit/miss、source kind、客户端协议版本等低敏维度；不保存 SQL 参数/正文。沿用现有 metrics 增补请求关联，不购买日志服务作为前置。获得对应授权后，在限定时间窗采样，并与 Neon 同窗口增量校准；本轮不自动创建监控或连云取数。

## 10. 发布、回填和回滚

1. 选择明确基线：优先在当前已发布后端上做独立批次，不把主线数百提交顺带发布。typed allowlist、后台 notificationCutover 分开核对；迁移读取不能自动切产品模式。
2. 先部署新增接口/向后兼容 schema，再更新 Web 消费者；App 作为独立交接。记录客户端实际协议使用，不把源码更新视作所有设备更新。旧无界接口使用量单独统计，不能隐形截断旧响应。
3. 新版本状态/工作表先 additive migration，索引和写路径覆盖后再启用读开关。旧部署/worker 可能仍写生产，必须升级或停止该 writer 后才能启用依赖版本正确性的缓存；不能只更新当前别名就算封闭。
4. 回填先接可靠写入，再按来源 ID 小批、持久 checkpoint、revision 防覆盖；不在首次 GET 中做，不重发历史 Push。诊断/大规模影子对读在本地；云端回填/少量 shadow 有单独预算和授权。
5. 读开关回退到上一个**经过预算验证**的 reader；关闭缓存不影响正确性。若唯一旧路径无界，回滚时必须明确预算风险/限制使用，不能声称“安全自动回退”。
6. 暂停新 worker 不删工作项；恢复可继续消费。代码回滚保留新表/待处理事件，不 DROP 权威数据，不恢复会破坏新写协议的旧 writer。
7. 发布后核对普通读取、跨端写后回读、提醒到期、撤权、旧客户端及真实单位成本。仅 typecheck/build 成功不等于产品闭环。

## 11. 本轮交付和待确认

本轮只新增此设计文档，未修改业务、依赖、共享契约、App、生产设置或用户已有文件。没有运行云测试/导出/迁移。GitNexus 技能促使按 CRITICAL 共用读取边界拆迁移，并以真实源码补足漏边，而非把原完整图直接截断。

方案可供后续按 P0→P1a/P1b 开工；实现授权、具体批次发布、实际客户端升级不包含在“设计新方案”内。目标 DAU/每天活跃时长尚未由用户确定，本文容量数字是场景，不阻碍本地设计/性能验证；改变 15 秒体验、增加付费基础设施、执行生产回填分别需要对应决定。

## 参考依据

- 有序索引配合 LIMIT 可避免为前 N 条排序全部数据，复杂筛选是否达成仍要看执行计划：[PostgreSQL 16：Indexes and ORDER BY](https://www.postgresql.org/docs/16/indexes-ordering.html)。
- SKIP LOCKED 适于多消费者工作队列，不适合拿来实现普通列表的一致读取：[PostgreSQL 16：SELECT](https://www.postgresql.org/docs/16/sql-select.html)。
- 框架缓存可复用数据库结果，但请求 cookies/headers 不能作为隐式共享缓存上下文；应显式传安全作用域：[Next.js：unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)。当前官方页面推荐 Next 16 的新机制，本项目不因此自动迁移配置。
- 标签重验证可采用 stale-while-revalidate，不能据此声称权限撤销立即生效：[Next.js：revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)。
