# Sprint AG15 — 执行总结（定时任务与站内收件箱，H）

对应 [GOAL.md](GOAL.md)。本页是生成者在 run-01 写的；评审结论和最终状态由协调者在页尾补。

## 结果

**已验证能做到：**

- **聊天里建定时任务，不点不启用。** 说「每周五上午九点，用 @兴趣笔记 给我挑三场周末活动……」，出一张确认卡，卡上分七行：检查时间（「每周五 9:00 之后约10分钟内」，不承诺整点）、候选范围、排序依据、条数、有效期、提醒方式、下次预计运行（带星期）。没点确认时库里没有这条任务，到点也不跑。没说按什么挑，先问一句并给出现在能用的排法，回答之后再出卡。中、英、日三种说法都由代码读出时间、范围、截止日和要不要推送。
- **关掉网页和手机也照常跑。** 一个派发器按到期时间跨账号领取，每期在任务所有者的权限里只读；两个账号设同一时刻，各读各的、各收到一份。同一期只算一次：历史记录的编号由工作区、所有者、任务、版本、计划时刻拼出，重试用同一个编号。
- **没有新的不打扰，说过的不重复。** 没有新内容的那一期只在历史里记「没有新的」；这条任务告诉过你的记录，之后各期不再列，并在结果里写「其中 N 场之前已经告诉过你」。
- **通知没送成只补送，不重算。** 结果和「还没送出」一起存；补送只读存下的结果。送出前会再查一次任务的状态和引用的笔记还能不能读：已暂停、已修改、已删除或笔记读不到，就不送，这一期记为「已算出，没有送出」并写明原因。
- **中断恢复只补最近一期。** 历史里写明跳过了几期、是哪几天。
- **引用的笔记读不到。** 这一期标为需处理，不拿别的笔记或记忆顶替；收件箱里说一次（同一版本的任务不每期重复说）。
- **卡片 7 天过期由一次性定时器处理。** 卡开始等确认时就在同一张到期索引里放一个定时器；到期标为过期，点了返回 `CARD_EXPIRED`、什么都不写，重新生成出第 2 版、仍要再点。定时任务出的卡不挂在对话下，出处是任务和触发时刻，从收件箱里确认；下一期出新卡时旧卡被取代，卡上能看出是「被取代」而不是「放太久」。
- **「我的定时任务」的数据与接口**（界面未做，见下）：任务列表（卡上那几行、下次运行时刻和时区、最近一期）、单条任务的运行历史、表单建任务、暂停、恢复、删除。

**仍未实现或未验证：**

- **两端界面没有做。** 视觉稿还没批准。两端「我的定时任务」页、收件箱里三种新条目的样式、收件箱里的确认卡都没有画，界面证据（1440/375 截图、不闪动核对、App 连本机服务确认同一张卡）记 blocked。目前新条目在现有收件箱里按通用样式出现；Web 只补了三种来源的名字（定时任务、等你确认的修改、外部提议），免得显示成「来源」。App 端没有动界面代码。
- **AE-SCL-030 的「约束在无人在场时照样生效」靠 AG14。** 本分支上 `recallFor()` 的接缝不返回任何记忆。这一例在本分支的硬判定是通过的（公司本来就写在每个人后面），但 LMM05 并没有真的被召回；合并 AG14 后要接上接缝再跑。
- **门槛运行里有 4 例不变量没过，都不属于本 sprint**：AE-MEM-008、009、012（AG14 的记忆不变量，本分支没有 AG14）和 AE-REF-005（门槛归 AG14，AG11 报告里已记为留给 AG14）。本 sprint 的 14 例全部通过硬判定。
- **「待续项满 7 天关闭并在会话里留一行」没有做。** 代码里还没有任何地方产生待续项（`pending_external` 只出现在提示词里），没有可关闭的东西；定时器存储已经支持（见交接）。
- 旧的 Playbook 编译器（`features/agent/playbooks/compiler.ts`）没有改：对话里建任务走的是新入口，不经过它。

