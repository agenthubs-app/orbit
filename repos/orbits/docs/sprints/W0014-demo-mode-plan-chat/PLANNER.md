# Sprint W0014 — 我的计划与示例对话的示例模式

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-03（我的计划、示例对话部分）。**单一目标:** 开关打开且用户处于引导期时，`/app/agent/plan` 与示例对话用 W0004 的示例人物数据渲染（复用 W0008 计划卡片与 W0009 计划页组件），所有真实读取与写入都不发生。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0004、W0008、W0009。
**进入条件:** W0004、W0008、W0009 completed。

## 范围与文件

- 读取：`app/(app)/app/agent/plan/page.tsx`、W0009 的 `iorbit-plan.tsx` 与 view-model、`iorbit-shell.tsx`（`useAgentChat` 在示例期间的挂载方式）、W0008 的 `iorbit-plan-card.tsx`、W0004 的 `_demo/` 与 `features/guide/progress.ts`。
- 修改：`plan/page.tsx`（服务端判定后选择示例数据源）、`iorbit-plan.tsx`（接受示例数据、写操作走 `guardWrite`）、`iorbit-shell.tsx`（示例期间不挂载真实对话请求，示例问答以只读会话打开）、`_demo/demo-persona.ts`（补充示例计划与示例问答，形状与 W0007／W0008 一致）及测试。
- 新建：无（复用既有文件）。
- 排除：真实计划页与对话行为（W0008／W0009 已交付）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0014-01 | 开关关闭或用户不在引导期时，计划页与对话页与改动前一致 | 既有 plan／chat 测试不改断言通过 + 页面级测试（开关关） |
| SC-W0014-02 | 示例期间计划页显示示例计划（本周、阶段、人脉需求、进展记录）并带横条与示例角标，不调用 `/api/agent/plans*` 与 `/api/agent/ledger` | 页面级测试断言真实读取未调用 + 组件测试 |
| SC-W0014-03 | 示例期间从最近对话打开示例问答，显示 W0008 同款计划卡片（示例数据），不调用 `/api/ai/conversations*`；追问与打勾等写操作被拦截 | 组件／页面测试（逐个接口断言） |
| SC-W0014-04 | 浏览器可见 | 桌面与手机截图 |
| SC-W0014-05 | 不引入新的回归 | plan、chat、iOrbit 相关测试；typecheck |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0014/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0014-demo-mode-plan-chat` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：L（仅前端数据源切换，真实写接口不变）；若 `iorbit-shell.tsx` 的 impact 为 HIGH 升 H。
- 开发定向集：plan 与 chat 页面级测试、示例数据测试。
- 操作链收口集：`app-agent-plan-route-view-model`、`app-agent-iorbit-screens`、`app-agent-iorbit-chat`、`app-agent-iorbit-home`；typecheck。
- 不运行：全量（纯 L）；App 端。

## 失败与交接

报告写明示例计划与示例问答的数据来源、与 W0004 故事的一致性。
