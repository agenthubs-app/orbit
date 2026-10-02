# 大目标 4 方案 review（2026-10-02）

Codex `gpt-5.6-sol`（reasoning high，read-only）对 W0043～W0055（含 W0048a／b）revision 2 的一次方案 review。原文附后；协调者裁决如下，修订后各 PLANNER 升 revision 3。

## 协调者裁决

| 意见 | 裁决 | 落点 |
| --- | --- | --- |
| R-1 W0047 改了移动端字段语义 | 采纳：旧 `relationshipStrengthDistribution` 逐字段不动，只新增 `relationshipTierDistribution`，Web 改读新字段；刷新入口不挂 `/api/mobile`；补「旧响应逐字段不变」SC | W0047 |
| R-2 自动快照预留无法传给执行器 | 采纳：排队只 upsert job；worker 取得租约后预留一次并把 `usage_id` 写回 job；所有结束路径明确 finish/release；补崩溃／租约回收用例 | W0048a |
| R-3 计划账本结算所有者不明 | 采纳：配额按**操作**计（一次计划生成＝用户主动池 1 次）；成本按**每次供应商 HTTP 一条子账**，用 operation id 聚合；外部持有 usage 时 `generateSnapshotNow` 只返回不结算，由 W0048b 最终结算一次 | W0048a、W0048b |
| R-4 ≤5 次调用与 12 阶段冲突 | 采纳：取消「≤5 次」断言，改为每次 HTTP 前增量登记子账、总数有硬上限（骨架 1 + 阶段数 + 快照 ≤ 14），对抗用例覆盖 4／12 阶段；配额仍按操作计 1 次 | W0048b |
| R-5 `plan_log` 无 `sync_revision` | 采纳：按来源定义版本算法（orbit_records 用 sync_revision，plan_log 用 count/sum/max(seq)，其余表按稳定版本或更新时间并处理删除）；每来源一条「只改它版本就变」测试 | W0048a |
| R-6 W0050 读取路径会写计划并调生成器 | 采纳：改用只读 `getCurrent()`，投影为纯函数；SC 加阶段边界夹具断言 0 写入、0 生成器调用；同类检查扩到 W0049、W0052、W0054 所有读计划处 | W0050（及读计划的 Sprint） |
| R-7 30 天变化可被静默省略 | 采纳：W0047 交接基于完整去重时间线的 point-in-time 计算入口；W0049 不得省略，仅 30 天前确无数据时显示「数据不足」；夹具含单人 >12 条信号 | W0047、W0049 |
| R-8 W50-3 未进 W0051 范围与 SC | 采纳：白名单加 W0050 待唤醒视图模型与测试；SC-W0051-04 明确 ready 读 `nextStep`、其他状态保留规则句、0 次模型调用 | W0051 |
| R-9 要求修改 App 仓库 | 采纳：本轮不产生 App commit；新字段 optional、旧响应兼容；写 Bridge handoff 记录 App 影响与未验证范围 | W0045、W0051、W0055 |
| R-10 强度纳入洞察版本却不触发 dirty | 采纳：强度只用于排序和展示，移出洞察 `sourceDataVersion`；洞察文字不随档位衰减改写（对标：档位实时显示，AI 文字按内容变化更新） | W0051 |
| R-11 单人重生成缺原子领取、用户池无熔断 | 采纳 contact 级 CAS／租约，并发断言 provider 调用 1 次；用户池总熔断**每人每日 10 次操作（含手动重新分析 3 次），用户 2026-10-02 确认（D45）** | W0048a、W0051 |
| R-12 快照消费者字段形态不一致 | 采纳：统一 `NetworkSnapshotView.blocks` + `freshness.stale` | W0049、W0052、W0054 |
| R-13 依赖门不一致 | 采纳：以 README 为准同步；W0046 进入条件只写 W0045；W0051 明列 W0050；W0054 加 W0053（导入入口须真实可用） | README、W0046、W0051、W0054 |
| R-14 W0048b 无读流量 SC | 采纳：SC-W0048b-05 加 bootstrap／reanalysis、计划 GET、季度维护三类实测，用户路径入 D39，维护任务单列 | W0048b |
| R-15 收口路径没证明成功标准 A | 采纳：W0055 新用户路径用 ≥5 位联系人，经真实确认或导入入口进入，等维护任务跑完再验三标签；`--guide-step1` 只留给 W0054 | W0055 |
| R-16 SC 打包过重 | 采纳：不增 SC 数，每项收束为一条操作链 + 一个主证据，其余放「必需证据子表」 | 全部 |
| R-17 W0052 L 档条件 | 采纳：进入条件写「任一待改符号 HIGH/CRITICAL 或共享装配链受影响即升 H」，UNKNOWN 补查写入 REPORT | W0052 |

