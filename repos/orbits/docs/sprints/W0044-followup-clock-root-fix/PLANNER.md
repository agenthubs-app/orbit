# Sprint W0044 — 跟进与提醒按「现在」算到期，逾期说逾期

> revision 4：按 D46 修订（①⑦）：`shared/contract/followups.ts` 注释改动（及可能抽到 `shared/` 的东京日纯函数）在同一提交内执行 App 机械同步脚本 `npm run sync:contract`（只复制、不改 App 逻辑）并跑 App 四个 *-sync 测试为绿；基线行号以开工时 HEAD 为准、按符号重定位。
>
> revision 3：按 REVIEW-2026-10-02-network 裁决修订（R-16）：验收契约改为「操作链 + 主证据」，其余断言移入必需证据子表；SC 数与通过条件不变。
>
> revision 2：按 D44 定稿待定项、W0048 拆分、配额两池（2026-10-02）。本 Sprint 不涉及 W0048 与 AI 配额，只定稿待定项。

**Plan revision:** 4。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RN-02（REQUIREMENTS「大目标 4」）。**单一目标:** 跟进生成链路与提醒链路的「现在」改为显式注入的请求时刻，到期天数按东京日历日、可为负；逾期在展示层说「已逾期 N 天」。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（编制时 `a48e1749`，下文行号以它为准，开工按符号重新定位）。记忆 `orbit-followup-queue-clock-bug`（2026-08-25）是本 Sprint 的来源。 **行号以开工时 HEAD 为准，按符号重定位（D46⑦）。**
**进入条件:**
- 无前序依赖（登记表）；W44-1～W44-3 已定（D44，见文末）。
- 不需要云端授权、不调用付费 AI、不做迁移；数据库测试按 RULES 6 用本机测试库。

## 已查清的事实（按 `a48e1749`）

1. **错误的「现在」只有两个出处。**`features/followups/storage/followup-live-record-provider.ts:264 latestTimestamp(records)`，在第 341 行赋给 `graph.generatedAt`（本人 task／contact／connection／evidence 记录里最新的 `updatedAt`）；`features/notifications/storage/reminder-notification-live-record-provider.ts:417` 同法（多了 notification 记录）。
2. **吃这个「现在」的地方：**
   - `features/followups/live-service.ts:103` `toTask`：`followupDaysUntil(task.dueAt, graph.generatedAt)` → `priority: followupPriorityFor(dueInDays)`；第 255 行 trigger `occurredAt`、第 340 行 provenance `collectedAt`、第 425 行 failure 场景都用 `graph.generatedAt`。
   - `features/followups/task-generation-projection.ts:120` `followupDaysUntil`：`Math.max(0, Math.ceil((due − base) / 86_400_000))`，无 `dueAt` 返回 7；第 138 行 `followupPriorityFor`：`≤1 today`、`≤7 this_week`、其余 `nurture`。
   - `features/followups/followup-task-generation-mock/hybrid-service.ts:106` 同样调用，参照是本地夹具库的 `state.generatedAt`（夹具时钟，hybrid 模式专用）。
   - `features/notifications/live-service.ts:173` 私有 `daysUntil`（同样夹 0）→ 第 184 行 `priorityFor`（`≤2 high`、`≤7 normal`、其余 `low`）、第 196 行 `frequencyFor`；第 231 行 `toReminder` 使用；第 462、557 行 provenance。
   - 展示层缓解 `features/orbit-ai/followup-review-artifact-service.ts:164 overdueDaysFor(dueAt, reference)` 与第 175 行 `dueLabelFor`、第 373 行 `itemFor`（`reference = data.generatedAt = provenance.collectedAt`），注释（第 160–163、377–379 行）明确写着「逾期天数本身仍错」。
