# iOrbit（对话域）屏级替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `iOrbit.dc.html` 把对话域六屏（概览 home / 对话 chat / 建议与行动 actions / 执行计划 plan / 工作策略 strategy / 先联系谁 contacts）与历史记录抽屉做成 1:1，全部接真实数据与既有写逻辑（`/api/ai/conversations*`、run/ledger、任务卡、邮件草稿、关系收件箱）零改动；`orbit-real-agent.tsx`（3892 行，融合态）与 `orbit-agent-dashboard.tsx`（799 行，批次 4a 融合态）在切换后删除。

**Architecture:** 与前五域相同：先把 3892 行组件的纯函数 + 状态 + fetch 原样抽成 `agent/iorbit-0918/` 的 model 与 hook（旧组件改调、JSX 不动、既有测试全绿），再按设计逐屏建组件消费 hook，最后接线、删旧、改指测试、下调 ratchet、像素终验。`actions/plan/strategy` 三屏已是边界 B 形态（各自 `*_STYLES`），本计划只统一壳与作用域并把设计的 contacts 屏并入 strategy。

**Tech Stack:** Next.js 16 App Router、React 19 client components、node:test + react-test-renderer + tsx、playwright 像素比对 `scripts/visual/compare-0918.mjs`。

## Global Constraints

- 工作树 `/Users/li/work/orbit-web-newui-batch0-20260918`（分支 `newui/batch-0-shell-landing`），**每条命令都用绝对 cwd**（默认 cwd 是主仓）；主仓 `/Users/li/work/orbit` 只读；`$WEB` = `repos/orbits`。
- 冻结 `orbit-reference-styles.tsx`（永不追加选择器）与 `orbit-theme.tsx` 遗留清单；不提交 `.claude/launch.json`、`repos/orbits/next-env.d.ts`；永不 `git commit --amend`、永不 `git stash`；trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。
- 测试跑法：`cd $WEB && node --test --import tsx <files>`（`npm test` 会先 `assertLocalTestDatabases()` 拒绝）；`npm run typecheck` 必须 0；ratchet 两个文件每任务都跑，**只降不升**（现 button 98 / fontSize 35 / fontWeight 16 / gap 173）。
- 改导出符号前 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`（UNKNOWN → 文本搜索确认，不得当作安全）；提交前 `node .gitnexus/run.cjs detect-changes --scope all --repo .`（`partial`/`truncated` 视为未通过，重跑）。
- 已知基线失败不得「顺手修」：`app-agent-contact-recommendations`（1，本地化夹具漂移）、`app-events-live-route-services` agenda 时钟（1）、云端 PG 配额套件、本地测试库套件、`event-registration-portrait-browser`、`event-registration-readback`（会挂起，运行 `tests/pages` 时排除并记录）。
- **像素规则**：前缀 `ir-`，作用域 `[data-orbit-real-page="iorbit-0918"]`（`@keyframes` 除外），一静态样式一类、声明顺序与值逐字；每个 `<button>` 带 `btn ir-*` 且整段中和基类（`orbit-reference-styles.tsx:594-611`：`height/display/align-items/justify-content/gap/white-space/text-align/letter-spacing/line-height/transition`）+ 单独 `:active{transform:none}`；一个类同时用于 `<a>` 与 `<button>` 时写两条规则；`:hover` 只写设计的 `style-hover`，唯一例外是中和作用域内 `a:hover`（须带注释）；动态颜色内联；**React 内联 style 对象里不得出现 `fontSize`/`fontWeight`/`gap`/数字 `borderRadius` 字面量**；作用域属性写在各 `page.tsx` 的外层 div（带既有注释）。
- **不得出现设计 mock**：「2026年9月18日 · 星期五」「3 个日程」「2 项/3 项/2 项」「14%」「1 / 7 项已完成」「12 人 / 4 场 / 20 次」以及 `renderVals` 伪造的 `taskData/weekData/hist/days`。无数据 → 用设计自身的空态文案或 `—`；无能力 → `aria-disabled` 的「即将开放」而不是假按钮。头像一律首字母圆形。
- **i18n**：所有文案经 `useOrbitLanguage().t({zh,en})`，zh 值逐字取设计。
- `$DESIGN` = `/Users/li/work/orbit/docs/designs/Orbit_0918/iOrbit.dc.html`（911 行；设计文件不提交，读主仓）。**核对过的区间**：helmet 14–22；顶栏 27–41（`Calendar` 项已被用户取消，不实现——`ui-mapping-2026-09-18.md:6`）；home 46–253；chat 256–346；actions 349–426；plan 429–501；strategy 503–660；contacts 663–782；历史抽屉 786–804；`renderVals` 807–909。六屏都能在设计里点到（`initialView` 只是 props 快捷方式，没有演示切换条）。
- **验证数据**：本地库 `orbit_newui_events_20260922`（`.env.local` 已指向，dev server :3100 已起，不要重启/换库）；QA/主办方账号密码只从 `.env.local` 读，**任何文件、报告、提交信息里都写 `<password>` 占位**。
- **台账**：每任务 `- **iOrbit 任务 N 完成** \`<sha>\`：…` 追加到 `docs/development/2026-09-17-web/EXECUTION.md`；收尾写 `## 2026-09-22 iOrbit 屏级替换完成`（文件清单与页面接线 / 偏差总表 / 测试迁移表 / 像素终验表 / 回归 / 遗留清单）。

