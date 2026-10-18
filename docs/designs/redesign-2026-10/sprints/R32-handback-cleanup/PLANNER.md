# Sprint R32 — 组件轮交还的页面清理

**Plan revision:** 1（2026-10-19；编制基线 `origin/redesign@d33a9f270`；执行时按 `line-a` 的新 HEAD 复核行号）。**模式:** existing-codebase / A 线单执行者 **Codex**。
**单一目标:** 消化 R31a-H1–H5、R31b REPORT §6 的 10 项、A-R16-04 与 R05 壳区域清单；把能由页面修复的差异按原画板过门禁，把确需组件能力的项给 A 线组件维护并保留未完成状态。
**易读目标:** [GOAL.md](GOAL.md)。**位置:** A 组件 → 后台之后的 R32，`/Volumes/ORICO/Dev/worktrees/orbit/redesign-a`（`line-a`）。R29 [REPORT](../R29-admin-refresh/REPORT.md) 当前写“部分”，本轮不能把 R29 冒称全过；先核对其提交已在执行基线，R29 未完成的原生登录 / 详情链由原责任项继续处理，不妨碍不依赖它们的本轮页面清理。
**门禁口径:** README 规则 11–13、RD-16 / RD-26 / RD-28 / RD-29；所有超阈带必须有真实 `[data]` / `[raster]` / `[contrast]` 归因，raw 只供定位。决定表 §52-1 的 W-R17-P26 只比抽屉。**生产边界:** 不连 Neon、不部署、不改生产变量、不做 TestFlight。

## 0. 给 Codex 的执行说明