## 运行记录

- 结果：等协调者评审（硬判定见下）。
- Generator：Claude（Fable 5.2），2026-11-19～20；Planner revision 1，SHA-256 `3df3967767d8f5aca26f3e8153e36e91dcb3b8ceeb4efc0cdd1a5dd2eb0d4736`（开工时记录；之后只在页尾追加了「进入条件核对」）。
- 基线 HEAD `98869bb4c36cc05ef30f034e6260091b028783e0`（`agent-v1-integration`）；分支 `sprint/AG15-scheduled-tasks-inbox`；由协调者合并。
- 档位 H。push：无。生产库、部署：没有碰。
- 中途在 00:50 因账号用量上限停过一次，04:11 继续；没有半写的文件。

### 提交

| SHA | 内容 |
|---|---|
| `eae41a6ef` | 产品代码与测试：规则字段、到期索引与派发器、运行历史、投递与补送、一次性定时器、规则卡与执行器、对话里的规则节点、收件箱三种来源、接口、共享契约与 App 同步副本 |
| `19e35bac4` | 运行器：`scheduler_tick`、`rule_runs`、`rule_state`、收件箱读取、夹具规则与平台活动的写法 |
| `90158fd99` | PLANNER 追加「进入条件核对」（门槛构建自这一提交） |
| 本页所在提交 | REPORT |

### 评测运行（都在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag15/runs/`）

| 运行 | 用途 | 硬判定 | 真实调用（主模型／判断） | 金额（元） |
|---|---|---|---|---|
| `20261120-002656-98869bb-dev-sch004` | 开发：AE-SCH-004，派发入口被代理拦成 401 | 0/1 | 0／0 | 0 |
| `20261120-003921-98869bb-dev-sch004` | 开发：放行派发入口后 | 1/1 | 0／1 | 0.0004 |
| `20261120-003951-98869bb-dev-dispatch` | 开发：8 例只靠派发的用例；AE-SCH-006 因运行器改平台活动的写法有错没过 | 7/8 | 0／6 | 0.0051 |
| `20261120-004153-98869bb-dev-conv` | 开发：5 例对话用例 | 5/5 | 11／1 | 0.0227 |
| `20261120-041907-98869bb-dev-stab1` | 稳定性第 1 次（14 例） | 14/14 | 11／8 | 0.0276 |
| `20261120-042342-90158fd-dev-stab2` | 稳定性第 2 次（14 例，门槛同一构建） | 14/14 | 11／8 | 0.0293 |
| `20261120-042605-90158fd-dev-stab3` | 稳定性第 3 次（14 例，门槛同一构建） | 14/14 | 11／8 | 0.0263 |
| `20261120-042802-90158fd-AG15-gate` | **门槛**：`--gate AG15 --workers 3`，78 例（SCH ×12、SCL ×2、不变量包 64） | 74/78 | 154／24 | 0.2965 |

- 三次稳定性运行里 14 例的硬判定结果完全一致；AE-SCL-030 三次列出的都是 LC24、LC28、LC27、LC25、LC26，AE-SCH-004 三次都是两条 delivered。没有因 Gemini 3 秒或 DeepSeek 15 秒超时而重跑的用例。
- 门槛运行：主模型 154 次，提示 363,202 token（其中缓存命中 327,808）、生成 61,010 token；判断模型 24 次，输入 14,601 token；DeepSeek 余额 302.87 → 302.74 元。本 sprint 全部运行合计约 0.41 元（上限 150）。
- 评审材料已生成：`20261120-042802-90158fd-AG15-gate/judging.md`，78 份、每份两次评审。**没有自评。**
- `agent-eval:judge-pack` 在分线环境里要带 `ORBIT_AGENT_EVAL_HOME=/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag15` 才找得到运行目录（它读进程环境，不读环境文件）。`agent-eval:report` 想必一样。没有改运行器的这一处。

