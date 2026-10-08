# Sprint W0005 — 人脉页示例模式

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-03（人脉部分）。**单一目标:** 开关打开且用户处于引导期时，人脉页的概览、关系管线、所有人脉和详情弹窗用同一位示例人物的 30 位联系人渲染，写操作拦截，扫名片／导入保持真实。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0004。
**进入条件:** W0004 completed（开关、进度判定、引导记录、示例人物与拦截组件已存在）。

## 范围与文件

- 读取：`app/(app)/app/contacts/page.tsx`、`dashboard/page.tsx`、`pipeline/page.tsx`、`[id]/page.tsx`、`contact-card-route-service.ts`、`network-0918/network-shell.tsx`、`network-cards.tsx`、`network-all.tsx`、`network-overview.tsx`、`network-pipeline.tsx`、`network-detail-modal.tsx`、`network-follow-modal.tsx`，W0004 的 `_demo/` 与 `features/guide/progress.ts`。
- 修改：上述页面入口（服务端判定后选择示例数据源；示例期间不调用 `loadContactCardRoute`、`loadContactsAnalysis` 等真实读取）、`network-shell.tsx`（横条）、各列表／概览／管线组件（示例数据、示例角标）、`network-detail-modal.tsx`、`network-follow-modal.tsx`（写按钮走 `guardWrite`）、`app/api/contacts/[id]/handler.ts`（`PATCH` 在调用 service 前拒绝 `demo:` 前缀 id）及对应测试。
- 新建：`app/(app)/app/_demo/demo-network.ts`（30 位联系人，8 位完整详情，字段形状与 `OrbitContactsViewModel`／`contact-card-view-model` 一致，与 W0004 故事一致；id 统一加 `demo:` 前缀）及测试。
- 排除：导入人脉页 `network-import.tsx` 的行为（保持真实）；`network-analysis.tsx`（示例期间只显示横条与说明，不另造数据）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0005-01 | 开关关闭或用户不在引导期时，人脉各页与改动前完全一致，真实读取照常发生 | 既有 `tests/pages/app-network-*` 不改断言通过 + 页面级测试（开关关） |
| SC-W0005-02 | 示例期间各页面入口不调用真实联系人读取；「所有人脉」显示 30 位示例联系人、6 个来源格子计数正确、可按来源筛选，每行带「示例」角标 | 页面级测试（开关开，断言真实 loader 未被调用）+ 组件测试 |
| SC-W0005-03 | 示例期间概览与关系管线按示例数据渲染；点任意示例联系人打开详情弹窗（8 位完整、其余简版），不发网络请求；`/app/contacts/demo:*` 这类 id 在开关关闭或非引导期直接 404 | 组件测试 + 路由测试 + 浏览器 |
| SC-W0005-04 | 示例期间「记录互动」「更新状态」等写操作被拦截且不发请求；任何写接口收到 `demo:` 前缀的 id 都拒绝；「扫描名片」「导入人脉」仍进入真实流程 | 组件测试 + `PATCH /api/contacts/[id]` 负例测试（`demo:` id 在调用 service 前被拒绝）；「记录互动」「更新状态」两个按钮在示例期间都不发请求 |
| SC-W0005-05 | 不引入新的回归 | 全部 `tests/pages/app-network-*`、`contact-card-browser.test.ts`、`app-contacts-primary-industry.test.tsx` 通过；typecheck |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0005/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0005-demo-mode-network` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（修改写接口 handler）；收口一次全量基线对照。
- 开发定向集：新增示例数据测试、`app-network-all`、`app-network-detail-modal`、页面级开关测试。
- 操作链收口集：全部 `tests/pages/app-network-*` + `contact-card-browser.test.ts`；typecheck。
- 不运行：App 端。

## 失败与交接

报告列出示例联系人与 W0004 故事的对应关系、`demo:` id 的拒绝点。
