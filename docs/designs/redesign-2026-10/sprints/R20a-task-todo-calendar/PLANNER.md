# Sprint R20a — Task：容器 + To-do + カレンダー

**Plan revision:** 2（2026-10-18 按独立复核 S1–S5、M1–M7 与 m 项修订；主会话代定见 §2，RD-33）。**模式:** existing-codebase / single-generator（负责：乙；执行：**Codex 主开发会话**，D 线）。
**单一目标:** 修好フォロー读取失败 → 定只读聚合契约 `GET /api/todo/page`（含 `deferralCount`、App 离线页副本、演示数据）与 `GET /api/calendar/external-events` → 两端 To-do 与カレンダー（含面談）按设计稿重写、Task 容器收口 → 替换并删除旧屏 → 组件库合入后过像素门禁。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `line-d` 从 `origin/redesign` 拉出的 HEAD（编制时 `75ace0f03`），行号按符号重新定位；已知失败以 README「骨架登记表」最后一行与各 Sprint 收口记录为准。
**进入条件:** RD-31 / RD-32 / RD-33 已定；§2「主会话代定」已生效。像素收口在 R31a / R31b 合入之后（RD-31）。
**提交方式:** 在 D 线 worktree 按路径提交，**不推送**（见 §0）。不跑 GitNexus（RD-32）。
**里程碑（主会话推到 `redesign`）:** R20a 的日程提案组件骨架（SC-11a，给 R11a）。B 线的 `shared/compute/follow-up-task.ts` 已在 `origin/redesign`（`8476eb8ad`），R20a 直接 import（代定 §D-6）。

---

## 0. 给 Codex 的执行说明

1. **你是谁、怎么沟通**：你是 Codex 主开发会话（多线管理器）。本 Sprint 是 D 线的工作，你可以在线内开并行 worker，但**同一时间各 worker 改的文件不能重叠**（按 §12 的步骤或 §1 的目录分），合并和提交由你负责。主会话（Claude）通过 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/talk-codex.sh` 给你发消息；你**每一轮结束时的最后一条回复就是给主会话的摘要**：做完了哪些 SC、提交号、测试摘要（通过 / 失败数和失败用例名）、新增的「待主会话代定」「请求」「待用户授权」条目、下一步。不要用别的方式找主会话或用户。
2. **工作目录**：`/Volumes/ORICO/Dev/worktrees/orbit/redesign-d`（分支 `line-d`）。所有命令都在这里跑，不要进 `/Users/xzhao/Projects/orbit` 或其他线的 worktree（`redesign`、`redesign-a/b/c`）。开工先跑 `git -C /Volumes/ORICO/Dev/worktrees/orbit/redesign-d pull --rebase origin redesign`，确认工作区干净。
3. **阅读顺序**（只读和自己相关的段落，先 grep 定位）：
   1. 本文件全文，再读 [GOAL.md](GOAL.md)；
   2. [`../README.md`](../README.md)：RD-16、RD-24～RD-33、「骨架通用规则」10–13；
   3. [`../HOW-TO-START-A-FEATURE-SPRINT.md`](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–§10（§3 新契约、§4「尚未实现」、§6 文案、§7 路由登记、§8 像素门禁与画板预检、§9 只加不改）；
   4. [`../HANDOFF-TO-FEATURE-SPRINTS.md`](../HANDOFF-TO-FEATURE-SPRINTS.md)：「通用口径」G01–G26、§R20（全部）、§R10 与 §R19（本 Sprint 的契约要给它们用）；
   5. [`../DEFERRED-A.md`](../DEFERRED-A.md) §2（R24-07、R12-12）；
   6. [`../screen-ownership.md`](../screen-ownership.md) 的 Task 行（App :45–48、Web :76–78）；
   7. [`../../IMPLEMENTATION-PLAN.md`](../../IMPLEMENTATION-PLAN.md) §1.6、D-12 / D-12b、附录 D 第 e、k 行；
   8. 两端 `AGENTS.md` 的「redesign 开发规则」，以及 `repos/orbits/scripts/visual/README-redesign.md`（画板预检、提速、App 门禁）；
   9. [`../R31a-app-components-pixel/PLANNER.md`](../R31a-app-components-pixel/PLANNER.md) §3–§4（组件会新增哪些参数；本 Sprint 只用、不改组件）。
4. **提交规则**：
   - 只提交本线归属的文件（见 §1），一律按路径提交：`git commit -m "<type>(R20a): …" -- <文件…>`，提交后 `git show --stat HEAD` 核对；不要用 `git add -A` / `git commit -a`，也不要把文件长时间留在暂存区。
   - 每次提交前 `git pull --rebase origin redesign`；`.snapshot.json` 冲突时重新生成（`node scripts/contract-snapshot.mjs --write`），不要手工合并。
   - 改了 `repos/orbits/shared/**` 的同步目录，就在 App 跑 `npm run sync:contract`，副本和源放在同一个提交；契约提交以 `contract:` 开头，并写「App 需要同步」。
   - 小步提交：每个 SC（或 SC 里一个完整的子步骤）测试转绿后提交一次。**SC-11a 组件骨架单独提交**，并在当轮摘要里写明提交号（主会话推作里程碑）。
   - **永远不推送**（不跑 `git push`、不开 PR）。由主会话复核后推到 `redesign`（RD-32）。
5. **不要提问，跳过并记下**（RD-33）：遇到产品取舍、设计稿矛盾、缺画板、要偏离设计稿的情况，不要停下来问人，也不要自己发挥。把那一项跳过，写进 REPORT「待主会话代定」（写清是什么、有几个选项、你推荐哪个、影响哪些 SC），然后接着做别的。
6. **停止条件**（满足任意一条就停在那一项，写进 REPORT，再做其他能做的部分）：
   - 需要改「不许碰」的文件：写进 REPORT「请求」，不要动。
   - 需要连 Neon、生产库、部署、生产环境变量、TestFlight，或连真实 Google 账号：不做，写进 REPORT「待用户授权」。
   - 同一个画面门禁改了 3 轮还不过：写进「未过」清单，不再耗轮次。
   - 全量测试出现新失败，修 2 次还没修好：停止扩大改动，写清失败用例名和你的判断。
   - **结构、数据、逻辑全部做完时，R31a / R31b 还没有合入 `origin/redesign`**：不要开始像素收口。REPORT 写「等组件库」，列出待跑的门禁清单，然后结束本轮并回复摘要。
   - 付费 AI：只在某个功能必须真调用才能验证时，在本机用已有 key 调用，每次调用都记进 REPORT（次数、用途、token 数）；其余一律用 mock。
7. **REPORT 与证据**：REPORT 写在 `docs/designs/redesign-2026-10/sprints/R20a-task-todo-calendar/REPORT.md`，画板预检写在同目录 `preflight-checklist.md`；截图和日志放 `~/orbit-sprint-evidence/redesign/R20a/run-01/`。REPORT 的结构按 HOW-TO §10 第 3 步，另加「フォロー 根因」「请求」「待主会话代定」「待用户授权」「交接表追加（逐行四栏原文）」「越线自查」「文档更新请求」几节。README 登记表、HANDOFF、DEFERRED-A、决定表、`screen-ownership.md` **不要改**（其他会话正在改），要改的内容写进 REPORT「文档更新请求」，由主会话合入。

## 1. 本线归属的文件 / 不许碰的文件（RD-31，复核逐条查越线）

**本线归属（可改 / 可删 / 新建）**
- **App 路由**：`app/task.tsx`、`app/today.tsx`、`app/tasks.tsx`、`app/tasks/**`、`app/followups.tsx`、`app/(app)/schedule.tsx`、`app/schedule/**`、`app/agent.tsx`、`app/agent/actions.tsx`、`app/contacts/all-actions.tsx`；新建的 To-do / カレンダー 二级页路由。
- **App 屏幕与数据**：`src/screens/task/**`（`TaskScreen.tsx` 只改 calendar / todo 两段和容器行为，`plan` / `memo` 两段原样）、`src/screens/tasks/**`、`src/screens/schedule/**`、`src/screens/today/**`、`src/screens/followups/**`、`src/screens/ai/AgentActionsScreen.tsx`、`src/screens/agent/AgentLedgerScreen.tsx`；新建 `src/screens/todo/**`、`src/screens/calendar/**`；`src/data/sync/{task,schedule}-outbox-*.ts`、`useOfflineTaskOutbox.ts`、`useOfflineScheduleOutbox.ts`（被引用方见 §4 事实 13，导出只加不改）；相关 view-model（`today*`、`followup*`、`schedule*`、`agent-ledger-route.ts`、`task*`）。
- **导航壳（D 线独有）**：App `src/components/{ShellTopBar,OrbitTabBar,TabPageBar,LegacyTaskRedirect}.tsx`、`src/components/shell-navigation.ts`、`src/view-models/{app-navigation,shell-state}.ts`；Web `app/(app)/app/orbit-2026/shell/**`、`orbit-2026/task/**`（`TaskContainer.tsx`、`task-tabs.ts`、`task.module.css`）。
- **Web 页面**：`app/(app)/app/tasks/**` 中除 `plan-slot.tsx` 以外的全部文件（含 `personal/`、`[id]/`、`relationship/`；`tasks-client.ts`、`relationship-lifecycle-tasks.ts` 有外部引用方，导出只加不改，见事实 13）、`app/(app)/app/agent/actions/**`；新建 `orbit-2026/todo/**`、`orbit-2026/calendar/**`、`orbit-2026/copy/task.ts`。
- **服务端与共享**：新建 `features/todo/**`、`features/calendar-external/**`、`app/api/todo/page/route.ts`、`app/api/calendar/external-events/route.ts`；本 Sprint 碰到的 `features/tasks/**`、`features/personal-schedule/**`、`features/appointments/**`（只加不改，保留现有服务端规则）、`features/integrations/**`（只读接入 + 回调 `returnTo`）；`app/api/{tasks,schedule-items,appointments,integrations,today}/**` 中需要改的处理函数；契约新增 `shared/contract/{todo-page,calendar-external-events}.ts` 与对应 `shared/api-schema/*`，`shared/contract/{tasks,today,appointments,personal-schedule-associations}.ts` 只加不改；新建演示数据文件 `shared/mock/demo-world/todo.ts`。
- **文案**：App 新字典域（`src/i18n/{ja,zh,en}/todo.ts`、`calendar.ts`，或重写现有 `tasks` / `schedule` / `today*` / `relationshipTasks` / `followupVm` / `meetingDetails` / `agentActions` 域）；Web `orbit-2026/copy/task.ts`。
- **画板改动（只限代定 §D-3）**：`docs/designs/redesign-2026-10/b7-account-misc.html` 里 #41「② 動かす」这一块，按代定 §D-3 原地改。
- **门禁**：新建 `scripts/visual/views/{web,app}-R20a.json`、`scripts/visual/attribution-redesign-R20a.json`；本目录 `preflight-checklist.md` / `REPORT.md`。
- **允许但要写交接**：フォロー 修复如果必须改 `features/connections/lifecycle/**`、`features/followups/**` 或 `app/api/relationship-tasks/**`，可以改，但只做修复需要的最小改动，并在 REPORT「交接」写给 B 线（R11 / R13）一句：改了哪个函数、行为差在哪里。

**不许碰**（要改就写 REPORT「请求」）
- **组件库与 token（A 线）**：App `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`、`tests/fixtures/legacy-ui-deferred.json`、`scripts/visual/{compare-redesign*.mjs,redesign-pixel-lib.mjs,contrast-substitutions.json}`。组件不对齐 kit 就标「待组件库」，不要在页面里打补丁。
- **B 线的共用判定**：`shared/compute/follow-up-task.ts` 与 App 副本 `src/api/compute/follow-up-task.ts`（R11a 已交，`8476eb8ad`；R20a 只 import，要改写 REPORT「请求」，见代定 §D-6）。
- **计划页内部（甲 R22–R25）**：App `src/screens/plan/**`、Web `app/(app)/app/tasks/plan-slot.tsx` 与计划相关组件、`features/plans/**`（只能调用已导出的函数和接口，例如 `plans/v2/pending`、`plans/v2/summary` 的 `todayChance`）。容器里本 Sprint 只能改标题区与分段（R24-07）。
- **メモ（R20b，同线下一步）**：App `src/screens/notes/**`、`app/notes/**`、`features/notes/**`、`shared/contract/notes.ts`；Task 容器 `memo` 段与 Web メモ段原样保留。
- **B 线人脈 / 收件箱**：`features/contacts/**`、人脈与联系人详情页面（R11a）、`inbox` 相关；联系人详情里挂「面談の日程提案」入口的文件归 R11，本 Sprint 只导出弹层组件。
- **甲名下加人**：App `src/screens/add/**`（`CompletionQuestionCard` 等只引用）、Web `orbit-2026/add/**`（`TodayQuestionCard` 只引用）、**`contacts/new/drafts` 页与其接口（保留，见代定 §D-2）**。
- **iOrbit（E 线）**：`app/(app)/app/agent/**` 中除 `actions/` 以外的文件（含 `iorbit-0918/**`、`agent-task-interaction-*`、`home-facts-route-service.ts`）、`orbit-global-ask/**`、App `src/screens/ai/**`（`AgentActionsScreen.tsx` 除外）、`shared/contract/orbit-ai.ts`；里面指向旧地址的链接靠跳转兜住，不改它们的文件，在 REPORT 列出给 E 线。
- **汇总文件只追加**：`shared/contract/index.ts`、`shared/mock/demo-world/{index,fixtures}.ts`、App `src/i18n/*/index.ts`、`copy-kinds.ts`、`tests/i18n-domain-split.test.ts`、`scripts/copy-qa/cli.mjs`、`features/redesign-contracts/{service-factory,mock-service,handlers}.ts`、`shared/services/capability-registry.ts`、App `src/data/sync/page-copies.ts`、`src/data/sync/web-mirror-storage.ts`（`WEB_MIRROR_PAGE_COPY_IDS`）、`src/data/offline-read/route-domain-inventory.ts`、`shared/api-schema/offline-policy.ts`、路由登记与审计计数；旧屏允许清单只删自己的行。
- 文档：README、HANDOFF、DEFERRED-A、决定表、`screen-ownership.md`（主会话改，见 §0 第 7 条）。

**本线环境**：Web dev 端口 **3500**、`ORBIT_NEXT_DIST_DIR=.next-line-d`；Metro **8085**；本地库 **`orbit_line_d`**：已存在就直接用，不存在再 `createdb -T orbit_redesign_shots_20261018 orbit_line_d`；环境文件从 `/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/.env.local` 复制到本 worktree 的 `repos/orbits/.env.local`，再把本地库变量改指 `orbit_line_d`（这个文件不提交）；连库测试用 `orbit_line_d` 或从它复制的 `orbit_line_d_test`，不和其他线共用；iOS 模拟器新建 **`Orbit Line D`**（`xcrun simctl create "Orbit Line D" <机型> <运行时>`），之后一律按 UDID 操作；App `.env.development.local` 指向 `http://localhost:3500`（不要改 `.env.local`）。不连 Neon、不部署、不连真实 Google 账号。