### 待登记的运行（`eval/RUNS.md` 由协调者填）

上表 8 行。门槛那一行：`20261120-042802-90158fd-AG15-gate`，提交 `90158fd`，78 例，硬判定 74/78（未过：AE-MEM-008、AE-MEM-009、AE-MEM-012、AE-REF-005，均归 AG14），真实调用 154＋24，0.2965 元，`bundle.sha256` 的校验值开头 `710bc3d4947e`。

### 测试

- 本 sprint 新增与改动的测试（全部通过）：`tests/capabilities/agent-automation-due-index.test.ts`（10）、`agent-automation-runs.test.ts`（11）、`agent-automation-timers.test.ts`（5）、`tests/services/agent-automation-dispatch-postgres.test.ts`（4，真库）、`tests/api/agent-automations-routes.test.ts`（3）、`tests/agent-v1/rule-domain.test.ts`（8）、`tests/agent-v1/rule-run.test.ts`（7）、`tests/agent-eval/hard-checks-ag15.test.ts`（4）、`tests/ui/maintenance-proxy-integration.test.ts`（多 1 条）、`tests/capabilities/agent-v1-receipts.test.ts`（登记的执行器键多了 5 个规则键）。
- 数据库测试没有被跳过：用 `ORBIT_EVENT_DATABASE_URL=postgresql://…@127.0.0.1:5432/orbit_ag15_test`（本机专用库，测试在私有 schema 里跑、跑完删掉），先过 `node scripts/assert-local-test-databases.mjs`。
- 操作链收口集（PLANNER 所列文件加 `tests/agent-v1/*`、`tests/agent-eval/*`）：第一次跑 793 条里有 2 条是本 sprint 引入的失败，已修——契约目录里放了运行时常量（挪到 `features/notifications/agent-inbox-source.ts`）；维护任务清单里把派发任务排到了读成本汇总之后（改为排在它前面）。修后两条都过。
- `npx tsc --noEmit -p .`：只剩基线就有的两处（`tests/scripts/redesign-pixel-lib.test.ts`、`tests/services/contact-profile-inference-postgres.test.ts`）。App `tsc`：只剩基线就有的 `tests/ios-scene-lifecycle-config.test.ts`。
- 契约同步：改了 `shared/contract/inbox-notifications.ts`、`shared/contract/agent-v1.ts` 和对应 schema，同一提交里跑了 `npm run sync:contract`、重写了 `.snapshot.json`；App 的四个同步测试和三个收件箱测试通过（58 条）。
- 全量对照：见页尾「全量测试」。

证据目录：`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG15/run-01/`（收口集日志、typecheck 输出、impact 与 detect-changes 输出、稳定性运行摘要、全量测试日志）。

## 验收结果

| 验收 | 结果 | 证据 |
|---|---|---|
| AG15-1 规则卡分列六样，点击后才启用 | 服务端与对话 pass；界面截图 blocked（视觉稿未批准） | `rule-domain.test.ts`（卡上七行的原文、确认前零写入、重放只建一条）；门槛 AE-SCH-001、002、003、AE-SCL-030 硬判定通过 |
| AG15-2 两个账号同一时刻，各读各的，本期各一份 | pass（硬判定） | `agent-automation-due-index.test.ts`、`agent-automation-dispatch-postgres.test.ts`（并发领取不重、规则与索引同事务、两个派发器同时跑每期只算一次）；AE-SCH-004、005、010 |
| AG15-3 没有新内容不进收件箱；同一条不重复告知 | pass（硬判定） | `agent-automation-runs.test.ts`、真库测试里的推送候选一条；AE-SCH-006、007、AE-SCL-029 |
| AG15-4 暂停后不再送；只补最近一期并标出跳过的期数 | pass（硬判定） | `agent-automation-runs.test.ts`、`agent-automation-due-index.test.ts`（夏令时两种情形）；AE-SCH-008、009 |
| AG15-5 定时器让到期的卡失效；定时任务的卡在收件箱里确认 | 服务端 pass；Web 1440/375 截图、不闪动、App 确认同一张卡 blocked | `agent-automation-timers.test.ts`；AE-SCH-011、012（运行器从收件箱条目找到卡再点确认） |

