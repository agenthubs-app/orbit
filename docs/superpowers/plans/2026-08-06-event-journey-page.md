# 活动旅程页（三卡片）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/app/events/[id]` 重组为「活动信息 / 活动现场 / 会后中心」三张随报名状态变形的大卡片（设计定稿：`docs/designs/journey/event-journey-green.html`），全部数据走已有真实接口。

**Architecture:** 不新建路由、不改数据层。`OrbitRealEventDetail` 的导出契约 `{ event, workspaceAvailable }` 不变（GitNexus impact：唯一调用方 `AppEventDetailPage`，LOW）。改造集中在 `EventDetailPanel`：现有的 lifecycle-aware 区块排序升级为三张卡片容器 + 折叠状态机。卡片 B 的暗色域用 **局部 token remap**（照 orbit-theme.tsx 的既有手法：一个作用域类重定义 `--surface/--ink/--text-*/--border*`），让内嵌的 `OrbitEventMatchmaking` / 参会者列表等真实组件免改自动换肤。

**Tech Stack:** 既有栈——React client component、inline `t({en,zh})` 双语、`orbit-reference` token 体系、组件内 `<style dangerouslySetInnerHTML>`（先例：`orbit-real-home.tsx`）。

## Global Constraints

- 导出符号契约不变：`OrbitRealEventDetail({ event, workspaceAvailable })`、`eventTime`、`canUseEventDetailHistoryBack` 保持导出。
- 一切文案走 `t({ en, zh })`；不新增硬编码单语文案。
- 数据只用已确认存在的端点：`GET /api/events/[id]/registration?questions=false`（已在文件内使用）、`OrbitEventMatchmaking`（内部拉 matches/readiness/contact-requests）、`OrbitEventQuickSignup`（两题+报名）、`OrbitPostEventCenter`（会后）。**不新增后端**；进度条按此前决定由 `event.agenda` + `eventTemporalBounds` 前端推算。
- Mock 仅允许出现在两处、且必须带「AI 示例」标识（产品决定）：未报名时卡片 B 的共用钩子、未结束时卡片 C 的示例复盘。其余一律真实数据。
- 提交前跑 `node .gitnexus/run.cjs detect-changes`（CLAUDE.md 规定）与相关测试：`node --test --import tsx tests/pages/app-event-detail-page.test.tsx`。

## 三态定义（状态机）

来源：`registrationStatus`（服务端首帧 `event.stats.youRsvped`，客户端 `/registration` 校正）+ `event.status`。

| stage | 条件 | 卡 A | 卡 B | 卡 C |
|---|---|---|---|---|
| `pre` | `!youRsvped` | 全展开（标题/信息/两题速答/关于/议程/报名 CTA） | 共用 mock 钩子 + 「报名后解锁」 | 示例复盘（AI 示例标识） |
| `joined` | `youRsvped && !ended` | 收成迷你条（时间+地点+已报名徽章），可展开 | 真实内容：进度条 + Orbit Match 摘要/分桌 + matchmaking + 参会者 | 示例复盘（提示会后自动生成） |
| `post` | `youRsvped && ended` | 迷你条（已结束徽章） | 折叠条（战报）+「回顾现场内容」展开真实内容 | `OrbitPostEventCenter`（真实） |

`!youRsvped && ended`：按 `pre` 布局但隐藏报名 CTA 与钩子解锁按钮（沿用现有 `ended` 分支语义）。

---

### Task 1: 折叠原语 + 三态派生 + 卡片 A

**Files:**
- Modify: `repos/orbits/app/(app)/app/events/[id]/orbit-real-event-detail.tsx`（`EventDetailPanel` 主体，约 258-485 行）

**Interfaces:**
- Produces: `type JourneyStage = "pre" | "joined" | "post"`；局部组件 `JourneyCollapse({open, children})`（grid-template-rows 0fr/1fr 动画）与 `JourneyCardShell({tone: "light"|"nite"|"tint", ...})`。
- Consumes: 现有 `registrationStatus` / `ended` / `registrationSection` / `aboutSection` / `agendaSection` / `OrbitEventQuickSignup`。

- [ ] Step 1: 在 `EventDetailPanel` 内派生 `stage`，新增 `aOpen`（卡 A 展开态，`stage==="pre"` 默认 true）、`bOpen`（post 态回顾）本地 state。
- [ ] Step 2: 组件底部注入 `<style>`：`.orbit-journey-collapse{display:grid;grid-template-rows:0fr;transition:grid-template-rows .28s ease}` `.orbit-journey-collapse.is-open{grid-template-rows:1fr}` `.orbit-journey-collapse>div{overflow:hidden}` + 迷你条样式。
- [ ] Step 3: 卡 A：`stage!=="pre"` 时渲染迷你条（`eventTime()` 的日期块 + venue + `badge`(已报名/已结束) + 「活动详情」chevron 按钮切 `aOpen`），完整内容包进 `JourneyCollapse`；`pre` 时直接展开且含 `OrbitEventQuickSignup`（速答两题——真实报名入口）与 `primaryAction`。
- [ ] Step 4: 手测三态（改 `event.stats.youRsvped` mock 场景 + dev server 走查）。
- [ ] Step 5: Commit `feat(events): journey card A with stage-aware collapse`。

