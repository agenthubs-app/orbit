# Sprint W0009 — 「我的计划」页

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-10、RW-07（有计划时活动推荐理由改为对应阶段）。**单一目标:** 把 `/app/agent/plan` 改成「我的计划」：报头（目标 + 周进度刻度）、左栏本周与阶段、右栏人脉需求与活动、底部进展记录；iOrbit 本周推进改为读计划。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0007（真实内容需要 W0008）。
**进入条件:** W0007、W0008 completed（页面要以真实生成的计划验收，不以测试数据宣称产品完成）。

## 范围与文件

- 读取：`app/(app)/app/agent/plan/page.tsx`、`iorbit-0918/iorbit-plan.tsx`、`plan-route-view-model.ts`、`iorbit-home.tsx`（本周推进栏）、W0007 接口、原型第 9 版「我的计划」页。
- 修改：`plan/page.tsx`、`iorbit-plan.tsx`（整体重写）、`plan-route-view-model.ts`（改为读计划；无计划时引导去第 3 步）、`iorbit-home.tsx`（本周推进：有计划读计划，没有计划保留原 ledger 显示）及对应测试 `app-agent-plan-route-view-model.test.ts`、`app-agent-iorbit-screens.test.tsx`、`app-agent-iorbit-home.test.tsx`。
- 新建：`features/plans/week.ts`（周次计算：以计划 starts_on 为第 1 周；到期未完成滚入当前周并计「已延后 N 周」；不复用跟进队列时钟逻辑）及测试；页面样式文件。
- 排除：进展记录的周一小结与重新分析提示（W0012）；人脉需求的匹配确认（W0010）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0009-01 | 有计划时页面显示目标原文、「第 n 周 / 共 N 周」刻度（阶段区间与本周高亮）、目标分析默认折叠；无计划时显示空状态并链接第 3 步 | view-model 测试 + 组件测试 |
| SC-W0009-02 | 本周列表列出建议周次 ≤ 本周且未完成的行动，逾期的标「已延后 N 周」；打勾调用 W0007 PATCH 并写进展记录，失败时回滚并提示 | week 纯函数测试（跨周、逾期、刚好本周）+ 组件测试 |
| SC-W0009-03 | 右栏列出人脉需求（已建立联系 / 已关联计数、人员按添加倒序）与计划里的活动；底部进展记录可手动添加一条 | 组件测试 + 浏览器 |
| SC-W0009-04 | iOrbit 本周推进：有计划时显示当前阶段名、本周最多 3 件可打勾的行动、行动与已建立联系计数、「查看完整计划 →」；无计划时保持 W0001 行为 | `app-agent-iorbit-home.test.tsx` 新增用例 |
| SC-W0009-05 | 有生效计划时，活动推荐理由改为「对应你计划第 n 阶段：认识 ___」；无计划时保持 W0003 的「匹配你的目标：『…』」；不引入新的回归 | 推荐测试（有计划／无计划）；plan／iOrbit 相关测试文件通过；typecheck；浏览器桌面与手机 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0009/run-01/`。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0009-my-plan-page` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：L（读既有接口 + 界面），打勾写入走 W0007 已验证的接口。
- 开发定向集：week、plan view-model、plan 组件、iOrbit home 新用例。
- 操作链收口集：`app-agent-plan-route-view-model`、`app-agent-iorbit-screens`、`app-agent-iorbit-home`；typecheck。
- 不运行：全量；App 端。

## 失败与交接

报告写明 4 周节奏占位卡片的去留、本周推进在无计划时的回退行为。