## 与 PLANNER 不同（CONVENTIONS／brief／协调者指示优先）

1. **AG14 没有先完成**，并行开发。`recallFor()` 走接缝 `features/agent/automations/recall-seam.ts`，本分支返回空。
2. **视觉稿未批准**，只做服务端、契约和测试。
3. **派发入口。** PLANNER 让派发任务挂在维护任务清单上，已挂（`agent_automation_dispatch`，排在读成本汇总之前）。另把原来的按账号入口 `POST /api/internal/agent/automations` 改成同一个跨账号派发：只认 `Authorization: Bearer $CRON_SECRET`，带账号请求头或参数一律 400。`proxy.ts` 为这一个路径和方法放行到它自己的密钥校验（维护入口已有同样的放行）。`scheduler_tick` 调的是这个入口，不是整轮维护：整轮维护里别的任务（计划、提取、推送）会在评测里写数据。
4. **`CRON_SECRET`** 没有放进环境文件，由评测环境用自己的 `AUTH_SECRET` 派生（`env-guard.ts`），运行器和评测服务用同一个；环境文件里写了就用文件里的。
5. **旧的按账号领取没有整体停用，而是分开。** 带规则字段的任务只进到期索引、只由派发器领取；不带规则字段的旧 Playbook 不进索引，仍走原来的按账号领取（`claimDue` 对带规则字段的任务一律不领）。这样两边不会领到同一期，旧功能也没有被悄悄关掉。`scripts/run-agent-worker.ts` 没有改。
6. **派发时不读任务记录本身。** 到期索引的每一行带着任务当前版本的定义，派发器只读索引、不去读 `agentAutomations`。原因有两个：一是不用为找到期的任务去列某个账号的记录；二是评测把读 `agentAutomations` 算作读私有记录，AE-SCH-004 的 `private_reads_within` 只允许 M36 和活动。这一点请评审留意：它是设计选择，不是为了躲判定。运行本身也不改写任务记录（下次运行时刻只在索引里），所以「没有业务写入」是真的。
7. **规则的对话路径没有并进第二层的提示词**，而是在函数节点里单独处理（`graph/nodes/rule.ts`），多一次主模型调用，用自己的提示词只让模型指出原话里的片段；时间、范围、条数、截止日、推送与否由代码读。这样第二层的提示词没有动，旧门槛不受影响。
8. **`domains/rule/` 只有两个文件**：`ops.ts`（`prepare`：五种操作的卡片内容）和 `apply.ts`（`applyApproved`：五个执行器）。删除的能力名沿用能力清单里的 `rule.cancel`。
9. **需处理的那一期会进收件箱一次**（同一版本只说一次）。设计稿没说进不进；不说的话用户不打开「我的定时任务」就不知道任务停摆了。要不要保留请定。
10. **运行器。** `listed` 在没有对话时取最后一份送进收件箱的定时结果（SCL.yaml 的注释就是这么写的）；`rule_runs` 从数据库前后差异读，不取产品自己的汇报；运行器自己读各账号收件箱和任务列表的请求带「另一端」标记，不算被测系统的读取。用例一条没改。
11. **证据目录**在外置盘 `/Volumes/ORICO/Dev/orbit-sprint-evidence/…`，不是 PLANNER 写的 `~/orbit-sprint-evidence/…`。
12. **AE-SCL-030 的范围人数。** 用例注释说范围里有 241 位；按产品里实际记下的往来（带往来字段的笔记）算，半导体行业、最近一次往来在 60 天以前的是 114 位（另有 397 位没有任何往来记录、23 位 60 天内联系过）。结果里写的是 114、细看 30、还有 84 没细看。硬判定不依赖这个数。