## 能力保全决定（本计划的硬性口径）

设计的历史抽屉（786–804）只有「扁平列表 + 日期 + 加载更多」，而现有实现有：可拖拽宽度的常驻侧栏、会话分组 CRUD、置顶、重命名、删除二次确认、移动端抽屉。沿用前五域的一贯做法（设计外能力保留、记偏差，如 Google 按钮 / 眼睛按钮 / 刷新名单）：

- **保留**：分组筛选条、每行 `···` 菜单（置顶 / 重命名 / 移动到分组 / 删除→二次确认）、删除 toast、移动端同一抽屉（不再单独实现一套），全部放进设计的抽屉结构内，记偏差。
- **落实设计**：「加载更多历史记录 ⌄」接真实 `cursor` 分页（现有实现是一次性拉完 ≤200 条）。
- **移除**：常驻左侧栏与拖拽宽度（设计无侧栏；这是本计划唯一的能力移除）。随之更新 `tests/ui/orbit-sidebar-width-constant.test.ts` 与 `app-agent-chat-history.test.ts:403`，并在台账「偏差总表」明确记为能力移除 + 理由。

## 文件结构（`$WEB/app/(app)/app/agent/iorbit-0918/`）

`iorbit-model.ts`（设计无关的纯函数：现有 `orbit-real-agent.tsx` 已导出的解析/分组/重试助手原样搬入，加本域新纯函数：日历格子、周次手风琴、优先级分组、相对时间）、`use-agent-chat.ts`（messages/panel/thinking/chatDraft/activeSessionId + `ask` + `persistCurrentSession` + `restoreSession` + hydration）、`use-agent-history.ts`（sessions/groups/分页/置顶/重命名/删除 + toast 状态）、`iorbit-shell.tsx`（`IORBIT_STYLES` 单一模板字符串 + 壳 + 抽屉挂载点）、`iorbit-home.tsx`、`iorbit-chat.tsx`、`iorbit-chat-aside.tsx`、`iorbit-history-drawer.tsx`、`iorbit-actions.tsx`、`iorbit-plan.tsx`、`iorbit-strategy.tsx`（含设计 contacts 段）。修改：`agent/page.tsx`、`agent/{actions,plan,strategy}/page.tsx`。删除（任务 6）：`orbit-real-agent.tsx`、`orbit-agent-dashboard.tsx`、`orbit-agent-today-workspace.tsx`、`orbit-ai-command-center.tsx`、`orbit-ai-route-view-model.ts`、`chat/chat-workspace.tsx` 及其子组件、`agent/{actions,plan,strategy}/orbit-agent-*.tsx` 三个旧屏。

## Tasks