## 2. 主会话代定（2026-10-18，RD-33；用户回来可逐条推翻）

1. **拆分**：R20a = 容器 + To-do + カレンダー（第一步修フォロー）；R20b = メモ（D-14、@イベント、Web メモ、R12-12 @人 token、`planLink`）。
2. **判断待ち 的来源**按 D-12：待处理任务建议、agent actions（awaiting）、计划待确认（`plans/v2/pending`）、草稿（拆成两类，见 §D-2）、1日1問。**过期任务留在フォロー里，标红**，不移进判断待ち。画板上的示例行按 `[data]` 处理。
3. **现在就做只读接口** `GET /api/todo/page`（契约 + App 离线页副本），To-do、R10 首页、R19 小组件共用；含 `deferralCount`。
4. **カレンダー**：只读已连接的 Google カレンダー（做法见 §D-4），显示连接状态和「連携する」；个人予定的「動かす」只改 schedule-item，面談的「動かす」见 §D-3；写外部日历仍逐次确认（`externalCalendarWritesEnabled`）；不做 iCloud，不做新的双向同步。
5. **b7 #40–#45**（面談の詳細 / 動かす / キャンセル / 編集）归 R20a，路由 `schedule/meetings/[id]` 归 R20。
6. **Web「面談の日程提案」的入口在联系人详情（R11 的文件）**：R20a 做弹层组件并导出（路径与 props 见 §7.6），由 R11 挂载。
7. **缺画板的宽度 / 主题**（沿用 R11a 代定 2 的口径）：b8 只给了 Task › プラン 的 1024 / 390，To-do 与カレンダー的 Web 1024 / 390 都是「设计稿无」；App 只有 b3 #47–#50 有深色。没有画板的组合按同一画面 1440 / 浅色画板照搬结构，按 b8「断点规范」（#15）排版，颜色只用 token；REPORT 附截图，不进像素门禁，写进「交接表追加」登记「设计稿无」。同样处理：**カレンダー 週視图**（只有 b3 #25 日程提案里的週视图，没有日历本体的週画板）、**Web 面談详情抽屉 `?meeting=<id>`**（b7 #44 / #45 是整页，没有抽屉画板）。
8. **容器 A-R05-07**（app.html #26 メモ）的正文属于 R20b；本 Sprint 只保证容器部分（顶栏 + `.tseg` + 底栏）不退步。
9. ~~判断待ち 接上实体草稿后删除 `contacts/new/drafts`~~ → 由 §D-2 取代。

**复核后追加（§D-1～§D-12，取代上面冲突的条目）**