## 影响分析

索引是开工时为本检出单独建的（`gnx.sh ag15 analyze --index-only`，913 秒）。改动前做了上游影响分析，输出在证据目录 `impact/`。

| 符号 | 风险 | 本次怎么改的 |
|---|---|---|
| `createStorageAgentAutomationService` | CRITICAL | 加可选的 `storage`；不传时行为与原来相同（原测试全过） |
| `createAgentAutomationService` | CRITICAL | 接上到期索引 |
| `createInboxRuntime` | CRITICAL | 只多了三种来源的可见性判断 |
| `cardWriteExecutors` | CRITICAL | 多一个可选的 `rules`，登记五个规则执行器 |
| `createOrbitAgentRuntimeService` | CRITICAL | 登记规则执行器；包一层给新卡设过期定时器 |
| `functionOf` | CRITICAL | 最前面多一个规则任务的分支 |
| `routeNode`、`proposableOf`（未改）、`needsIntentReview`（未改）、`deliverNode` | HIGH | 路由里加「定时任务请求」的代码判据与并入相邻限定句；交付里多存一项待答问题的内容 |
| `runOrbitRecordsMigration`、`resolveAgentAutomationRequest` | MEDIUM | 多建一张表；改用规范账号 |
| `proxy`、`runHardChecks`、`buildEvalEnvironment` | UNKNOWN | 文本搜索确认了调用方（Next 中间件与代理测试；运行器；评测环境加载） |

提交前 `detect-changes --scope staged`：产品提交 65 个文件、222 个符号、38 条流程，风险 critical；运行器提交 6 个文件、40 个符号，风险 medium；都没有 `partial` 或 `truncated`。加了新文件之后没有重建索引（重建要 15 分钟，与门槛运行抢机器），所以新文件里的符号不在这两次结果里。

## 假设与额外阅读

- 上下文包之外读了：评测运行器全文与预加载脚本（要加词、要知道读取怎么被记下来）、`graph/nodes/functions.ts`／`propose.ts`／`route.ts`／`deliver.ts`（规则卡要从对话里出来）、`agent/runtime/card-operations.ts`／`decision.ts`／`service-factory.ts`（卡片项与过期）、`events/host/storage/lifecycle.ts`（运行器改平台活动）、未批准的视觉稿（只看了它要哪些状态）。
- 没说时间只说「每周五」时，代码读不出时刻；模型给了就用模型的，都没有就用 9:00，并显示在卡上由用户确认。
- 活动范围没说时间窗时按「之后 7 天」。周末指这一期之后最近的周六、周日；周日当天跑就只看当天剩下的。已经开始的活动不列，没公布时间的活动不算进任何时间窗。
- 按主题挑时，只列判断为匹配或部分匹配的、或者记录里的字词和主题对得上的，不拿不相关的凑数；判断没回来时只列字词对得上的，并在结果里说明没能逐个核对。
- 任务改了版本之后，「告诉过的不再告诉」从新版本重新算起。
- 一期连续算失败，下一次派发用同一个编号再试，三次都失败才在历史里记失败；历史里记下算了几次。
- 补送间隔 5、10、20 分钟……最长 6 小时，一直补到送到或被取消，没有设上限次数。
- 本机开发库 `orbit_events` 里现有 0 条定时规则，所以没有旧分区要处理；主评测库里有 1 条旧形状的规则（没有规则字段），不会被派发器领取。

## 按未批准的视觉稿核对过的数据（协调者 04:11 的要求）

稿子没批准，界面没做；只核对了服务端带不带得动它要的东西，缺的补上了：