---

## Codex 原文

本次为只读评审，未修改任何文件。范围内 14 份 PLANNER 都是 5 项 SC，形式上满足上限。GitNexus 本地 wrapper 因缺少可用 runner、受限网络无法拉取而未能重新执行，因此调用方数量以当前源码与文本引用复核；没有把 `UNKNOWN` 或零搜索结果当作安全结论。

## 阻塞

### R-1｜W0047：修改了既有移动端字段语义

- **涉及 Sprint 与文件：** W0047 PLANNER、REQUIREMENTS、D41。
- **问题：** 方案声称“只加字段”，但同时把既有 `relationshipStrengthDistribution` 的数据源改为 W0047 缓存，并移除 `businessRelevanceScore`。这会改变 App 已消费字段的值和缺行行为，还计划在 `/api/mobile/contacts-dashboard` 增加刷新入口。
- **证据：** [W0047 PLANNER:49](/Users/li/work/orbit/repos/orbits/docs/sprints/W0047-relationship-strength-tiers/PLANNER.md:49)、[W0047 PLANNER:101](/Users/li/work/orbit/repos/orbits/docs/sprints/W0047-relationship-strength-tiers/PLANNER.md:101)、[SC-W0047-03:110](/Users/li/work/orbit/repos/orbits/docs/sprints/W0047-relationship-strength-tiers/PLANNER.md:110)；现实现仍以 `relationshipStrength ?? businessRelevanceScore` 计算：[dashboard-distribution.ts:560](/Users/li/work/orbit/repos/orbits/shared/compute/dashboard-distribution.ts:560)；约束见 [REQUIREMENTS:186](/Users/li/work/orbit/repos/orbits/docs/sprints/REQUIREMENTS.md:186)。
- **建议修改：** 保留旧 `relationshipStrengthDistribution` 完全不动；只新增可选 `relationshipTierDistribution`，Web 改读新字段。不要把 W0047 刷新挂到移动端路由；改为 Web loader 或后台维护入口。补“旧响应逐字段不变”的回归 SC。

### R-2｜W0048a：自动快照的配额预留无法传给执行器

- **涉及 Sprint 与文件：** W0048a PLANNER。
- **问题：** 自动路径先预留额度再 upsert job，但 job 表没有 `usage_id`；执行器又要重新判定，而 `generateSnapshotNow` 强制要求调用方传 `usageId`。当前设计无法确定究竟由排队方还是 worker 持有预留，容易重复预留、无法执行或永久遗留 `reserved`。
- **证据：** job 表无使用记录字段：[W0048a PLANNER:55](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:55)；先预留再排队：[同文件:79](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:79)；生成入口要求 `usageId`：[同文件:82](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:82)；账本完成/释放规则：[同文件:91](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:91)。
- **建议修改：** 排队阶段只 upsert job；worker 取得租约后再且只预留一次，并把 `usage_id` 持久化到 job。所有完成、失败、无需刷新、租约超时路径必须明确 `finish/release`。增加“排队后崩溃、预留后崩溃、二次判定变 fresh、租约回收”的 SC。

### R-3｜W0048a/W0048b：同一计划账本行没有明确结算所有者