- **§D-1 面談「動かす」的画板**：b7 #41 画的是只选一个新时间；但面談改期按服务端规则必须走 `propose`（3–5 个候选）。执行者把 b7 #41 原地改为多候选选择（沿用 b3 #25–#29「面談の日程提案」的样式），画板注释写「主会话代定 §D-1（2026-10-18）」，门禁按改后的板比。
- **§D-2 草稿两类来源**：判断待ち 的草稿拆成 `entity_draft`（iOrbit 对话里的实体草稿卡，`shared/contract/orbit-ai.ts:69–84`，`pending_confirmation`；只读显示，点开进对应会话，E 线文件不改）和 `contact_draft`（名片 / 导入的联系人草稿，点开进现有 `contacts/new/drafts` 页）。**保留 `contacts/new/drafts` 页及其接口**（甲的加人、活动会后、门禁 A-R12-N08b 与测试在用）；「服务端丢弃」需求写进 REPORT「请求」给甲，不在本 Sprint 做。
- **§D-3 「動かす」分两种**：个人予定 → PATCH schedule-item；面談（appointment）→ 走 appointments `propose`（3–5 个候选，状态变 `reschedule_pending`），**保留服务端现有规则**，不新开「直接改时间」的命令。本机测试里外发 worker 用测试替身，不发真邮件 / 真邀请。
- **§D-4 Google カレンダー只读的最小实现**：新接口 `GET /api/calendar/external-events?from&to`（新契约，只加），服务端复用现有 integrations 的 token 与刷新（`listCalendarEvents`），**不落库**，只做内存短缓存（TTL ≤5 分钟，按账号 + 区间），走读预算闸门；provider 可注入测试替身；App 离线只显示连携状态，不缓存外部事件。
- **§D-5 `deferralCount` 的数据来源**：在任务更新路径只加不改：日期变晚时往该次活动的 `changes` 写 `previousPlannedDate` / `previousDueAt`，或另写一条 `rescheduled` 活动——二选一由执行者读代码后择优，REPORT 写理由。只数「用户把日期改晚」；历史数据（改动前已有的活动）一律记 0；lifecycle 任务不参与计数（字段不出现）。
- **§D-6 跟进任务的判定**统一用 `shared/compute/follow-up-task.ts`（B 线 R11a 已交，`8476eb8ad`；App 同步副本 `src/api/compute/follow-up-task.ts`），两端直接 import，不另写规则：`isOpenFollowUpTask(task: FollowUpTaskInput)`——普通 task `{ kind?: "task"; status; category?; relatedContactId?; deletedAt?; lifecycleState?; deleted? }`（`relatedContactId` 有值或 `category=relationship`，且 status ∈ `OPEN_PLAIN_TASK_STATUSES = ["open"]`、未删除）；lifecycle 任务 `{ kind: "lifecycle"; status; contactId?; connectionId?; … }`（**必须显式传 `kind: "lifecycle"`**，status ∈ `OPEN_LIFECYCLE_TASK_STATUSES = ["open","scheduled"]`）。另有 `followUpContactId(task)`、`contactIdsWithOpenFollowUps(tasks)` 可用。规则要改就写 REPORT「请求」给 B 线，不在本线改这个文件。
- **§D-7 件数口径**：只有フォロー要求 SQL 聚合件数（全量、准确）；其他来源用来源自带的 total，没有 total 的做有上限的读取（上限写成常量），超过上限时该块 `countsCapped` 标出（界面显示「n+」）。第二页按**单个来源**翻页：`section` + `source` + 该来源自己的游标。
- **§D-8 OAuth 回调落点**：`app/api/integrations/[provider]/callback/route.ts:131–132` 现在固定跳 `/app/agent/actions?integration=connected`（该页本 Sprint 删除）。改为白名单 `returnTo`（只允许 `calendar` → `/app/tasks?tab=calendar`、`settings` → 設定页；App 走同样的键），没有或不在白名单时默认 `/app/tasks?tab=calendar`。设定页的入口归 R18a，交接里通知。
- **§D-9 今日の一手 只读**：只调 `GET /api/agent/signals`（不调 `POST …?view=home` 之类会生成或改状态的接口）；计划今日机会读 `plans/v2/summary` 的 `todayChance`（`shared/contract/plan-v2.ts:151`），这次读取同样计入读预算；没有当前计划或「尚未实现」时这一来源记 `not_implemented`、不报错。
- **§D-10 「送りましたか？」没有对应任务时**：今日の一手 的条目不一定有 task；回答「はい」时有 task 就完成 task 并记 encounter，没有 task 就只记一次 encounter（不新建 task、不写 note）。
- **§D-11 旧参数映射**：App `/tasks?view=completed` → To-do タスク一覧的「完了」筛选；`scope=relationship`（含旧 `/followups`）→ To-do 并滚到フォロー块；其他 `scope` 落 To-do 顶部。Web `/app/tasks?view=completed` 同样映射。`parentForPath` 里 `agent` 从「iOrbit（`/ai`）」改指 To-do（`ai` 不变，两个 case 拆开）。
- **§D-12 「三份清单」的说法**：指 App 的三份旧屏允许清单（Ionicons、写死文字、旧写法）加 Web 的写死文字清单；本文件统一叫「旧屏允许清单」。

## 3. 交接条目（逐条写进 SC，REPORT 逐条写处理结果）

| 交接表 # | 去向 |
| --- | --- |
| R20-01 Task 左上 🔍 | 已由 R30 接全局搜索（`TaskScreen.tsx:116`）；SC-06 保证重写后仍在、行为不变 |
| R20-02 Web メモ「＋ メモを追加」 | → **R20b** |
| R20-03 四段内容（A-R05-04 / 05 / 07、W-R07-08 / 09 / 10） | カレンダー / To-do → SC-06～SC-12；メモ → R20b（代定 8） |
| R20-04 记住上次那一段 | SC-06 |
| R20-05「＋」聚焦、键盘弹出时底栏隐藏、断网保存 Toast（b12 #92–#95） | SC-06、SC-13 |
| R20-06 Web 右栏「次の一手 · Taskから」 | SC-06（读 `todo/page` 的 今日の一手） |
| R20-07 App メモ「＋」断网禁用 | 容器重写时保留这条规则（`TaskScreen.tsx:95`）；メモ本体 → R20b |
| R20-08 手入力「メモ」进 Task › メモ | → **R20b** |
| R20-09 `planLink`、类型详情「やること」 | → **R20b** |
| R20-10 面谈メモ `usedForPlan` | → **R20b** |
| R20-11 `contacts/new/drafts` | **保留**（代定 §D-2）：判断待ち 用 `contact_draft` 链接过去；服务端丢弃 → REPORT「请求」给甲；SC-07 |
| R20-12 判断待ち 接计划待确认、1日1問卡 | SC-04、SC-07（卡片引用甲的 `CompletionQuestionCard` / `TodayQuestionCard`，不改） |
| R20-13 `tasks.deferralCount` | SC-03；契约 5 `noteKind` / 活动提及 → **R20b** |
| R20-14 删除 `TodayScreen` | SC-14 |
| R20-15 A-R05-06（To-do 空态）、A-R05-08（横滑） | 空态 = A-R20-03（app.html #18），SC-15；横滑不截静态图，SC-06 用操作记录 |
| R20-16 `/app/tasks` 未登录跳转丢 `new=1`、`plan` | SC-14（`tasks/page.tsx:25–26`） |
| R20-17 旧页面控制台噪音 | SC-14（旧页面删除后复查两端控制台为零） |
| DEFERRED-A §2 R24-07（Task 1024 标题区多出「目標を追加」） | SC-06 删掉；SC-15 重跑 W-R24-01 1024（`web-plan-A.json`） |
| DEFERRED-A §2 R12-12（メモ @人 token） | → **R20b** |
| 通用口径 G01 G02 G03 G10–G22 G24 G26 | 写进各 SC 的做法（见 §6 易错边界）；G04 / G23 / G23b 属 A 线，用到的组件差异标「待组件库」；G05–G09 G25 → SC-15 |
| §R10 / §R19（契约消费方） | SC-04 的契约按它们的需要定（首页「今日やること」、小组件件数），REPORT 写用法 |

## 4. 已查清的事实（按 `75ace0f03`，开工按符号复核）