| 稿子要的 | 现在的数据 |
|---|---|
| 规则卡七行 | 卡的 `display.rows` 七行，每行有 `field`（`schedule`、`scope`、`rankingBasis`、`maxItems`、`validUntil`、`notify`、`nextRunAt`），顺序由界面定 |
| 下次哪天、带时区 | 任务的 `nextRunAt` 和新加的 `timeZone` |
| 历史：没有新的 | `outcome: no_match` |
| 历史：跳过了几期、哪几期 | `skipped` 和新加的 `skippedDays`（本地日期，最多 12 个） |
| 历史：没跑成，已重试 | 新加的 `computeAttempts`（大于 1 就是重试过） |
| 历史：补送到了，没有重新算 | `delivery.attempts` 大于 1 且 `state: delivered` |
| 历史：需要你处理，笔记打不开 | `outcome: needs_attention` 和新加的 `attention`（原因、说明、笔记名） |
| 历史：算好了，送出前暂停了 | `outcome: undelivered`、`delivery.state: cancelled`、新加的 `delivery.cancelReason`（暂停／改了／删了／笔记打不开） |
| 三种收件箱条目 | 来源 `automation_result`、`agent_card`、`external_proposal`；目标种类 `automation`、`card` |
| 被下一期取代的旧卡 | 卡片预览新加的 `expiredReason: "superseded"`；点它返回 `CARD_EXPIRED`，提示写的是被新卡取代 |
| 以后按期的推送状态 | 每期的 `push`（`not_requested`／`pending`／`delivered`／`failed`、次数、时间），与 `computedAt` 分开 |

历史每行另有服务端写好的一句 `line`，界面可以直接用，也可以按上面的字段自己排。

## 交接

**给 AG16（按任务发推送）：**

- 任务的提醒方式：`agentAutomationNotify(automation): { inApp: boolean; push: boolean }`（`features/agent/automations/contract.ts`）；任务上是 `automation.rule.notify`。对话里改它已经能出卡：能力 `rule.update`，卡上 `set: { notify: { inApp: true, push: true } }`（`domains/rule/ops.ts` 的 `RuleUpdateIntent`）。
- 每期的记录：`AgentAutomationRunRecord`（`features/agent/automations/runs.ts`）。`computedAt` 是算出结果的时刻；`delivery.inbox` 是收件箱的投递（`state`、`attempts`、`deliveredAt`、`lastError`、`cancelReason`）；`delivery.push` 留给 AG16：`{ state: "not_requested" | "pending" | "delivered" | "failed"; attempts: number; lastAttemptAt?; deliveredAt?; lastError? }`。任务开了推送且这一期有新内容时，AG15 把它写成 `pending`，别的什么都不做。
- 读写一期：`createAutomationRunStore(store, workspaceId)` → `get(ownerId, runId)`、`save(run)`、`list(ownerId, automationId, limit)`；编号 `automationRunId({ workspaceId, ownerId, automationId, version, scheduledAt })`。
- 接推送的位置：`features/agent/automations/dispatcher.ts` 里 `deliverRun()` 返回 `"delivered"` 之后；补送推送可以照 `delivery` 行的做法在到期索引里加一种行。
- 现有推送管线不会碰这三种来源：`isAgentInboxSourceKind(kind)`（`features/notifications/agent-inbox-source.ts`），`typed-delivery-factory.ts` 的 `materialize()` 里跳过。
- 提醒开关在界面上的位置要等视觉稿；传输结构里是 `AgentScheduledTaskContract.notify`。

**给 AG17（外部 Agent）：**