1. 在 `redesign-a` 的 `line-a` 工作，先 `git pull --rebase origin redesign`，确认工作区与 R29 / R31a / R31b 交付版本。只在本线按路径提交，不推送；主会话复核后推送。不要在本编制用的 `redesign` worktree 施工。用户已指定 R32 和范围，无需再问产品决定；新矛盾按 §2 的原则代定并记入决定表，由主会话事后复核。
2. 读本文件和 [GOAL](GOAL.md)，再读 [README](../README.md) 的规则 10–13、RD-16、RD-24～33，[HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md) §8，[HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) 的通用口径及 R12/R16、R17、R26/R27、R22–R25、R31b 节，[DEFERRED-A](../DEFERRED-A.md) §1/§3，[决定表](../maintenance/2026-10-12-decisions.md) §20/§51/§52，R31a / R31b REPORT 的交还与复核段，以及 [R05 返工报告](../R05-app-shell/REWORK-REPORT.md)。以执行 HEAD 的源码、画板和现有 suite 复核下文事实。
3. **先通知再改甲名下页面：** 在 HANDOFF 对应 R12/R16、R17、R26/R27、R22–R25 节追加一句“R32 / 乙接手页面自身的像素交还，组件不动”，列具体来源号；R31b §6 尚未全部入表，先把 1–10 逐项登记到对应节并给转出项写责任人。只追加自己的行，不覆盖并行线。每条完成后在 HANDOFF 和 DEFERRED-A 对应行改 `done`，写提交号、门禁摘要和证据；未过/转出只写部分或请求，不写 done。新 App 页面或重做内容沿用 `AppScreen inset="kit"`，不手画系统外壳。
4. **测试节奏：** 先记录两端基线与既有通过键。相关行为先写能失败的测试再改页面；布局按画板源码和 kit 数值、token 调整。一个画面用 `--only` 最多三轮，失败记录具体带、截图与下一动作后继续其他画面。重任务统一 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/heavy.sh a -- <cmd>`，本线同时最多排 **1** 个；全量测试和本轮全量门禁只在收口时跑。证据统一 `/Volumes/ORICO/Dev/line-a-evidence/R32/run-01/`（或该位置的 `~/orbit-sprint-evidence/redesign/R32/run-01/` 链接）。
5. 每次提交仅列本线文件路径，提交前 rebase、冲突后重跑受影响检查，提交后 `git show --stat HEAD` 核对越线；**不推送**。REPORT 写逐项 SC、每个画面 × 宽度 × 主题的 raw / 带数 / 归因 / compare.html、测试基线差额、未过与请求、HANDOFF / DEFERRED-A 更新行及 SHA、付费 AI 调用数（预计 0）。Web ↔ App 共享可见行为如发生变化，先读 `bridge/status.md` / `bridge/handoffs.md`，REPORT 给本端版本、另一端影响、未完项和验证范围，由 Bridge 协调者更新台账。
6. **规则冲突记录：** README RD-32 取消 GitNexus，但当前项目 `AGENTS.md` 的 GitNexus 段仍写编辑符号前 `impact`、提交前 `detect-changes` 为 MUST。执行时以适用的 `AGENTS.md` 强制要求为准；若上游已修订该段，以执行时版本为准。`UNKNOWN` 须文本核查；HIGH/CRITICAL 先记录风险和对策。本文档编制只读源码、不编辑符号。

## 1. 本线归属的文件 / 不许碰的文件（RD-30 / RD-31）

**本线页面范围（按具体条目改，不扩成原 Sprint 重写）：**

| 组 | 可改的页面与本屏资产 |
| --- | --- |
| App 活动 | `repos/orbit-app/src/screens/events/v2/{DiscoverPage,VenuePage}.tsx` 与 H1 九屏实际涉及的本页样式/文案；`views/app-R27.json` 的中途状态步骤、`attribution-redesign-R27-app.json`。R27-26 的 expo-brightness 原生模块不是本轮。 |
| App 加人/导入 | `src/screens/add/{ContactDraftsScreen,UnifiedReviewApp,ScanBatchScreen}.tsx`、`src/screens/add/import/ImportScreens.tsx`、本屏只读设计 fixture 与 ja/zh/en 文案；`views/app-add-R12.json`、`views/app-import-R16.json` 和对应归因。`UnifiedReviewApp` 改动须同时回归 R12 与 R16。 |
| App 计划 | `src/screens/plan/{PlanOverview,PlanTypeScreen,PlanGoalSwitcher,PlanReviewEntrySheet,PlanRecordSheet,PlanProposalSheet}.tsx` 及本组 CSS/文案/只读 fixture；`views/app-plan-A.json` / `app-plan-C.json` 和对应归因。若标题锚点必须动 D 线 `TaskScreen` / `PlanSegment`，先给 D 线具体请求；本线不改 Task 容器。 |
| Web 计划 | `repos/orbits/app/(app)/app/orbit-2026/plan/{PlanOverview,PlanTypeDialogs,BackgroundBlocks,FlowParts}.tsx` 及本页 CSS / copy / 设计 fixture；`views/web-plan-A.json` / `web-plan-B.json` 和对应归因。手写 `FlowDialog` 仅在本页调用点替换，组件能力不足见 §2。 |
| Web 活动/主办/邀请/搜索 | `repos/orbits/app/(app)/app/orbit-2026/events/EventsScreen.tsx`、`host/{HostCohosts,HostConsole}.tsx`、`search/SearchPanel.tsx`、`invite-landing/InviteLanding.tsx` 与只读 fixture/本页 copy；只改 §3 所列页面。对应 `views/web-R26.json`、`web-R17.json`、`web-invite-R15.json` 和归因。 |
| 门禁与文档 | 新建 `repos/orbits/scripts/visual/views/app-R05-regions.json` 与本轮 `views/*-R32.json`（如需汇总），本轮归因文件；仅在区域清单格式无法由现有工具表达时，才最小改 `compare-redesign-app.mjs` 并加工具测试。执行阶段的 R32 REPORT、HANDOFF / DEFERRED-A 对应行、决定表本轮代定条目。 |

**不许碰：** R31a/b 的 App `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`、`kit/**`；D 线两端普通壳 / Task 容器；B/C/E 线页面；后端接口、共享契约、迁移、生产配置；R29 后台与其未完 SC；已有通过画面的画板源。需组件新参数时给 A 线组件维护请求，不在页面手写仿制件。R05 新区域 suite 不改 `AppScreen` / `OrbitTabBar` 等壳，只测壳；若发现真退步，给 D 线壳责任人。跨线共享汇总只追加本线行，根目录 Bridge 台账由协调者维护。

## 2. 主会话代定（RD-33；可在决定表标“主会话代定”）

| # | 决定与依据 | 落点 |
| --- | --- | --- |
| A-1 | **页面交还边界：** 组件轮已对齐的框体/头部不再修；只改页面 DOM、文案、fixture 或清单步骤。以数据自洽、已定规则、较新画板、成熟产品惯例依次判定。原已完成页面由乙接手并先通知甲（RD-30）；每个未过画面保持未过。 | §3、SC-P |
| A-2 | **R05 只重验壳裁区：** 旧 `app-R05.json` 的整屏清单保留历史；另建 `app-R05-regions.json`，11 个裁区视图 × 浅深 = 22 张，使用新工具 `region` / 必要时 `design-region`、`--grid 30`。R31a 复核的 1/22 自动通过、其余人工几何观察不等于通过；重拍后逐带归因。裁区之外页面正文由其页面 Sprint 验。 | SC-S01～S11 |
| A-3 | **A-R16-04 标签：** `17358002b` 把“名前が似ているだけの N件”限定在有自动统合块时；R31a 新截图里标签实际可见且 0 缺块，浅深仍 FAIL。先用 b9 #4 与 b11 #4 对应数据核对条件，不无条件恢复标签；头像色可 `[data]`，字形只能经裁剪核实后 `[raster]`，余页面差修好再判。 | SC-P20 |
| A-4 | **W-R17-P26：** 决定表 §52-1 明定只比 520 宽抽屉区域，背景柱高不计。先复核 `906,14,520,932` 是否仍为当前 1440 截图的抽屉框；用新 suite `region` 裁两侧，再处理抽屉正文的真实差。R31b 重跑仍有浅 7、深 6 未归因带，不直接算过。 | SC-W07 |
| A-5 | **W-R23-06：** `FlowDialog` 是计划页手写件，目标为 520 Modal；现有组件缺 520 档（R31b §6-5），不能把 560/480 当 520 或在页面补一个假 Modal。向 A 线组件维护提出“Modal 520，只加不改旧档”请求；能力到位后本页改用 Modal 并重比。此前该项保持未完成，其他项继续。 | SC-W05 |
| A-6 | **R31b §6-9/10 的边界：** `HostConsole` 的报表分段是链接，`SearchPanel` 类型 chip 是带 `aria-controls` 的 tablist，保留链接/选项卡语义；若组件没有同语义参数，向 A 线请求，未替换前不称 done。§6-10 的八组 Web 规格格是组件缺件，逐组转组件维护并记录责任，不纳入页面像素通过数。`FlowDialog` 在 §6-5 只处理一次。 | SC-X01 / X02 |
| A-7 | **数据和状态先于样式：** W-R15-12 用与画板同长度的只读 QA 邮箱重比；W-R24-12 点“下書きをつくる”、W-R26-31 填满画板的 7 位码、W-R24-11 用键盘焦点态。只读 fixture 与开发状态开关不得在正式包启用；不改变 live 或写入语义。 | SC-W03/04/06/08 |
| A-8 | **画板/主题：** 现有清单只给 A-R12-N09 浅色画板；深色只作主题回归截图，不能虚构暗色像素通过。其余以现有 suite 的画板、宽度、主题为准；宽度缺板则写设计稿无，不外推。R31b 的 c-ctl-0 人工例外 §52-2 不推广到页面门禁。 | §5～§7 |

## 3. 交接来源逐条映射（REPORT 号码原样保留）

| 来源 | 本轮处理 / 不重复计数 | HANDOFF、DEFERRED-A 落点 |
| --- | --- | --- |
| **R31a-H1** | A-R27-06/07/08/09/29/31/33/34/35，九屏页面差：社区 chip 低 3、轮播卡底部 4、搜索 placeholder 对比度与其余真实字形；逐屏修/归因。A-R27-26 的 expo-brightness 不并入 H1。 | HANDOFF R26/R27 `R31a-H1`、`R27-01/02`；DEFERRED-A §1 的 R27 App 三行；SC-P01～09。 |
| **R31a-H2** | A-R12-N09：草稿来源 chip 缺 🥂、参加者导入卡图标不符；ConfirmDialog 已对齐。 | HANDOFF `R31a-H2` / `R12-12`；DEFERRED-A `R12-12` 的 N09；SC-P10。 |
| **R31a-H3** | A-R16-02：列表尾行 1–2 点、渐隐区域内容；头像底色按数据核对。 | HANDOFF `R31a-H3` / `R16-01`；DEFERRED-A `R16-01` App；SC-P11。 |
| **R31a-H4** | A-R25-11：标题触发的 BottomSheet 改 Popover + `.gmenu` 行结构；保留切换、添加、编辑与完成目标行为。 | HANDOFF `R31a-H4` / `R24-05c`；DEFERRED-A `R24-05c`；SC-P12。 |
| **R31a-H5** | A-R24-05/13/16、A-R25-01/12 改 sheet 内容结构；A-R24-12、A-R25-08 对文案/示例分数。七屏各重比，不把“组件已换图标”当页面完成。 | HANDOFF `R31a-H5` / `R24-05c`；DEFERRED-A `R24-05c`；SC-P13～19。 |
| **R31a 复核 S3，A-R16-04** | 复核证实标签可见，0 缺块，浅/深 19/20 超阈带，raw 0.0639/0.0601；按 A-3 查数据状态并逐带修，原 R12-b9-04 已由它覆盖。 | HANDOFF R16 节加 R32-16-04；DEFERRED-A §1 加/更新本项，SC-P20。 |
| **R31b §6-1** | W-R24-03：Modal 已对齐；概要背景示例数据和页高。 | HANDOFF R22–R25 / `R24-05b`；DEFERRED-A `R24-05b`；SC-W01。 |
| **R31b §6-2** | W-R24-09b：记录弹窗正文的输入焦点、候补行小字、`いつ` 行。 | 同上；SC-W02。 |
| **R31b §6-3** | W-R24-11：补缺句「話した人の点とは分けて、斜線で表示します。」并让清单走键盘焦点态。 | 同上；SC-W03。 |
| **R31b §6-4** | W-R24-12：清单补生成下书き步骤，并对齐候补表数据与抽屉正文。 | 同上；SC-W04。 |
| **R31b §6-5** | W-R23-06：手写 FlowDialog 位移约 3px；组件 520 请求后换 Modal。§6-9 再提到它，不另算屏。 | 同上；SC-W05 / 请求 X01。 |
| **R31b §6-6** | W-R26-31：填满 7 位码并复核背景イベント页数据。 | HANDOFF R26/R27 节加 R32-W26-31；DEFERRED-A `W-R26-31`；SC-W06。 |
| **R31b §6-7** | W-R17-P26：按 §52-1 只裁抽屉，处理正文；背景柱高不计。 | HANDOFF R17 `R17-17`；DEFERRED-A `R17-17` Web；SC-W07。 |
| **R31b §6-8** | W-R15-12：邮箱长度导致少折一行，固定同画板 fixture 后重比；不改邀请产品规则。 | HANDOFF R12/R15/R16 节加 R32-W15-12；DEFERRED-A R15 行；SC-W08。 |
| **R31b §6-9** | `HostConsole` 报表链接分段、`SearchPanel` tablist 请求同语义组件参数；`FlowDialog` 并入 §6-5。若现有参数已够，页面换后分别测 href/键盘/ARIA；否则保留现状并转组件维护。 | HANDOFF R17、R30、计划节新增请求；DEFERRED-A 加组件依赖行；SC-X01。 |
| **R31b §6-10** | c-ai-3、c-load-1、c-err-0/3、c-sample-2、c-kbd-1、c-text-1/2 逐格请求组件维护；c-err-0 的标准文案键若获实现须按共享契约同步 App。页面轮不改组件或把规格格记 done。 | HANDOFF G23/G23b / 对应功能节新增责任、DEFERRED-A 加组件依赖行；SC-X02。 |
| **R05 区域迁移** | 旧整屏 suite 转 11 个局部视图、22 张浅深，重跑并逐带归因；与 R31a SC-08 的 1/22 自动结果对账。 | HANDOFF G15/G17 加 R32-R05；DEFERRED-A 加区域门禁行；SC-S01～11。 |

## 4. 已查清的事实（`origin/redesign@d33a9f270`，执行者按路径重定位）

1. `repos/orbits/scripts/visual/views/app-R05.json:1-77` 只有 7 个整屏条目，注释写旧 `region.mjs` 裁区；`repos/orbits/scripts/visual/compare-redesign-app.mjs:191-226` 已支持 suite `region` / `design-region`，实现图先缩到设备点再裁；`README-redesign.md:127-137` 记录新格式和 `path` 开发开关。R05 返工报告 `:37-47` 给首页头、Task 头、个人页头、底栏的旧坐标，执行需按 16e 实图核实。
2. `R31a-app-components-pixel/REPORT.md:171-197` 的复核以已登录 16e 和 45 秒冷启动取得 22 张有效 R05 区域图，自动只有 1/22；A-R16-04 两主题仍 FAIL，标签可见。其视觉观察不能替代 R32 自动门禁。
3. `repos/orbit-app/src/screens/add/ContactDraftsScreen.tsx:25-40,95-141` 的 `design=n09` 已能直接打开第二张草稿的破棄确认；来源 chip 仅用 `sourceLabel` 文本，导入卡的图标与正文在本页。`views/app-add-R12.json:155-163` 只列 N09 的浅色画板。
4. `repos/orbit-app/src/screens/add/import/ImportScreens.tsx:83-91,210-245` 用 `design-pick` 到选择页并从 sample 造列表；`views/app-import-R16.json:6-9` 映射 b9 #2/#4。`UnifiedReviewApp.tsx:94-103` 的相似标签条件是 `autoMergedLabel && duplicates.length`；`17358002b` 引入该条件，不能在 R16 盲删。
5. `repos/orbit-app/src/screens/events/v2/DiscoverPage.tsx:115-121,199-228,270-285` 直接布置搜索行、社区/轮播卡和筛选 sheet；`VenuePage.tsx:59-67,117-139` 已用 `usePageBottomBar` 和 Toast。H1 的残差应先查这些页面结构与数据，不动通用组件。
6. `repos/orbit-app/src/screens/plan/PlanGoalSwitcher.tsx:44-145` 目标切换仍是 `BottomSheet`，完成目标列表与动作在其中；`PlanOverview.tsx:55-65,168-212` 已有 `premise/review/achieve/edit` 开发状态与相关 sheet。R31a REPORT §4/§9 已证组件 Popover 存在，差在页面 `.gmenu` 行结构。
7. `repos/orbit-app/src/screens/plan/PlanTypeScreen.tsx:103-109` 有 `skip/record/propose` 到达状态；正文分别落在 `PlanRecordSheet.tsx`、`PlanProposalSheet.tsx` 等本页文件。旧 `app-plan-A.json` / `app-plan-C.json` 仍写手点步骤，R32 重比先核对应开发状态，不能把 sheet 未打开当像素差。
8. `repos/orbits/app/(app)/app/orbit-2026/plan/FlowParts.tsx:148-163` 定义手写 `FlowDialog`，`BackgroundBlocks.tsx:289-424` 的 AddMemberModal 用它且宽 520；`ui/Overlay.tsx:78` 的 Modal `size` 联合类型确实没有 520。这不是 R31b 组件 Modal。`PlanTypeDialogs.tsx:48-165,171-184,247-297` 的记录/跳过/提案已用新 Modal/Drawer，剩余是页面内容和状态。
9. `repos/orbits/app/(app)/app/orbit-2026/plan/PlanOverview.tsx:832-849` 的前提弹窗已用组件 Modal；`views/web-plan-A.json` 的 W-R24-03/09b/11/12 和 `views/web-plan-B.json` 的 W-R23-06 写了 fixture/步骤，执行前逐条校对。W-R24-12 现有步骤未生成下书き，W-R24-11 步骤只点鼠标，见 §5。
10. `repos/orbits/app/(app)/app/orbit-2026/host/HostCohosts.tsx:250-259` 共同運営者已用 520 Drawer；`HostConsole.tsx:243-268` 报表分段的每项带 href；`search/SearchPanel.tsx:198-208` 是带 `aria-controls` 的 tablist。不能用 radiogroup 组件替换而改变语义。
11. `views/web-R17.json:166-181`、`web-R26.json:180-187`、`web-invite-R15.json:54-64` 分别登记共同運営者、参加コード、邀请接收确认的画板和进入条件；`invite-landing/InviteLanding.tsx:312-314` 渲染确认区。W-R17-P26 旧 note 仍写 540 / 待组件库，已被 RD-27 和 R31b 的 520 结果覆盖，R32 更新注释时不改变画板。

## 5. 画板、截图状态与五项预检

现有画板映射来自各 suite，**编制阶段只核对清单与 REPORT，没有运行 `board-preflight`，不报预检已通过**。执行时先用 `board-preflight.mjs` 为本轮清单输出到 ORICO 的 `preflight-*.md`，把五项结果摘要贴 REPORT；同一画板有多状态时逐状态核对。设计源只抽单板（`compare-redesign.mjs --extract-board`），不通读 bundle。

| 组 / 画板 | ① 自洽、② 数据/动作 | ③ token、④ 组件 | ⑤ 宽度/主题/中途态 |
| --- | --- | --- | --- |
| H1：`b2-events-flow.html` #6/7/8/9/29/31/33/34/35 | 对同一活动人数、chip、分数与卡片数；搜索/筛选/会場 Toast 用 suite 的 journey fixture 与 `approve=`，不以真实账号空数据代替。 | Segmented/FilterOption/Toast 已由 R31a 修；只量页面 chip、卡高、行距、占位色，`[contrast]` 限清单替换色。 | iPhone 16e，九 ID 浅深；筛选 09 和 Toast 35 必须在目标状态。 |
| H2/H3/A-R16-04：`b12-missing-states.html` #114；`b9-import-plan-v2.html` #2/#4 | N09 第二草稿带活动来源和正确图标；R16 #2 的 1,284 件、末行/渐隐；#4 分清自动统合块与仅相似两种数据。 | ConfirmDialog/Segmented 已交付；Avatar 色先核数据映射，不能拿数据差遮盖位置错。 | N09 只有浅色画板；R16 #2/#4 浅深，需开发 fixture 与正确登录态。 |
| H4/H5：`b12-missing-states.html` #198；`b4-plan-iorbit.html` #0/6/9/19/24/28/29 | 前提键值、推定/Q 编号、记录/提案候补、见直次数和分数 45/128 要与同一 fixture 自洽；所有按钮应有真实动作。 | 用现有 Popover/BottomSheet/ConfirmDialog；按 kit 的标题/行/卡结构、token 精确搬，缺组件参数写请求。 | iPhone 16e 浅深，按 `design=premise/review/achieve/edit/skip/record/propose` 或真实步骤打开；A-R25-11 为标题点击 Popover。 |
| Web 计划：`b12-missing-states.html` W-R24-03/09b/11、W-R23-06；`b4-plan-iorbit.html` #12 | 同 fixture 对齐背景概要页高、记录姓名/候补、skip 正文、提案生成后的 draft、成员候补；目标态与清单步骤一一对应。 | 弹框框体由 R31b 已对齐；W-R23-06 等 Modal 520 参数，不能页面补假框。 | 现有 suite 均 1440 × 浅深；W-R24-11 键盘焦点；W-R24-12 点生成；无 1024/390 画板不虚报。 |
| Web 其他：`b12-missing-states.html` #320、`b6-host-polish.html` #20、`b11-nav-v3.html` #12 | 参加コード填 7 位；共同運営者保持小林操作态；邀请 QA 邮箱长度同画板且不改变帐号产品逻辑。 | Modal/Drawer 组件不动；P26 只裁抽屉；邀请页只改 fixture/文案折行。 | W-R26-31 / P26 为 1440 浅深；W-R15-12 为 390 浅深且移除画板浏览器外壳。 |
| R05：`app.html` #2/#8/#15/#16/#17/#26，`b5-me-inbox.html` #16 | 顶栏的日期/姓名/完成度先固定同画板 fixture；胶囊裁区不得露出不同正文，否则明写 `[data]` 的实际像素范围。 | 壳归 D 线；本轮仅清单迁移和重比，图标/字形裁剪核实后才给 `[raster]`。 | 16e 浅深；11 裁区视图见 §6，冷启动/登录会话与 R31a 复核条件一致。 |

## 6. 像素 SC：每个画面独立结论

**门禁调用：** App 用 `node scripts/visual/compare-redesign-app.mjs --suite scripts/visual/views/<suite>.json --simulator <A-line-UDID> --only <id> --out /Volumes/ORICO/Dev/line-a-evidence/R32/run-01/<id>`；Web 用 `node scripts/visual/compare-redesign.mjs --suite scripts/visual/views/<suite>.json --only <id> --out <同根>/<id>`。调用都包在 `heavy.sh a --` 后，A 线同刻只排一个。Web 的本地 dev server / QA 账号按既有 suite，密码由脚本读文件，日志不回显。App 用原生 16e 与开发包 `open-path`，状态栏、安全区照 HOW-TO；不拿 RN Web 图代替。每个 SC 有浅/深两张，**P10 只对浅色画板做像素结论**。

| 像素 SC | 画面 ID / 画板 | 状态步骤与本屏通过条件 |
| --- | --- | --- |
| SC-P01 | A-R27-06 · b2 #6 | `discover=empty`；空态与社区入口的 chip/间距匹配。 |
| SC-P02 | A-R27-07 · b2 #7 | `discover=few` 与筛选参数；少量态行/卡高度匹配。 |
| SC-P03 | A-R27-08 · b2 #8 | `discover=many`；社区 chip 与轮播卡底对齐。 |
| SC-P04 | A-R27-09 · b2 #9 | `filters=1` 打开筛选；FilterOption 已对齐，余页面布局归因。 |
| SC-P05 | A-R27-29 · b2 #29 | 会場 `people` 页；数据与分段下方内容匹配。 |
| SC-P06 | A-R27-31 · b2 #31 | 会場 `view=map`；页面卡与文字位置匹配。 |
| SC-P07 | A-R27-33 · b2 #33 | 会場选中 `jp-shimizu`；人物详情结构匹配。 |
| SC-P08 | A-R27-34 · b2 #34 | 会場 `meet=1`；动作态与卡片位置匹配。 |
| SC-P09 | A-R27-35 · b2 #35 | `approve=jp-shimizu` 常驻交换 Toast；位置、文案与会場底栏匹配。 |
| SC-P10 | A-R12-N09 · b12 #114 | `design=n09` 第二草稿破棄；浅色画板含 🥂 来源 chip、导入卡图标；深色只做功能/主题回归。 |
| SC-P11 | A-R16-02 · b9 #2 | `design-pick`；列表末行/渐隐及头像数据逐带核实。 |
| SC-P12 | A-R25-11 · b4 #28 | `c-goals`、点标题；Popover 与 `.gmenu` 的三类行、位置、切换/添加/编辑保持可用。 |
| SC-P13 | A-R24-05 · b12 #198 | `premise`；emo 标题、键值/推定/Q、lav 卡和主按钮。 |
| SC-P14 | A-R24-13 · b4 #0 | `record`；面谈记录 sheet 内容/动作。 |
| SC-P15 | A-R24-16 · b4 #6 | `propose`；候补与提案 sheet 内容/动作。 |
| SC-P16 | A-R25-01 · b4 #19 | `review`；今月の作り直し卡与见直入口。 |
| SC-P17 | A-R25-12 · b4 #29 | `edit`；编辑 sheet 文案、行结构与保存动作。 |
| SC-P18 | A-R24-12 · b4 #9 | `skip`；换图标后的正文、确认态及返回。 |
| SC-P19 | A-R25-08 · b4 #24 | `achieve`；示例分数与同一 fixture 自洽（45/128），确认态。 |
| SC-P20 | A-R16-04 · b9 #4 | `design-review`；先复核“相似 N 件”条件，再处理 19/20 条残带，浅深各自自动结果真实记录。 |
| SC-W01 | W-R24-03 · b12 标题 W-R24-03 | `b12-206-premise`、打开“前提を見る”；背景数据/页高与 Modal 同时匹配。 |
| SC-W02 | W-R24-09b · b12 同名标题 | `b4-11-type-vc`；输入焦点、候补小字、`いつ` 行与画板结构一致。 |
| SC-W03 | W-R24-11 · b12 同名标题 | `b12-244-law`；补缺句，清单以键盘给主按钮 `.focus` 后截；Esc/取消保留。 |
| SC-W04 | W-R24-12 · b4 #12 | `b4-11-type-vc`；两名候补与背景表同数据，点“下書きをつくる”后截已生成态。 |
| SC-W05 | W-R23-06 · b12 标题 W-R23-06 | `b12-140-add-member`、勾森；Modal 520 到位后替换 FlowDialog，约 3px 位移消除并保留焦点/关闭。 |
| SC-W06 | W-R26-31 · b12 #320 | 打开参加コード再填画板 7 位码；背景活动页同步同 fixture；`wait-for` 必须证明已加载。 |
| SC-W07 | W-R17-P26 · b6 #20 | 点小林菜单进入共同運営者；`region` 只裁 520 抽屉，逐带处理正文，不算背景柱高。 |
| SC-W08 | W-R15-12 · b11 #12 | 390、已登录确认；用同长度 QA 邮箱与同状态重拍，不因折行把整页误记 `[raster]`。 |

**R05 区域 suite（SC-S01～S11）：** 由 `app-R05.json` 的七条旧视图复用 design/board/path，但给每个裁区独立 id。设计侧和实现侧以 16e 设备点核位；若页面头与画板不在同一 y，写 `design-region` / `region` 分侧坐标，不通过平移图片掩盖布局差。下表坐标是 R05 返工报告的起点，不是免检常量。

| SC | 旧画面 / 裁区 | 起点区域（设计点） |
| --- | --- | --- |
| S01 | A-R05-01 首页 `.hhead` | `0,50,390,58` |
| S02 | A-R05-01 底栏胶囊 | `14,756,362,62` |
| S03 | A-R05-02 人脈底栏胶囊 | `14,756,362,62` |
| S04 | A-R05-03 活动底栏胶囊 | `14,756,362,62` |
| S05 | A-R05-04 Task カレンダー顶栏+分段 | `0,50,390,128` |
| S06 | A-R05-04 底栏胶囊 | `14,756,362,62` |
| S07 | A-R05-05 Task To-do 顶栏+分段 | `0,50,390,128` |
| S08 | A-R05-05 底栏胶囊 | `14,756,362,62` |
| S09 | A-R05-07 Task メモ顶栏+分段 | `0,50,390,128` |
| S10 | A-R05-07 底栏胶囊 | `14,756,362,62` |
| S11 | A-R05-11 マイページ顶栏 | `0,50,390,64` |

**横向验收 SC（页面级像素结论仍逐项按上表）：**

| SC | 操作链 / 通过条件 | 主证据 |
| --- | --- | --- |
| SC-R32-01 基线 | rebase → 核 R31a/b、R29 SHA → 两端基线、已通过键和失败名逐项登记；R29 的“部分”不被 R32 覆盖。 | HEAD、基线摘要、差额表。 |
| SC-R32-02 通知/登记 | 在改甲名下页面之前把通知写到对应 HANDOFF 节；R31b §6 的 1–10 全部有独立行或显式合并引用。 | HANDOFF diff、来源号对照 §3。 |
| SC-R32-03 预检 | 对每组画板完成 §5 的五项，异常有代定或转出、无画板状态不宣称通过。 | ORICO `preflight-*.md`、REPORT 摘要。 |
| SC-R32-04 页面门禁 | SC-P01～P20 与 SC-W01～W08 各自到目标状态，浅深 / 指定宽度重比，超阈带逐条属实归因；P10 暗色仅回归。 | 各 `summary.json`、`compare.html`、归因与裁剪图。 |
| SC-R32-05 R05 迁移 | SC-S01～S11 按新 suite 跑 22 张；旧 `region.mjs` 不再是自动门禁的必需步骤，1/22 旧结果只作对照。 | 新 suite、22-key 摘要、区域归因。 |
| SC-R32-06 行为 | 目标切换/添加/编辑与完成目标入口、skip/record/propose、邀请确认、Web Esc/焦点/ARIA 和相关真实导航保持可用。 | 行为测试、真实 Web/App 操作记录。 |
| SC-X01 语义组件请求 | W-R23-06 的 Modal 520、HostConsole 链接分段、SearchPanel tablist 各有组件参数或明确请求；未交付时对应屏仍未完成。 | 请求号、组件维护回执、对应页面回归。 |
| SC-X02 规格格转出 | R31b §6-10 的八组格逐组写明缺件、目标设计格、责任人与 App 文案同步条件；不计入页面通过数。 | HANDOFF / DEFERRED-A 新行与组件请求。 |
| SC-R32-07 不退步 | 本轮目标清单全量只在收口跑；另跑 R31a/b 已通过画面的相关不退步键，缺 key / 等待超时补跑并留痕。 | key 数、通过数、未归因数、重试记录。 |
| SC-R32-08 测试 | 两端全量、typecheck；Web `typecheck:app` / lint，失败按开工基线逐名对账，零新增失败。 | `heavy.sh a` 日志、退出码、失败名表。 |
| SC-R32-09 收口 | 每个来源号在 HANDOFF / DEFERRED-A 有 done+提交号+证据，或真实未完/转出；REPORT 给 Bridge 四栏及独立复核范围。 | 文档 diff、提交号、REPORT / REVIEW。 |

Web 只需重比原 suite 指定的宽度；新 1024/390 板若出现，先作代定再加 SC。

## 7. 执行顺序与收口

1. rebase、查 R29/R31a/R31b SHA 与工作区；按 §0 通知甲并把 R31b §6 逐项登记 HANDOFF。跑两端基线摘要、读取现有 pass baseline 和 R31a/R31b 归因，不能用旧“done”替代当前结果。
2. 先编 `app-R05-regions.json`，用单张探针确认裁区尺寸、主题与 key，再跑 22 张；不足的归因只写在新区域键上，别把整屏旧正文记成壳失败。R05 壳真回归发 D 线请求，继续页面工作。
3. 按依赖做 App：H2/H3/A-R16-04 → H1 九屏 → H4/H5 计划；每组先读对应画板与运行 `board-preflight`，一屏一轮 `--only`，同一屏至多三轮。R16 共享 `UnifiedReviewApp` 的条件改动要同时重比 b11 #4 和 b9 #4。
4. Web：计划 W01～W04 → W06/W07/W08；W05 先发 Modal 520 组件请求，有能力后再换 FlowDialog。§6-9 的链接/tablist 和 §6-10 规格格逐条转出，若已有组件参数支持则在原语义下实测，不额外改组件。对 W-R17-P26 先确认裁区，避免背景数据污染抽屉结论。
5. 每个小组完成立即更新其 HANDOFF / DEFERRED-A 行、写真实提交号和证据；未过项写未归因带、三轮情况或外部依赖。收口时一条线只排一个 `heavy.sh a`，分别跑 R32 所有目标、R05 22 张、相关既有通过键的不退步、两端全量与类型/lint；必要时对环境超时的同名失败做定向复跑，不把跳过记通过。
6. REPORT 按 §0 第 5 点交证据；主会话独立复核亲自重跑失败/改动键和至少 20% 已过键、核裁剪图和归因。R29 未完成链继续留在 R29，不用 R32 的全量“零新增”推断它已完成。

## 8. 失败、请求与交接

- **组件请求必须具体：** X01a Modal 520（只加档、不改旧 380/480/560 等）；X01b Segmented 的报表链接语义（href / 焦点 / 当前页）；X01c CategoryTabs 的 tablist + `aria-controls` 模式，或经 A 线确认保持页面手写控件；X02 八组 Web 规格格分别列缺件和示例文案键。请求归 A 线组件维护，R32 页面不越线。W05/X01/X02 不因“已发送请求”记 done。
- **证据不够时：** 状态没到、fixture 与画板不一致、工具 `wait-for` 超时、R05 截到登录/加载瞬态，都标无效截图并重拍；自动门禁仍 FAIL 就写 FAIL。A-R16-04 以最新截图与自动结果为准，不能复述“标签缺失”作既成事实。
- **三轮后仍未过：** 记录画面、主题、raw、超阈/未归因带、裁剪图、已试三步与下一责任人；继续独立条目。基线已有失败逐名对账；新失败先有界修复，未修好则对应 SC 不通过。
- **更新闭环：** HANDOFF 与 DEFERRED-A 每个来源号标 `done` 必须有同一提交号和证据目录；组件转出保留未完成并写 A 线请求号。跨端交接给主会话四栏：本端版本、另一端影响、未完成项、验证范围。只路由或类型通过不代表业务/像素完成。不连 Neon、生产或外部发布；如执行中发现必要生产动作，仅登记待授权。