1. **App 容器**：`src/screens/task/TaskScreen.tsx:36–44` `TASK_SLOTS`：calendar = 旧 `ScheduleScreen`，todo = `TaskQuickAdd` + 旧 `TasksScreen`，plan = `PlanSegment`（甲），memo = `MemoSlot`（R20b）；引入在 :22–27；🔍 → `/search`（:116，R30 已接）；`add()`（:96–100）：calendar → `/schedule/personal/new`，memo → `/notes/new`，plan → `new=1`；メモ「＋」断网禁用 :95。分段与记忆：`view-models/app-navigation.ts`（`TASK_SEGMENTS`）、`view-models/shell-state.ts`（`initialTaskSegment` / `rememberTaskSegment`）；`openMainTab` 在 `components/shell-navigation.ts:36`，`parentForPath` 在 `app-navigation.ts:57`（`agent` 与 `ai` 同一个 case 指向 `/ai`，约 :99–101）。
2. **App 旧路由**：`app/today.tsx`、`app/tasks.tsx`、`app/(app)/schedule.tsx` 已是 `LegacyTaskRedirect`（跳转表 `app-navigation.ts:45–49`；`/tasks` 带 `scope` / `view`，`/followups` → `scope=relationship`）；`app/followups.tsx` → `FollowupsScreen`；`app/agent.tsx` → `AgentActionsScreen`；`app/agent/actions.tsx`、`app/contacts/all-actions.tsx` → `AllActionsAgentLedgerScreen`；`app/tasks/personal.tsx:5` 标题写死「待办」（中文出现在日文界面，カレンダー「中文文字」已证实的来源之一，其余可能来自演示 / 种子数据，SC-10 查清）；`TodayScreen` 除自身外只在 `src/data/offline-read/route-domain-inventory.ts` 出现。
3. **App 本机优先**：读 `screens/tasks/task-list-source{,.web,-mirror}.ts`、`screens/schedule/schedule-calendar-source{,.web,-mirror}.ts`、`personal-schedule-source*.ts`；写 `data/sync/task-outbox-{mutation,upload}.ts`、`schedule-outbox-*.ts`、`useOfflineTaskOutbox.ts`、`useOfflineScheduleOutbox.ts`；离线页副本表 `data/sync/page-copies.ts`（`relationship-tasks` :49、`today-page` / `today-summary` :51–52、`meeting-details` :54、`home-schedule` :56）；浏览器端只存 `web-mirror-storage.ts:18` `WEB_MIRROR_PAGE_COPY_IDS` 里的 id；页面离线清单 `docs/offline/page-inventory.md`，浏览器镜像威胁模型 `docs/phoneweb/local-mirror-threat-model.md`。`task` 在同步域里（`shared/contract/sync.ts:42`）。
4. **Web 容器与旧页面**：`orbit-2026/task/TaskContainer.tsx:68–69` プラン 段在 ≥1280 加「目標を追加」（b8 #6 / #16 只有「次の一手」→ R24-07 删）；`app/(app)/app/tasks/page.tsx:37–43` calendar = 旧 `PersonalScheduleWorkspace`（挂在 `data-orbit-real-page` 里），todo = 旧英文 `TasksPageContent` + `loadLifecycleTaskPages`；未登录跳转 :25–26 丢 `new` / `plan`（R20-16）。旧页面：`tasks/personal/page.tsx`、`tasks/[id]/page.tsx`、`tasks/relationship/[id]/page.tsx`、`agent/actions/page.tsx`（iOrbit 文件 `iorbit-0918/iorbit-*.tsx`、`orbit-product-href.ts`、`orbit-ask-routes.ts` 里有指向 `/app/agent/actions` 的链接，归其他线）。
5. **フォロー 读取失败（两端都失败）**：
   - App：`RelationshipLifecycleList.tsx` → `GET /api/relationship-tasks/page` → `handler.ts:22–27` 把所有错误统一改成 `SERVICE_UNAVAILABLE`「Follow-ups are temporarily unavailable」，**根因被吞掉** → `features/connections/lifecycle/task-page.ts`：`:57` 工作区不一致直接抛错、`:60` 读预算闸门 `assertAllowed({collectionName:'tasks'})`、`:34` 游标密钥不足 32 字节抛错、`:46` SQL 结果按 `.strict()` 解析、`:47` 排序运行时断言（ICU 排序规则版本）。
   - Web：`tasks/page.tsx` → `lifecycle-pages-route-service.ts:30–60` 同样 `catch {}` 吞错 → `features/followups/storage/lifecycle-task-pages.ts:301–306`（**没有**工作区检查）。
   - 两端共用 `LIFECYCLE_TASK_CLASSIFIED_CTES` / `LIFECYCLE_SORT_RUNTIME_CTE`（`lifecycle-task-pages.ts`）、同一套密钥回退（`ORBIT_READ_CURSOR_SECRET ?? AUTH_SECRET ?? NEXTAUTH_SECRET`）、`createConfiguredPostgresLiveRecordStore()`。⇒ 只有 App 有的工作区检查解释不了 Web 也失败；**优先查共用部分**（共用 CTE 的 SQL / 数据形状、排序运行时断言、密钥、本地 live 存储配置），再查读预算闸门和 strict 解析。
6. **契约现状**：`shared/contract/tasks.ts:37` `deferralCount?: number` 只在演示数据里有值（`demo-world/index.ts:86–88`、`fixtures.ts:405–410`），服务端没推导；任务活动有 `rescheduled` 类型（`features/tasks/contract.ts:59`，`task-record.ts:30`），但现有活动是否记下改动前的日期要开工核对（§D-5）；`shared/contract/today.ts`；`plan-v2.ts:678–705`（`PlanPendingKind` / `PlanPendingItem` / `PlanPendingListResponse`）、`plan-v2.ts:151` `todayChance`；`task-suggestion-page.ts`；`relationship-lifecycle.ts:28` `RelationshipTaskPageDTO`；`orbit-ai.ts:69–84` 实体草稿卡（kind `task|note|schedule|event|contact`，state 含 `pending_confirmation`）。
7. **契约登记**：`features/redesign-contracts/service-factory.ts:10–22` `REDESIGN_CONTRACT_CAPABILITIES`、:35 live 清单；`shared/services/capability-registry.ts:12` `CAPABILITY_IDS`（G18 的「capability-registry」）。
8. **Google カレンダー**：`features/integrations/contract.ts:2` `google_calendar`、:11–12 `calendar.read` / `calendar.write`、:27–34 scope；接口 `app/api/integrations/{route.ts,[provider]/{route,authorize,callback,health}/route.ts}`。**现在没有给界面用的外部日程读取接口或客户端**：服务端 `createOrbitIntegrationService().listCalendarEvents`（`features/integrations/service.ts:403`，token 刷新在 :218–240）只被 iOrbit 会前简报 workflow（`features/orbit-ai/workflows/pre-event-brief-candidate-source.ts:533`）调用。OAuth 回调固定跳 `/app/agent/actions?integration=connected`（`callback/route.ts:131–132`，§D-8）。
9. **面談**：`features/appointments/contract.ts:6` 状态含 `reschedule_pending`；`service.ts:287–290` `propose` / `counter` 命令规则（首次提案只能由草稿所有者提交等）；外发由 `outbox-worker.ts` 处理。
10. **现有接口**（D-12 来源）：`/api/today`、`/api/tasks/{page,[id],[id]/activities,history,generate,note-page}`、`/api/task-suggestions/{page,[id]/accept|dismiss|snooze}`、`/api/agent/actions/{route,[id]/accept|dismiss|view}`、`/api/agent/signals/{route,[id]}`、`/api/agent/ledger/{route,[id]/draft,[id]/transition}`、`/api/agent/plans/v2/pending/{route,[id]/accept|dismiss}`、`/api/agent/plans/v2/summary`、`/api/relationship-tasks/{route,page}`、`/api/schedule-items/{route,[id],[id]/meeting-details,association-options/*}`、`/api/appointments/{route,[id],[id]/commands,[id]/details,[id]/memo}`、`/api/integrations/[provider]/**`。
11. **旧屏允许清单**（G20，§D-12）：App `tests/fixtures/{ionicons-legacy-allowlist,hardcoded-copy-legacy-allowlist,legacy-ui-allowlist}.json`；Web `tests/fixtures/hardcoded-copy-legacy-allowlist.json`。
12. **已有门禁条目**：`views/app-R05.json` A-R05-04（app.html #16）/ 05（#17）/ 07（#26 メモ）；`views/web-R07.json` W-R07-Tcalendar / H / L（web.html #13）、W-R07-Ttodo / H / L（#14），H 区域 `84,0,996,90`、L 区域 `0,0,84,960`。
13. **被引用方（改动只加不改，删除前先确认引用归零）**：App `useOfflineTaskOutbox` ← `screens/home/HomeDashboardScreen.tsx`、`screens/ai/AiScreen.tsx`、`screens/profile/ProfileScreen.tsx`；`ScheduleScreen` ← `app/schedule/personal/new.tsx`、`app/schedule/personal/[id]/edit.tsx`；`MeetingDetailScreen`、`AgentLedgerScreen`、`AgentActionsScreen`、`TasksScreen`、`RelationshipLifecycleList`、`PendingTaskSuggestions`、`task-list-source`、`schedule-calendar-source`、`personal-schedule-source`、`TodayScreen` ← `src/data/offline-read/route-domain-inventory.ts`；`/api/today` 的 `today-summary` 副本被 iOrbit 页使用（`page-copies.ts:52`，保留）。Web `tasks/tasks-client.ts` ← `agent/agent-task-interaction-card.tsx`、`agent/agent-task-interaction-client.ts`（E 线）；`tasks/relationship-lifecycle-tasks.ts` ← `agent/home-facts-route-service.ts`（E 线 / R10）。
14. **文案现状**：App 已有域 `schedule`、`scheduleVm`、`schedulePreview`、`tasks`、`taskDetail`、`today`、`todayActions`、`todayVm`、`relationshipTasks`、`followupVm`、`meetingDetails`、`agentActions`；Web `orbit-2026/copy/` 没有 task 文件（`shell.ts` 里有 `taskAdd*`）。