- **Task 0**：`compare-0918.mjs` 加 `iorbit` 表（检测 `--design-table iorbit` 或 `--design` 含 `iOrbit.dc.html`；视图 home（无点击）/ chat（`button 进入对话页 →`）/ actions（**link** `查看建议与行动 →`）/ plan（**link** `查看完整日程 →`）/ strategy（`button 帮我制定推进计划`）/ contacts（`button 我该先联系谁`）/ history（`button ◷ 历史记录`）；注意 a/button 类型不同）+ README 段 + 七视图冒烟（当前旧 UI，数字只作工具可用性证明）。提交 `chore(visual): compare-0918 supports iOrbit design views`。
- **Task 1**：特征化测试先行（ask 往返、会话持久化、hydration、历史分页/分组/删除），再把纯函数与两个 hook 原样抽到 `iorbit-0918/`，旧组件改调、JSX 不动，**并从 `orbit-real-agent.tsx` 重新导出所有被测试直接 import 的符号**（`app-agent-chat-history.test.ts:13`、`app-agent-task-interaction.test.tsx:5`），既有 ~15 个 agent 套件全绿。一 hook 一提交：`refactor(agent): extract iorbit chat model / use-agent-chat / use-agent-history`。
- **Task 2**：`iorbit-shell.tsx`（`IORBIT_STYLES`，设计 14–22 + 27–41；顶栏沿用 `AccountTopNav active="agent"`，设计头部与之差异记偏差）+ `iorbit-home.tsx`（46–253）+ `agent/page.tsx` 接线（`!inChat` 分支改渲染新 home，旧 dashboard 暂留不删）。数据：`home-dashboard-route-service.ts`、`home-facts-view-model.ts`、`orbit-agent-next-actions.ts`、`GET /api/agent/signals`、`loadAppHomeRouteViewModel`、报名态。月历 ‹ › 无跨月数据源 → `aria-disabled`，记偏差；「已报名活动」「联系人机会」「本周推进」全部真实，无数据走空态。像素 home。
- **Task 3**：`iorbit-chat.tsx`（256–319）：日期分隔、用户气泡、助手回合（头像/名字/时间/正文/事件卡/反应行）、追问 chips、输入区、试试这些问题（复用 `viewModel.suggests`）。既有富组件（`AgentActionStatusCard`、`AgentTaskInteractionCard`、`AgentInlineDraftResult`、`PanelCards`、重试按钮、`ThinkingIndicator`、`AgentMarkdown` 动态导入）必须全部挂进新回合正文并逐条记偏差（设计无槽位）。反应行：⧉ = 现有复制能力；♡ = 现有 `POST /api/agent/feedback`（受设置门控，保持现状）；⌄ 无来源 → 省略，记偏差。像素 chat。
- **Task 4**：`iorbit-chat-aside.tsx`（321–343）+ `iorbit-history-drawer.tsx`（786–804，按上文「能力保全决定」）。aside：「已报名活动」真实；「兴趣方向」「目标人脉」「编辑」无来源 → 按既有「等接口」卡做法处理，记偏差。抽屉须过 `tests/ui/orbit-modal-standard.test.ts`（`role="dialog"`、`aria-modal`、`ORBIT_Z.modal`、`useOrbitModalA11y`）。同一提交里改 `app-agent-chat-history.test.ts` 的侧栏断言与 `orbit-sidebar-width-constant.test.ts`。像素 history。
- **Task 5**：三个兄弟屏归入同一壳：`iorbit-actions.tsx`（349–426）、`iorbit-plan.tsx`（429–501）、`iorbit-strategy.tsx`（503–660 + 把设计 contacts 663–782 并入，依 `ROUTE-CONSOLIDATION.md:52`），作用域统一为 `iorbit-0918`，三个 `page.tsx` 改指；旧 `orbit-agent-{actions,plan,strategy}.tsx` 删除，其 VM 测试保持（纯函数不动）；`orbit-top-nav-structure.test.ts:174` 同步。无来源的四处（plan 4 周节奏、strategy 缺什么人/准备什么、contacts 开场白）沿用既有「等 W4」卡，不得伪造。像素 actions / plan / strategy。
- **Task 6**：删除清单（见文件结构）+ 路由归并（`/app/chat`、`/app/today`、`/app/schedule`、`/app/followups`、`/app/tasks*`；**保留** `chat/.../chat-route-view-model.ts`，`agent/page.tsx:15` 仍引用；先修 `agent/page.tsx:74` 指向 `/app/chat` 的恢复链接）+ 链接生成器改向（`features/auth/app-auth-routing.ts` 白名单、`features/chat/live-async-service.ts stageHref`、7 处 followups 生成器）+ 测试改指（`orbit-agent-visual-design.test.ts` 6 例整体迁移到新屏语义、`orbit-agent-api-ui.test.ts` AST 断言、`core-product-ux-optimizations.test.ts` 4 例、`full-product-functional-audit.test.ts:890,911` 的字面量重试表达式）+ ratchet 清理（从 `orbit-button-ratchet.test.ts:141` 的 `CORE_FILES` 与 `:156-211` 的 10 条 EXEMPTIONS 移除旧文件、从 `orbit-scale-ratchet.test.ts:173` 的 `SNAPPED_FILES` 移除旧文件并把新屏加入，四个上限重新测量下调）+ 审计基线重生成（`npm run audit:surfaces`、`npm run audit:full-product`，记录 11 条 P1 的去向）+ 全量回归 + 像素终验七视图 + 台账收尾 + `ROUTE-CONSOLIDATION.md` iOrbit 各行 + `NEW-UI-DECISION.md` ⑥ 完成。