- **涉及 Sprint 与文件：** W0048a、W0048b PLANNER。
- **问题：** W0048b 用一行 `purpose=plan` 覆盖快照、骨架和各阶段调用，并把同一个 `usageId` 传入 W0048a；但 W0048a 又定义生成入口按该记录完成结算。没有规定谁最终调用 `finish`、如何累计多次响应、部分失败如何记 calls/token，也没有说明实际调用少于预留 units 时如何调整。
- **证据：** [W0048b PLANNER:27](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048b-plan-ai-generator/PLANNER.md:27)、[W0048a PLANNER:82](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:82)、[W0048a PLANNER:86](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:86)、[W0048a PLANNER:91](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:91)。
- **建议修改：** 明确唯一所有者。可选方案是：外部持有的 `usageId` 下，`generateSnapshotNow` 只返回 usage、不结算；W0048b 聚合全部响应并最终结算一次。更稳妥的是每次供应商 HTTP 调用一条子账，另用 operation id 聚合。SC 必须覆盖快照成功后骨架失败、阶段部分成功、重放和无响应。

### R-4｜W0048b：“每份计划 ≤5 次调用”与现有 12 阶段上限冲突

- **涉及 Sprint 与文件：** W0048b PLANNER、计划生成源码。
- **问题：** PLANNER 按“骨架 1 + 阶段数 + 快照”预留且断言 `units ≤5`，但现有计划允许最多 12 个阶段，生成器会为每个阶段各调用一次。并发限制为 2 只限制并行度，不限制总调用数。
- **证据：** [W0048b PLANNER:27](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048b-plan-ai-generator/PLANNER.md:27)、[SC-W0048b-01:84](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048b-plan-ai-generator/PLANNER.md:84)；现有上限为 12：[contract.ts:108](/Users/li/work/orbit/repos/orbits/features/plans/contract.ts:108)；逐阶段调用：[generator.ts:190](/Users/li/work/orbit/repos/orbits/features/plans/generator.ts:190)。
- **建议修改：** 在任何 phase HTTP 调用前，把骨架解析结果硬限制到明确阶段数，或改为每次调用增量预留。增加模型返回 4 个、12 个阶段的对抗用例，断言不存在未预留的供应商调用。

### R-5｜W0048a：`sourceDataVersion` 对 `plan_log` 的 SQL 假设不成立

- **涉及 Sprint 与文件：** W0048a PLANNER、计划迁移源码。
- **问题：** 方案要求 `plan_log` 与其他来源统一使用 `count:sum:max(sync_revision)`，但 `plan_log` 没有 `sync_revision`。实现会直接 SQL 失败，或为了绕过而漏掉计划日志变化，导致快照错误判 fresh。
- **证据：** [W0048a PLANNER:61-65](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:61)；实际表只有 identity `seq`、`created_at` 等字段：[migrations.ts:102](/Users/li/work/orbit/repos/orbits/features/plans/migrations.ts:102)。
- **建议修改：** 为每类来源定义独立版本算法：`orbit_records` 来源使用 `sync_revision`；`plan_log` 使用 `count/sum/max(seq)`；可更新表使用稳定版本或更新时间，同时处理删除语义。每个来源至少做一次“只修改该来源即版本变化”的测试。

### R-6｜W0050：所谓只读机会页会实际写计划并可能调用生成器

- **涉及 Sprint 与文件：** W0050 PLANNER、计划服务源码。
- **问题：** W0050 上下文选用 `PlanService.getCurrentView({includeLog:false})`。该函数在阶段边界会执行 `enterPhaseTransaction()`，写入“进入新阶段”并调用默认 phase refiner；它不是只读入口。
- **证据：** W0050 对读取路径及“页面 0 AI”的要求见 [W0050 PLANNER:51-63](/Users/li/work/orbit/repos/orbits/docs/sprints/W0050-analysis-opportunities-tab/PLANNER.md:51)；`getCurrentView` 的写事务见 [service.ts:1290](/Users/li/work/orbit/repos/orbits/features/plans/service.ts:1290)，真正只读的 `getCurrent` 在 [service.ts:687](/Users/li/work/orbit/repos/orbits/features/plans/service.ts:687)；默认补细器会解析生成器：[phase-refinement.ts:120](/Users/li/work/orbit/repos/orbits/features/plans/phase-refinement.ts:120)。
- **建议修改：** 统一改用 `getCurrent()`，必要的 view 投影必须是纯只读函数。SC 加阶段边界夹具，明确断言零 INSERT/UPDATE、零 generator 调用，而不只断言页面正常渲染。