## 5. 上下文包

- 决定：本文件 §2；README RD-16、RD-24～RD-33、通用规则 10–13；IMPLEMENTATION-PLAN §1.6、D-12 / D-12b、附录 D（e：面談候选 3–5 个、默认预选 3 个；k：旧路由收敛）。
- 交接：HANDOFF 通用口径、§R20、§R10、§R19；DEFERRED-A §2；`screen-ownership.md` Task 行。
- 画板清单：`docs/designs/redesign-2026-10/` 下 app.html、web.html、b3-daily-actions.html、b7-account-misc.html、b11-nav-v3.html、b12-missing-states.html（序号开工时用 `--list` 确认）。
- 代码：§4 列出的文件；R30 REPORT（🔍 接法）；R31a PLANNER §3–§4（组件新参数）。

## 6. 易错边界（全部写进对应 SC）

- **フォロー 不能只把错误藏起来**：修根因；`handler.ts` 与 `lifecycle-pages-route-service.ts` 的 catch 要在服务端日志里留下错误码（不记 PII、不记标题内容），界面仍显示通用的重试卡。
- **`todo/page` 只读**：不写任何来源、不调付费 AI、不生成建议，今日の一手 只走 `GET /api/agent/signals`（§D-9）；完成 / 延期 / 接受 / 拒绝都走各来源已有的写接口。某个来源失败或「尚未实现」时，只把那一块的那个来源标成不可用，其余照常（不能整页 503）。
- **件数**（§D-7）：フォロー 的 `counts.followups` / `counts.overdue` 用 SQL 聚合（全量，受读预算闸门约束，不读全量再在应用里过滤）；其他块用来源自带 total 或有上限读取 + `countsCapped`；条目只给第一页；R10 / R19 只读 `counts` 和前几条。
- **过期任务在フォロー**，带 `overdue: true`，排在最前，标红（`--coral-text`，G03），不进判断待ち（代定 2）。
- **跟进任务判定只有一处**（§D-6）：import `isOpenFollowUpTask`，把 lifecycle 任务交给它时显式带 `kind: "lifecycle"`；条目带 `kind: "task" | "lifecycle"`，去重只在同一 kind 内（按 `taskId`）。
- **只加不改**（规则 10、G18、G19）：响应 schema 不用 `.strict()`；决定「这条是什么」的 `source` 用 `knownValues`，未知值整条跳过；`status` 等展示类枚举用 `tolerantEnum` 并写明兜底值；请求参数严格。改 `TaskItemContract` 只加可选字段；被引用的 hook / 导出只加不改（事实 13）。
- **App 本机优先**：To-do / カレンダー 离线可打开；フォロー 里 `kind=task` 的条目以本机任务镜像为准，离线完成 / 延期写进 outbox 并立刻反映；**`kind=lifecycle` 条目离线时完成 / 延期按钮禁用**；其他块用离线页副本；副本跨过本地零点时整块标「以前の情報」；离线时不显示需要联网才能做的按钮（下書き生成、Google 连接、面談提案），用离线横条与 Toast（b3 #44 / #50、b12 #94–#95）；外部日历事件离线不显示，只显示连携状态（§D-4）。
- **下書き不发送**：所有草稿 `externalSendRequested:false`；只有复制和 mailto；「送りましたか？」状态存本机，24 小时后收起；「はい」的处理按 §D-10。
- **カレンダー**：个人予定「動かす」只 PATCH schedule-item；面談「動かす」走 `propose`（§D-3）；同步到 Google 仍需每次确认（`externalCalendarWritesEnabled`）；不做 iCloud、不做新的双向同步。
- **面談候选** 3–5 个，默认预选 3 个（附录 D e，和 `appointments` 接口一致）。
- **日程提案弹层**：两端各一个，路径与 props 固定（§7.6），先单独提交骨架（SC-11a）；Task 里有一个入口可以打开它（b3 #25 起点），面談「動かす」复用它的改期模式；有开发状态开关供门禁截图。
- **OAuth 回调**（§D-8）：只认白名单 `returnTo`，不把任意 URL 当跳转目标（防开放重定向），测试覆盖。
- **容器**：只换 calendar / todo 两段的组件和 `add()` 里自己的分支（G15）；分段用 `Segmented variant="tseg"`（G17）；打开一级页用 `openMainTab()`；新二级页在 `parentForPath` 写返回目标（含 §D-11 的 `agent` 改指向）；被盖住的一级页用 `TabPageBar`（G16）；Web 用 `ShellPage`（G10），`phoneFold` 保持（G11），390 无 🔍（G12），新弹层在旧页面上复查全局 `.btn` 漏入（G13）；外层 `Orbit2026Scope` + `ToastProvider`（G21）；链接不拼 `?lang=`（G22）；文字用 `UiText`（G24）；字号圆角用已有 token（G26）；次要说明 `--ink-3`（G02）。
- **旧屏重写 = 新文件 + 删旧文件**：不在旧屏上改颜色；旧路由保留跳转（不删地址），跳转表同步改成新地址，旧参数按 §D-11 映射。
- **不写死文字**：两端 `no-hardcoded-copy`；日文句末「。」、拉丁字母与日文之间半角空格（R03 规范），跑 `npm run copy:qa`。

## 7. 契约（本 Sprint 定稿，REPORT 交接给 R10 / R11 / R19）

### 7.1 `GET /api/todo/page`（只读聚合）

- **文件**：`shared/contract/todo-page.ts`（文件头写负责人「R20a · D 线」和使用方「To-do（两端）、R10 首页今日やること、R19 小组件」；注明**首页「予定」不在本契约里，R10 另读 `/api/schedule-items`**）、`shared/api-schema/todo-page.ts`（导出未强转的 `*Object` 和 `*Schema`）。
- **请求**：`date`（`YYYY-MM-DD`，可选，默认账户时区的今天）、`timeZone`（IANA，可选）；取某个来源的下一页时再带 `section`（`decisions` | `nextMoves` | `followups`）+ `source`（该块内的一个来源）+ `cursor`（该来源自己的游标，服务端包一层签名）、`limit`（1–50）。未知参数、`section` 与 `source` 不匹配、只给一部分翻页参数、游标被篡改，都返回 `VALIDATION_ERROR`。
- **响应**（不 `.strict()`）：

```ts
interface TodoPageContract {
  date: string; timeZone: string; asOf: string;
  counts: { decisions: number; nextMoves: number; followups: number; overdue: number };
  countsCapped: { decisions: boolean; nextMoves: boolean };   // followups 永远准确（SQL 聚合）
  decisions: TodoSection<TodoDecisionItem>;
  nextMoves: TodoSection<TodoNextMoveItem>;
  followups: TodoSection<TodoFollowupItem>;
  sources: Partial<Record<TodoSourceKey, "ok" | "unavailable" | "not_implemented">>;
}
interface TodoSection<T> {
  items: T[];
  next: Partial<Record<TodoSourceKey, string>>;   // 每个还有下一页的来源 → 签名游标（「すべて」页用）
}
type TodoSourceKey =
  | "task_suggestion" | "agent_action" | "plan_pending" | "entity_draft" | "contact_draft" | "completion_question"   // decisions
  | "agent_signal" | "plan_today_chance"                                                                             // nextMoves
  | "relationship_task" | "task";                                                                                    // followups
interface TodoItemBase {
  key: string;               // `${source}:${sourceId}`，跨端稳定，用作列表 key 和本机合并
  source: TodoSourceKey;     // knownValues：未知值整条跳过
  sourceId: string;
  titlePreview: string;
  contactId?: string; contactNamePreview?: string; eventId?: string;
  createdAt: string;
  sample?: true;
}
interface TodoDecisionItem extends TodoItemBase {
  reasonPreview?: string;
  actions: TodoDecisionAction[];          // "accept" | "dismiss" | "snooze" | "open"，knownValues
  conversationId?: string;                // entity_draft：点开进会话
}
interface TodoNextMoveItem extends TodoItemBase { reasonPreview?: string; draftAvailable: boolean; taskId?: string }
interface TodoFollowupItem extends TodoItemBase {
  kind: "task" | "lifecycle";             // tolerantEnum，兜底 "task"
  taskId: string;
  status: "open" | "scheduled";           // tolerantEnum，兜底 "open"
  dueAt?: string; overdue: boolean;
  deferralCount?: number;                 // 只有 kind=task 才有
}
```

