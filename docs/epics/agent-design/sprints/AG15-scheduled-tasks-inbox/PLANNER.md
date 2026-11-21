# Sprint AG15 — 定时任务与站内收件箱

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R15（设计稿 §5.3 全文、§5.2 卡片过期一行、§10 我的定时任务与站内收件箱两行、附录 E 定时规则与站内收件箱两行）；AG-R02（卡片过期）；AG-R19（门槛用例）。
**单一目标:** 定时规则带上卡上分列的字段；一个可跨账号按到期时间查询的索引，加一个挂在维护队列上的派发器，按期领取、在规则所有者权限内只读运行；结果与待投递记录一起存进运行历史 `agentAutomationRuns`，有新内容才写站内收件箱（新增三种来源）；一次性定时器放在同一存储里，让卡到期失效；两端各有“我的定时任务”页。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad55f9dfd21793057f6b22c7727540fac1`，开工时改填实际 HEAD；前序 REPORT 只读 AG02、AG10 两份及本页引用到的 AG04、AG05、AG06、AG07、AG08、AG14 交接节。
**进入条件:**
1. AG02、AG10 已 completed 并合回 `orbit-agent-claude`（登记表依赖）。另需 AG14 completed：AE-SCL-030 要求规则运行时约束 LMM05 照样生效，靠 AG14 的 `recallFor()`；登记表没有列这条依赖，开工前由协调者确认。
2. 产品批准：“2026-11-15 已定的事项”里“定时任务：到点后约 10 分钟内运行；中断恢复只补最近一期”和“通知：结果一律进站内收件箱”，以及 §5.3。
3. 付费模型调用已允许，上限见费用一条。
4. 环境：AG00 的 `agent-eval:*` 命令与运行器的 `scheduler_tick`、固定时钟可用；本机库 `orbit_agent_eval`；`CRON_SECRET` 在本机设好（维护入口要它）；`ORBIT_AGENT_V1_MODE=on`、`ORBIT_AGENT_EVAL=1`。
5. 视觉稿：规则卡、两端“我的定时任务”列表与详情、收件箱里的三种新条目和收件箱里的卡，已按设计稿 §10“出稿方式”获用户批准。未批准时只做服务端，界面证据记 blocked。
6. 生产库建表、部署不在本 sprint 授权内。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `repos/orbits/features/agent/automations/contract.ts`：`AgentAutomation`（:79–103）；`delivery` 只有一个值 `"in_app" | "push"`（:9–12、:85），没有 `references, rankingBasis, maxItems, onEmpty, validUntil, notify`；`nextAgentAutomationRunAt`（:317–366）没有专门处理夏令时重复和跳过的本地时刻。
- `repos/orbits/features/agent/automations/service.ts`：分区 `${workspaceId}:agent-actor:${actorId}`（:32–38），所以 `claimDue`（:450–481）只能列一个账号的规则再在内存里筛；`serial()`（:243–257）只在进程内排队，不是数据库原子领取；`recordRun`（:592–596）按完成时刻直接算下一次，错过的期被悄悄丢掉、不记跳过数；只有 `lastRun`，没有历史；`requireAutomationCapability`（:58–74）只收只读能力。
- `repos/orbits/features/agent/automations/runner.ts`：`executeWithOrbitAgent`（:114–167）以会话编号 `automation:<id>` 跑产物任务，语言写死 `"zh"`，传进来的记忆被忽略（`_memory`）。
- `repos/orbits/features/agent/automations/service-factory.ts`：工作区取配置库（:49）。`repos/orbits/app/api/agent/automations/request.ts:179–181` 用 `session.user.id`，与对话入口的规范账号不同源。
- `repos/orbits/scripts/run-agent-worker.ts:39–44`：一个进程绑定 `ORBIT_AGENT_WORKER_ACTOR_ID` 一个账号；`repos/orbits/app/api/internal/agent/automations/route.ts:28` 要求请求头带 `x-orbit-actor-id`。
- `repos/orbits/features/operations/maintenance/configured-tasks.ts`：维护任务清单（:54–358），没有个人规则的跨账号派发；任务形状见 `pass.ts:21–24`。`heartbeat.ts:26` 默认间隔 600 秒，一个工作区一条链。`vercel.json:52–57` 只有每天 3 点的 `/api/internal/maintenance`，用来续上心跳链；10 分钟一次靠队列 `maintenance-heartbeat`（:33–41）。本机可经 `app/api/internal/maintenance/route.ts`（`CRON_SECRET`，`features/operations/maintenance/http.ts`）跑一次维护。
- `repos/orbits/shared/contract/inbox-notifications.ts`：`InboxSourceKind`（:5–9）和 `InboxNotificationTarget.kind`（:21）没有定时任务结果、待确认的卡、外部提议；写入校验在 `shared/api-schema/inbox-notifications.ts:20`。
- `repos/orbits/features/notifications/inbox-record-service.ts`：`createInboxRecordUpserter`（:53–74）按 `inboxNotificationId(actorId, semanticKey)`（:76–78）幂等，内容不变的重放不升版。`inbox-record-service-factory.ts:45` 起按来源种类核对可见性，`createConfiguredInboxRuntime()`（:140）。
- `repos/orbits/features/notifications/typed-delivery-factory.ts:15–35`：`materialize()` 会把每条未读、未处理的收件箱条目变成推送候选。新来源若不排除，就会被现有推送管线自动发出。
- `repos/orbits/features/agent/playbooks/compiler.ts`、`contract.ts:5–10`：自然语言转规则草案与可用能力编号。
- 收件箱界面：Web `app/(app)/app/inbox/typed-notifications-tab.tsx`、`notification-source-view-model.ts`，经 `app/(app)/app/orbit-2026/shell/inbox-bridge.tsx` 接入；App `repos/orbit-app/src/screens/inbox/NotificationInboxList.tsx`、`NotificationDetailScreen.tsx`、`useNotificationInbox.ts`。两端目前都没有定时任务页面。
- 用例与夹具：`docs/epics/agent-design/eval/cases/SCH.yaml`；`cases/SCL.yaml` 的 AE-SCL-029、030；`eval/world/base-v1.yaml:132–141`（RU1、RUB1）。
- 现有测试：`tests/capabilities/agent-automations.test.ts`、`agent-playbooks.test.ts`、`tests/services/maintenance-heartbeat.test.ts`、`configured-maintenance-reminder-wiring.test.ts`、`inbox-record-service.test.ts`、`tests/api/inbox-notifications-routes.test.ts`。

### 关键符号
本 worktree 没有 GitNexus 索引。Generator 先按根目录 `CLAUDE.md` 建索引，再对下列每个要改的符号做 upstream impact，HIGH/CRITICAL 先报告；建不起来就用文本搜索补查并在 REPORT 写明（CONVENTIONS §5）。引用数是编制时在 `repos/orbits` 的 `app features shared scripts tests` 下 `grep -rlw` 得到的文件数，含定义文件。
- `export function createStorageAgentAutomationService({` … `}: StorageAgentAutomationServiceOptions): AgentAutomationService {`（service.ts:234–241）：4 个文件，测试 2 个。
- `export function createAgentAutomationService({` … `}: CreateAgentAutomationServiceOptions): AgentAutomationService {`（service-factory.ts:28–32）：5 个文件。
- `export async function runDueAgentAutomations(`（runner.ts:193）：3 个文件。`export function nextAgentAutomationRunAt(`（contract.ts:317）：3 个文件，测试 1 个。
- `export function createConfiguredMaintenanceTasks({`（configured-tasks.ts:54）：8 个文件，测试 2 个。`export async function processMaintenanceHeartbeat(message: MaintenanceHeartbeatMessage, {`（heartbeat.ts:223）：4 个文件，只调用不改。
- `export function createInboxRecordUpserter(input:{transaction:InboxRecordRepository['transaction'];now:()=>string}) {`（inbox-record-service.ts:53）：6 个文件。`export function createConfiguredInboxRuntime() {`（inbox-record-service-factory.ts:140）：10 个文件。
- `export type InboxSourceKind = ...`（shared/contract/inbox-notifications.ts:5）：3 个文件，改它要同步 App。
- `export function createTypedDeliveryRuntime(input:{actorId:string;client:TransactionalPostgresClient;workspaceId:string;now?:()=>string;devices?:PushDeviceService;push?:OrbitPushAdapter|null}) {`（typed-delivery-factory.ts:12）：7 个文件，测试 5 个；只加对新来源的排除。

### 前序交接要点
以下名字取自 CONVENTIONS §4，是约定。开工时逐条对照前序 REPORT，不一致就按 REPORT 更正本节并留追加记录，原文和原哈希保留。
- AG00：`emitTrace()`；运行器的 `scheduler_tick` 与固定时钟；`notify.inbox` 事件。
- AG02：账本的 `origin`（规则运行：规则编号＋触发时刻）、`revision`、`expiresAt`、状态 `expired`、`decideAction()`；过期卡被拒的原因 `CARD_EXPIRED`；重新生成出新版本。
- AG04：`decideNextStep()`；建规则缺排序依据时先问一轮（AE-SCH-003）。
- AG05：`references/authorize.ts` 与 `domains/registry.ts` 的 `read`；每期按最新可见版本重读引用。
- AG06：`freezeCard()`、执行器登记，`todo.update` 的 `prepare` 与 `applyApproved`（AE-SCH-012 的卡）。
- AG07：确认卡组件，收件箱里用同一个。
- AG08：`funnel()` 与 `askJudgment()`；定时任务每期送去判断的候选不超过 30 个（AE-SCL-030）。
- AG10：`rankCandidates()`；每期运行用对话里同一个函数（§3.5）。
- AG14：`recallFor()` 可在无会话时按规则所有者调用，约束类每次加载。

### 易错边界（都对应到下方验收项）
1. **不点不启用**（AG15-1，AE-SCH-001）：规则卡点击前零写入，到点也不跑；卡上分列检查时间（写“每周五 9:00 之后约 10 分钟内”，不承诺整点）、候选范围、排序依据、条数、有效期、提醒方式，并写出下次预计运行日；缺排序依据先问一轮（AE-SCH-003）。规则存的是能力与参数，不存当时读到的笔记内容。
2. **一个派发器、按账号隔离**（AG15-2）：在 `createConfiguredMaintenanceTasks` 里加一个任务，按到期索引分页、数据库原子领取（例如 `FOR UPDATE SKIP LOCKED`）；不按账号起进程，也不要求请求头带账号。旧的按账号领取（`claimDue`、工作进程、内部接口）要么改走同一索引，要么停用，二者不能领同一期，REPORT 写明选哪种。每期在规则所有者权限内读，甲只读 M36，乙读不到甲（AE-SCH-004）。规则的所有者用规范账号，`automations/request.ts` 改走规范身份；本机库旧分区里的规则数写进 REPORT，不自动并入。
3. **同一期只算一次**（AG15-2）：唯一键“工作区＋所有者＋规则编号＋版本＋计划触发时刻”，有限重试沿用同一键；规则与到期索引同一事务更新；重新确认改期作废旧版没跑的触发；按 IANA 时区算下一次，夏令时重复的本地时刻只跑一次、跳过的顺延（东京没有夏令时，单测用别的时区）。
4. **结果与待投递一起存**（AG15-2、AG15-4）：运行历史是单独的集合 `agentAutomationRuns`，记规则编号与版本、计划触发时刻、结果（无匹配、已送达、已算出未送出、失败、需处理）、结果引用、跳过期数；投递失败只重送通知，不再读资料、不再调模型（AE-SCH-005）；投递前重查规则状态、所有者和引用权限，暂停后不再送，这一期记为已算出未送出（AE-SCH-008）。
5. **不打扰**（AG15-3）：无新内容只记历史，不进收件箱（AE-SCH-007 第三期、AE-SCL-029 第二期）；告知过的同一条不再告知，依据规则版本、触发时刻、记录编号（AE-SCH-006）；收件箱写入的 `semanticKey` 由这三样拼出，重放不出第二条。
6. **新来源不推送**（AG15-3）：新三种来源的收件箱条目不能被 `materialize()` 变成推送候选；`notify.push` 只存不发，留给 AG16。本区用例 `push` 一律 0。
7. **补期**（AG15-4，AE-SCH-009）：中断恢复只补最近一期，历史里写跳过期数；要改掉 `recordRun` 按完成时刻丢期的做法。
8. **引用读不到**（AG15-2，AE-SCH-010）：这一期标为需处理，不改用别的笔记或记忆顶替排序依据。
9. **一次性定时器**（AG15-5）：与重复规则同一存储，字段相同、没有重复规则、触发一次即完成；到期只写一条入口记录，本身不调模型。用途二：卡片到期标为过期（对话卡 7 天；定时任务卡 7 天，或被下一期新卡取代，以先到为准），点过期卡零写入并返回 `CARD_EXPIRED`，重新生成后仍要再点（AE-SCH-011）；待续项满 7 天无人带回时关闭并在会话里留一行，不另发通知（§5.3）。
10. **收件箱里的卡**（AG15-5，AE-SCH-012）：定时任务产生的卡不挂在任何对话下，出处写规则编号和触发时刻；在收件箱点确认走同一个决定接口，只执行一次。

## 范围与文件

- 读取：上下文包所列；前序 REPORT 只读交接节。
- 修改：
  - `repos/orbits/features/agent/automations/contract.ts`、`service.ts`、`runner.ts`、`service-factory.ts`：新字段；旧 `delivery` 读成 `notify`；写规则时同事务更新索引；单期执行改为读引用、召回、`rankCandidates()`、写运行记录与待投递。
  - `repos/orbits/features/agent/playbooks/compiler.ts`：草案带新字段。
  - `repos/orbits/app/api/agent/automations/`（`request.ts`、`route.ts`、`[id]/route.ts`、`[id]/run/route.ts`）：规范身份；表单建规则、暂停、恢复、删除、看历史。
  - `repos/orbits/features/operations/maintenance/configured-tasks.ts`：加派发任务。`vercel.json` 不改。
  - `repos/orbits/shared/contract/inbox-notifications.ts`、`shared/api-schema/inbox-notifications.ts`：三种新来源（定时任务结果、待确认的卡、外部提议），目标种类加卡片和定时任务。外部提议这一种只登记种类，写入在 AG17。
  - `repos/orbits/features/notifications/inbox-record-service-factory.ts`（新来源的可见性核对）、`typed-delivery-factory.ts` 或 `typed-delivery-source.ts`（新来源不推送）。
  - 收件箱界面：Web `app/(app)/app/inbox/typed-notifications-tab.tsx`、`notification-source-view-model.ts`；App `repos/orbit-app/src/screens/inbox/` 下相应文件。
  - `scripts/run-agent-worker.ts`、`app/api/internal/agent/automations/route.ts`：按易错边界 2 改走索引或停用。
- 新建：
  - `repos/orbits/features/agent/automations/due-index.ts`（跨账号到期索引表与原子领取，表结构按现有 `*_SCHEMA_SQL` 的 `create table if not exists` 写法）、`dispatcher.ts`（维护任务）、`runs.ts`（`agentAutomationRuns`）、`timers.ts`（一次性定时器）、`delivery.ts`（待投递与重送）。
  - `repos/orbits/features/agent-v1/domains/rule/`：`rule.create`、`rule.update`、`rule.pause` 及恢复、删除的 `prepare` 与 `applyApproved`。
  - `repos/orbits/shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`：追加规则与运行历史的传输结构。
  - “我的定时任务”页：位置以获批视觉稿为准；建议 Web 放 `app/(app)/app/orbit-2026/account/` 下并在 `shell/shell-routes.ts` 的 `shellFrameFor` 加框架，App 放 `repos/orbit-app/src/screens/me/` 下。
  - 测试：`tests/capabilities/agent-automation-due-index.test.ts`、`agent-automation-runs.test.ts`、`agent-automation-timers.test.ts`、`tests/services/agent-automation-dispatch-postgres.test.ts`、`tests/api/agent-automations-routes.test.ts`；App 端在 `repos/orbit-app/tests/` 加定时任务页与收件箱新来源的测试。
- 排除：推送提醒（AG16）；外部提议写进收件箱（AG17）；定点延时唤醒（设计稿留到以后）；信号触发的规则保持原样；生产库建表与部署。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG15-1 | 规则卡上分开列出检查时间、候选范围、排序依据、条数、有效期和提醒方式，点击后才启用。 | `domains/rule` 适配器测试：确认前零写入、到点不跑；门槛 AE-SCH-001、002、003，AE-SCL-030（较大账号，范围与依据写在规则上）；规则卡与“我的定时任务”页的“约 10 分钟内”说法截图 |
| AG15-2 | 两个账号设同一时刻，各自只读自己的资料；本期各只有一份结果。 | `agent-automation-due-index.test.ts`：跨账号领取、并发两次领取只一份、唯一键重试；`agent-automation-dispatch-postgres.test.ts`：真库原子领取、规则与索引同事务；AE-SCH-004（不变量）、005、010 |
| AG15-3 | 没有新内容的那一期不进收件箱、不提醒；同一条内容不重复告知。 | `agent-automation-runs.test.ts`：无匹配只记历史、同一记录不重复写收件箱、新来源不进推送候选；AE-SCH-006、007，AE-SCL-029（常规账号） |
| AG15-4 | 暂停后还没投递的不再送出；中断恢复只补最近一期并标出跳过的期数。 | `agent-automation-runs.test.ts`：暂停后投递前重查、补期只补最近一期并记跳过数、夏令时两种情形；AE-SCH-008、009 |
| AG15-5 | 一次性定时器让到期的卡失效；定时任务产生的卡能在收件箱里确认。 | `agent-automation-timers.test.ts`：7 天到期、被下一期取代、定时器不调模型；AE-SCH-011、012；Web 收件箱与“我的定时任务”页 1440/375 截图并按 `docs/development/web-no-flash-and-cache-rules.md` 核对不闪动；App 连同一本机服务在收件箱里确认同一张卡 |

## 一次 Generator 的执行顺序

1. 复核进入条件；登记 run-01、本页 SHA256 和基线 HEAD；记下门槛用例与夹具的校验值；动手前在基线上跑一次 `npm test` 存失败清单；建 GitNexus 索引；按前序 REPORT 校正上下文包；确认运行器已实现 `scheduler_tick`、`rule_runs`、`rule_state`，缺的按 eval README §3.4 的含义在 `repos/orbits/tests/agent-eval/` 补上，不改用例。
2. 对关键符号做 impact；先写失败测试：跨账号到期领取与唯一键、补期、暂停后不送、投递重试不重算、新来源不推送。
3. 存储与派发：规则新字段、到期索引、运行历史、一次性定时器、待投递；派发器接进维护任务清单；旧按账号领取改走索引或停用。
4. 对话与收件箱：`domains/rule` 适配器与执行器登记；规则卡字段；收件箱三种来源和收件箱里的卡；卡片过期与取代。
5. 界面（视觉稿批准后）：两端“我的定时任务”页、收件箱新条目；`shared/` 改动的同一提交里跑 App 同步；浏览器 1440/375；App 按 App 规则 5.4 连同一套本机服务验证。
6. 门槛运行与双评；收口全量对照；路径限定提交；写 REPORT；交接分支与最终 SHA，由协调者合回 `orbit-agent-claude`。

## 最小测试与检查

- **档位：H。** 跨账号派发、幂等领取、新表、共享契约、收件箱写入、付费模型调用，都属 RULES 5.1 的 H。
- **开发定向集**（cwd `repos/orbits`）：上面新建的五个测试文件；`tests/capabilities/agent-automations.test.ts` 与 `agent-playbooks.test.ts` 改成新字段与新领取方式下的断言。数据库测试读 `ORBIT_EVENT_DATABASE_URL`，必须指本机测试库，先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 证明没有被 skip。
- **操作链收口集**：上述文件完整跑；`tests/services/maintenance-heartbeat.test.ts`、`maintenance-heartbeat-deployment.test.ts`、`configured-maintenance-reminder-wiring.test.ts`（维护任务清单的消费者）；`tests/services/inbox-record-service.test.ts`、`tests/api/inbox-notifications-routes.test.ts`、`tests/contracts/tolerant-reading.test.ts`、`tests/performance/inbox-bounded-read.test.ts`（收件箱契约的消费者）；`tests/services/typed-notification-source-postgres.test.ts`、`historical-inbox-delivery-postgres.test.ts`（推送候选的消费者）；`npx tsc --noEmit -p .`。
- **契约同步**：改 `shared/contract/inbox-notifications.ts`、`shared/api-schema/inbox-notifications.ts`、`shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts` 的同一提交里，在 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`。App 界面也改了，另跑 App 的 `npm run typecheck` 和 `tests/inbox-notification-state.test.ts`、`inbox-notification-tolerance.test.ts`、`inbox-unified-feed.test.ts` 及新加测试的完整文件。
- **门槛**：`npm run agent-eval:run -- --gate AG15`，含 SCH 区 12 例（AE-SCH-001～012）、分给 AG15 的 AE-SCL-029（常规账号）与 AE-SCL-030（较大账号）、不变量包（本区的 AE-SCH-004 在内）。三个账号都有用例。`scheduler_tick` 由运行器触发派发，不依赖托管定时器（eval README §10）。
- **评审**：`npm run agent-eval:judge-pack -- --run <运行编号>` 出材料，门槛里每例由两个互不相见的 Claude 新会话各评一次，不一致的做第三次并进人工复核清单；`npm run agent-eval:report -- --run <运行编号>` 汇总并登记 `eval/RUNS.md`。失败修复后整套门槛重跑，最多两轮。
- **全量对照**：H 档收口跑一次 `npm test`，与第 1 步的基线失败清单 `comm -13` 比较，只查新增项；不 source `.env` 系列文件；不用裸 `git stash`。
- **费用**：真实模型调用每次完整运行 30 元以内，本 sprint 累计 150 元以内，超出先停下报告；次数、token、金额和 DeepSeek 余额差记进 `costs.json` 与 REPORT。
- **证据**：截图与命令输出放 `~/orbit-sprint-evidence/agent-design/sprint-AG15/run-01/`；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：封存集（只在 AG18）；`--all`；托管队列上的真实心跳链（本机由运行器触发）；推送服务（AG16）；Lighthouse、axe 等验收项没要求的检查。

## 失败与交接

外部条件缺失（前序未完成、视觉稿未批准、密钥缺失）先不启动，或只做不受影响的部分并把受影响的证据记 blocked；run 已开始则按规则产出 failed 或 blocked 报告，不开第二次 Generator。
报告包含：验收项与证据的对应、功能 SHA、命令与退出码、门槛运行编号与 `RUNS.md` 一行、双评不一致清单、旧按账号领取路径的处理、本机库旧分区规则数、费用、未提交与失败项、下一步。给 AG16 的交接写明规则的 `notify` 字段、运行记录与待投递记录的结构、“我的定时任务”页里提醒开关的位置。
分支：从 `orbit-agent-claude` 建 `sprint/AG15-scheduled-tasks-inbox`；只暂存本 sprint 的文件，禁止 `git add .`；提交前跑 `node .gitnexus/run.cjs detect-changes --scope staged --repo .`，`partial` 或 `truncated` 要重跑。由协调者 `git merge --no-ff` 合回 `orbit-agent-claude`，在合并树跑收口集与 typecheck 后才登记 completed。push 需要用户授权。

## 进入条件核对（2026-11-19，协调者核对，Generator 启动时追加；以上原文未改）

本页启动时的 SHA-256：`3df3967767d8f5aca26f3e8153e36e91dcb3b8ceeb4efc0cdd1a5dd2eb0d4736`。基线 HEAD：`98869bb4c36cc05ef30f034e6260091b028783e0`（`agent-v1-integration`，本页写的 `orbit-agent-claude` 读作它）。run-01。

| 进入条件 | 核对结果 |
| --- | --- |
| 1. AG02、AG10 已合并 | 已合并；AG03～AG13 也都已合并进 `agent-v1-integration` @ `98869bb4c`。 |
| 1. AG14 completed | **没有满足，按协调者安排并行开发。** AG14 与本 sprint 同时进行。本 sprint 只在一处用到它：规则运行时照样生效的约束（AE-SCL-030 的 LMM05），经 `recallFor()`。做法：对着一个小接缝写（`features/agent/automations/recall-seam.ts`），本分支上接缝不返回任何记忆；协调者合并 AG14 后把它接上，再重跑 AE-SCL-030。这一例在本分支上可以是红的，不在本 sprint 修。 |
| 2. 产品批准 | 沿用“2026-11-15 已定的事项”与设计稿 §5.3。 |
| 3. 付费模型调用 | 已允许；每次完整门槛运行 30 元、本 sprint 累计 150 元以内。 |
| 4. 环境 | 本条线有自己的评测环境：库 `orbit_agent_eval_ag15`、端口 3170 起、目录 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag15`。`CRON_SECRET` 不在环境文件里，改由评测环境自己派生（见 REPORT）。 |
| 5. 视觉稿 | **还没有批准**（另有 agent 在画）。先做不依赖它的部分：规则字段、规则卡的内容与执行器、跨账号派发、运行历史、投递与补送、一次性定时器、收件箱条目的数据与接口、运行器的词和测试。规则卡在对话里沿用现有确认卡组件。两端「我的定时任务」页面和收件箱新条目的样式等批准后再做；界面证据在此之前记 blocked。 |
| 6. 生产库、部署 | 不在授权内，没有做。 |

门槛用例与夹具在启动时的校验值（SHA-256）：`cases/SCH.yaml` `244cfc09…fefcf1`、`cases/SCL.yaml` `0b490714…aeb9c8`、`world/base-v1.yaml` `4cbed9e5…12819e`、`world/regular-v1.yaml` `10438580…268975`、`world/large-v1.yaml` `216a69e4…8d6ec5`（完整值见 REPORT）。

后续 sprint 对本 sprint 的要求（协调者转述）：AG16 要按任务发推送，需要“投递状态与运行完成时间分开记”；AG17 要用一次性定时器和收件箱来源「外部提议」，合并后接本 sprint 的接口。两者要调用的函数名与签名写在 REPORT 的交接节。
