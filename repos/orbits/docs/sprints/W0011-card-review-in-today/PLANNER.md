# Sprint W0011 — 名片待确认并入今日要事

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-02。**单一目标:** iOrbit 今日要事读取本机进行中批次的待确认名片数，作为一项要事显示；iOrbit 页上隐藏右下角浮动药丸，但名片状态机照常只运行一份。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0001。
**进入条件:** W0001 completed。

## 范围与文件

- 读取：`contacts/card-batch-0918/card-batch-host.tsx`、`card-batch-store.ts`（`listActiveBatches` 只读 localStorage 里的批次 id）、`card-batch-ui.tsx`（药丸）、`contacts/ingest-v2/ingest-v2-client.ts`（`fetchBatchDetail`）、`iorbit-home.tsx`。
- 修改：`card-batch-host.tsx`（新增「只隐藏药丸、不让出状态机」的路径规则：`/app/agent` 仅隐藏药丸，解析中进度与完成弹窗保留）、`card-batch-ui.tsx`（按该规则不渲染待确认药丸）、`iorbit-home.tsx`（新增名片要事项，排序在 critical/high 信号之后）及测试。
- 新建：`iorbit-0918/use-pending-cards.ts`（对 `listActiveBatches()` 的批次调用 `fetchBatchDetail`，只读计数，不运行 `useCardBatch`；监听 `orbit-card-batches` 事件刷新）及测试。
- 排除：服务端汇总待确认数的新接口；其他页面的药丸行为。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0011-01 | 有待确认名片时今日要事出现「确认 N 张新名片」，依据写批次创建时间（batch `createdAt`），按钮进入该批次审阅；排序在 critical/high 信号之后、其余信号之前 | 组件测试 |
| SC-W0011-02 | 在 `/app/agent` 上不再显示右下角「N 张名片待你确认」药丸，其他 `/app` 页面照旧；解析中进度与完成弹窗在 `/app/agent` 仍显示 | card-batch-host 测试（两条路径） |
| SC-W0011-03 | 读取计数不启动第二个状态机：`useCardBatch` 在 `/app/agent` 仍只由宿主运行一次，`use-pending-cards` 只发 GET | 测试断言 hook 只挂一次、只有 GET 请求 |
| SC-W0011-04 | 批次状态变化（确认完成）后今日要事的名片项消失 | 组件测试（派发 `orbit-card-batches` 事件） |
| SC-W0011-05 | 不引入新的回归 | card-batch 与 iOrbit home 测试；typecheck；浏览器用本地已有／预置批次走一次（不为验证新上传，避免 OCR 费用） |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0011/run-01/`。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0011-card-review-in-today` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：L。
- 开发定向集：use-pending-cards、card-batch-host、iOrbit home 新用例。
- 操作链收口集：card-batch 相关测试文件、`app-agent-iorbit-home.test.tsx`；typecheck。
- 不运行：全量；App 端。

## 失败与交接

报告写明 localStorage 批次登记的局限（换设备看不到本机上传中的批次）。