- **来源与口径**（D-12、代定 2、§D-2、§D-6、§D-9）：判断待ち = 待处理任务建议 + agent actions（awaiting）+ `plans/v2/pending` + `entity_draft`（iOrbit 实体草稿卡 `pending_confirmation`，只读）+ `contact_draft`（联系人草稿，链到 `contacts/new/drafts`）+ 1日1問（今天未答时 1 条）；今日の一手 = `GET /api/agent/signals` + `plans/v2/summary.todayChance`；フォロー = 满足 `isOpenFollowUpTask` 的普通 task（`kind=task`）+ lifecycle 任务（`kind=lifecycle`），按「过期在前、再按期限」排序，同一 kind 内按 `taskId` 去重。`counts.overdue` 是フォロー里过期的条数。
- **第一页大小**：decisions 5、nextMoves 3、followups 20；有上限读取的上限另设（都写成常量，REPORT 写依据）。
- **实现**：`features/todo/`（直接调用各来源的服务端函数，不经 HTTP 自调）；读预算闸门覆盖所有读到的集合（含 `todayChance` 那次计划读取）；每个来源独立 try，失败记 `sources[key]="unavailable"` 并在服务端日志留错误码。
- **登记**：`REDESIGN_CONTRACT_CAPABILITIES` 加 `todo-page`，live 实现合入后进 live 清单；`capability-registry` 加对应条目；`mock-service.ts` 用 `shared/mock/demo-world/todo.ts`（人和事只从演示世界 `index.ts` 取，带 `sample: true`；条数照 app.html #17 / web.html #14 画板）；`handlers.ts` 加 `getTodoPage`；路由文件 `app/api/todo/page/route.ts` 只有 re-export 与 `dynamic`；测试按 HOW-TO §3 第 5 步全部补齐（`redesign-contract-routes` CASES、`redesign-schema-parity`、`demo-world-consistency`、App `contract-fixtures-parse`），最后 `node scripts/contract-snapshot.mjs --write`。
- **登录**：默认要登录（不进 `isPublicApiPath`）。

### 7.2 `deferralCount`（D-12b、§D-5）

任务更新路径只加不改：日期改晚时记下改动前的日期（`changes.previousPlannedDate` / `previousDueAt`，或另写一条 `rescheduled` 活动，二选一写 REPORT）；`deferralCount` = 记有「改晚」的活动条数；往前改、系统改期、历史活动都不算（历史记 0）；lifecycle 任务不出现这个字段。`/api/tasks/page`、`/api/tasks/[id]`、`todo/page` 的フォロー条目、同步域的任务 payload 都带上；App 本机延期时在镜像里 +1，同步后以服务端为准。第 2 次延期时显示提醒（b11 #35）。

### 7.3 App 离线页副本

- `src/data/sync/page-copies.ts` 追加 `{ id: "todo-page", endpoint: "/api/todo/page", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account" }`（描述写清只存第一页、不含外部日历）。
- 同步登记：`web-mirror-storage.ts` 的 `WEB_MIRROR_PAGE_COPY_IDS` 追加 `todo-page`；`shared/api-schema/offline-policy.ts` 与 App 副本；`src/data/offline-read/route-domain-inventory.ts`；`npx tsx scripts/page-offline-inventory.ts --write` 重新生成 `docs/offline/page-inventory.md`；`docs/phoneweb/local-mirror-threat-model.md` 补一行（新副本存了哪些字段、只存预览文字）。
- 读取顺序：本机任务镜像（フォロー 的 `kind=task`）→ 页副本（其余）→ 联网结果覆盖。显示副本时间；副本的 `date` 不是本地今天时整块标「以前の情報」。

### 7.4 `GET /api/calendar/external-events`（§D-4）

- **文件**：`shared/contract/calendar-external-events.ts`、`shared/api-schema/calendar-external-events.ts`；实现 `features/calendar-external/`；路由 `app/api/calendar/external-events/route.ts`。
- **请求**：`from`、`to`（ISO 时间，区间 ≤ 42 天），严格校验。
- **响应**（不 `.strict()`）：`{ connection: "connected" | "not_connected" | "needs_reconnect" | "unavailable"（tolerantEnum，兜底 "unavailable"）; provider: "google_calendar"; events: { id; titlePreview; startsAt; endsAt?; allDay: boolean; locationPreview? }[]; asOf }`。
- **实现**：复用 `listCalendarEvents`（token 与刷新照旧）；不落库；按「账号 + 区间」内存缓存 ≤5 分钟；读预算闸门；provider 通过参数注入，测试用替身；没连接 / 失效时 200 + 对应 `connection`，不报错。
- 登记与测试同 §7.1（capability、schema parity、snapshot、`sync:contract`）；App **不**进离线页副本。

### 7.5 其他只加不改

- `appointments` / schedule-item 需要的字段（例如面談 `cancelReason`、候选的 `tentative`）只加可选字段；没有画板对应的字段不加。
- 两端 `todo/page` 读取 hook 导出给 R10 / R19，REPORT 写签名和用法。

### 7.6 日程提案组件（§D-1、代定 6；SC-11a 先交骨架）

- **App**：`repos/orbit-app/src/screens/calendar/MeetingProposalSheet.tsx`，导出 `MeetingProposalSheet` 与 `MeetingProposalSheetProps`。
- **Web**：`repos/orbits/app/(app)/app/orbit-2026/calendar/MeetingProposalModal.tsx`，导出 `MeetingProposalModal` 与 `MeetingProposalModalProps`。
- **props（两端同形）**：

```ts
interface MeetingProposalProps {
  open: boolean;
  contactId: string;
  onClose: () => void;
  onSent?: (appointmentId: string) => void;
  /** 改期模式（面談「動かす」，§D-3）：传已有面談 id，提交走 propose 并变 reschedule_pending。 */
  appointmentId?: string;
  /** 预选候选；缺省时组件自己按空闲时间预选 3 个。 */
  initialCandidates?: readonly { startsAt: string; endsAt: string }[];
}
```

- **骨架**（SC-11a）：文件、导出、props 类型、空的三步结构（候補を選ぶ → 形式と場所 → 送る前の確認）与渲染测试先单独提交；之后只加不改 props。

## 8. 旧屏替换与删除（screen-ownership Task 行，跳转保留）

| 旧（两端） | 新 | 处理 |
| --- | --- | --- |
| App `/today`、`/tasks`、`/(app)/schedule` | `/task?seg=todo` / `seg=calendar` | 跳转保留，旧参数按 §D-11 映射；`TodayScreen.tsx` 删除（R20-14） |
| App `/tasks/[id]`、`/tasks/relationship/[id]`、`/followups` | To-do 详情 / フォロー详情（b3 #17、#20） | 重写；`/followups` 改跳 To-do フォロー块，旧屏文件删除 |
| App `/agent`、`/agent/actions`、`/contacts/all-actions` | 判断待ち 一覧（「すべて」页） | 并入；路由改跳转（`entry` 参数映射到对应条目）；`parentForPath` 的 `agent` 改指 To-do（§D-11）；`AgentActionsScreen` / `AgentLedgerScreen` 删除前确认引用归零（事实 13，只剩 `route-domain-inventory.ts` 时同步删那几行） |
| App `/schedule/personal/new`、`/[id]`、`/[id]/edit`、`/schedule/events/[id]`、`/tasks/personal` | カレンダー 予定 新建 / 详情 / 编辑（b3 #34–#36）、活动预览 | 重写；`/tasks/personal` 改跳 `/task?seg=calendar` |
| App `/schedule/meetings/[id]` | 面談の詳細（b7 #40–#43） | 重写 |
| Web `/app/tasks`（todo / calendar 段）、`/app/tasks/[id]`、`/app/tasks/relationship/[id]`、`/app/agent/actions` | Task › To-do / 详情抽屉 / 判断待ち | 重写；旧地址跳到 `/app/tasks?tab=todo`（带能定位到条目的参数，`view=completed` 按 §D-11）；旧英文组件删除（`tasks-client.ts` 等有外部引用的保留导出） |
| Web `/app/tasks/personal` | Task › カレンダー | 跳到 `/app/tasks?tab=calendar` |
| Web OAuth 回调落点 `/app/agent/actions?integration=connected` | 白名单 `returnTo`，默认 `/app/tasks?tab=calendar` | §D-8 |
| **App / Web `contacts/new/drafts` 页及其接口** | — | **不删**（§D-2）：判断待ち 的 `contact_draft` 链接过去；服务端丢弃 → REPORT「请求」给甲 |

每个跳转加路由测试；跳转表在两端各一处（App `app-navigation.ts`，Web 页面里的 `redirect`）。删除旧屏后：旧屏允许清单删对应行（G20、§D-12）、旧组件使用点归零就删文件、HOW-TO §7 两端路由登记与审计计数同步（新增 / 删除的 App 路由、`integratedFeatureRoutes`、`page-offline-inventory`、`route-parity`、Web `audit:full-product` / `audit:surfaces`）。

## 9. 像素 SC 与预检（HOW-TO §8、规则 11 / 13、RD-16 / RD-26 / RD-29）