3. **其他读同一张图的地方不用 `generatedAt`：**`features/agent/signals/source-collector.ts:98` 已注入 `now`（`followup_due` 信号正确）；`app/(app)/app/agent/home-facts-route-service.ts:561–583` 首页 facts 以快照时刻判 `overdue`；`features/connections/lifecycle/task-list.ts`、`app/(app)/app/tasks/relationship-lifecycle-tasks.ts` 只读图不读 `generatedAt`。它们**不改**，只是 provider 的消费者（见 impact）。
4. **跨端契约。**`shared/contract/followups.ts:13` `FollowupPriorityCode = "today" | "this_week" | "nurture"`，第 63 行 `dueInDays: number`；App 端镜像 `repos/orbit-app/src/api/contract/followups.ts:63`。App `src/view-models/schedule.ts:144–163 dueLabel` **先用 `dueAt`**，只有无 `dueAt` 才读 `dueInDays`（派生建议，恒为正桶值）；第 234–247 行 `shouldNormalizeTaskToToday` 对 `priority === "today"` 且 `dueAt < now` 的任务显示「今天」——这是 App 自己的展示，本 Sprint 不改 App（只登记观察项）。所以**不新增 priority 枚举值**，逾期任务的 `priority` 仍是 `"today"`。
5. `app/api/tasks/generate/suggestion-handler.ts:43 dueAt(task, now)` 在没有 `dueAt` 时用 `now + dueInDays` 反推截止时间，派生建议不受影响。`features/orbit-ai/todo-summary-service.ts:413–419 followupTaskConversationRecord` 用 `addDays(now, task.dueInDays)` 推截止时间（不读 `task.dueAt`）；改后负数推出过去的日期，语义正确（逾期），开工时用一条测试确认待办排序不反转。
6. 东京日历日：仓库已有 `features/plans/week.ts:23 planTokyoDate(at: Date): string`（`YYYY-MM-DD`）与 `home-facts-route-service.ts` 的 `productDateForInstant`。跟进模块不宜反向依赖 plans；Generator 可在 `features/followups/` 内写一个同法的小函数，或抽到 `shared/` 的纯函数（新文件需在 REPORT 登记）。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/followups/task-generation-projection.ts`（第 120–152 行）：两处要改的纯函数。
- `features/followups/live-service.ts`（529 行）：`LiveFollowupTaskGenerationServiceOptions`（第 44 行）、`toTask`（93）、`relationshipSuggestions`（169）、`toTrigger`（246）、`compareTasks`（271）、`payloadFor`（317）、`scenarioResult`（389）、`createLiveFollowupTaskGenerationService`（467）。
- `features/followups/storage/followup-live-record-provider.ts`：`LiveFollowupGraph`（第 26 行）、`latestTimestamp`（264）、`createStorageFollowupTaskProvider`（275）。
- `features/followups/service-factory.ts:21–31`：live 实现的组装处（注入默认时钟）。
- `features/notifications/live-service.ts`：`daysUntil`／`priorityFor`／`frequencyFor`／`toReminder`（173–250）、`createLiveReminderScheduleNotificationService`（598）；`features/notifications/service-factory.ts:14`。
- `features/notifications/storage/reminder-notification-live-record-provider.ts:417`。
- `features/orbit-ai/followup-review-artifact-service.ts:134–200、370–420`：缓解代码与注释，修根因后改为直接用领域值。
- 测试：`tests/capabilities/followup-task-generation-live-store.test.ts`、`tests/capabilities/reminder-schedule-notification-live-store.test.ts`、`tests/capabilities/orbit-ai-artifact-task-mock.test.ts`、`tests/services/followup-owner-boundary.test.ts`。

### 关键符号（原样）与 impact
- `export function followupDaysUntil(dueAt: string | undefined, generatedAt: string): number` — LOW，直接 2（两个 `toTask`），共 10。
- `export function followupPriorityFor(dueInDays: number): FollowupTaskPriority` — LOW，直接 3，共 11。
- `export function createLiveFollowupTaskGenerationService({ provider = null }: LiveFollowupTaskGenerationServiceOptions = {}): FollowupTaskGenerationService` — LOW，直接 1（`service-factory.ts` live）。
- `export function createStorageFollowupTaskProvider({ source, sourceLabel, store, workspaceId, scopeRecordReader }: StorageFollowupTaskProviderOptions): LiveFollowupTaskProvider` — **CRITICAL**（1 个流程：`POST → … ServiceForActor`，即 `/api/agent/signals`）。调用链经 `createConfiguredStorageFollowupTaskProvider` 到 signals service、首页 facts、关系生命周期任务页、`/api/relationship-tasks`、`scripts/run-agent-worker.ts`。**这些消费者都不读 `generatedAt`（事实 3），所以本 Sprint 不改 `readFollowupGraph` 的签名与读取行为，只改 `generatedAt` 的赋值或不再使用它**；开工先报告此 CRITICAL。
- `function toReminder(notification, graph): ScheduledReminder`（notifications）— LOW，直接 1；`priorityFor` 有 6 个同名符号（ambiguous），以文件内文本搜索为准：只在 `features/notifications/live-service.ts` 内 2 处调用。`createLiveReminderScheduleNotificationService` — LOW，直接 1。
- `function overdueDaysFor(dueAt: string, reference: string): number` — LOW，直接 1（`itemFor`）。
- `latestTimestamp` — GitNexus `UNKNOWN`（多文件同名私有函数）；文本搜索：followups provider 内 1 处调用、notifications provider 内 1 处，各自私有。

### 易错边界（都有对应 SC）
- 「现在」只能来自注入的时钟（默认 `() => new Date()`，在**每次请求**时取一次），不得再从任何记录时间戳推出；同一请求内所有任务共用同一个 now（SC-01）。
- 去掉 `Math.max(0, …)`，逾期为负；但**不新增 priority 枚举**，`dueInDays ≤ 1`（含负数）仍是 `"today"`；排序 `compareTasks` 升序天然把逾期排在最前（SC-02）。
- 天数按东京日历日差，不按毫秒向上取整：截止今天 20:00、现在 09:00 是 0（今天），不是 1（明天）；截止昨天 23:00、现在今天 09:00 是 −1（SC-02，W44-2）。
- 没有 `dueAt` 的派生建议（`relationshipDueInDays` 的 1／3／7／14／30）和无 `dueAt` 时返回 7 的兜底**行为不变**；展示层对它们仍不给绝对日期。
- hybrid 模式保持夹具时钟（`state.generatedAt`），只接受「可为负」这一处语义变化；不要把真实时钟引进夹具演示（W44-3）。
- 展示层不再自己算逾期：「已逾期 N 天」由领域 `dueInDays < 0` 推出，N = `−dueInDays`；逾期任务的到期行与优先级 chip 都不出现「今天／Today」（SC-03）。

## 范围与文件

- 修改：`features/followups/task-generation-projection.ts`、`features/followups/live-service.ts`、`features/followups/service-factory.ts`、`features/followups/storage/followup-live-record-provider.ts`（仅 `generatedAt` 赋值；若改为删除字段，需证明 hybrid 与所有消费者编译通过）、`features/followups/followup-task-generation-mock/hybrid-service.ts`（若签名变）、`features/notifications/live-service.ts`、`features/notifications/service-factory.ts`、`features/notifications/storage/reminder-notification-live-record-provider.ts`、`features/orbit-ai/followup-review-artifact-service.ts`、`shared/contract/followups.ts`（只改注释：`dueInDays` 可为负、`dueAt` 存在时以它为准）。
- 测试：上列四个测试文件；必要时新建 `tests/capabilities/followup-clock.test.ts`。
- 同步副本（D46①）：`shared/contract/followups.ts` 改注释也会让 App 副本逐字比对失败，所以同一提交内执行 `npm run sync:contract`，`repos/orbit-app/src/api/contract/followups.ts` 随之逐字更新（若按事实 6 把东京日函数抽到 `shared/`，放进同步范围时同样随同步更新，且只能 `./` 互引）。
- 排除：App 端（`repos/orbit-app`）逻辑与界面不改（同步副本除外）；`features/agent/signals/**`、首页 facts、关系生命周期任务页不改；不新增 priority／frequency 枚举值；不改 `/api/tasks` 的请求参数；不碰 W0036 首页今日要事的排序（它已不读到期字段）。

## 验收契约（五项；revision 3 起每项 = 一条操作链 + 一个主证据，其余断言见「必需证据子表」，R-16）

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0044-01 | **「现在」显式注入。**同一注入时刻下，两份只在记录 `updatedAt` 上不同的图得到逐字段相同的 tasks 与 reminders | 跟进与提醒两个服务的「同输入不同 `updatedAt` 输出相等」测试（memory store 夹具） |
| SC-W0044-02 | **逾期为负、东京日历日。**截止 7/29 10:00 JST、now 8/25 09:00 JST 时 `followupDaysUntil` 与提醒 `daysUntil` 都返回 −27 | 纯函数表驱动测试 |
| SC-W0044-03 | **展示层说逾期，不说今天。**一条已逾期的跟进任务进入复核产物，到期行显示「已逾期 N 天 · <绝对日期>」、优先级 chip「已逾期」 | `tests/capabilities/orbit-ai-artifact-task-mock.test.ts`（或新增用例） |
| SC-W0044-04 | **消费者无回归、契约只放宽。**`/api/tasks` GET 响应结构不变，只有 `dueInDays` 可为负 | 收口集命令输出与退出码 |
| SC-W0044-05 | **H 档收口。**以签名 cookie 登录有过期任务的测试账号，看 `/api/tasks` 响应与首页跟进区域 | `/api/tasks` 响应 JSON + 1440／375 截图（`~/orbit-sprint-evidence/web/sprint-W0044/run-01/`） |

### 必需证据子表（每条子断言独立留证，缺一即该 SC 不通过）

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01 | `createLiveFollowupTaskGenerationService` 与 `createLiveReminderScheduleNotificationService` 接受 `now?: () => Date`（默认真实时钟），每次 `listTasks`／`generateTasks`／提醒列表调用只取一次；provenance `collectedAt` 等于这个 now | 服务测试 |
| 01 | 注入时刻推后 1 天，所有带 `dueAt` 的任务 `dueInDays` 恰好减 1 | 服务测试 |
| 02 | 截止今天 20:00、now 今天 09:00 → 0；截止昨天 23:00、now 今天 09:00 → −1；无 `dueAt`／非法时间行为同改前 | 纯函数测试 |
| 02 | `followupPriorityFor(−27) === "today"`；提醒 `priorityFor(−3) === "high"`、`frequencyFor(−3) === "once"` | 纯函数测试 |
| 02 | `compareTasks` 把逾期排在今天之前 | 服务级排序断言 |
| 03 | 英文 `Overdue by N day(s) · …`；`overdueDaysFor` 删除或改为读领域值；`dueInDays === 0` 且未过期显示「今天」；无 `dueAt` 的派生任务仍无绝对日期；改前「被夹成 0 的逾期任务」用例改为新断言（不保留两套） | 同上测试文件 |
| 04 | `FollowupPriorityCode` 与提醒 `ReminderPriority`／`ReminderFrequency` 枚举不变；signals、首页 facts、关系生命周期任务页相关测试通过 | 收口集 |
| 04 | `npx tsc --noEmit -p .` 与 `npm run lint` 通过；REPORT 列 App 端观察项（事实 4） | 命令输出、REPORT |
| 05 | 控制台无新错误；不为截图触发付费 AI 对话 | 控制台日志 |
| 05 | 全量 `npm test` 按 RULES 5.2 对照基线新增失败 0；一次 Codex 代码 review，意见交回本 Generator | 基线／新增失败清单、review 处理（REPORT） |
| 05 | **D46①**：同一提交含 `npm run sync:contract` 写出的 App 副本，App 端 `contract-sync`／`api-schema-sync`／`compute-sync`／`domain-sync` 四个测试全绿；`repos/orbit-app` 除 `src/api/{contract,schema,compute,domain}` 外无改动 | 同步命令输出、App *-sync 测试输出、`git diff --stat` |

## 一次 Generator 的执行顺序

1. 复核进入条件，记录基线 SHA、Planner SHA256；`git status --short` 确认 RULES §4 所列用户未提交文件不动。
2. 对上表符号跑 impact，报告 `createStorageFollowupTaskProvider` CRITICAL 与 `latestTimestamp`／`priorityFor` 的文本补查结果。
3. RED：先写 SC-01／02 的纯函数与服务级失败测试，再写 SC-03 的展示断言。
4. 最小实现：注入时钟 → 改纯函数 → 改两条服务 → 删展示层自算逾期；注释同步（`shared/contract/followups.ts`、artifact service 第 160–163、377–379 行旧注释删掉或改写）。
5. 定向集 → 收口集 → 浏览器 → 全量对照 → Codex review → 有限修复 → 在 `repos/orbit-app` 执行 `npm run sync:contract` 并跑 App 四个 *-sync 测试为绿（D46①）→ 路径限定提交（含同步副本）→ REPORT → 交接。

## 最小测试与检查

- **档位 H**：共享契约语义放宽（`dueInDays` 可负）＋ CRITICAL provider 的消费者面。
- **开发定向集**（cwd `repos/orbits`，`node --import tsx --test <file>`，不 source `.env`）：`tests/capabilities/followup-task-generation-live-store.test.ts`、`tests/capabilities/reminder-schedule-notification-live-store.test.ts`、`tests/capabilities/orbit-ai-artifact-task-mock.test.ts`、新增时钟测试。
- **收口集**：定向集 + `tests/services/followup-owner-boundary.test.ts`、`tests/capabilities/followup-task-generation-mock.test.ts`、`tests/capabilities/reminder-schedule-and-notification-mock.test.ts`、signals 与首页 facts 相关测试（`grep -rl "followup_due\|home-facts" tests`）、`npx tsc --noEmit -p .`、`npm run lint`。
- **全量**：本 Sprint 本地代码收口时一次（RULES 5.2 基线对照）。
- **数据库**：若收口集含 Postgres 测试，先 `node scripts/assert-local-test-databases.mjs`，REPORT 证明未被 skip。
- **流量**：不新增读取（只改赋值与计算），不需要 D39 总账测算；REPORT 写一句「语句数与返回字节不变」并以既有 read-cost 测试通过为证。
- **App 机械同步（D46①，RULES §6）：**本 Sprint 改动 `shared/{contract,api-schema,compute,domain}`，须在**同一提交**里于 `repos/orbit-app` 执行 `npm run sync:contract`（即 `scripts/sync-contract.mjs`：`shared/contract`→`src/api/contract`、`shared/api-schema`→`src/api/schema`、`shared/compute`→`src/api/compute` 整目录逐字复制，`shared/domain` 只复制 `industries.ts`／`language.ts`→`src/api/domain`），只复制、不改 App 逻辑；再在 `repos/orbit-app` 跑 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/compute-sync.test.ts tests/domain-sync.test.ts`，须全绿（2026-10-02 编制时 4 文件 10 例全绿）。被同步的文件只能引用同步范围内的文件：`shared/contract` 只能 `./` 互引（`contract-sync` 的「自包含」用例），`shared/compute` 受 `tests/support/shared-compute-audit.ts` 约束（只可 `./`、`import type` 契约与两个字典），`shared/api-schema` 引 `../domain/*` 只限 `industries`／`language`；违反时改 Web 侧写法，不改 App。除同步脚本写出的副本外，本 Sprint diff 不含 `repos/orbit-app` 其他文件；App 界面与 App typecheck 不在本 Sprint 验收内，在 REPORT「App 影响」写明未验证。
- **不运行**：App 端 *-sync 以外的测试（不改 App 逻辑）；付费 AI。

## 失败与交接

外部条件缺失先不启动；run 已开始则按 RULES 产出 failed／blocked 报告，不自动重跑。REPORT 写：SC 映射与 SHA；impact（CRITICAL 一项及 UNKNOWN 文本补查）；时钟注入的最终签名；App 端观察项（`shouldNormalizeTaskToToday` 会把逾期显示为「今天」，建议 App 线另开）；证据路径；全量新增失败清单；review 处理。交接列本线分支、固定最终 SHA、待合并目标 `chat-agent`。完成后请协调者把记忆 `orbit-followup-queue-clock-bug` 标为已修复。

## 已定（D44，2026-10-02）

| 编号 | 定稿结论 | 对标做法 |
| --- | --- | --- |
| W44-1 | 只让 `dueInDays` 可为负，不新增 priority 枚举或 `overdueDays` 字段；逾期由「截止日早于今天」在展示时推出 | Linear、Todoist、Asana 只存截止日期，「Overdue」按用户时区当天比较派生；单一事实来源是 `dueAt`，App 端 exhaustive 枚举不被破坏 |
| W44-2 | 到期天数按东京日历日差（与首页 facts、计划周、今日要事一致） | Todoist／Linear／Google Tasks 的 Today／Tomorrow／Overdue 按用户本地日历日分组，不按 24 小时滑窗 |
| W44-3 | hybrid（夹具）模式保留夹具时钟，只接受「可为负」 | Storybook／演示数据固定参照时刻保证截图与断言稳定；真实时钟只用于 live 路径 |

App 端遗留（C-6，D44）：`schedule.ts` 的 `shouldNormalizeTaskToToday` 仍把逾期显示成今天，本大目标不改 App，登记为 App 线后续候选（REPORT 观察项照写）。