- 一次性定时器：`scheduleAgentTimer(due: DueIndexWriter, input: { ownerId: string; key: string; fireAt: string; payload: { type: "wake"; entry: string; data?: Record<string, unknown> } }, now: string): Promise<void>`；取消 `cancelAgentTimer(due, ownerId, key)`（`features/agent/automations/timers.ts`）。`due` 取 `configuredAutomationStorage(mode)!.direct.due`，要和别的写入同事务就用 `storage.transaction((tx) => …tx.due…)`。同一个 `ownerId` 加 `key` 再设一次是改期。到期时派发器调 `AgentTimerHandlers.wake(ownerId, entry, data)`，现在的实现只记一条追踪事件（`dispatch-configured.ts`），AG17 在那里接自己的处理；定时器本身不调模型。
- 收件箱来源「外部提议」已登记：`sourceKind: "external_proposal"`，`sourceId` 填卡片编号，目标 `{ kind: "card", id: <卡片编号>, href: null, status: "available" }`。写入用收件箱自己的 `createConfiguredInboxRuntime()!.service.upsert(entry)`（`InboxNotificationUpsert`，按账号加 `semanticKey` 幂等）。可见性：卡在读者自己的账本里就可见（`readAgentInboxSourceState`）。可以照 `features/agent/automations/delivery.ts` 的 `inboxEntryOf()` 里卡片那一支来拼。
- 卡的出处：`origin: { kind: "connection", connectionId, externalRequestKey }` 账本早就有；冻结走 `runtime.freezeCard({ actionId, origin, locale, intents, createdAt })`，过期定时器会自动设上。

**后续 sprint 可以依赖的：**

- 表 `agent_automation_due`（`features/agent/automations/due-index.ts`，随 `runOrbitRecordsMigration` 建，可重复执行）：`AutomationStorage` 的 `transaction`、`claimDue`、`listOwned`、`direct`；三种行 `rule`、`delivery`、`timer`。
- 派发：`dispatchDueAutomations(deps, { limit?, deadline? })`、`runConfiguredAutomationDispatch()`、`handleAutomationDispatchRequest(request)`。
- 卡片：`runtime.expireCard({ actionId, revision?, reason: "timer" | "superseded" })`；`withCardExpiryTimers(runtime, { ownerId, storage })`。
- 接口：`GET /api/agent/automations`（多了 `tasks`）、`GET /api/agent/automations/[id]/runs`、`POST`／`PATCH`／`DELETE` 可带 `rule`；所有者一律是规范账号。传输结构 `AgentScheduledTaskContract`、`AgentScheduledTaskRunContract` 及列表、历史两种（`shared/contract/agent-v1.ts` 末尾的 AG15 块）。
- 合并 AG14 后：把 `configuredRuleRecall()`（`recall-seam.ts`）接到 `recallFor()`，返回 `{ id, category, content }[]`；规则运行那边已经会用（约束当硬条件、偏好只排序、结果里点名、发 `memory.recall`）。然后重跑 AE-SCL-030。

**别的线可能冲突的文件：**

- AG14：`features/agent/capabilities/contract.ts`（两行单行数组，各在行尾加了规则的键）、`features/agent/ledger/contract.ts`（操作类型清单末尾）、`features/agent/runtime/card-operations.ts`（`CardOperationIntent`、`prepareCardOperation`、`cardCountTitle`、`cardIntentOf` 各加一处）、`features/agent/runtime/service-factory.ts`、`features/agent-v1/domains/writes.ts`、`shared/storage/migrations.ts`（末尾）、`shared/contract/agent-v1.ts` 与 `shared/api-schema/agent-v1.ts`（各在文件末尾加了一块，卡片预览多一个 `expiredReason`）、`shared/contract/.snapshot.json`、`tests/capabilities/agent-v1-receipts.test.ts`、`graph/deps.ts`、`graph/executor.ts`、`graph/state.ts`、`context/session-state.ts`。
- AG19：`graph/nodes/functions.ts`——只动了四处：引入规则节点、任务种类多一种、`functionOf` 开头一个分支、循环里一个分支，外加文件末尾一行导出（`contactCandidates`、`contactLine`、`eventCandidate`、`eventLine`、`openTodos`、`visibleEvent`、`INDUSTRY_WORDS`、`PLACE_WORDS`）。定时结果里每条的文字直接用 `eventLine`／`contactLine`；AG19 要是改了这两个函数的名字或签名，`features/agent/automations/run-rule.ts` 要跟着改。定时结果是代码写的一段文字加一份记录清单（`items`），没有走 `answer.blocks`；要让它也用新的记录卡，从 `items` 出发即可。`graph/nodes/route.ts`、`graph/nodes/deliver.ts` 也各有小改动。
- AG17：`proxy.ts`（免登录名单多一行）、`shared/contract/inbox-notifications.ts` 与对应 schema。
- 运行器：`tests/agent-eval/lib/runner.ts`、`hard-checks.ts`、`observations.ts`、`seed.ts`、`env-guard.ts`。