- **顺序**：画板预检在开工时跑（它决定契约字段）：`node scripts/visual/board-preflight.mjs --suite scripts/visual/views/<端>-R20a.json --md docs/designs/redesign-2026-10/sprints/R20a-task-todo-calendar/preflight-checklist.md`，五项结论写进 `preflight-checklist.md`；画了但没有数据来源 / 功能的元素按 §0 第 5 条记「待主会话代定」。**像素门禁在 R31a / R31b 合入之后才跑**（§0 第 6 条）。
- **判定**：两端按决定表 §20 / RD-29：超阈值带全部归因为 `[data]` / `[raster]` / `[contrast]` 即通过；提交 `attribution-redesign-R20a.json`；每个画面最多 3 轮；被组件卡住的标「待组件库」。设计稿示例 fixture 放 `shared/mock/demo-world/todo.ts`，只补数据。中途状态（sheet 展开、Toast、确认框、横滑中）用只在开发包 / 开发环境生效的状态开关（`design=` / `open-path`，RD-28），测试保证正式构建里没有。
- **宽度与主题**：Web 只有 1440 画板（下表），浅色；标「深」的另跑深色画板。Web 1024 / 390、无深色画板的 App 画面、カレンダー 週視图、Web 面談详情抽屉按代定 7 处理（附截图，不进门禁）。
- **画面清单**：

| 画面 id | 画板（文件 #序号 · 标题） | 端 / 主题 |
| --- | --- | --- |
| A-R20-01 / 02 / 03 | app.html #16 カレンダー、#17 To-do、#18 To-do 空（= A-R05-04 / 05 / 06） | App 浅 |
| A-R20-04～07 | b3 #0 今日の一手、#1 下書きエディタ、#2 送りましたか、#3 はい → Toast；#47 下書きエディタ（深） | App 浅（#47 深） |
| A-R20-08～10 | b3 #6 判断待ち 左スワイプ、#7 ひとこと記録、#8 Toast | App 浅 |
| A-R20-11～13 | b3 #11 / #12 / #13 タスク 空 / 少 / 大；#48 タスク大量（深） | App 浅（#48 深） |
| A-R20-14 / 15 | b3 #17 タスク詳細、#18 削除の確認 | App 浅 |
| A-R20-16～19 | b3 #20 フォロー詳細、#21 今回やったこと、#22 次のステップ、#23 完了 → Toast | App 浅 |
| A-R20-20～22 | b3 #25 候補を選ぶ（週）、#26 形式と場所、#27 送る前の確認 | App 浅 |
| A-R20-23～26 | b3 #30 / #31 / #32 カレンダー 月 空 / 少 / 大、#33 日；#49 月大量（深） | App 浅（#49 深） |
| A-R20-27～29 | b3 #34 個人の予定を編集、#35 繰り返し（sheet）、#36 重複の警告 | App 浅 |
| A-R20-30～32 | b3 #43 読み込み失敗、#44 オフライン、#45 AI 利用不可（下書き）；#50 Toast + オフライン（深） | App 浅（#50 深） |
| A-R20-33～36 | b7 #40 面談の詳細、#41 動かす（**按 §D-1 改后的板**）、#42 キャンセル、#43 面談を編集 | App 浅 |
| A-R20-37～40 | b11 #33 左右スワイプで切替、#34 To-do を完了、#35 To-do を延期、#38 二級ページ → 戻る | App 浅 |
| A-R20-41 / 42 | b12 #92 / #93 A-R05-13（「＋」聚焦、键盘弹出底栏隐藏）、#94 / #95 A-R05-13b（断网保存 Toast） | App 浅 / 深 |
| W-R20-01 / 02 | web.html #13 カレンダー、#14 To-do（另重跑 W-R07-TcalendarH / L、W-R07-TtodoH / L） | Web 1440 |
| W-R20-03 / 04 | b3 #4 下書き（右側ドロワー）、#5 送りましたか → はい | Web 1440 |
| W-R20-05 / 06 | b3 #9 ホバー → 完了 → ひとことポップオーバー、#10 Toast（右下） | Web 1440 |
| W-R20-07～09 | b3 #14 / #15 / #16 タスク 空 / 少 / 大；#51 タスク大量（深） | Web 1440（#51 深） |
| W-R20-10 / 11 | b3 #19 削除の確認、#24 フォロー完了（2 列モーダル） | Web 1440 |
| W-R20-12 / 13 | b3 #28 日程提案（モーダル）、#29 送る前の確認（组件用开发路由 / 状态开关打开） | Web 1440 |
| W-R20-14～17 | b3 #37 / #38 / #39 カレンダー 月 空 / 少 / 大、#40 日；#52 月大量（深） | Web 1440（#52 深） |
| W-R20-18 / 19 | b3 #41 予定を追加（重複あり）、#46 エラー + AI 利用不可 | Web 1440 |
| W-R20-20 / 21 | b7 #44 面談の詳細 + 動かす（動かす部分按 §D-1）、#45 キャンセル | Web 1440 |
| W-R20-22 | b11 #39 To-do · Web（ホバー操作 + キーボード） | Web 1440 |

- **不进本 Sprint 门禁**：web.html #15（作废）、b8 #8（作废）、b3 #42（R27）、b4 / b10（プラン，甲）、b12 #30 / #31 / #66 / #67（组件，A 线）、b12 #86 / #88（R10）、app.html #26 / web.html #19 / b11 #36（メモ，R20b）、b11 #37（プラン）。
- **重跑（不退步）**：`views/app-R05.json` 全部（含 A-R05-07 容器部分）、`views/web-R07.json` 的 Task 条目、`views/web-plan-A.json` 的 W-R24-01 1024（R24-07）。

## 10. 范围与文件

- **改 / 新建 / 删除**：见 §1、§7、§8。
- **测试**：フォロー 回归测试（两端路径各一条，能在修复前 RED）；`features/todo` 单测（来源合并、kind 内去重、排序、过期、件数与 `countsCapped`、某来源失败时降级、单来源翻页、游标签名与篡改）；`deferralCount` 推导单测（改晚 / 往前 / 系统改 / 历史数据 / lifecycle）；`calendar-external` 单测（缓存 TTL、未连接 / 失效、替身 provider、区间校验）；OAuth `returnTo` 白名单测试；面談改期走 `propose` 的服务测试（外发 worker 替身）；本机 PG 路由测试（`orbit_line_d`，记录读到的行数 / 字节）；契约检查与 schema parity；App 离线副本、跨零点「以前の情報」、lifecycle 离线按钮禁用、本机合并测试；两端新屏真实渲染测试（To-do 三块、空态、错误 / 离线 / AI 不可用、延期第 2 次提醒、日程提案候选 3–5、重复规则、重叠提醒、面談 動かす / キャンセル）；跳转与旧参数映射测试；开发状态开关不进正式构建的测试；允许清单 ratchet。
- **不做**：メモ（R20b）；プラン 段内部（甲）；组件库与 token（A 线）；联系人详情挂载日程提案入口（R11）；`contacts/new/drafts` 的删除与服务端丢弃（甲）；Google 以外的日历、双向同步、外部事件落库；首页 / 小组件本体（R10 / R19）；设定页的连携入口（R18a）。

