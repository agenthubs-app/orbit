# Sprint AG13 — 活动、参会、日程与 Todo 关联

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在 [SPRINTS.md 登记表](../../SPRINTS.md#登记表)。
**原需求:** AG-R13（设计稿 §4 全节，含「删除私有活动的首版处理表」；附录 B 私有活动、参会自述、Todo、个人日程各行及「三处边界」；附录 E「活动引用、私有活动、参会自述」与 Todo、个人日程两行）；AG-R19（门槛用例）。
**单一目标:** 新集合 `private_events`、`event_attendance_notes` 与带类型的 `EventRef`；`privateEvent`、`attendance`、`schedule` 三个适配器；Todo 的 `relatedContactIds`、`relatedEventRefs` 多值关联；以上增改删全部经确认卡执行，删被引用的私有活动先逐项处理引用；存储结构的迁移只写文件并在本机库验证。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 分支 `orbit-agent-claude`，编制时 HEAD `324943ad5`；开工时重新记录 HEAD，并读 AG02、AG06、AG07 的 REPORT（AG10 已合回时也读，它可能已加 `todo.create`）。
**进入条件:**
1. AG06 completed（登记表的依赖）。另需 AG07 已合回：两端显示这些卡要用它的确认卡组件，登记表没列，开工前由协调者确认。
2. 设计稿「2026-11-15 已定的事项」即产品批准，不重复索要。
3. 视觉稿已获批准：「我的活动」在两端显示「我去过（自己记的）」的样子，以及私有活动在列表里怎么显示、点了去哪（§10 出稿方式）。没有批准不启动。
4. 真实模型调用已允许，费用上限见下文；评测环境 `npm run agent-eval:env` 自检通过；`ORBIT_DEEPSEEK_MODEL=deepseek-flash`，`ORBIT_GEMINI_DECISION_API_KEY` 可用。
5. 迁移只在本机库执行（`ORBIT_EVENT_DATABASE_URL` 指向本机，先跑 `node scripts/assert-local-test-databases.mjs`）；生产库、测试服执行与部署都不在本 sprint 的授权里。
6. 与 AG12 并行时，第二条线按根 `CLAUDE.md` 在 `/Volumes/ORICO/Dev/worktrees/orbit/<名称>` 另建 worktree；外接盘未挂载则停下询问。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
路径相对 `repos/orbits`。
- `shared/storage/live-record-store.ts`：通用记录表按工作区、集合、记录编号定位；`insertRecordIfAbsent` 只插不改；`updateRecordIfCurrent` 的前置 `LiveRecordWritePrecondition` 已支持 `expectedPayloadVersion`（payload 里的数字版本，`postgres-live-record-store.ts`:353 实现），两个新集合的数字版本直接用它。
- `shared/storage/migrations.ts`：迁移的写法是 `ORBIT_RECORDS_SCHEMA_SQL` 里一串可重复执行的 `create index if not exists`（:82–114 是按集合的局部索引），`runOrbitRecordsMigration` 按固定顺序执行各步，新步骤一律接在最后；由 `scripts/migrate-live-records.ts`（`npm run db:migrate:live`）执行。新集合不需要新表。
- `shared/contract/tasks.ts`：`TaskItemContract` 只有单值 `relatedContactId`、`relatedEventId`；`PersonalScheduleContract` 有 `contactIds`、`noteIds`、`recurrence`（每天、每周、每月加截止日）、`seriesId`、`occurrenceDate`，没有活动引用。
- `features/tasks/service.ts`：:66 `TaskUpdatePatch`；:403 `update` 用存储里的任务展开后再覆盖补丁字段，前置是 `expectedUpdatedAt`。`app/api/tasks/[id]/handler.ts`:22 的补丁字段白名单只有单值关联，除三项日期地点外不收 `null`。`features/tasks/task-record.ts` 按单值字段算记录的 `targetType`/`targetId`，读取时逐字段校验。
- 旧客户端的写入口：App 离线队列 `repos/orbit-app/src/data/sync/task-outbox-mutation.ts` 与契约 `shared/api-schema/offline-mutations.ts`（任务补丁只有单值 `relatedContactId`）。`tasks`、`notes`、`personal_schedule_items` 都是同步集合（`features/sync/domain-registry.ts`:59），写入要拿提交顺序锁。
- `features/personal-schedule/service.ts`:130 `mutate`：重复日程改删必须带 `scope`（`occurrence`／`series`，`shared/api-schema/personal-schedule.ts`:13）；「仅本次」写 `personal_schedule_occurrence_exceptions` 一条例外，系列只更新时间；关联的人和笔记经 `associationReader.accessibleIds` 核对。`recurrence.ts` 的 `expandPersonalScheduleOccurrences` 展开，`occurrence-exceptions.ts` 读例外。
- `features/events/mine/service.ts` 与 `shared/contract/events-mine.ts`：「我的活动」只读报名、审核、签到、计划条目和外部评估；`attended` 只来自签到表 `event_ops_checkins`。App 的 `repos/orbit-app/src/api/schema/events-mine.ts` 遇到不认识的状态会**跳过整行**，所以新来源不能加新状态值。界面在 `repos/orbit-app/src/screens/events/v2/EventsHome.tsx` 与 `app/(app)/app/orbit-2026/events/EventsScreen.tsx`、`events-model.ts`。
- `shared/contract/notes.ts`：笔记只有 `eventIds: readonly string[]`，没有 `eventRefs`；`features/notes/service.ts`。
- `features/events/core/contract.ts`：平台活动的规范记录；普通用户不可改。
- 测试夹具：`tests/services/tasks-service.test.ts`、`tests/services/task-mutations-postgres.test.ts`、`tests/services/task-record.test.ts`、`tests/api/tasks-routes.test.ts`、`tests/api/personal-schedule-routes.test.ts`、`tests/api/personal-schedule-recurrence.test.ts`、`tests/services/personal-schedule-recurrence.test.ts`、`tests/services/personal-schedule-offline-replay-postgres.test.ts`、`tests/services/events-mine.test.ts`、`tests/api-schema/offline-mutations-r20b.test.ts`、`tests/support/migrated-configured-database.ts`。

### 关键符号
文件数为文本搜索结果，含定义文件和 App 副本。
- `export interface TaskItemContract {` — 23；字段 `relatedContactId` 出现在 62 个文件、`relatedEventId` 27 个，按 HIGH 对待。
- `export interface TaskUpdatePatch {` — 2；`async update(updateInput) {`（`features/tasks/service.ts`:403）。
- `export interface PersonalScheduleContract extends ScheduleItemContract {` — 36。
- `export function createPersonalScheduleService(input: { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string; client?: TransactionalPostgresClient; now?: () => string; inboxProjection?: InboxProjectionWriter; executor?: TransactionalSqlExecutor; associationReader?: PersonalScheduleAssociationReader; associationReaderForStore?: (store: LiveRecordStoreLike<Record<string, unknown>>) => PersonalScheduleAssociationReader }) {` — 30。
- `export function expandPersonalScheduleOccurrences(series: PersonalScheduleSeries, window: { from: string; to: string }, occurrenceDate?: string): PersonalScheduleOccurrence[] {` — 5。
- `export function createMyEventsService(deps: { reader: MyEventsReader; now?: () => Date }) {` — 4；`export function createPostgresMyEventsReader(input: { query: Query; workspaceId: string; assessmentsReady?: () => Promise<void>; strict?: boolean }): MyEventsReader {` — 4；`export type MyEventStatus = ...` — 7。
- `export async function runOrbitRecordsMigration(` — 44；`export const ORBIT_RECORDS_SCHEMA_SQL = ` — 195（多数是测试建库）。
- `expectedPayloadVersion?: { path: readonly string[]; value: number };` — 3。
- 本 worktree 没有 GitNexus 索引。Generator 先按根 `CLAUDE.md` 建索引，再对每个要改的符号做 upstream impact；建不起来用文本搜索补查并写进 REPORT（CONVENTIONS 第 5 节）。

### 前序交接要点
以下是 CONVENTIONS 第 4 节约定的名字，开工时按前序 REPORT 核对，有出入追加更正记录。
- AG02：账本项的 `dependsOn`、各版载荷、`decideAction()`，状态含 `partially_failed`；执行时目标变了的处理。
- AG06：`OperationIntent`、`resolveIntents()`、`freezeCard()`；`todo`、`memo` 的 `prepare`、`applyApproved`（至少 `todo.update`、`memo.create`）；本批新建对象的 `localCreateRef` 与依赖失败即跳过。缺的 `todo.create`、`todo.complete`、`todo.reopen`、`todo.delete`、`memo.update`（解除活动关联）由本 sprint 补。
- AG07：两端确认卡组件。
- 交给后续：AG11 的门槛用例 AE-REF-002 要用本 sprint 的两个集合与 `EventRef`（AG11 的 PLANNER 已把本 sprint 列为它的进入条件）。

### 易错边界（括号里是对应验收项）
1. **卡内依赖**：参会自述引用本卡新建的活动时，用 `localCreateRef` 指向第 1 项，执行器在第 1 项成功后才换成正式编号；第 1 项失败，第 2 项记为跳过，结束时零数据变化（AG13-1）。
2. **三者互不代写**：建活动、加日程、报名都不自动生成参会自述；参会自述不写签到、报名表；平台活动及其报名、审核、签到普通用户改不了，说明后不出卡；「我的活动」把自述显示为「我去过（自己记的）」，用新增的可选字段表达，不新增状态值，不改 `attended`（AG13-2）。
3. **重复日程**：卡上的 `this_occurrence`／`whole_series` 对应现有的 `occurrence`／`series`；「仅本次」只写一条例外，系列内容和其他各次不变；系列上的关联人、笔记在改了这一次之后仍在。「隔周」「每月第二个周二」「共几次」直说不支持，可提议列出有限几条单次日程，用户接受前不出卡（AG13-3）。
4. **删除私有活动**：出卡前查全部有效引用（参会自述、笔记、待办、日程）逐项列出并让用户选：保留活动、把自述转到另一场（先查同人同场唯一）、在卡上一并删自述；笔记、待办、日程只解除这一场的关联，原文和状态不动。删除那一项排在其他各项之后，执行时再查一次引用，仍有或新增就保留活动并写明原因；引用的增加与删除活动用同一把锁或等价的事务约束，防止并发留下悬空引用。恢复活动只恢复活动本身（AG13-4）。
5. **多值关联与旧客户端**：旧的单值字段读成零或一项的数组；`relatedContactId` 镜像数组第一项，`relatedEventId` 只镜像第一个平台活动；旧接口只改标题时数组不变；旧客户端改了单值字段时只替换镜像的那一项，其余保留（这条是 Planner 的选择，REPORT 写明）；数组在服务端去重，私有活动引用逐项核对归属；已发版 App 读同步来的待办行时多出的字段不能报错（AG13-5）。
6. **唯一与版本**：参会自述按工作区、账号、`eventRef` 唯一（已删除的不算）；私有活动和参会自述用数字版本，每次写入加一，经 `expectedPayloadVersion` 条件写；Todo 与日程沿用记录更新时间（AG13-2、AG13-4）。
7. **迁移只在本机**：新增的唯一索引和反向查询索引接在 `runOrbitRecordsMigration` 最后，可重复执行；在本机库连跑两次无错，证明删除检查走索引；不在任何远程库执行（AG13-4）。

## 范围与文件

- 读取：上文必读文件；AG02、AG06、AG07（与 AG10）的 REPORT；`docs/epics/agent-design/eval/cases/EVT.yaml`，`SCL.yaml` 的 AE-SCL-025、AE-SCL-026；`eval/world/base-v1.yaml` 的增量 `private-event-reunion`。
- 修改（相对 `repos/orbits`）：
  - 契约：`shared/contract/agent-v1.ts`（`EventRef`、`PrivateEvent`、`AttendanceNote`，按 CONVENTIONS 第 1 节放这里；该文件由前序 sprint 新建，编制时还不存在）、`shared/contract/tasks.ts`（Todo 两个数组、日程 `eventRefs`）、`shared/contract/events-mine.ts`（自述的可选字段）、`shared/contract/notes.ts`（`eventRefs`，AG06 没加时）及对应 `shared/api-schema/` 文件；App 副本只经 `npm run sync:contract` 写出。
  - Todo：`features/tasks/service.ts`、`task-record.ts`、`contract.ts`、`legacy-task-adapter.ts`、`app/api/tasks/[id]/handler.ts`。
  - 日程：`features/personal-schedule/service.ts`、`representation.ts`、`association-reader.ts`（核对活动引用）。
  - 笔记：`features/notes/service.ts`、`note-record.ts`（`eventRefs` 与 `eventIds` 同步，AG06 没做时）。
  - 我的活动：`features/events/mine/service.ts`、`app/(app)/app/orbit-2026/events/events-model.ts`、`EventsScreen.tsx`，`repos/orbit-app/src/screens/events/v2/EventsHome.tsx`（按批准的视觉稿）。
  - 迁移：`shared/storage/migrations.ts`。
- 新建：
  - 领域：`features/events/private-events/service.ts`、`features/events/attendance-notes/service.ts`（增改删、唯一、版本、引用查询）。
  - 适配器：`features/agent-v1/domains/private-event/`、`domains/attendance/`、`domains/schedule/`，以及 Todo 与 Memo 适配器缺的操作，在 `domains/registry.ts` 与执行器登记表里登记。
  - 测试：`tests/agent-v1/private-event-domain.test.ts`、`tests/agent-v1/attendance-domain.test.ts`、`tests/agent-v1/schedule-domain.test.ts`、`tests/services/private-event-delete-references-postgres.test.ts`、`tests/services/task-multi-links-legacy-postgres.test.ts`、`tests/services/agent-v1-collections-migration-postgres.test.ts`。
- 排除：外部日历（只读）；平台活动、报名、签到的任何写入；「已评估并加入的外部活动」不并入私有活动；新的重复规则类型；私有活动与参会自述的离线同步；历史数据回填（AG18）。

## 验收契约（最多五项）

| 验收 | 可观察的结果 | 必需证据 |
| --- | --- | --- |
| AG13-1 | 同一张卡里先建私有活动、再记参会，前一项成功后一项才执行。 | `private-event-domain.test.ts`、`attendance-domain.test.ts`（`localCreateRef` 换正式编号、前项失败后项跳过、零残留、重放不重复）；门槛 AE-EVT-001、AE-EVT-002。 |
| AG13-2 | 参会自述、官方签到、日程三者互不代写。 | `attendance-domain.test.ts`（写自述后签到、报名表零变化；建日程、建活动不生成自述；同人同场唯一）；`tests/services/events-mine.test.ts` 补「我去过（自己记的）」且 `attended` 不变；门槛 AE-EVT-003、AE-EVT-004；两端「我的活动」截图（Web 1440／375，App 模拟器），Web 按 `docs/development/web-no-flash-and-cache-rules.md` 在本机生产构建上测列表位置不变、读取次数不增。 |
| AG13-3 | 改删重复日程时“仅本次”不动整个系列。 | `schedule-domain.test.ts`（仅本次只写一条例外、整个系列改系列、不支持的重复方式不出卡）；`tests/api/personal-schedule-recurrence.test.ts` 保持通过；门槛 AE-EVT-005、AE-EVT-006、AE-EVT-007、AE-SCL-025。 |
| AG13-4 | 删除被引用的私有活动前逐项列出影响并让用户选处理方式；处理后仍有引用就保留活动。 | `private-event-delete-references-postgres.test.ts`（四类引用逐项列出、解除与转移排在删除前、执行时新增引用则保留活动并写原因、并发加引用不留悬空）；`agent-v1-collections-migration-postgres.test.ts`（本机库连跑两次、唯一索引生效、删除检查走索引）；门槛 AE-EVT-008、AE-EVT-009。 |
| AG13-5 | 旧客户端只改 Todo 标题时，多值关联不丢。 | `task-multi-links-legacy-postgres.test.ts`（单值读成数组、旧接口只改标题数组不变、旧客户端改单值只替换镜像项、离线队列重放不丢）；`tests/api-schema/offline-mutations-r20b.test.ts` 保持通过；门槛 AE-EVT-010、AE-EVT-011、AE-EVT-012、AE-SCL-026。 |

## 一次 Generator 的执行顺序

1. 核对进入条件（AG06、AG07 的 REPORT，视觉稿批准链接，本机库），登记 run-01、本页 SHA256、基线 HEAD；建 GitNexus 索引，对关键符号做 upstream impact，HIGH/CRITICAL 先报告。
2. 契约与迁移：先写失败测试（旧单值读成数组、旧接口只改标题、唯一约束），再改 `shared/contract`、`shared/api-schema` 与 `migrations.ts`；同一提交在 `repos/orbit-app` 跑 `npm run sync:contract` 与四个同步测试；本机库跑两次 `npm run db:migrate:live`。
3. 领域：私有活动、参会自述两个服务；Todo 多值关联与旧客户端兼容；日程的活动引用；笔记 `eventRefs`（如需）；定向测试转绿。
4. 适配器与执行器：`privateEvent`、`attendance`、`schedule`，补齐 Todo、Memo 缺的操作，删除私有活动的引用处理与执行时复查。
5. 「我的活动」按视觉稿改两端；Web 本机生产构建上 1440／375 截图，App 按 App RULES 5.4 与同一账号的 Web 生产构建跑模拟器；收口集、两端 typecheck、全量对照。
6. 跑门槛与双评，路径限定提交到 `sprint/AG13-events-attendance-schedule`，写 REPORT，交协调者合并。

## 最小测试与检查

- **档位：H。** 新集合与迁移、写入与并发锁、共享契约（`TaskItemContract` 涉及 23 个文件）都在改；收口做一次 I 全量对照。
- **开发定向集**（cwd `repos/orbits`）：新测试六份，加 `tests/services/tasks-service.test.ts`、`tests/services/task-record.test.ts`、`tests/services/personal-schedule-recurrence.test.ts`、`tests/services/events-mine.test.ts`。数据库测试先跑 `node scripts/assert-local-test-databases.mjs`，并在 REPORT 证明没被跳过。
- **操作链收口集**：上述完整文件；`tests/services/task-mutations-postgres.test.ts`、`tests/api/tasks-routes.test.ts`、`tests/api/personal-schedule-routes.test.ts`、`tests/api/personal-schedule-recurrence.test.ts`、`tests/services/personal-schedule-offline-replay-postgres.test.ts`、`tests/api-schema/offline-mutations-r20b.test.ts`、`tests/events/r26-design-fixtures.test.ts`；App 端「我的活动」与离线任务相关测试（`tests/offline-pages-tasks.test.tsx`、`tests/app-wide-events.test.ts`）；`npx tsc --noEmit -p .` 与 App `npm run typecheck`。
- **契约同步**：cwd `repos/orbit-app` 执行 `npm run sync:contract`，跑 `tests/contract-sync.test.ts`、`api-schema-sync.test.ts`、`compute-sync.test.ts`、`domain-sync.test.ts`，与契约改动同一提交。与 AG12 并行时，合并后在合并树再跑一次。
- **门槛命令**：`npm run agent-eval:run -- --gate AG13`，包含 EVT 区 12 例（AE-EVT-001～012，小账号）、SCL 的 AE-SCL-025（常规）与 AE-SCL-026（较大），以及不变量包。AE-EVT-002 含模拟故障，单独计数。
- **评审**：门槛运行的每例由两个互不相见的 Claude 会话各评一次（`npm run agent-eval:judge-pack -- --run <运行编号>`），不一致做第三次并列入人工复核；`agent-eval:report` 的结论登记进 `eval/RUNS.md`。
- **全量对照**：`repos/orbits` 按 RULES 5.2 跑失败清单对照，只调查新增项；stash 带唯一标签并按 SHA 取回（本 worktree 与其他 worktree 共用 stash 栈）。App 端改了界面，按 App RULES 5.1 的 I 档跑一次 `npm test` 对照。
- **费用**：真实模型调用每次完整运行 30 元以内，本 sprint 累计 150 元以内，超出先停下报告；次数与 token 记进 REPORT。
- **证据位置**：截图、迁移输出与命令输出放 `~/orbit-sprint-evidence/agent-design/sprint-AG13/run-01/`，评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **不运行**：`--all` 与封存集（AG18）；真实联网；任何远程库上的迁移、部署、push（需另行授权）；外部日历同步。

## 失败与交接

外部条件缺失（AG07 未合回、视觉稿未批准、本机库或评测自检不过）先不启动。run 已开始，按 eval README 第 6 节最多两个修复轮次，每次整套门槛重跑；仍不过就如实结束为 failed，不为通过改用例，用例确实写错按第 7 节记进 `eval/CHANGES.md`。
REPORT 含验收映射、功能 SHA／文件／理由、迁移文件与本机两次执行的输出、旧客户端兼容规则、命令与退出码、门槛运行编号与评审结论、费用、未提交与下一步。分支 `sprint/AG13-events-attendance-schedule` 从 `orbit-agent-claude` 建；固定最终 SHA 交协调者以 `--no-ff` 合回 `orbit-agent-claude`，合并树跑受影响测试与两端 typecheck 后才登记 completed。

## 开工更正记录（Generator 追加，2026-11-18；原文与原哈希 34b8b810… 保留）

- **视觉稿已批准**：用户 2026-11-18 批准 https://claude.ai/artifact/RQ3Z1dNxbAvm9sPpfstDDY ，D1–D7 全选推荐（A）：
  - D1：「我去过（自己记的）」在活动名下单独一行；右边标签只放主办方的状态；有这一行时不显示「未签到」。
  - D2：私人活动标「🔒 私人」。
  - D3：将来的私人活动放进「接下来」，按钮「查看」，算进「计划参加 N 场」。
  - D4：点私人活动不开新页面：网页宽屏在右栏显示，手机网页和 App 从底部弹出。
  - D5：详情只能看；「在 iOrbit 里改」打开对话并带上这场活动。
  - D6：重复日程的卡写明「只改这一次」或「整个系列」，不放切换。
  - D7：删被引用的私人活动，先在对话里逐项列出并给可选的处理方式，选定后才出卡。
  - 只加可选字段、不加新的状态值（旧版 App 不跳行）。
- **进入条件**：AG06 completed、AG07 已合回（协调者确认）；基线 HEAD `5137eae77`（AG12 合回）。
- **以 brief 为准的出入**：全量对照不用 stash（brief 禁止），按协调者给的 24 条基线失败名单对照；App 端另跑一次 `npm test` 报失败名。
- **门槛**：按 `SPRINT_EXECUTION_ORDER`，AG13 门槛 72 例 = EVT ×12 + SCL-010、SCL-012（`gate: AG13`）、SCL-025、SCL-026 + 不变量 56 例；`sprint: AG11` 的 REF 不变量不在内（AG11 排在 AG13 之后）。SPRINTS.md 登记的「SCL ×4」即这四例，本页「SCL-025、026」少写了两例，以 SPRINTS.md 为准。
- **开场项**（协调者 AG12 复核，先于本 sprint 改动、单独提交）：AE-SCL-004 单位与职位同时过时时连成「拾野选物店店长」；AE-FN-008 摘要里的状态词须有读到的记录支持；AE-RD-003 只是时间词或指代的联系人线索不当联系人；AE-BND-001 用例之间等后台工作结束（评测侧）。
- **回归重跑**：门槛后依次跑 AG12、AG10、AG09、AG08、AG07、AG06、AG05、AG04、AG03，命名 `AGxx-gate-rerun-at-AG13`，`--workers 4`，一个接一个；超时规则按协调者说明。
- **文件**：PLANNER 列的三个适配器目录合在 `features/agent-v1/domains/private-event/`（`ops.ts` 卡片项、`apply.ts` 执行器），第二层的解析在 `propose/events-resolve.ts`；「我的活动」详情是新文件 `app/(app)/app/orbit-2026/events/PrivateEventPanel.tsx`；新文案放 `shared/copy`（经同步脚本到 App）。