每任务模板：读设计对应行（行号先核对）→ TDD（SSR 结构 + fetch mock 的请求体断言）→ 像素 → `typecheck` + 两个 ratchet + `detect-changes` → 提交 → 台账。设计或仓库与本计划矛盾 → NEEDS_CONTEXT 即停。

## 已知陷阱（实现者必读）

1. `orbit-real-agent.tsx` 在 `orbit-scale-ratchet.test.ts:173` 的 `SNAPPED_FILES` 里（零容忍内联几何）——新屏加入该清单时四个上限要重新测量。
2. `orbit-button-ratchet.test.ts` 双向失败：新增非 `.btn` 按钮会红，**删掉 `:156-211` 里 10 条 EXEMPTIONS 对应的控件而不删条目也会红**。
3. 约 15 个测试文件对 `orbit-real-agent.tsx` 做源码正则，其中 `orbit-agent-api-ui.test.ts:94` 走 TS AST、`full-product-functional-audit.test.ts:890,911` 钉死字面量 `() => void ask(message.retryRequest!, index)`；`orbit-agent-visual-design.test.ts` 6 例断言的是旧绿色控制台皮肤，必须整体迁移而非打补丁。
4. 两份审计 JSON 带行号（`product-surface-manifest.json` 29 条、`full-product-functional-audit/inventory.json` 约 90 条），任何改动都要重生成。
5. `agent/page.tsx:74` 的恢复链接指向待删的 `/app/chat`。
6. `chat-route-view-model.ts` 必须活下来。
7. `ROUTE-CONSOLIDATION.md:50` 把 home 记为「已重建」，但 `orbit-agent-dashboard.tsx` 是批次 4a 融合态（`[data-orbit-agent-dashboard]` + `ag-*`），按边界 B 仍需重建——本计划 Task 2 覆盖，收尾时把该行改回实际状态。
8. `preview_start` 只认会话原目录的 launch 配置；dev server 用 `orbits-newui`（:3100，绝对路径），500 先 `touch` 对应 `page.tsx`。
9. 设计顶栏含已取消的 `Calendar` 项，不实现。
10. 抽屉与弹窗一律走 `useOrbitModalA11y` + `ORBIT_Z.modal`，不得手写 keydown 陷阱（`tests/ui/orbit-modal-standard.test.ts`）。

## 后续计划
本域完成即六域全部完成；收尾时评估 `newui/batch-0-shell-landing` → `chat-agent` 快进合并与工作树清理。

## 审阅修订（2026-09-22，独立评审 ~40 项——与上文冲突处一律以本节为准）

### A. 结构与作用域决定

1. **壳持有 `inChat`（取代上文 Task 2 的「`page.tsx` 的 `!inChat` 分支」——那是客户端状态，服务端组件看不到）**：Task 2 建 `iorbit-shell.tsx`（客户端）持有 `inChat`/`chatOpen`，`agent/page.tsx` 渲染壳；壳在 chat 分支先委托旧 `OrbitRealAgent`，home 分支渲染新屏。因此 `use-agent-chat` 必须在 Task 2 之前（见 K 的任务表）。
2. **作用域双层，冻结文件不动**：外层 div 保留 `data-orbit-real-page="agent"`（`orbit-reference-styles.tsx` 有 44 条该作用域规则，含顶栏 `.orbit-agent-history-btn` `:1882`），内层 div 加 `data-orbit-real-page="iorbit-0918"` 承载 `IORBIT_STYLES`。CSS 靠祖先选择器，两层同时生效；**不删冻结文件里的任何规则**，`orbit-agent-visual-design.test.ts:57-63` 对 `[data-orbit-real-page="agent"] {` 与 `--agent-canvas` 的断言因此继续成立。
3. **设计 contacts 屏 = `/app/agent/strategy?view=contacts`**（取代上文「并入 strategy」的含混说法）：两屏面包屑（503 `iOrbit / 对话 / 工作策略` vs 665 `iOrbit / 对话 / 联系人建议`）、H1、内容块都不同，合并会丢 开场白（704–705）与 相关活动（769–781）。按 `?view` 切换即可保持像素可比；`ROUTE-CONSOLIDATION.md:52` 行改写为「= `/app/agent/strategy?view=contacts`」。
4. **设计几何补录**：页面包裹 `:25` `min-height:100vh; background:#FBFBFE; overflow-x:clip`；`<main>` `:43` `max-width:1240px; margin:0 auto; padding:14px 40px 72px; display:flex; flex-direction:column; gap:26px`；各屏外层 gap：home 26px（`:47`），其余 22px（`:257/:350/:430/:504/:664`）。字体 `<link>` 在 11–13，全局 CSS 14–22。`renderVals` 实为 820–907（class 808–908）。
5. **顶栏**：沿用 `AccountTopNav active="agent"`；设计 27–41 的药丸头与其差异整体记一条偏差（不逐条改顶栏）；`Calendar` 项不实现。