## 11. 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R20a-01 开工与边界 | 用 / 建 `orbit_line_d`、复制环境文件、端口 3500 / 8085、`.next-line-d`、模拟器 `Orbit Line D`（记 UDID）；`pull --rebase` 后确认能 import `follow-up-task.ts`（§D-6）；两端基线全量记录；`board-preflight` 跑完并写 `preflight-checklist.md`；画面清单写成 `views/{web,app}-R20a.json` | 基线摘要、`preflight-checklist.md` |
| SC-R20a-02 フォロー 修复（第一步） | 在 `orbit_line_d` 造有跟进任务的账号，复现两端失败并记录服务端错误码；写出根因（REPORT「フォロー 根因」：哪一行、为什么两端都失败）；先写 RED 回归测试再修；两端 catch 留错误码日志；修好后 App 与 Web `/app/tasks` 都能列出跟进任务；改到 B 线文件的写交接 | 回归测试 RED → GREEN、两端截图、日志 |
| SC-R20a-03 `deferralCount` | 用户把期限改晚 2 次 → `deferralCount=2`；往前改、系统改期不加；改动前的历史任务为 0；lifecycle 任务没有该字段；任务页 / 详情 / 同步 payload / `todo/page` 一致；App 离线延期后本机 +1，同步后与服务端一致 | 单测 + 本机 PG 测试 + App 测试 |
| SC-R20a-04 `GET /api/todo/page` | mock 模式返回演示世界 To-do（条数照画板）；live 在 `orbit_line_d` 上三块与件数正确：フォロー 件数是 SQL 聚合、其他块超上限时 `countsCapped=true`；过期留在フォロー并 `overdue:true`；`entity_draft` 点开进会话、`contact_draft` 进草稿页；同 kind 内去重；让一个来源抛错 → 只有该来源 `unavailable`，页面 200；`section`+`source`+`cursor` 取单来源下一页、篡改游标 400；读预算闸门生效；`contract-snapshot`、schema parity、`sync:contract` 同提交；capability 两处登记 | 路由测试、PG 测试输出、契约检查 |
| SC-R20a-05 App 离线与本机优先 | 联网打开 To-do → 飞行模式重开：三块显示副本内容与时间；跨本地零点后整块标「以前の情報」；本机完成 / 延期一条 `kind=task` 的フォロー 立即反映并进 outbox，恢复联网后上传、刷新后一致；`kind=lifecycle` 条目离线时按钮禁用；カレンダー 离线可看月 / 週 / 日（外部事件不显示，只显示连携状态）、离线新建予定进 outbox；离线页副本的四处登记（§7.3）齐全 | App 测试 + 模拟器操作记录 + `page-inventory.md` diff |
| SC-R20a-06 Task 容器两端 | 分段点按 / 左右滑（App）/ ←→ 键（Web）切换，重开记住上次（R20-04）；进二级页再返回，恢复分段与滚动位置（b11 #38）；「＋」按段：カレンダー → 新建予定、To-do → 添加框聚焦、键盘弹出时底栏隐藏、断网保存 Toast（R20-05）；🔍 仍进全局搜索（R20-01）；Web 1024 プラン 段无「目標を追加」（R24-07）；Web 右栏「次の一手 · Taskから」接 今日の一手（R20-06）；`plan` / `memo` 段行为不变 | 渲染测试 + 两端操作记录 |
| SC-R20a-07 判断待ち | 六类来源都能出现（演示 + 本机库）；接受 / 拒绝 / 稍后调各自来源的写接口，成功后条目消失、件数减 1；`entity_draft` 只读、点开进对应会话；`contact_draft` 进 `contacts/new/drafts`（页面保留）；App 左滑「完了」→ ひとこと（可空）→ Toast；Web 行悬停 → 完了 → ひとことポップオーバー → 右下 Toast；1日1問卡引用甲的组件；「すべて」按来源翻下一页；REPORT「请求」写给甲的服务端丢弃需求 | 渲染测试 + 操作记录 |
| SC-R20a-08 今日の一手 · 下書き · 送りましたか | 今日の一手 只读 `GET signals` + `todayChance`（无计划时不报错）；卡片点开下書きエディタ（语气切换、書き直す、依据、复制 / mailto，不发送）；离开再回来出现「送りましたか？」，24 小时后不再出现；「はい」按 §D-10（有 task：完成 + encounter；无 task：只记 encounter）+ Toast；AI 不可用时显示 b3 #45 / #46 状态、手写仍可用；付费 AI 只在必须时调用并记次数 | 渲染测试 + 操作记录 + AI 调用记录 |
| SC-R20a-09 フォロー · タスク | フォロー 详情 → 今回やったこと → 次のステップ → 完了 Toast（App 四步、Web 2 列モーダル）；延期 sheet、第 2 次延期提醒；タスク一覧（空 / 少 / 大，含「完了」筛选 = 旧 `view=completed`）、详情、删除确认后消失；过期行标红排前 | 渲染测试 + 操作记录 |
| SC-R20a-10 カレンダー | 月 / 週 / 日切换与日期跳转；新建 / 编辑个人予定、繰り返し sheet（规则保存后月视图正确展开）、时间重叠提示（App 警告、Web 添加时提示）；个人予定「動かす」只 PATCH schedule-item；日文界面没有中文文字（含 `tasks/personal.tsx:5`「待办」与演示 / 种子数据，REPORT 写查到的来源） | 渲染测试 + 操作记录 + 文本搜索 |
| SC-R20a-11a 日程提案组件骨架（里程碑） | 两端按 §7.6 的路径、导出名、props 建好骨架与渲染测试，单独提交；当轮摘要写提交号 | 提交 + 测试 |
| SC-R20a-11 面談 | 日程提案：选 3–5 个候选（默认预选 3）→ 形式と場所 → 送る前の確認 → 调 `appointments` propose；面談の詳細、「動かす」= 同组件改期模式走 `propose`（状态 `reschedule_pending`，服务端规则不变，b7 #41 已按 §D-1 改板）、キャンセル（确认后状态变化）、編集；外发 worker 用替身；R11 挂载用法写进 REPORT | 渲染测试 + 服务测试 + 操作记录 |
| SC-R20a-12 Google カレンダー | `GET /api/calendar/external-events`：未连接 → `not_connected`，界面显示状态与「連携する」→ `integrations/google_calendar/authorize`；回调按白名单 `returnTo` 回到カレンダー（非白名单值落默认、不跳外站）；已连接（替身 provider）→ 日 / 週 / 月显示只读外部予定，和 Orbit 予定区分；5 分钟内重复请求命中缓存、不落库；token 失效 → `needs_reconnect` 提示重新连接；读预算闸门生效；不写外部、不做 iCloud；交接通知 R18a 设定页的 `returnTo=settings` | 服务测试 + 路由测试 + 渲染测试 + 操作记录 |
| SC-R20a-13 错误 · 离线 · 未实现 | 两端 読み込み失敗（区块重试卡）、オフライン、AI 利用不可、Toast + オフライン；`todo/page` 在 live 是「尚未实现」时整块隐藏、不报错（G18） | 渲染测试 + 截图 |
| SC-R20a-14 旧屏替换与删除 | §8 每行都做完（「不删」行保持原样）：新屏上线、旧文件删除、跳转与旧参数映射测试通过；`parentForPath` 的 `agent` 改指 To-do；`TodayScreen` 已删（R20-14）；`/app/tasks` 未登录跳转保留 `new` / `plan`（R20-16）；两端控制台无旧页面噪音（R20-17）；旧屏允许清单删行、ratchet 通过；HOW-TO §7 两端登记与审计计数更新；被引用方（事实 13）都还能编译、测试通过；E 线文件里的旧链接列表写进交接 | 测试 + 文本搜索为零 + 控制台记录 |
| SC-R20a-15 像素与不退步（R31a / R31b 合入后） | §9 画面清单每个画面 × 主题过门禁；被组件卡住的标「待组件库」并写进「交接表追加」；`app-R05.json`、`web-R07.json` Task 条目、W-R24-01 1024 重跑通过；代定 7 的画面附截图 | 门禁总表（raw、带数、归因路径）、`compare.html` |
| SC-R20a-16 全量与复核 | 两端全量对照基线零新增失败（orbits 带 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`）；orbits `typecheck` / `typecheck:app` / `lint` / `copy:qa`、App `npx tsc --noEmit` 通过；REPORT 写「越线自查」（`git diff --stat origin/redesign...HEAD` 逐文件对照 §1）；独立复核**自己重跑**测试与门禁 | 全量摘要、REPORT、REVIEW |

## 12. 执行顺序（可并行的步骤已注明，worker 之间文件不重叠）

1. SC-01 开工（环境、基线、画板预检、画面清单）。
2. **SC-02 フォロー 修复**（先于一切 UI 工作；修好提交一次）。**并行**：SC-11a 组件骨架（只碰 §7.6 两个新文件），做完单独提交。
3. 数据层，测试先行：SC-03 `deferralCount` → SC-04 `todo/page`（契约 → mock → live → 登记）与 §7.4 外部日程接口（可另一 worker 并行，文件不重叠）→ 一次 `contract:` 提交并同步 App → SC-05 App 离线副本与本机合并。
4. SC-06 容器（含 R24-07）。
5. To-do：SC-07 判断待ち → SC-08 今日の一手 / 下書き → SC-09 フォロー / タスク。**并行**：カレンダー：SC-10 → SC-11 面談（含 b7 #41 改板）→ SC-12 Google 读取与回调。
6. SC-13 错误 / 离线 / 未实现状态补齐；SC-14 旧屏删除、跳转、登记、允许清单。
7. 全量测试一轮（不含像素），写 REPORT 草稿，回复摘要。
8. 检查 `origin/redesign` 是否已合入 R31a / R31b：已合入 → SC-15 像素收口；未合入 → REPORT 写「等组件库」并结束本轮（§0 第 6 条）。
9. SC-16 全量、REPORT 定稿，回复摘要；独立复核由主会话另起。

## 13. 失败与交接

- 需要产品取舍：按 §0 第 5 条跳过并写进「待主会话代定」，不阻塞其他 SC。可能出现的：现有活动无法区分用户 / 系统改期（§D-5）；画板元素没有数据来源（预检第 2 项）。
- REPORT「请求」必须写：给甲的 `contacts/new/drafts` 服务端丢弃需求（§D-2）；要改「不许碰」文件的其他请求。
- REPORT「交接」必须写：`todo/page` 的字段口径、第一页大小、上限与 `countsCapped`（给 R10 / R19；首页「予定」另读 `schedule-items`）；两端 `todo/page` 读取 hook 与日程提案组件（§7.6）的用法（给 R11 / R10）；外部日程接口用法与 `returnTo=settings`（给 R18a）；改到 B 线文件的说明；E 线文件里的旧链接；「待组件库」与「设计稿无」清单；给主会话的「文档更新请求」（HANDOFF §R20 各行状态、DEFERRED-A R24-07、`screen-ownership.md` Task 行、README 登记表、决定表登记 §D-1～§D-12）。