### Task 2: 卡片 B「活动现场」——暗色域 remap + mock 钩子 + 真实区块

**Files:**
- Modify: 同上文件

**Interfaces:**
- Produces: 作用域类 `.orbit-journey-nite`：重定义 `--surface:#182c2b; --surface-2:#14282b; --surface-3:rgba(255,255,255,.06); --ink:#fff; --text:rgba(255,255,255,.92); --text-2:rgba(255,255,255,.66); --text-3:rgba(255,255,255,.5); --text-4:rgba(255,255,255,.4); --border:rgba(255,255,255,.13); --border-2:rgba(255,255,255,.2); --border-strong:rgba(255,255,255,.3); --accent-soft:rgba(255,255,255,.1); --accent-softer:rgba(255,255,255,.05)`，背景取设计稿渐变（`#14201e → #14282b → #123437` + 两个 radial）。
- Consumes: `matchmakingSection`（原样）、`attendeesSection`（原样）、`aiSummaryStrip`（并入 B 头部）、`aiSummary.roundOneTable/TwoTable`。

- [ ] Step 1: B 壳：eyebrow「On-site · 现场」+ `h-section` 标题「活动现场」+（joined 且进行中）LIVE 徽章。
- [ ] Step 2: `pre`：共用 mock 钩子（推荐的人×3 / 座位示例 / 开场白示例，毛玻璃 `rgba(255,255,255,.07)+blur`，「AI 示例」chip）+ `btn`「报名后解锁你的真实匹配」→ `/app/events/[id]/register`（真实入口）。`ended && !youRsvped` 时不渲染解锁按钮。
- [ ] Step 3: `joined`：进度条（Task 3）+ aiSummaryStrip 内容 + `matchmakingSection` + `attendeesSection`，全部包在 `.orbit-journey-nite` 内。
- [ ] Step 4: `post`：折叠条「活动已结束 · 名片交换 N 张」（N=`aiSummary.acceptedContacts.length`，真实）+「回顾现场内容」展开 joined 内容。
- [ ] Step 5: 暗域对比走查（matchmaking 卡、attendee 卡在 remap 下可读；发现硬编码色再补局部覆盖）。Commit `feat(events): journey card B on-site dark scope`。

### Task 3: 活动进程进度条（agenda 推算，无新后端）

**Files:**
- Modify: 同上文件

**Interfaces:**
- Produces: `function agendaProgress(event, now): { items: {time,label}[], currentIndex: number }`——用 `eventTemporalBounds(event.startsAt…)` 的 start 日期 + `item.time`（"HH:mm"）合成时刻；`now < event start` → currentIndex -1；`ended` → 全 done。

- [ ] Step 1: 实现 `agendaProgress` 纯函数（放组件外，便于测试）。
- [ ] Step 2: 横向滚动条 UI（`overflow-x:auto`、done=live-soft 勾、current=白底 accent 字），仅 `event.agenda.length>0` 时渲染。
- [ ] Step 3: 单测：`tests/pages/` 新增 `event-journey-agenda-progress.test.ts`——三个用例（未开始/-1、进行中命中正确项、已结束全 done）。跑 `node --test --import tsx tests/pages/event-journey-agenda-progress.test.ts`。
- [ ] Step 4: Commit `feat(events): agenda-derived live progress strip`。

### Task 4: 卡片 C「会后中心」

**Files:**
- Modify: 同上文件

- [ ] Step 1: C 壳：eyebrow「Post-Event」+「会后中心」标题 + 右侧 chip（未结束=「AI 示例」，结束=「iOrbit 生成」）。
- [ ] Step 2: `pre|joined`：accent-softer 底 + 毛玻璃示例复盘（复盘说明 + 3 个示例 stat-pill + 注释文案区分 pre/joined），全部 `t()` 双语。
- [ ] Step 3: `post`：原样渲染 `OrbitPostEventCenter`（真实数据），删除旧的顶层 `postEventSection` 排序位。
- [ ] Step 4: Commit `feat(events): journey card C post-event center`。

### Task 5: 验收

- [ ] Step 1: `node --test --import tsx tests/pages/app-event-detail-page.test.tsx tests/pages/app-canonical-event-detail-view.test.ts`——对照改前基线（memory：仓库存在既有失败基线，先记录改前结果再比对）。
- [ ] Step 2: dev server 三态走查（未报名账号 / 已报名 / ended 活动），移动端 375px 粘底 CTA 不回归。
- [ ] Step 3: `node .gitnexus/run.cjs detect-changes` 确认只影响预期符号。
- [ ] Step 4: Commit（若有修正）。

---

# 子系统 2：iOrbit 工作台（home+chat+agent 合一）——独立计划，另行执行

设计定稿：`docs/designs/journey/home-console-green.html`。范围：`OrbitRealAgent` 空态改为 dashboard（复用 home route view model 的 stats/events + appointments + 关系信号），对话页加返回键，`/app/home`、`/app/chat` 按 followups 先例收敛重定向，悬浮球全局化（AgentDock 泛化）。**本计划不含**，等子系统 1 验收后单独出计划。