### R-7｜W0047/W0049：RN-07 必需的“较 30 天前变化”允许被静默省略

- **涉及 Sprint 与文件：** W0047、W0049 PLANNER，REQUIREMENTS RN-07。
- **问题：** RN-07 把 30 天变化列为必需内容，但 W0049 允许因 W0047 缺少按时间点能力而不显示；同时 W0047 缓存只保留最多 12 条信号，不能保证用缓存正确回放 30 天历史。
- **证据：** 强制需求：[REQUIREMENTS:219-220](/Users/li/work/orbit/repos/orbits/docs/sprints/REQUIREMENTS.md:219)；W0047 只保留 12 条：[W0047 PLANNER:43](/Users/li/work/orbit/repos/orbits/docs/sprints/W0047-relationship-strength-tiers/PLANNER.md:43)；W0049 的逃生条款：[W0049 PLANNER:50](/Users/li/work/orbit/repos/orbits/docs/sprints/W0049-analysis-structure-tab/PLANNER.md:50)。
- **建议修改：** W0047 必须交接基于完整、去重后时间线的 point-in-time 计算入口；W0049 不得因接口缺失省略。只有账号在 30 天前尚无联系人等真实数据不足场景，才允许显示明确的“数据不足”。测试加入单联系人超过 12 条信号的夹具。

### R-8｜W0051：W50-3“为什么现在联系改读洞察”未真正进入实现范围和 SC

- **涉及 Sprint 与文件：** PENDING、W0051 PLANNER。
- **问题：** 协调者备注说 W0051 承接 W50-3，但正式范围只列三处洞察展示，没有列 W0050 机会视图模型；SC-W0051-04 也未验证待唤醒理由使用 `nextStep`。该已定事项可能在执行中被合法遗漏。
- **证据：** 决定见 [PENDING:60](/Users/li/work/orbit/repos/orbits/docs/sprints/PENDING-2026-10-01-network.md:60)；承接声明见 [W0051 PLANNER:4](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:4)；实际范围与 SC 见 [同文件:93-106](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:93)。
- **建议修改：** 把 W0050 待唤醒 view model 和测试显式加入白名单；SC 明确：ready 洞察读 `nextStep`，none/pending/failed 保留规则拼句，读取过程中 0 次模型调用。

### R-9｜W0045/W0051：方案要求修改 App 仓库，违反“本轮只做 Web”

- **涉及 Sprint 与文件：** W0045、W0051 PLANNER、REQUIREMENTS、Bridge。
- **问题：** 两份方案都要求协调者在 `repos/orbit-app` 执行 contract sync 并产生单独提交，属于 App 修改，不只是验证；与“本轮只做 Web”直接冲突。目前 Bridge 也没有大目标 4 的正式交接记录。
- **证据：** [W0045 PLANNER:129](/Users/li/work/orbit/repos/orbits/docs/sprints/W0045-contact-enrichment-seniority-region/PLANNER.md:129)、[W0051 PLANNER:123](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:123)；约束见 [REQUIREMENTS:186](/Users/li/work/orbit/repos/orbits/docs/sprints/REQUIREMENTS.md:186)；跨端行为要求登记交接：[bridge/README.md:30](/Users/li/work/orbit/bridge/README.md:30)。
- **建议修改：** 本轮不得产生 App commit；Web 新字段必须保持 optional 和旧响应兼容。建立 Bridge handoff，记录 Web 版本、App 影响和未验证范围。若 contract sync 确实是完成条件，应先取得明确的范围变更决定。

## 重要

### R-10｜W0051：强度被纳入洞察版本，却明确不触发 dirty

- **涉及 Sprint 与文件：** W0051 PLANNER。
- **问题：** `source_data_version` 包含强度档，但强度档变化不标 dirty；W0047 又会因时间衰减在无写入时改变档位。结果是版本已经过期，却没有后台任务领取该联系人。
- **证据：** [W0051 PLANNER:29](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:29)、[同文件:39-45](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:39)。
- **建议修改：** 二选一：若强度仅用于排序，移出洞察文字的 `sourceDataVersion`；若强度变化应改写洞察，则 W0047 在 tier/dormant 发生转换时发出 dirty，或由维护任务扫描版本差异。

