# Sprint W0011 — 执行总结

## 目标实现情况

- 本轮要实现：待确认的名片不再只靠右下角药丸提醒，而是作为 iOrbit 今日要事中的一件事出现。
- 已验证能做到：
  - 有待确认批次时，今日要事出现「确认 N 张新名片」，依据写批次创建时间，按钮「去确认」进入该批次审阅；排序在 critical/high 信号之后、其余信号与 W0010「可能对应你的计划」之前（SC-01）。
  - `/app/agent` 上只有在首页读取器处于「读取中／已就绪」时才隐藏右下角药丸；读取失败时药丸回来兜底，不会两处都看不到；解析进度与完成弹窗照常显示；其他 `/app` 页面药丸照旧（SC-02，Codex review 后补失败兜底）。
  - 计数不启动第二个状态机：`useCardBatch` 仍只由宿主挂一次，`use-pending-cards` 只发 GET；计数与审阅页共用 `cardReviewQueue`，两边张数一致（SC-03，Codex review 后补计数一致）。
  - 批次确认完成后宿主派发 `orbit-card-batches`，今日要事里的名片项随即消失（SC-04）。
- 仍未实现或未验证：
  - 手机宽度只验证了布局（375 宽无横向滚动、无药丸）和导语，主稿卡片的视觉细节以桌面截图为准。

## 运行记录

- 原需求：RW-10（名片待确认并入今日要事）
- 结果：completed
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 分支：`sprint/W0011-card-review-in-today`；功能 SHA `25263402`
- 档位 L，另跑了全量：5539 条 42 失败，与上一基线新增 0、修复 0
- push：未执行

## 改了什么

| 功能 | 文件 |
| --- | --- |
| 待确认读取（只 GET，状态 pending／ready／unavailable） | `app/(app)/app/agent/iorbit-0918/use-pending-cards.ts`（新） |
| 今日要事名片项、导语与部分失败提示 | `iorbit-home.tsx` |
| 共享账本解析与计数 | `card-batch-model.ts`（`parseCardBatchLedger`、`cardReviewQueue`）、`card-batch-store.ts`（读取器状态 store） |
| 药丸按读取器状态隐藏 | `card-batch-host.tsx`（`cardBatchHostHidesPendingPill`）、`card-batch-ui.tsx`（`hidePendingPill`） |
| 抽出账本读取（行为不变） | `use-card-batch.ts`——**超出 PLANNER 白名单**：为让两处共用同一计数必须抽出 |
| 测试 | `tests/pages/app-card-batch-host-agent-pill.test.tsx`（新）、`tests/pages/app-iorbit-pending-cards.test.ts`（新）、`tests/pages/app-agent-iorbit-home.test.tsx` |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0011-01 | pass | iOrbit 首页测试（排序、依据、跳转）；浏览器桌面：导语「今天有 1 件事，最紧的是：确认 1 张新名片。」，主稿「确认 1 张新名片／去确认」 |
| SC-W0011-02 | pass | `app-card-batch-host-agent-pill.test.tsx`（/app/agent 读取中／就绪隐藏、失败回显、其他页面照旧、进度与弹窗仍显示）；浏览器：/app/agent 无药丸，/app/events 药丸仍在 |
| SC-W0011-03 | pass | 同上测试断言 hook 只挂一次、只有 GET；`app-iorbit-pending-cards.test.ts` 计数与 `cardReviewQueue` 一致 |
| SC-W0011-04 | pass | 首页测试派发 `orbit-card-batches` 后名片项消失 |
| SC-W0011-05 | pass | 定向集 161/161；`tsc` 0；全量对照新增 0；浏览器用本地已有批次（未新上传，无 OCR 费用） |

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 读取失败或读取中时药丸被隐藏，用户两处都看不到待确认名片 | 采纳 | 读取器三态；只在 pending／ready 隐藏，unavailable 时药丸兜底 |
| 首页计数与审阅页计数口径不同（可能不一致） | 采纳 | 抽出 `cardReviewQueue` 两处共用，新增一致性测试 |

## GitNexus

- staged detect-changes：10 文件、47 符号、0 流程，risk low。

## 交接

- 费用：0 次付费 AI 调用。
- 回退：`git revert` 合并提交即可恢复药丸提醒。