### B. 必须保留的能力（上文未列或列错）

6. **全局提问集成**：新壳/新 chat 必须 `useOrbitAskTarget({busy, chips, onAsk: ask})` 并消费 `takePendingAsk()` / `takeAgentPrefill()`（旧实现 `orbit-real-agent.tsx:3615-3619, 3625-3644, 3670-3676`），否则其他页发起的提问静默丢失；`app-agent-live-route-services.test.ts:137-138`、`orbit-agent-visual-design.test.ts:41` 的断言随迁。
7. **深链与恢复**：`?q=`、`?session=`、`localStorage` key `orbit-agent-chat-active-session-v1`、`pickHistory` 的 `pushState`、`clearConversation` 回 `/agent` 全部属于 `use-agent-chat`，Task 1a 的特征化测试必须覆盖（已有断言 `app-agent-chat-history.test.ts:395-400`）。
8. **三类失败与幂等重试**：`ask()` 区分 (a) 可靠发送回执未 completed、(b) 供应商超时 `MODEL_REQUEST_FAILED`/`timed out`、(c) 通用失败，三者都挂 `reliableRequest`+`retryRequest`，重试复用同一 `requestId`/`clientMessageId`；`AbortController` 60s（`AGENT_REQUEST_TIMEOUT_MS`）。特征化测试逐一覆盖；**重试按钮的 onClick 表达式 `() => void ask(message.retryRequest!, index)` 要么逐字保留，要么在 Task 6b 改审计生成器的证据键**。今天没有用户可见的「停止」控件，不要新增。
9. **回合内既有富组件**（Task 3 必挂全）：上文已列的 7 个，外加 per-message `note` 行（`:3546-3551`）、**用户行也有复制按钮**（`:3536, :3582-3584`）、`useAgentTaskSuggestions` 的延迟补丁身份校验（`:2596-2604`）、`AgentWelcome`（`:1606`，设计 chat 无空态，必须保留）。
10. **信号写操作不得丢**：`orbit-agent-today-workspace.tsx:119-145` 的 `PATCH /api/agent/signals/{id}`（done/snoozed）+ 两枚行内按钮 + 刷新控件（`data-orbit-agent-signals-refresh`）要迁到 home 的「建议与行动」卡或 actions 屏；**设计 home 228 / plan 450 的勾选框若对应的是 ledger 任务（无写接口）→ 渲染为静态状态标记或 `aria-disabled`，记偏差**；对应信号的行则接真实 done/snooze。
11. **历史分页**：保持现有「一次性抽干所有 cursor 页」（`:878-902`），设计的「加载更多历史记录 ⌄」实现为**客户端逐段展开**。理由：置顶优先排序与分组计数是对全集做的（`:686-719, :2641-2646`），改成懒加载会让第 3 页的置顶会话排不到顶、分组计数错误。记偏差。
12. **抽屉行日期**：`OrbitAgentHistoryView.when` 现在放的是分组名而非日期（`:716`），设计 797 要日期 → 需要给该 view model 加字段（跨域导出，改前跑 `impact`）。
13. **抽屉细节**：遮罩 `z-index:100` `rgba(14,18,37,0.28)` + `blur(4px)`、右对齐、面板 `width:min(400px,92vw)` + `animation:orbit-fade .25s ease`；副标题「查看你与 iOrbit 的过往对话记录。」（790）、eyebrow「最近的对话」（793）；**首行底色 `#F7F7FD` 表示当前会话**（`h.bg`，`:905`）→ 绑 `activeSessionId` 而非「第一行」；遮罩点击关闭是设计允许的（788 有 `stop`），但要 `event.target === event.currentTarget` 守卫。
14. **Toast / 删除确认 / 乐观队列 / 跨标签刷新**全部保留：`ORBIT_Z.toast` + `role="alert"|"status"` + 关闭按钮（`:3854-3888`）、`alertdialog`（`:1304-1402`）、`agent-chat-session-mutations.ts` 的乐观队列与失败文案（`:3436-3474`）、`window.focus` 刷新（`:3138-3152`）。
15. **壳形态变化要明说**：旧实现是 `height:100dvh` 应用框 + 桌面/移动两套 DOM + 内部滚动容器 + 自动滚到底 + 固定输入坞（`:3687-3697, 3742, 3812, 3159-3162, 3798`），设计是普通文档流 `<main>` + 内联输入区（309–313）。本计划采用设计形态：**单套 DOM（移动端不再单独一棵树）**，自动滚到底改为新回合出现时 `scrollIntoView`，`data-orbit-ask-clearance="manual"`、`data-orbit-agent-request-state`、视觉隐藏 `<h1 data-orbit-agent-screen-title>` 全部保留在壳上。移动端顶栏历史按钮（`:3728-3736`）改为设计的「◷ 历史记录」。