### R-11｜W0051：单人手动重生成缺少防重复调用的原子领取

- **涉及 Sprint 与文件：** W0051 PLANNER、W0048a 配额契约。
- **问题：** 点击后 `after()` 直接生成，只有账本幂等键；两次并发请求可能拿到同一预留，却各执行一次供应商调用。SC 只要求“不重复计费”，没有要求“不重复调用”。此外用户池对跨联系人的手动洞察没有总熔断，容易形成失控成本。
- **证据：** [W0051 PLANNER:32](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:32)、[同文件:45](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:45)、[SC-W0051-04:106](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:106)；用户池定义见 [W0048a PLANNER:87](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:87)。
- **建议修改：** 增加 contact-level CAS/lease，只有从 pending 原子切到 started 的执行器能调用模型；并发测试必须断言 provider 调用数为 1。另定义用户池的日级成本熔断或单人洞察日上限。

### R-12｜W0049/W0052：快照消费者使用了不存在的字段形态

- **涉及 Sprint 与文件：** W0048a、W0049、W0052 PLANNER。
- **问题：** W0048a 定义 `NetworkSnapshotView` 为“当前语言的 `blocks` + `freshness.stale`”；W0049、W0052 却引用 `language.{zh,en}` 和顶层 `stale`。这不是单纯的行号漂移，而是上下文包的契约形态不一致。
- **证据：** 正式形态见 [W0048a PLANNER:47](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:47)；错误引用见 [W0049 PLANNER:39](/Users/li/work/orbit/repos/orbits/docs/sprints/W0049-analysis-structure-tab/PLANNER.md:39)、[W0052 PLANNER:34](/Users/li/work/orbit/repos/orbits/docs/sprints/W0052-network-overview-cockpit/PLANNER.md:34)。
- **建议修改：** 现在就统一为 `NetworkSnapshotView.blocks` 与 `freshness.stale`；确需双语时只使用 W0048a 的 `{languages}` 仓储读取接口，不自行创造另一种 view contract。

### R-13｜登记表与 PLANNER 的依赖门不一致

- **涉及 Sprint 与文件：** README、W0046、W0051、W0054 PLANNER。
- **问题：**
  - W0046 先写“登记表无前序依赖”，同段又要求 W0045 已合并，而登记表实际也写了 W0045。
  - W0051 登记表依赖 W0050，但正式进入条件漏掉 W0050。
  - W0054 页面要求展示“导入人脉”，却未显式依赖 W0053；仅靠编号顺序不能保证生命周期门控。
- **证据：** [README:115](/Users/li/work/orbit/repos/orbits/docs/sprints/README.md:115)、[W0046 PLANNER:9](/Users/li/work/orbit/repos/orbits/docs/sprints/W0046-relationship-timeline-memo/PLANNER.md:9)；[README:121](/Users/li/work/orbit/repos/orbits/docs/sprints/README.md:121)、[W0051 PLANNER:10-12](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:10)；[W0054 SC-01:76](/Users/li/work/orbit/repos/orbits/docs/sprints/W0054-network-threshold-demo/PLANNER.md:76)、[README:124](/Users/li/work/orbit/repos/orbits/docs/sprints/README.md:124)。
- **建议修改：** 以 README 为唯一状态源同步三处依赖；W0051 明列 W0050 completed；W0054 若按钮要求真实可用则加 W0053，否则明确是不可操作占位并从 SC 中移除。

### R-14｜W0048b 没有数据库读取流量实测 SC

- **涉及 Sprint 与文件：** W0048b PLANNER、REQUIREMENTS D39。
- **问题：** W0048b 新增快照判定、计划输入、GET/SSR 和维护任务读取，但五项 SC 只有 AI 次数、功能、全量测试，没有数据库语句数/返回字节测量。W0055 汇总无法补救上游没有实测数据。
- **证据：** [SC-W0048b-01～05:80-88](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048b-plan-ai-generator/PLANNER.md:80)；要求见 [REQUIREMENTS:186](/Users/li/work/orbit/repos/orbits/docs/sprints/REQUIREMENTS.md:186)。
- **建议修改：** 在 SC-W0048b-05 加 bootstrap/reanalysis、计划 GET、季度维护三类读流量实测；用户请求进入 D39，维护任务单列后台预算，不与用户打开频次混算。

