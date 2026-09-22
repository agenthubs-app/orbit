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