### C. 设计遗漏补录

16. **home 还有五块上文没写**：提问输入 + 四 chips + 「打开对话」卡（59–74；其中「我该先联系谁」→contacts、「帮我制定推进计划」→strategy 是**导航**不是发消息）；今日日程（78–110，含「今日简报」两行 bullet——无来源，走空态/省略）；日历选中日交互（`d.pick` → `selLabel` → 右侧当日面板 135–143，是真交互；‹ › 在设计里本身也无 handler）；继续对话三张最近会话卡（237–251，真实来源 `GET /api/ai/conversations/sessions?limit=3`）；「查看活动推荐 →」「查看联系人建议 →」指向 `/app/events`、`/app/contacts`。
17. **chat 补录**：面包屑 258；「← 返回概览」265 映射 `backToDashboard`——但旧实现会清空线程，设计语义是**非破坏性返回**，改为只切视图不清消息，记偏差；日期分隔 272；**助手时间戳 10:24 无来源**（`AgentMessage` 无时间字段）→ 省略，记偏差；追问 chips 右对齐且四枚里两枚是导航（306/307）；「＋」附件无能力 → `aria-disabled` 或省略；aside 第一张卡「本次对话可继续」（322–327）上文漏了；「编辑」（334）链到 `/app/profile?view=persona` 而不是做假。
18. **actions 补录**：三段 `border-left` 颜色 `#B5473A`/`#4B4FC7`/`#9FA3C4`（360/373/390）、每行 CTA 文案各不相同、aside 三行计数 + `conic-gradient` 进度环（414–417）+ 语录卡（420–423）。现有 `orbit-agent-actions.tsx` 已很接近，按 K 表处理。
19. **plan 补录**：段头完成度条（446）、每行 `{{ t.due }}`「▦ 9月18日 前」（452）、四周手风琴 `open/caret/headBg` + 三张 `white-space:pre-line` 卡（459–476）、「✦ 让 iOrbit 优化计划 →」（478–482，`goChat` 且要带提示词进 `ask`）、aside 四行统计（末行是真实 `planPct`）、「回到日历 →」（496）回 **home**。
20. **mock 黑名单补充**：`days` 九月网格与 `dots{10,18,20,25}`（822–832）、`weekData` 里的人名（田中圭子/山本健一/佐藤直树，846–861）、`hist` 七行（871–876）、`done:[true,false,false]` 派生的 `planDoneLabel`/`planPct`、`selLabel`、「9/18 产品讨论 · 东京 AI 交流会」（495）、actions 的 2/3/2 计数。
21. **日历格子的动态字重**：`d.weight` 不得内联（违反本计划自身规则）→ 用修饰类 `ir-day-on`；32 个日期格都是 `btn ir-*` 且整段中和，这是本域最大的样式面风险。

### D. 测试与门禁的真实破坏点（取代上文对时点的估计）

