# Sprint W0006 — 独立引导页 /app/start

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-04、RW-05（第 3 步就地改目标）。**单一目标:** 新建 `/app/start` 全屏引导：步骤条 + 当前步骤模块，1–3 步严格顺序、第 4 步随时；进度从真实数据推导 + 引导记录（含当前步骤），可中途离开、换设备续做。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0002、W0003、W0004。
**进入条件:** W0002、W0003、W0004 completed。复用 W0004 的开关 `ORBIT_GUIDE_DEMO` 与老用户规则（D2：老用户第 1、2 步视为完成，无计划时直接停在第 3 步，永不进入示例）。第 3 步的「开始分析」在 W0008 完成前跳转到对话页并提示「计划生成即将上线」，不伪造计划。

## 范围与文件

- 读取：W0004 的 `features/guide/*`、`_demo/demo-mode-context.tsx`；W0002 的目标编辑器；`app/(app)/app/profile/onboarding-0918/`（名片流程在引导内的挂法，commit 76716076）；`contacts/card-batch-0918/card-batch-host.tsx`（`YIELD_PREFIXES`）、`use-card-batch.ts`；`proxy.ts`、`app/(app)/app/profile/profile-onboarding-route-policy.ts`（约 16 行豁免列表、约 29 行门禁）、`profile-onboarding-access.server.ts`。
- 修改：`features/guide/progress.ts`（加入跳过标记、第 4 步）、`features/guide/guide-state.ts`（新增 `step1Skipped`、`currentStep`、`completedAt`，`version` 递增；`currentStep` 在用户切换步骤和步骤完成时写入）、`app/api/guide/state/route.ts`（接受新字段并校验）、`profile-onboarding-route-policy.ts`（豁免 `/app/start`）、`card-batch-host.tsx`（`YIELD_PREFIXES` 加 `/app/start`）、W0004 横条（链接到 `currentStep`）及测试（含 proxy／route policy 测试）。
- 新建：`app/(app)/app/start/page.tsx`（服务端判定：开关关 → 重定向 `/app/agent`）；`app/(app)/app/start/start-guide.tsx` 及四个步骤模块；对应测试。
- 排除：计划生成本体（W0008）；社群卡片与加入记录本身（W0003，第 4 步直接复用 `community-card.tsx` 与 `/api/community/membership`）；把 onboarding 并入引导。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0006-01 | 开关关闭时 `/app/start` 重定向到 `/app/agent`；开关打开时，资料未完成的用户也能进入 `/app/start`（门禁豁免），其余 `/app/**` 路由的 onboarding 门禁行为不变 | route policy／proxy 测试（豁免与仍拦截各一例）+ 页面测试 |
| SC-W0006-02 | 步骤状态由真实数据与引导记录推导：已确认联系人 ≥3 或已跳过 → 第 1 步完成；有目标 → 第 2 步完成；D2 老用户第 1、2 步直接完成；有计划 → 第 3 步完成；报名过任意真实活动或 W0003 社群加入记录存在 → 第 4 步完成；1–3 步严格顺序，未完成前一步时点后续步骤只提示不切换，第 4 步随时可开 | progress 纯函数测试（含老用户、跳过、顺序锁）+ 组件测试 |
| SC-W0006-03 | 第 1 步显示「已确认 x / 3」、待确认名片数和扫名片入口（`/app/start` 自己挂状态机，宿主让出，不重复处理）；「先这样，继续」写入跳过标记；第 2 步用 W0002 编辑器；第 3 步显示当前目标并可就地修改（草稿，取消不覆盖） | 组件测试 + card-batch-host 测试（`/app/start` 让出） |
| SC-W0006-04 | 两个独立客户端（不同 cookie 会话、同一 actor）读取同一 `currentStep`，刷新或换浏览器停在同一步；引导记录接口只改本人、拒绝非法字段与非法步骤值 | `/api/guide/state` 路由测试（双客户端、他人、非法值）+ 浏览器两次进入 |
| SC-W0006-05 | 不引入新的回归 | card-batch、onboarding、profile 门禁、iOrbit、guide 相关测试文件通过；typecheck；一次 `npm test` 全量与基线对照 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0006/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0006-start-guide` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（路由门禁、写接口、共享状态机）。
- 开发定向集：guide 纯函数、`/api/guide/state` 路由测试、route policy 测试、start-guide 组件测试。
- 操作链收口集：card-batch、onboarding、profile 门禁、iOrbit 相关测试文件；typecheck；一次全量基线对照（RULES 5.2）。
- 不运行：App 端；生产数据写入。

## 失败与交接

报告写明第 3 步在 W0008 前的过渡行为、引导记录字段与写入时机、门禁豁免范围、`YIELD_PREFIXES` 改动的影响。