### R-15｜W0055 最终路径没有证明成功标准 A

- **涉及 Sprint 与文件：** REQUIREMENTS、W0051、W0055 PLANNER。
- **问题：** 成功标准要求新用户扫 5–10 张名片；W0055 最终链路只用 `--guide-step1` 注入 3 位联系人。该 seed 还可能绕过 W0051 的名片确认 dirty 触发，导致“洞察已有内容”不是生产链路证明。
- **证据：** 成功标准见 [REQUIREMENTS:176](/Users/li/work/orbit/repos/orbits/docs/sprints/REQUIREMENTS.md:176)；W0055 仅 3 位 seed：[SC-W0055-04:79](/Users/li/work/orbit/repos/orbits/docs/sprints/W0055-network-closeout/PLANNER.md:79)；洞察触发点见 [W0051 PLANNER:39-47](/Users/li/work/orbit/repos/orbits/docs/sprints/W0051-contact-insights/PLANNER.md:39)。
- **建议修改：** 收口路径至少使用 5 位联系人，并通过真实确认入口或生产支持的批量导入入口进入；随后执行并等待维护任务，再验证三标签。`--guide-step1` 可保留为 W0054 的无付费门槛测试，但不能替代最终成功标准。

## 建议

### R-16｜多份 SC 虽然数量合规，但单项打包过重

- **涉及 Sprint 与文件：** W0045、W0048a、W0054 等 PLANNER，RULES。
- **问题：** 全部 PLANNER 都恰好 5 项 SC，但多项同时绑定迁移、权限、并发、UI、流量、全量测试和真实调用，无法形成单一明确的通过/失败结论。
- **证据：** 规则要求一个 SC 对应一个可观察行为和一个主要验证方式：[RULES:63](/Users/li/work/orbit/repos/orbits/docs/sprints/RULES.md:63)；典型例子为 [SC-W0048a-04:128](/Users/li/work/orbit/repos/orbits/docs/sprints/W0048a-network-snapshot-quota/PLANNER.md:128)、[SC-W0054-05:80](/Users/li/work/orbit/repos/orbits/docs/sprints/W0054-network-threshold-demo/PLANNER.md:80)。
- **建议修改：** 不必增加 SC 数量；把每项收束成一条操作链和一个主证据，其余测试矩阵放到“测试映射/必需证据子表”，并要求每个子断言独立留证。

### R-17｜W0052 的 L 档只能在影响分析完成后保留

- **涉及 Sprint 与文件：** W0052 PLANNER、RULES。
- **问题：** W0052 涉及 Dashboard 服务端装配、多个新增读取以及 `AppContactsDashboardPage` 的 `UNKNOWN` 影响。当前可以暂列 L，但若开工 impact 显示触及共享 loader、HIGH/CRITICAL 符号或跨标签共同数据组装，就必须升 H，不能只在个别函数 HIGH 时升级。
- **证据：** [W0052 PLANNER:30-37](/Users/li/work/orbit/repos/orbits/docs/sprints/W0052-network-overview-cockpit/PLANNER.md:30)；分档规则见 [RULES:67-72](/Users/li/work/orbit/repos/orbits/docs/sprints/RULES.md:67)。
- **建议修改：** 在进入条件写成“任一待改符号为 HIGH/CRITICAL 或共享装配链受影响即升 H”，并把 UNKNOWN 的文本补查结果写入 REPORT。

其余重点约束整体一致：`RelationshipTimelineItem`、`ContactInsight`、`enrichment.fields`、三种账本 pool 名称基本统一；“不读私信表”“强度不手标”“邮件止于草稿”“示例期零真实调用”均未发现直接反向方案；各 Sprint 的 H/I 档除 W0052 外总体合适。

**总体结论：修后可开工。**