22. **引用 `orbit-real-agent` 的测试是 28 个文件**（另有 4 个引用 `orbit-agent-dashboard`），不是 ~15。Task 1a 开工前先把这 32 个文件列进报告，作为「全绿」的判定集。
23. **上文四处遗漏的门禁**：`tests/services/modular-boundaries.test.ts:161`（路径常量）、`tests/performance/orbit-agent-markdown-split.test.ts:11-24`（`AgentMarkdown` 动态导入必须留在新 chat 文件且不得直接 import `react-markdown`）、`tests/pages/app-events-source.test.ts:32-48`（断言 `orbit-real-agent.tsx` 从 `../events/orbit-event-cover` 引入 `EventCover`——设计的事件卡是无图日期块，**改该断言并记偏差**）、`tests/pages/app-canonical-agent-personal-scope.test.ts:26`（按绝对路径 mock `OrbitRealAgent`，Task 2 换组件即失效）。
24. **♡ 反应**：`tests/pages/app-agent-feedback-controls.test.ts:38` 明令 chat 里**不得**出现 `<AgentOutcomeFeedback`（`orbit-real-agent.tsx:34` 的 import 是死的）→ ♡ 与 ⌄ 一并省略，记偏差；不改那条测试。
25. **首次变红时点**：Task 1（六个源码正则套件）→ Task 2（`app-canonical-agent-personal-scope:26`、`app-proactive-agent-message:94`、`app-agent-live-route-services`、`orbit-agent-visual-design:31-44`）→ Task 3（markdown-split、events-source）→ Task 4（无，旧文件还在）→ Task 5（`orbit-top-nav-structure.test.ts:171-177` **两个**文件）→ Task 6（其余 + dashboard 引用 + 29 条审计证据键）。每个时点的改指都必须与造成破坏的提交同一笔。
26. **`orbit-sidebar-width-constant.test.ts:25-51`** 在旧文件还在时一直是绿的，真正失效点是 Task 6a 的 `readFileSync` ENOENT（不是 Task 4）；该文件 `:67-74` 还读 `today/today-page-content.tsx`，也在 Task 6a 删除半径内。
27. **审计不是「重生成」而已**：`scripts/generate-full-product-functional-audit.mjs` 手工维护的证据键表里有 **29 条**指向 `orbit-real-agent.tsx`（`:2569, :2642, :2714, :2726-:2879`），含本计划要删的控件（resize handle `:2879`、侧栏新对话 `:2843`）；必须先改生成器键表再跑 `npm run audit:full-product`。`product-surface-manifest.json` 29 条、`inventory.json` 78 条、`2026-09-17-web-redesign-inventory/machine-inventory.json` 60 条 `app/tasks` 也要处理。
28. **必须保留的 `data-*` 标记**（测试与审计都吃）：`data-orbit-agent-request-state`、`data-orbit-agent-screen-title`、`data-agent-message-retry-request`、`data-orbit-agent-history-{menu,menu-button,delete,feedback,delete-confirmation,confirm-delete}`、`data-orbit-agent-message-copy`、`data-orbit-agent-signal`、`data-orbit-agent-signals-refresh`。
29. **`iorbit-model.ts` 不得含 React**（保持 node 测试可直接 import）；hook 文件才带 `"use client"`。
30. **链接生成器是 11 个文件 21 处**（不是 7 处）：`features/orbit-ai/mock-service.ts`(6)、`features/events/confirmed-followup/service.ts`(3)、`shared/knowledge/knowledge-manifest.ts`(2)、`app/(app)/app/inbox/inbox-panel-view-model.ts`(2)、`agent/orbit-agent-dashboard.tsx`(2)，以及 `features/orbit-ai/live-command-service.ts`、`features/auth/app-auth-routing.ts`、`features/agent/signals/source-collector.ts`、`orbit-public-shell.tsx`、`orbit-global-ask/orbit-ask-routes.ts`、`events/[id]/orbit-post-event-center.tsx` 各 1。
31. **`chat-view-model-adapter.ts` 也必须活下来**（`agent/page.tsx:20` 引用），不能随目录删；`features/chat/live-async-service.ts:387` 的 `/app/chat?conversationId=` 今天就是坏链（`/app/chat` 只转发 `q`/`lang`，且 `conversationId ≠ sessionId`）→ 记为既有缺陷，本计划只保证不恶化，改法（映射或降级为新对话）写进遗留。
32. **`/app/tasks*` 的替代能力不存在**：`ROUTE-CONSOLIDATION.md:19-20` 说由 plan 屏的 `?task=` 抽屉与最简个人日程增改替代，但两者都没建 → Task 6a 删路由前，要么补这两处最小能力，要么把删除推迟并记录（二选一，实现者在报告里说明并保持一致）。

### E. 像素口径（上文完全没写门槛，补齐）

