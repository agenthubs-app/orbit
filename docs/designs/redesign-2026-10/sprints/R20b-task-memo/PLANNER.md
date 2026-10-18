# Sprint R20b — Task › メモ

**Plan revision:** 2（2026-10-18；主会话代定见 §2，RD-33）。**模式:** existing-codebase / single-generator；执行者是 Codex 主开发会话，D 线 `redesign-d` / `line-d`。

**单一目标:** R20a 收口后，把两端 メモ 的读写、提及、计划开关、Web 新页和 App 四旧屏替换接成一条可验证的链；`planLink` 真正落库；把 b5 E3 的 AI 整理留下一期。

**易读目标:** [GOAL.md](GOAL.md)。**编制基线:** `origin/redesign a37d0f551`（2026-10-18；代码事实一律取 `git show origin/redesign:<path>`）。编制时 R20a REPORT 仍写「進行中」，只有 SC-02、SC-11a、SC-12 前提的部分结果，不能把 R20a 当作已完成。

**进入条件:** 主会话确认 R20a 的实现、REPORT、复核已收口且进入 D 线基线；R31a / R31b 的实际组件导出已进入 `origin/redesign` 后才做像素收口。开始时重定位所有 §4 行号。

**提交方式（执行者）:** D 线按路径小步提交，绝不推送；主会话独立复核后才推 `redesign`。本次文档编写只创建本目录 GOAL / PLANNER，不执行 Sprint。

---

## 0. 给 Codex 的执行说明