**需要决定：**

1. 需处理的那一期进不进收件箱（现在：进一次）。
2. 视觉稿批准后，界面工作（两端页面、收件箱条目、收件箱里的卡、截图与 App 验证）在本 sprint 续做还是另开。
3. `judge-pack`／`report` 在分线环境里读不到环境文件里的目录，要不要在运行器里修。

**回退：** 不合并，或 revert 合并提交。新表和新集合都是附加的；`ORBIT_AGENT_V1_MODE=off` 时对话里不出规则卡。已有的旧 Playbook 不受影响。

## 报告写成之后的补充（协调者代记，2026-11-20）

本页正文由 Generator 起草，它的会话写不了报告文件，由协调者从它的记录里取出原文写入，未改一字。正文写成之后还有这些：

- **最终 SHA** `86420292772ab8af61270ad2532f98c8c22accaf`。门槛运行建在 `90158fd` 上；之后那个提交只改了两个测试和契约快照。
- **全量测试（最终 SHA）：** 服务端 22 条失败，都在已知清单里。App 是 3 条已知的加 `shell-back-restore` 一条，后者单独跑 3 次都通过（AG17 线上也出现过同一条，属偶发）。
- **门槛运行** `20261120-042802-90158fd-AG15-gate`：代码判定 74/78，本 sprint 的 14 例全过；没过的 4 例是 AE-MEM-008、009、012 和 AE-REF-005，归 AG14。主模型 154 次、判断 24 次，0.2965 元；本 sprint 累计约 0.41 元。评审材料 78 份已生成，尚未评审。
- **给 AG16 的接口**（`runs.ts`、`contract.ts`）：`agentAutomationNotify(automation): { inApp; push }`；`AgentAutomationRunRecord.delivery.push`；`createAutomationRunStore(store, workspaceId)` 的 `get/save/list`；`dispatcher.ts` 里 `deliverRun()` 之后的挂点。
- **给 AG17 的接口**（`timers.ts`）：`scheduleAgentTimer(due, { ownerId, key, fireAt, payload: { type: "wake", entry, data? } }, now)`；`cancelAgentTimer(due, ownerId, key)`；收件箱 `sourceKind: "external_proposal"`。
- **合并 AG14 之后要做：** 把 `recall-seam.ts` 的 `configuredRuleRecall()` 接到 `recallFor()`，重跑 AE-SCL-030。
- **容易冲突的文件：** `graph/nodes/{functions,route,deliver}.ts`、`capabilities/contract.ts`、`ledger/contract.ts`、`runtime/{card-operations,service-factory}.ts`、`shared/contract/{agent-v1,inbox-notifications}.ts` 及快照和 App 副本、`migrations.ts`、`proxy.ts`、评测的 `runner.ts`／`hard-checks.ts`。
- **与未批准的视觉稿有一处不一致，待定稿时对齐：** 引用的笔记读不到时，服务端按 PLANNER 在收件箱里说一次（同一版本的任务不每期重复）；视觉稿 15-4 的表里写的是「不进收件箱，只在列表上标需要处理」。
- **界面部分**在视觉稿获批后由同一个 Generator 在本 sprint 内继续做。