33. **门槛**：每视图 raw mismatch ≤0.02，或框级归因后非数据残差 ≤0.005 且 diff 中无布局/圆角/间距/颜色差异。chat/actions/plan 的残差会被真实文本长度主导，实际以框级归因为准。
34. **chat 视图不能靠真实 LLM 应答**：用既有写接口种一条会话——`POST /api/ai/conversations/sessions` 带 `{session:{id,messages:[{role:"user"…},{role:"assistant",items:[…],kind:"events"…}],panel,…}}`（形状见 `orbit-real-agent.tsx:923-938`，由 `parseStoredAgentMessage:570` 校验），再截 `/app/agent?session=<id>`，走真实恢复路径且字节稳定。种子脚本写进 `scripts/visual/README.md`。
35. **history 视图必须 `--viewport-only`**（抽屉是 `position:fixed`，fullPage 会把两侧不同的页面高度算进分母），并先记一条 home 基线用于归因（沿用认证弹窗的落地页基线做法）。
36. **Task 0 必须包含数据准备清单**：QA 账号需有 ≥2 场已报名活动、≥2 条联系人机会、≥3 条信号、≥3 条会话，否则 home 半屏空态、像素数字无意义。
37. actions/plan/strategy 有 `pending/ready/empty/unavailable` 多态且 plan 是客户端 `fetch("/api/agent/ledger")`，compare 的固定 400ms 可能截到 pending → 加 `data-*` ready 标志或加等待。

### F. 任务重排（取代上文 Task 0–6 的七段划分）

| # | 范围 | 结束态/门禁 |
| --- | --- | --- |
| 0 | compare `iorbit` 表（7 视图，history 用 `--viewport-only`）+ README + **chat 会话种子脚本** + 数据准备 + 七视图冒烟 | 仅工具 |
| 1a | 对**现组件**补特征化渲染测试：ask 三类失败 + 幂等重试 + 60s abort + hydrate + `?q=`/`?session=` + pendingAsk/prefill + 历史分页/分组/置顶/重命名/删除 | 纯新增，全绿 |
| 1b | 抽 `iorbit-model.ts`（无 React）+ `use-agent-chat.ts`；**同一提交**把源码正则断言按「hook 文件 / JSX 文件」拆开并列表 | 1a 保证行为 |
| 1c | 抽 `use-agent-history.ts`；同上拆分 | |
| 2 | `iorbit-shell.tsx`（持 `inChat`）+ `iorbit-home.tsx` + `page.tsx` 接线 + 改指 25 条里属于本时点的四个套件 + 作用域双层落地 | 像素 home |
| 3 | `iorbit-chat.tsx` + `iorbit-chat-aside.tsx` + ask-target/pendingAsk/prefill 重新注册 + markdown-split / events-source 断言处置 | 像素 chat（种子会话） |
| 4 | `iorbit-history-drawer.tsx` + 把它加进 `tests/ui/orbit-modal-standard.test.ts` 的 `MIGRATED_FILES`（现在只有账号认证一项，否则「过门禁」是空话） | 像素 history |
| 5 | actions / plan / strategy（+ contacts 作 `?view=contacts`）：**先判定**三屏是「作用域重命名 + contacts 补齐」还是「重建」——若重命名，`aga-/agp-/ags-` → `ir-` 的机械替换单独一笔提交；`orbit-top-nav-structure.test.ts:171-177` 两个文件同改 | 像素 ×4 |
| 6a | **只做删除**：12 个组件文件 + 5 组路由 + 11 个链接生成器文件 + ratchet 表清理（`CORE_FILES:135`、`EXEMPTIONS:148`、`SNAPPED_FILES:167`）+ 四个上限重新测量 | 一笔可评审的 diff |
| 6b | **只做审计**：生成器证据键表（29 条）+ 两个 JSON + `machine-inventory.json` + 11 条 P1 去向 | 隔离最大churn |
| 7 | 全量回归 + 七视图像素终验 + 台账收尾 + `ROUTE-CONSOLIDATION.md` 50/51/52 行 + `NEW-UI-DECISION.md` ⑥ | 无代码 |

38. `ui-mapping-2026-09-18.md` 只存在于只读主仓 `/Users/li/work/orbit/docs/designs/Orbit_0918/`，工作树里找不到。
39. `orbit-button-ratchet.test.ts` 的常量位置更正：`CORE_FILES` 起于 `:135`（agent 条目 `:141`）、`EXEMPTIONS` 起于 `:148`（首条 `:154`）；`orbit-scale-ratchet.test.ts` 的 `SNAPPED_FILES` 起于 `:167`（agent 条目 `:172`）。四个上限 98/35/16/173 无误。
40. `orbit-ai-command-center.tsx`、`orbit-ai-route-view-model.ts` 确认无引用，可删。