1. 你是 D 线主开发会话。工作目录只用 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-d`（`line-d`）；开工 `git pull --rebase origin redesign`，确认干净并核对 R20a / R31a / R31b 的提交。主会话通过 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/talk-codex.sh` 通信。每轮最后一条回复给主会话：SC、提交号、测试通过／失败数与失败名、像素状态、请求和下一步。在线内并行 worker 只领互不重叠的文件。
2. 阅读：本文件与 GOAL → [README](../README.md) RD-16、RD-24～RD-33、通用规则 10–13 → [HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–§10 → [HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) 通用 G01–G26、R20 全节、R12-12、R07 遗留 → [DEFERRED-A](../DEFERRED-A.md) §2 R12-12 → [screen-ownership](../screen-ownership.md) Task 行 → [决定表](../maintenance/2026-10-12-decisions.md) D27 / D52、§5、§20 → [IMPLEMENTATION-PLAN](../../IMPLEMENTATION-PLAN.md) §1.6 / D-14 / 附录 D-k → R20a PLANNER / REPORT；两端 AGENTS 与视觉工具 README。RD-32 取代旧 GitNexus 步骤，不跑 GitNexus。
3. 开工记录两端全量和类型检查基线。R20a 编制时的 Web 31 / App 4 个失败只是当时快照（R20a REPORT 开头），不能当 R20b 的允许失败；新失败先诊断、修复并逐条对照。测试先 RED，真实渲染与本机回环库覆盖行为；Python 命令必须在 uv 环境里跑。
4. 只改 §1 的 D 线文件。修改 `shared/**` 源后在 App 跑 `npm run sync:contract` 并同一提交带副本；`NoteMentionContract.contactId` 必须先在 `BREAKING.md` 登记，再更新快照。每次提交前 `pull --rebase`，用 `git commit -m "…" -- <本次路径…>`，核对 `git show --stat HEAD`；不 `git add -A`、不推送。
5. 缺画板或矛盾先用 §2 已列的代定。新发现的选择写 REPORT「待主会话代定」（选项、推荐、影响 SC），跳过该项继续独立项；不直接问用户。需要别线文件写 REPORT「请求」并发主会话，等归属方接线，不能越线。
6. REPORT 写 `R20b-task-memo/REPORT.md`；预检写同目录 `preflight-checklist.md`；证据在 `~/orbit-sprint-evidence/redesign/R20b/run-01/`。REPORT 逐条回填 §3 交接表、SC、门禁 raw／带数／归因路径、基线与收口、越线自查、请求、待主会话代定、待用户授权、文档更新请求。README / HANDOFF / DEFERRED-A / 决定表 / screen-ownership 由主会话更新；本线只给四栏原文。
7. 不连 Neon、生产库、真实外部账号，不部署，不改生产环境变量，不发 TestFlight。需要这些的项写「待用户授权」。每屏至多 3 轮像素返工；组件阻塞或设计稿无时登记并继续，不能假报通过。付费 AI 仅 C11 判定确需真调用时按 RD-33 在本机用既有 key，REPORT 记次数与 token；E3 整理绝不调用。

## 1. 本线归属的文件 / 不许碰的文件

**D 线本 Sprint 可改、新建、删除：**

- App：`app/notes/{index,new,[id],[id]/edit}.tsx` 四个路由文件保留为新屏或兼容跳转；`src/screens/notes/**` 只删除 `NotesScreen.tsx`、`NewNoteScreen.tsx`、`NoteDetailScreen.tsx`、`EditNoteScreen.tsx` 四个旧屏实现，保留 `notes-source*` 与 `NoteSourceTasks` 行为；建 `src/screens/memo/**`；`src/screens/task/TaskScreen.tsx` 只改 `memo` slot 和 `memo` 的「＋」分支；`src/view-models/notes.ts`、`src/view-models/notes-mirror.ts`、`src/data/sync/note-*.ts`、`src/storage/note-draft-storage.ts`、笔记 API 读取／outbox 与新文案 `src/i18n/{ja,zh,en}/notes.ts`。按需改 D 线的 App 路由登记、允许清单中自己的行。
- Web：`app/(app)/app/orbit-2026/task/TaskContainer.tsx` 的 `memo` slot / 「＋」；`app/(app)/app/tasks/page.tsx` 只接 memo prop，不能动计划槽；新建 `orbit-2026/memo/**`（CSS Modules）、`orbit-2026/copy/memo.ts`；新页相关测试、路由／审计登记。
- Web/API：`features/notes/**`、`app/api/notes/**`、`shared/contract/notes.ts`、`shared/contract/BREAKING.md`、`shared/api-schema/offline-mutations.ts` 及 App `src/api/{schema,contract}/offline-mutations.ts` 同步副本、笔记演示 fixture / mock；`features/sync/domain-registry.ts` 只改 notes / tasks 行（`noteKind`、`usedForPlan`、`planLink`）；`features/tasks/{contract,service,task-record,repository}.ts`、`app/api/tasks/**` 和任务读模型中只加 `planLink` 的可选写读链；共享任务契约现有字段不改。新字段涉及的快照、schema parity 和相关测试。
- App 手入力独占窗口：D 线本 Sprint 独占改 `src/screens/add/ManualContactScreen.tsx`、`src/screens/add/manual-model.ts`，按 RD-30 在交接表通知甲；R11a 在窗口内不碰这两个文件。仅做保存联系人后转 Task › メモ 的接线及相应测试。
- 门禁与证据：新建 `scripts/visual/views/{app,web}-R20b.json`、`scripts/visual/attribution-redesign-R20b.json`；本 Sprint 的 `preflight-checklist.md` / `REPORT.md`。

**不许碰；要改则给主会话「请求」：**

- A 线：App `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`、视觉比对工具。缺组件列出 kit 结构、两端 props 和画板，给 R31a / R31b；页面不用自制同类件。
- 甲名下的联系人与加人：除上述独占两文件外的 `src/screens/add/**`、`features/contacts/**`、联系人详情；R12-12 A-R12-16 重比交给该画面归属方，D 线提供 token 证据。
- 计划与 E 线：`features/plans/**`、两端人物タイプ詳細 UI、`app/(app)/app/tasks/plan-slot.tsx`、iOrbit 页面／写入入口。R20b 只接 R24 已有钩子并提供 `planLink` 读写，类型详情显示和 iOrbit「プランに追加」由各归属方接，联验才算 R20-09 完成。
- R20a 仍进行中的 To-do / カレンダー、其他线的汇总文档、其他线的画板。只在 R20a 收口后改共享 Task 容器。画板里 E3 的 AI 整理部分需主会话统一改稿；本 Sprint 不自行编辑 b5。

**环境：** 继承 R20a 的 D 线隔离：Web 3500、`ORBIT_NEXT_DIST_DIR=.next-line-d`，Metro 8085，本机库 `orbit_line_d`、模拟器 `Orbit Line D`（按 UDID）；视觉设计稿静态服务另用 3340 以上端口，跑完停服。只用回环库。

## 2. 主会话代定（RD-33；用户可逐条推翻）

| # | 推荐口径 | 依据与后果 |
| --- | --- | --- |
| D-1 | 分类 tabs 固定「すべて / 面談 / 自由メモ」；`meeting` 属面談，`free` 与 `voice` 属自由メモ。旧记录缺 `noteKind` 当 `free`；音声仅显示来源 chip，不另有第四 tab。 | D-14 的三种存储值与 app / b11 的三种显示 tab 自洽；不改旧数据。 |
| D-2 | 本期不录音；🎙 隐藏，`voice` 只做旧数据读取与来源 chip。b5 #47 录音画板推下一期并登记 DEFERRED；不加原生依赖、不调用服务端 ASR。 | 本期可完成的链是手写、保存和历史 voice 读取；b5 #51 的回放元素与 #46 / #49 的 AI 文案由主会话改稿，改稿前相应区域不算通过。 |
| D-3 | b5 #46 / #49–#51 只取手写、列表与详情的非 AI、非录音结构；#47 录音、#48「整理結果の確認」整屏与 E3 AI 整理／自动加予定确认卡推下一期。新建的明确动作是「保存」。 | E3 和录音均不在本期；Web 门禁只用 web.html #19，b5 #52 作废。改稿清单交主会话，不以旧板硬比。 |
| D-4 | `NoteMentionContract.contactId` 改可选；缺 `entityType` 当 contact。contact 分支必有非空 `contactId`、不收 `eventId`；event 分支必有非空 `eventId`、不收 `contactId`。新写 token 严验；读取未知 `entityType` 仍显示正文，编辑保存时只允许已有且未改动的未知 token 原样回传，不静默丢弃或新造未知 token。 | 已有契约 `entityType?` / `eventId?`，但服务目前强制联系人。改 `contactId` 是破坏性契约变更，必须先登记 BREAKING，App 先宽进再同步。 |
| D-5 | `eventIds` 继续表示关联活动的并集（手动选择 + event token）；界面明示删 @活动 token 不解除活动关联，用户须显式取消关联 chip。`contactIds` 只由手动联系人 + contact token 得来。 | 沿用现有数据形状，避免为一处重叠关系新增无画板字段；写后读回与 unlink 不误删活动。 |
| D-6 | 「プランの話せた に使う」只在 `meeting` 且恰好一个可访问联系人时可开；联系人不是恰好 1 人时开关置灰并提示，不做选人器。开关随笔记保存 `usedForPlan`，服务端保存成功后异步交已有 C11 提取／判定；失败不回滚笔记，结构化记错、由既有补扫机制补做。 | C11 的输入是单个 `contactId`，R24 钩子已存在；避免错把一人的事实计给另一人。 |
| D-7 | `planLink` 写入对象为 `{planId,typeItemId}`；只允许挂当前 actor 可见、生效计划中的真实类型，POST / PATCH 接受可选字段，PATCH 的 `null` 可解除。同步 notes / tasks 注册表与任务离线写入字段；任务旧 payload 读回不变。类型详情按服务端过滤读同一任务；若链接目标计划后来失效，读取时隐藏链接而保留任务。 | R22 契约已加但内部 DTO / API 未接；读端要容错失效计划，E 线消费读写接口，不在本线改 iOrbit。 |
| D-8 | App `/notes` 无 `contactId` 继续跳 `/task?seg=memo`；有 `contactId` 保持独立二级页，`/notes/new?contactId=` 与详情／编辑旧链接落到新屏。旧屏实现删除，四个 route 文件保留兼容。 | R05 已定的深链与 R20-07 一致，删掉路由会断已有链接。 |
| D-9 | Web 1024 / 390 / 深色，以及 App 无深色板的组合，沿 R20a「设计稿无」：按 1440 / 浅色同结构、b8 断点、token 实现，附截图与交接；不把它们写成像素通过。 | `--list` 只找到 web.html #19 与 b5 #52 的 1440 浅色；本机工具清单无对应深／窄板。 |
| D-10 | 组件只从已合入 R31a / R31b 的新库取；新 App 屏（包括联系人范围独立页）统一 `<AppScreen inset="kit">`，正文 `UiText`。缺输入 token 组件则给 A 线请求，先做可独立验证的数据链。 | RD-24、G17/G23/G24 与 AppScreen 的新 inset 参数；不在本线补组件。 |
| D-11 | 面談の記録（`appointments/[id]/memo`）本期不合并进 Task › メモ 列表；在 DEFERRED 登记独立入口与未来合并判定。 | 当前是另一条记录流；不能把它误算成 R20b 的笔记读写验收。 |

## 3. 交接条目逐条映射（REPORT 按编号回填）

| 交接 # | 这次的去向 |
| --- | --- |
| R20-01、04、05、06 | R20a 已归属容器搜索、记忆分段、「＋」与右栏；R20b 只对 memo 分支作不退步回归，SC-04 / 07 / 13 / 14。R20-06 的 R10 首页内容继续交 R10。 |
| R20-02；R07 W-R07-Tmemo / TmemoH / TmemoL | Web メモ 左列表／右详情和标题区「＋ メモを追加」：SC-07、14；重跑原未过的整屏／标题区与原已过的左栏，页签、键盘、`?tab=` 只调用容器原机制。 |
| R20-03 | memo 段与右上「＋」归 SC-04 / 07；calendar、todo 属 R20a，plan 属 R23–R25，不重做。 |
| R20-07 | App web 不可达时「＋」禁用；原生离线 outbox；`/notes?contactId=` 独立二级页：SC-08 / 12。 |
| R20-08；决定表 D27 | 手入力「メモ」保存联系人后进入 Task › メモ：SC-09；D 线独占 `ManualContactScreen.tsx` / `manual-model.ts` 的本 Sprint 改动窗口，按 RD-30 在交接表通知甲；R11a 不碰。 |
| R20-09；决定表 D52；R22 REPORT :48 / :94 | `planLink` 落库、类型下的 To-do 与「プランに追加」：SC-11；D 线交接口与数据证据，计划 UI／E 线入口请归属方接线。 |
| R20-10；R24 REPORT :104 / :116 | `usedForPlan` live 触发 C11：SC-10；确认卡和计分仍走 R24 已有逻辑。 |
| R20-11、12、14、15、16、17 | R20a（草稿页保留、判断待ち、Today 删除、未截画面、登录 next、控制台噪音），本 Sprint 不接手；SC-01 开工检查 R20a 的最终交接，有未交项写 REPORT 请求。 |
| R20-13 | 契约 5 的 `noteKind` / @イベント归 SC-02 / 03 / 05；契约 10 的 `deferralCount` 属 R20a，`planLink` 属 SC-11。 |
| R12-12；DEFERRED-A §2 | @人 token 完成后重跑 A-R12-16：SC-05 提供可复现状态与证据，SC-16 请求画面归属方重比；A-R12-N09 ConfirmDialog 则属 A 线组件轮，不占 R20b 门禁。 |
| 归属表 App Task `notes` 四屏；Web 新 メモ | SC-04 / 07 / 12 整屏换、旧实现删、兼容路由保留。 |
| 通用 G01–G26 | G01/10/11/15–17/21/22/24 → SC-04 / 07 / 12 / 14（壳、语言、`UiText`）；G02/03/04/26 → SC-13 / 14（token、危险色、触控）；G05–09/25 → SC-01 / 13 / 14（预检、fixture、门禁、3 轮上限）；G13 → SC-14（旧 `.btn` 漏入）；G18/19 → SC-02 / 03 / 15（宽进、只加不改）；G20 → SC-12（允许清单）；G23/23b → A 线请求并在 SC-13 / 14 检查，不改组件；G14 公开／kiosk 不适用。 |

## 4. 已查清的代码事实（`origin/redesign a37d0f551`；开工重定位）

1. `repos/orbits/shared/contract/notes.ts:1–9` 的 `NoteMentionContract.contactId` 仍必填，虽已可选 `entityType` / `eventId`；`:21–24` 的 `noteKind?`、`usedForPlan?` 已在类型中。App 同步副本也有这些字段（`repos/orbit-app/src/api/contract/notes.ts:1–24`）。这只是类型，不代表 live 接线。
2. `repos/orbits/app/api/notes/route-support.ts:100–113` 只认带 `contactId` 的 mention；`app/api/notes/collection-handler.ts:60–71` 与 `[id]/handler.ts:38–51` 的严格白名单没有 `noteKind` / `usedForPlan`，GET 搜索目前只接 `association=all|contacts|events|unlinked`（collection-handler :26–49），没有三类过滤。
3. `repos/orbits/features/notes/service.ts:54–77` 的 create / update 输入未含这两个字段；`:119–137` 把全部 mention 当联系人，`:248–273` 新记录不存类型，`:287–322` 更新不存类型；读列表在 `:213–243` 按关联而非 noteKind 筛。`note-record.ts:23–45` 读 mention 丢掉 `entityType` / `eventId`，`:89–98` canonical 又把全部 mention contactId 汇入联系人。
4. `features/notes/service-factory.ts:7–17` 的 `createConfiguredNoteService` 连 PostgreSQL live records；`app/api/notes/route-support.ts:27–29`、`features/orbit-ai/entity-drafts/service-factory.ts:37`、`task-interaction-service-factory.ts:8` 都用它。属于全站高影响写入点：只加可选字段、保持旧 payload 往返与 draft／task interaction 回归。
5. `repos/orbit-app/src/view-models/notes.ts:19–60` 的响应 reader 把每个 token 都当 `contactId`，`:73–77` 一条坏 note 会让整页失败；`:113–147` 请求 builder 不带新字段，`:189–207` 确认回执只比 contactId。`src/view-models/notes-mirror.ts` 的乐观叠层也把每个 mention 的 contactId 汇入 contactIds，event token 不能进这里。App outbox 的 `note-outbox-mutation.ts:18–43` 会保存请求 JSON，可随可选字段传，但 decoder / 草稿须同步。
6. `repos/orbit-app/src/screens/task/TaskScreen.tsx:36–44` 的 memo slot 仍是 `MemoSlot`，`:91–100` 的 memo「＋」去 `/notes/new`，Web 不可达才禁；`:143–152` 把旧 `NotesScreen` 挂在容器里。旧 `NotesScreen.tsx:18–24` 是按关联对象四类筛，`:63–79` 有页内「我的笔记」大标题和 Ionicons；不是 app.html #26 的三类结构。
7. `repos/orbit-app/src/screens/notes/NoteMentionEditor.tsx:12–26` 只生成 @人 token；`:29–48` 在编辑时位移 token，`:51–99` 候补只搜联系人。旧新建屏 `NewNoteScreen.tsx:29–47` 读 `contactId`、事件选择，`:132–157` 原生已走离线队列；编辑屏 `EditNoteScreen.tsx:33–60` 也走同一旧编辑器。`src/screens/ai/AiConversationScreen.tsx:51` 使用 `notes-source`；`NoteSourceTasks` 的写入状态功能必须保留，删除只限四旧屏。
8. `repos/orbit-app/app/notes/index.tsx:19–24` 已有「无 `contactId` 跳 Task，有 `contactId` 独立页」的规则；归属表 App Task 行列出 `notes`、`notes/[id]`、`notes/[id]/edit`、`notes/new` 四屏待重写（`screen-ownership.md:48`，远端行号开工核对）。
9. `repos/orbits/app/(app)/app/orbit-2026/task/TaskContainer.tsx:15–25` 的 memo 仍是空态，`:33` props 无 memo，`:69–85` 没有 memo 添加按钮；`app/(app)/app/tasks/page.tsx:37–43` 只传 calendar / todo / plan。Web 尚无独立笔记页。
10. `repos/orbit-app/src/screens/add/manual-model.ts:16–26` 有 `note` 字符串，`:49–53` 被塞进手入力请求；`ManualContactScreen.tsx:129–166` 保存成功后只打开联系人／成功页，没有建笔记。R20-08 要改的是这条动作链，而不是仅改字段名。
11. `repos/orbits/features/contacts/memo-extraction/store.ts:75–102` 已提供 `runConfiguredMemoExtraction({usedForPlan})`；仅 true 时调用 `planCoverageHooksOrSkip`，失败记结构化日志且笔记写入不回滚；`job.ts:58–66` 的输入要求单个 contactId。R24 REPORT :104 / :116 明说 live 触发点待 R20。
12. `repos/orbits/shared/contract/tasks.ts:40–50` 已有可选 `TaskPlanLink`；但 `features/tasks/contract.ts:29–54` 内部 DTO 无字段，`service.ts:37–70` create / update 输入无字段，`task-record.ts:83–130` 没校验它，`app/api/tasks/collection-handler.ts:23–37` 和 `[id]/handler.ts:21–45` 严格白名单也不收它。R22 REPORT :48 / :94 已明确交 R20 落库。
13. `repos/orbit-app/src/components/AppScreen.tsx:33–38` 已有 `inset="kit"`，但默认仍为 legacy（:57）；R31a 的组件参数能用之前要核对实际导出。录音本期 DEFERRED，不调查或增加原生语音模块。
14. `shared/mock/demo-world/fixtures.ts:223–240` 的 5 条 note fixture 已带 `noteKind` / `usedForPlan`，但 live 路径没有；`shared/contract/BREAKING.md` 要求破坏性改动按表格完整登记。`bridge/status.md` / `bridge/handoffs.md` 的 BR-017～019 是旧跨端笔记能力验收，不代表这次 D-14、新 Web 页或旧屏替换已完成。
15. `repos/orbits/shared/api-schema/offline-mutations.ts:9–23` 的 mention 和 notePatch 都是 `.strict()`；mention 强制 contactId，notePatch 没有 noteKind / usedForPlan。App `src/api/schema/offline-mutations.ts` 有同样解析副本；`src/api/contract/offline-mutations.ts` 是类型副本。离线出队前就会拒绝 event token 与新字段，必须两端同改、只加不改地放宽。
16. `repos/orbits/features/sync/domain-registry.ts:207–226` 的 notes / tasks 字段行没有 noteKind、usedForPlan、planLink；即使 live 写成功，设备镜像也不会下发它们。`src/view-models/notes-mirror.ts` 要在离线乐观映射中按 entityType 区分 contactIds。
17. `GET /api/agent/plans/v2/summary` 当前返回 `current` / `goals`；`PlanV2HomeSummary.score` 没有「三问覆盖数」字段（`shared/contract/plan-v2.ts:114–169`）。因此在此基线「3問中 2問」行应隐藏；以后只有响应已有明确字段时才按该字段显示，不从提议或正文猜数。

## 5. 契约与数据落点

### 5.1 Notes（SC-02 / 03 / 05 / 10）

- **写请求**：POST / PATCH 可选 `noteKind: 'free'|'meeting'|'voice'` 与 `usedForPlan:boolean`；请求白名单仍严格。缺 `noteKind` 视为 free、缺 `usedForPlan` 视为 false，但旧请求写后返回形状要和原来一致：不为未传的旧记录凭空序列化两个键；新客户端需要显示时按默认值读取。PATCH 没传字段时保留已存值。
- **提及**：`NoteMentionContract.contactId?:string`（BREAKING 表中的 id 以快照工具报出的精确 id 为准；「甲乙同意」栏如实写 RD-33 主会话代定，不冒称双方签字）；`entityType` 缺省 contact。contact mention 需 contactId 且无 eventId；event mention 需 eventId 且无 contactId；start/end 是 JS 字符串 UTF-16 范围，`body.slice(start,end)===displayText`；区间不得越界、重叠或指向别的 token。存储 decoder 保留 `entityType` / `eventId`，旧 mention 仍按原形读回；按 actor 检查两类对象可访问，跨 actor id 拒绝。编辑器遇到未知类型 token 时保留原始字段及位置并原样回传，不能把未知 token 当联系人或静默删除；服务端只允许与原持久化记录逐字段相同的未知 token 在 PATCH 中回传，拒绝新造或改写的未知 token。如正文编辑使范围失效，应可见报错并要求用户先处理。
- **关联**：`contactIds = manualContactIds ∪ contact mentions`，`notes-mirror.ts` 不把 event token 汇入 contactIds；`eventIds` 保持用户明确选择的活动和 event mentions 的并集；界面明示删 @活动 token 不解除活动关联，须单独取消关联 chip。`unlinkContact` 只清该联系人的关联及 token，不动 event token。旧记录 schema v1 / v2、旧幂等回执、同 key 重放、版本冲突、actor 隔离与 Orbit AI 建笔记路径均守住。
- **列表**：先读授权笔记，再按 `noteKind` 过滤，count 与分页游标属于该查询（不能翻页跨过滤器）；三类按 D-1。App 响应对象宽进，未知 kind 当 free 展示，未知 mention entityType 可读且编辑回传原样，坏单项跳过且总数照服务端；请求严格不容错。演示世界增 event mention / 旧无字段 / voice fixture，仍 `sample:true`。面談の記録（`appointments/[id]/memo`）不并表。
- **流程**：先补能 RED 的契约、服务、离线 schema 与 outbox 测试，再改 `BREAKING.md`、快照、schema parity；共享 `offline-mutations.ts` 和 App schema / contract 副本一起只加不改地放宽：mention 增可选 entityType / eventId、contactId 按 entityType 分支必填或可省，notePatch 加可选 noteKind / usedForPlan，taskPatch 加可选 planLink。同步 App 副本与 parser，同一 `contract:` 提交。`features/sync/domain-registry.ts` 只加 notes 的 noteKind / usedForPlan 和 tasks 的 planLink，并验证镜像读回。全站服务 `createConfiguredNoteService` 的调用方回归必须包含旧数据往返不变。

### 5.2 计划与任务（SC-10 / 11）

- `usedForPlan` 由用户明确开关后随笔记写；联系人不恰好 1 人时开关置灰并提示。服务端保存成功后的派生作业用现有 `runConfiguredMemoExtraction`，只给唯一已授权联系人，作业按 noteId + body hash 防重。开关 false 不运行；true 但计划不可用时笔记仍成功，计划区按 G18 隐藏/手动回退，日志不含正文。本机 AI 账本迁移及 provider 环境配置是 SC-10 前提：`createConfiguredAiQuotaGate` 未迁移时为 disabled，不能把跳过计作提取通过。「3問中 2問」只从 `plans/v2/summary` 已有字段读取；无字段就隐藏该行，不自行计算或写死数字。C11 只产提议，用户确认才计分。
- `planLink` 不是联系人洞察里的同名局部变量。Task DTO、live payload decoder / repository、POST / PATCH、同步注册表与两端读模型只加可选对象；PATCH null 解除，旧数据省略。写入时验证 actor、planId、typeItemId 的从属关系。按 planId + typeItemId 读 actor 自己的 To-do；目标计划失效时读端隐藏链接而保留任务。E 线「プランに追加」与类型详情 UI 用这个读写口径，双方联验后关闭 R20-09。

### 5.3 Web 与 App 操作链（SC-04～09 / 12）

- App 容器保留四段顺序、`?seg=`、🔍 与其他三个段；memo 正文只渲染新列表，不重复顶栏。四个旧屏用新文件重写后删除旧实现，旧四路由只做入口和兼容。新页一律 `AppScreen inset="kit"` + 新组件库 + `UiText`，不写 Ionicons、旧色值或自制底栏。
- Web `TaskContainer` 新增 memo prop 与按钮，页面提供列表 / 详情；右侧默认打开第一条，空列表用新库空态，选择项保持 URL 可重开；`?tab=memo`、←→ 键、其他 tab 状态不变。按钮只触发 memo 编辑，不动页签。标题／右栏槽的文案在作用域外按 `pickCopy` 取语言；正文在 `Orbit2026Scope` + `ToastProvider` 中，CSS Modules + token。
- App 原生离线：草稿、strict outbox patch、requestJson、乐观列表和恢复同步都携带新字段与 event token；冲突 409 保留本机草稿，不丢旧 voice 来源。手入力联系人若仍是本机临时 id，其笔记排在联系人 outbox 成功并取得服务端 id 之后，再替换引用并出队；联系人同步失败时笔记留队并可见。Web 断网禁用新增并保留已载列表；不假造离线成功。🎙 隐藏，不请求麦克风、不加原生依赖。
- R20-08 由 D 线在 `ManualContactScreen.tsx` / `manual-model.ts` 独占窗口接线：保存联系人成功拿到 contactId 后打开 `/notes/new?contactId=<id>`（新屏内按 Task › メモ 规则）；失败／撤销联系人时不创建孤儿笔记。按 RD-30 交接通知甲，R11a 在窗口内不碰；同 actor 的 note 在 Task 与联系人范围联验。

## 6. 旧屏替换与不退步

| 旧入口／文件 | 新着地与删除条件 |
| --- | --- |
| App `/notes`、旧 `NotesScreen` | 无 contactId → Task › メモ；有 contactId → 新联系人范围列表。旧 `NotesScreen.tsx` 在新屏渲染／测试／路由引用归零后删除。 |
| App `/notes/new`、旧 `NewNoteScreen` | 新建；`contactId` 自动预选且可保存；旧实现删除。 |
| App `/notes/[id]`、旧 `NoteDetailScreen` | 新详情；关联对象 token 可跳，旧实现删除。 |
| App `/notes/[id]/edit`、旧 `EditNoteScreen` | 新编辑；版本冲突与草稿恢复，旧实现删除。 |
| Web `/app/tasks?tab=memo` | 新列表／详情，无新一级导航；R07-TmemoH 重新比。 |

旧屏允许清单只删本次四屏对应行；`notes-source.ts`、`notes-source.web.ts`、`notes-source-mirror.ts` 保留（`AiConversationScreen.tsx:51` 仍在用）；新详情继续渲染 `NoteSourceTasks`，保留来源任务读／写状态行为；路由登记、离线清单、审计计数按 HOW-TO §7 更新。R20a To-do / カレンダー / プラン画面和 R05 / R07 Task 壳重比，不能因 memo 插槽退步。桥接交接要写本端提交、App/Web 对方影响、未完事项与同 actor 双向验证范围；只通过类型检查不写「业务对齐完成」。

## 7. 像素 SC 与画板预检

编制时用 `compare-redesign.mjs --list`，设计稿静态服务端口 3340（已停），确认以下序号；画板文件与当前工作树 blob 相同，正式门禁仍需在 R20a / R31a / R31b 合入后重核标题。执行者在写 UI 前建 `views/{app,web}-R20b.json` 并跑 `board-preflight.mjs --suite … --md R20b-task-memo/preflight-checklist.md`。预检结论（数字自洽、元素数据源、token、组件、fixture）写入该文件，并把待主会话改稿的 AI 区域逐项列出。

| 门禁 id | 画板（`--list` 序号／标题） | 到达状态／主题／尺寸 | 预检关注 |
| --- | --- | --- | --- |
| A-R20b-01 | `app.html #26 Task · メモ大量数据` | `/task?seg=memo`；App 浅 390×844 | 三类计数、搜索、卡片 token；与 R05 壳同屏。 |
| A-R20b-02 | `b11-nav-v3.html #36 ④ メモを書く（@人 · @イベント）` | Task「＋」→ 输入 @ → 选人／活动；App 浅 390×844 | token 长度、点击目标、候补状态；非单纯 `eventIds` chip。 |
| A-R20b-03 | `b5-me-inbox.html #46 ① 一言メモ` | 新建输入；App 浅 390×844 | 只取手写与保存结构；AI 按钮／文案待主会话改稿。 |
| A-R20b-05 | `b5-me-inbox.html #49 メモ一覧 空` | 无真实笔记；App 浅 390×844 | 示例卡只读；AI 提示文案改稿后比。 |
| A-R20b-06 | `b5-me-inbox.html #50 メモ一覧 少量` | 2 条 fixture；App 浅 390×844 | 今日／今週分组；时间与计数同 fixture。 |
| A-R20b-07 | `b5-me-inbox.html #51 メモ一覧 大量` | 5 条 fixture；App 浅 390×844 | voice chip 仅标记、回放元素改稿后比。 |
| W-R20b-01 | `web.html #19 Task · メモ大量数据` | `/app/tasks?tab=memo`；Web 浅 1440×960 | 列表 5／详情 7 栏、标题按钮与 R07 壳。 |

**不进门禁：** b5 #47 录音画板、#48「整理結果の確認」整屏推下一期并登记 DEFERRED；b5 #52 的 W-R20b-02 作废，不进任何 Web 门禁。b5 #46/#49/#51 的 AI 文案和回放片段在主会话改板前记「待改稿」，不得伪作 [data]。Web 只以 web.html #19（W-R20b-01）为新页门禁；1024 / 390 / 深色与 App 深色没有对应画板，按 D-9 截图、标「设计稿无」并交接；不会因为没有画板停止数据／UI 工作。中途状态用开发态 `design=`／open-path 开关到达，正式构建无此开关（RD-28），不用写库或付费 AI 造截图。

判定按 README 规则 11、决定表 §20 与 RD-29：App/Web 超阈值带全部具名归因 `[data]` / `[raster]` / `[contrast]` 即通过，raw 仍记录；结构差不能归因。Web 先 `--style-diff`，App 看数字和裁剪块；同屏最多 3 轮。R31a / R31b 合入后跑本表全量与 R05 Task、R07 Task、R12 A-R12-16（归属方）不退步。缺组件列「待组件库」，不在页面局部打补丁。

## 8. 验收契约（16 条；每条有操作链与证据）

| SC | 操作链／通过条件 | 主证据 |
| --- | --- | --- |
| SC-R20b-01 开工与预检 | 确认 R20a 收口与 D 线基线；本机隔离端口／库／模拟器；两端全量记录失败名；建画板清单、跑五项预检、记录 AI 改稿和「设计稿无」。 | HEAD、基线摘要、`preflight-checklist.md` |
| SC-R20b-02 契约与离线 RED | 旧 mention（只有 contactId）仍通过；event mention 无 contactId 可写，错分支／越界／重叠／跨 actor 被拒；`contactId` 变可选前 BREAKING 表行完整。先写共享与 App `offline-mutations` 的 RED：strict mention 无 contactId 的 event、notePatch 的 noteKind / usedForPlan、taskPatch 的 planLink 可入队；再只加不改地放宽并同步副本／快照。App 未知类型 token 读回后编辑原样回传。 | RED→GREEN 契约／离线 parser／outbox 测试、BREAKING 行、快照 diff |
| SC-R20b-03 live 持久化与镜像 | POST/PATCH `noteKind` / `usedForPlan` / 两类 mention 后重开同值；缺字段旧 payload 原样往返；删 @人不删 @活动，contactIds / eventIds 分别正确；`domain-registry.ts` 只加 notes / tasks 字段行，设备镜像同步读回 noteKind / usedForPlan / planLink；搜索三类 count / cursor 不串；重放、409、actor 隔离、Orbit AI note 创建不退步。 | 本机 PG + 路由／同步域测试、App 镜像读回、旧 fixture 字节／字段对照 |
| SC-R20b-04 App 列表与详情 | Task › メモ 切三类、搜索、翻页、打开详情、跳联系人／活动；`voice` 只在「自由メモ」和「すべて」；正文无重复大标题，AppScreen `inset="kit"`，新组件与 UiText；返回保持段位和滚动。 | 渲染测试、模拟器操作链、截图 |
| SC-R20b-05 @人／@イベント | 新建输入 @ 后搜索人／活动，分别选择 → body 范围、token、canonicalIds 正确；编辑 token 前／中／后文字、emoji surrogate pair、删除 token，再同步 Web 读回；未知 token 编辑后原样回传；点有效 token 进入授权对象，R11a 软删联系人 token 灰色「削除された連絡先」且不可点；提供 A-R12-16 状态。 | 搜索／编辑器测试、两端回读、A-R12-16 重跑请求 |
| SC-R20b-06 历史 voice 兼容 | 本期 🎙 隐藏且无录音权限请求、原生依赖或服务端 ASR 调用；既有 `noteKind:'voice'` 在两端可读、归「自由メモ」并显示来源 chip，编辑文字后仍保留来源；#47 记录 DEFERRED。 | 渲染／读回测试、依赖与请求检查、DEFERRED 交接文案 |
| SC-R20b-07 Web メモ | `?tab=memo` 左列表选中→右详情，搜索／三类／翻页／新建／编辑／重开；标题「＋ メモを追加」可用，旧 R07-TmemoH 重比；键盘 ←→ 只在页级切段，输入框保留光标键；Web 390 截「设计稿无」。 | Web 渲染与 e2e、URL 操作链、截图 |
| SC-R20b-08 离线与 R20-07 | App 飞行模式打开缓存、创建 / 编辑含 event token + kind 的笔记→strict outbox→恢复联网同值；镜像 contactIds 不含 event token，noteKind / usedForPlan 可读回；本机临时联系人 id 先同步、依赖笔记再出队；409 留草稿并提示；Web 不可达时「＋」禁用；无 contactId 的 `/notes` 跳 Task，有 contactId 独立页。 | App outbox／镜像／路由测试、模拟器离线回放 |
| SC-R20b-09 手入力接线 R20-08 | D 线在独占窗口改 `ManualContactScreen.tsx` / `manual-model.ts`，按 RD-30 交接表通知甲，R11a 不碰；手入力保存成功进 `/notes/new?contactId=`，失败与撤销不建孤儿 note；同 actor 在 Task 与联系人范围读到同一条。 | 独占窗口交接、加人→笔记→刷新操作链 |
| SC-R20b-10 C11 | 本机 AI 账本迁移和 provider 环境配置到位；`createConfiguredAiQuotaGate` 未迁移时 disabled 并明确记录。面談且唯一联系人可开 `usedForPlan`→保存→一次 C11 提议→确认后才计分；联系人非恰好 1 人时开关置灰提示。计划不可用／提取失败笔记仍可读，错误无正文；「3問中 2問」只读 `plans/v2/summary` 现有字段，无字段隐藏；重放不重复提议。 | 迁移／provider 状态、本机 PG／钩子测试、计划待确认回读、日志 |
| SC-R20b-11 `planLink` | 任务 POST / PATCH 写入、重开、同步后按 planId/typeItemId 读到同一 task；解除后消失；旧任务无字段仍可读；伪造他人 plan/type 4xx；指向后来失效计划的链接读时隐藏但任务保留；E 线「プランに追加」和类型详情归属方联验并写提交号。 | 任务服务／路由／PG／同步测试、两端类型页回读 |
| SC-R20b-12 旧屏删除 | App 旧列表／新建／详情／编辑四屏使用点归零并删除，四旧路由仍正确着地；`notes-source*` 与 `NoteSourceTasks` 保留，E 线 `AiConversationScreen` 写入状态不退步；三份允许清单只减、路由审计与离线清单更新；R20a 三段和计划槽不变。 | `git grep` 四屏归零、AI 写入状态／路由／ratchet 测试、diff |
| SC-R20b-13 App 像素 | §7 A-R20b-01～03、05～07 按现有或主会话改板逐张过门禁；#47 / #48 DEFERRED，无法比的 AI／回放片段只列「待改稿」，App 深色列「设计稿无」；R05 Task 与 A-R12-16 由归属方重跑。 | raw／带数／归因表、compare.html、模拟器截图 |
| SC-R20b-14 Web 像素 | §7 只用 W-R20b-01（web.html #19）1440 浅色板；W-R20b-02（b5 #52）作废不进门禁。另按 R07 原 suite 重跑 W-R07-Tmemo 整屏／TmemoH 标题／TmemoL 左栏及其既有浅深区域基准。新整页 1024 / 390 / 深色无板时截图标「设计稿无」，壳、旧 `.btn` 与弹层不退步。 | raw／带数／归因表、compare.html、三宽截图 |
| SC-R20b-15 全量与跨端 | 两端全量对照本 Sprint 基线零新增失败；orbits `typecheck` / `typecheck:app` / `lint` / `copy:qa`、App `tsc`；同 actor App 建 note → Web 读 / 改 → App 重开，反向再走一遍；每次明确何端何版本。 | 测试摘要、跨端手动回读表、bridge 交接 |
| SC-R20b-16 REPORT 与复核 | REPORT 回填 §3 各编号及完成／转出／未完；提交前按路径检查越线和共享契约同步；主会话独立重跑测试、门禁与至少 20% 已过图。向 DEFERRED 登记 #47 录音、#48 E3 与面談の記録并表，注明 W-R20b-02 作废；缺项进 HANDOFF / DEFERRED-A，不把部分通过写 done。 | REPORT、独立 REVIEW、提交 stat、DEFERRED 文案 |

## 9. 执行顺序与测试重点

1. SC-01：确认 R20a 完成；从远端拉新基线；核对 R31a/b 导出；记录两端全量、画板预检。R20a 未完时只做可独立的契约／代码调查，不改共享容器。
2. SC-02 → 03：旧 payload 与离线 strict schema 先 RED，补 BREAKING、请求解析、服务／record decoder、同步注册表、镜像、mock、App 宽进与快照；同一提交同步契约副本。并行文件不重叠时可先做 SC-11 任务数据链。
3. SC-05 编辑器数据链 → SC-04 App 列表／四屏 → SC-08 离线与兼容路由；SC-06 验历史 voice 读取、🎙 隐藏及无新原生依赖。实现只取新组件库；缺件先发 A 线请求。
4. SC-07 Web 新页与 Task 按钮；SC-10 先核本机 AI 账本迁移及 provider 再验 C11 钩子；SC-11 planLink。SC-09 在 RD-30 独占窗口由 D 线接手入力并通知甲；R24 类型详情和 E 线入口交契约后联验。
5. SC-12 删除旧屏与允许清单、路由清单；SC-13 / 14 在主会话改稿及 R31a/b 合入后跑像素；SC-15 全量与跨端；SC-16 REPORT、主会话独立复核。每步测试转绿才继续依赖步骤；独立步骤可推进。

重点反例：旧 v1/v2 记录无新字段、emoji 造成 UTF-16 偏移、event token 无 contactId、恶意 eventId、未知 token 编辑回传、两个 token 重叠、软删联系人 token 不可点、删除联系人时 event token 不丢、strict 离线 schema 拒新字段、离线临时联系人依赖顺序、镜像把 event token 错算进 contactIds、旧 App 未同步字段、C11 多联系人歧义及账本 disabled、`planLink` 指他人类型或失效计划、R20a 未完成时容器并发改动。测试要观察真实行为，不只断言函数返回值。

## 10. 失败与交接

- **R20a 未完**：R20b 的容器/UI 依赖不启动；契约调查、画板预检、独立单测仍可做。REPORT 列明具体缺少的 R20a 提交／SC，不把整个 Sprint 说成阻塞。
- **跨线归属**：R20-08 手入力两文件由 D 线按 RD-30 独占窗口修改并在交接表通知甲，R11a 不碰；R20-09 类型详情与 E 线入口、R12-12 重比由主会话路由给各归属方。D 线交明确接口、fixture 和测试，未联验的 SC 留未完。组件缺口给 A 线，不能用页面补丁掩盖。
- **画板不自洽**：按 §2 代定列改稿请求；主会话修改后再门禁。b5 #47 / #48 为 DEFERRED，#52 作废不进 Web 门禁；原 b5 AI 文案／回放 chip 在改稿前是「待改稿」，不作为通过证据；新缺画板按 D-9 留截图与交接。
- **高影响服务**：`createConfiguredNoteService` 改动限可选字段与独立校验分支；旧 payload 往返失败时先修该回归，再做 UI。BREAKING / 快照失败要如实记录，不略过。
- **历史 voice**：只读旧记录并显示来源 chip；🎙 隐藏，#47 录音 DEFERRED，SC-06 验无麦克风请求与无新增原生依赖，不以服务端 ASR 代替。
- **验证失败**：新全量失败有界修复并留失败用例、日志与未完成 SC；同屏像素 3 轮上限后登记「未过」。REPORT 不把 skipped 检查写 passed。
- **收尾文档请求**：主会话更新 README R20b 行、HANDOFF R20-02/03/07/08/09/10/13 与 R12-12、DEFERRED-A 的 A-R12-16、#47 录音、#48 E3、面談の記録并表及 W-R20b-02 作废、screen-ownership 四屏、决定表 D-1～D-11 与 AI 改稿状态；跨端按 bridge 模板写本端版本、另一端影响、未完与验证范围。生产迁移／部署／Neon 永不在此 Sprint 做。
