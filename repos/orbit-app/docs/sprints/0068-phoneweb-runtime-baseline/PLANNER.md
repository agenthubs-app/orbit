# Sprint 0068 — phoneweb 运行时基座归位

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 02 节（未合并存量）与第 11 节 Phase 0；用户明确"phoneweb 是要进主线的"。
**单一目标:** 把 Phone Web 运行时基座合并进主线，原生行为不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `a0b1f088a`（0067 已 completed）。
**进入条件:** 0067 completed。只用本机环境，不部署、不连云端。

## 权威源选择（本 Sprint 的前置判定，已完成）

21 个 phoneweb 文件散落在 9 条分支上。逐项核对结论：

- 六条候选分支（`phoneweb-a-0010`／`b-0011`／`c-0012`／`consume-0052`／`investor-mobile-web`／
  `sprint-0053`）的核心运行时文件**组合 SHA256 完全相同**（`1309e04d531cd034`），无分叉要调和。
- 各分支之间**无祖先关系**，是从共享基线反复机械消费出来的并列线。
- 完整 delta 差异极大：`consume-0052` 276 个代码文件，`a-0010` 79 个（含 16 个与 phoneweb
  无关的 AI artifact/会话改动），而 `phoneweb-a-runtime` 38 个、`phoneweb-c-journeys` 32 个，
  且两者 **orbits 侧零改动**。

**选定：合并 `codex/phoneweb-a-runtime` 与 `codex/phoneweb-c-journeys` 两条。**
理由：它们的并集覆盖运行时基座的 18 个新文件，且不夹带任何 orbits 侧产品改动。
`a-0010` 虽是 21 文件并集，但会连带 AI artifact 工作，属范围蔓延，本 Sprint 拒绝。

**明确延后（不是遗漏）：** `docs/phoneweb/vercel.example.json`、
`scripts/phoneweb-retime-events.cjs`、`scripts/phoneweb-retime-events.test.cjs`
共 3 个文件是 phoneweb 部署与测试数据助手，不属运行时基座，留待实际需要部署 phoneweb 时单独处理。

## 集成方式

沿用 0067 固定约定：`git merge --no-ff`，两条分支分别一次 merge，不 rebase。理由见
[0067 PLANNER](../0067-mainline-production-alignment/PLANNER.md#集成方式本-sprint-的固定约定)。

## 范围与文件

- 读取：两条源分支 diff、[RULES](../RULES.md)、本目录 GOAL／PLANNER。不重新盘点全库。
- 新建（由 merge 带入，18 个）：`src/api/{ApiBaseUrlProvider.web.tsx, base-url.web.ts,
  browser-api-origin.ts, browser-auth.ts, batch-image-source.ts, batch-image-source.web.ts}`、
  `src/notifications/push-device-session.web.ts`、`src/screens/settings/ApiSettingsScreen.web.tsx`、
  `scripts/{phoneweb-server.cjs, phoneweb-journey-smoke.mjs, phoneweb-journey-support.mjs}`、
  对应 7 个测试文件。
- 修改（冲突合并）：`app.config.ts`、`package.json`、`src/api/AuthSessionProvider.tsx`、
  `src/api/batch-images.ts`、`src/components/{AppScreen.tsx, OrbitTabBar.tsx}`、
  `src/i18n/OrbitLocaleProvider.tsx`、`src/screens/ai/AiConversationScreen.tsx`、
  `src/screens/settings/SettingsScreen.tsx` 及相关既有测试。
- 排除：orbits 侧任何改动；phoneweb 线的产品消费工作；Web 本地优先实现（0077／0078）；
  phoneweb 部署、域名与公网发布；上列 3 个延后文件。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0068-01 | 两条源分支均已成为主线祖先：`git merge-base --is-ancestor <each> chat-agent` 退出码 0；18 个基座文件在主线存在 | 命令与退出码、文件清单 |
| SC-0068-02 | 原生不被 Web 实现污染：`repos/orbit-app` 全量测试相对合并前**零新增失败**（同环境前后对照，不引用历史环境数字） | 前后两份全量摘要 + 失败集合 diff |
| SC-0068-03 | 基座自带测试在主线可跑：7 个新增测试文件全部通过；`npm run typecheck` 0 error | 命令、退出码、通过数 |
| SC-0068-04 | 合并未夹带 orbits 改动：本次两个 merge commit 的 `repos/orbits` 变更文件数为 0 | `git diff --name-only` 统计 |
| SC-0068-05 | 集成方式合规：两次 `--no-ff` merge，提交信息 `merge(sprint-0068): ...`；staged `detect_changes` 范围已核对 | detect_changes 摘要与 commit SHA |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. 先跑 `repos/orbit-app` 合并前全量，冻结对照基线（SC-02 需要同环境前后对照）。
3. 对被修改的共享符号（`AppScreen`、`OrbitTabBar`、`AuthSessionProvider`）做 GitNexus upstream impact，HIGH/CRITICAL 先报告。
4. 在 `codex/sprint-0068-phoneweb-baseline` 分支依次 merge 两条源分支，逐个解冲突。
5. 跑 SC-03 定向集与 typecheck；跑合并后全量做 SC-02 对照。
6. 路径限定暂存 → staged `detect_changes` → commit → 合并回 `chat-agent` 并验证合并树。
7. 写 `REPORT.md`，更新登记表。

## 最小测试与检查

- 档位：**H**。改动落在跨端共享外壳（`AppScreen`、`OrbitTabBar`、`AuthSessionProvider`、locale provider）上。
- 开发定向集：7 个新增测试文件 + 被修改的既有测试（`app-wide-route-coverage`、
  `auth-session-provider-races`、`ink-signal-shell`、`app-locale-account-sync`、`mobile-route-access`）。
- 操作链收口集：`repos/orbit-app` 全量 + `npm run typecheck`。
- 集成触发：含 H，本地代码收口时对 App 端跑一次全量；`repos/orbits` 若 diff 为空则复用 0067 证据并说明。
- 不运行：orbits 全量（本 Sprint 不改 orbits）、iOS Simulator 真机验收（不改原生业务行为，
  平台分流由断言覆盖；真实设备 Web 行为留给 0078）、任何部署。

## 失败与交接

若两条分支对同一既有文件的改法冲突且无法在不改变任一侧语义下调和，停止合并、
保留冲突清单并产出 `blocked` 报告，不擅自选边。
若 App 全量出现新增失败且无法定位到具体源码原因，如实记录为 `failed`，不以"环境波动"搪塞。
报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
