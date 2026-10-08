# Sprint W0008 — 生成第一份计划（界面版，mock 数据）

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-08（AI 部分按 D3 延后）。**单一目标:** 第 3 步的固定问题直接调用新的 `POST /api/agent/plans/bootstrap`，由 mock 生成器一次原子地产出并保存完整计划；前端在对话页用确定性的分段揭示做出「生成中 → 已完成」过渡；完成后是「我的计划 v1」。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0006、W0007。
**进入条件:** W0006、W0007 completed。按 D3：**不调用任何付费 AI**。不改动 `/api/ai/conversations` 的请求契约（`ReliableAiSendInputContract` 没有 `intent` 字段，也不为此新增）。因为 mock 不需要后台任务，生成在一次 POST 内完成并落库；接真实 AI 时再另开 Sprint 引入持久化生成任务。

## 范围与文件

- 读取：`iorbit-0918/iorbit-model.ts`（`AgentMessage` 联合类型）、`iorbit-chat.tsx`（助手消息渲染分支，约 175–236 行）、`iorbit-shell.tsx`、`shared/contract/ai-sessions.ts`（确认不改）、W0006 第 3 步、W0007 的 plans 服务、原型第 9 版回答页。
- 修改：`iorbit-model.ts`（助手消息新增可选 `planCard` 字段，仅前端类型，不进共享契约）、`iorbit-chat.tsx`（新增渲染分支）、`iorbit-shell.tsx`（支持 `?plan=<id>` 打开已保存计划的卡片）、W0006 第 3 步（改为真正发起生成）及测试。
- 新建：`features/plans/generator.ts`（`PlanGenerator` 接口：`skeleton(input)`、`phaseDetail(input, phase)`）；`features/plans/mock-generator.ts`（按目标期限切分阶段，引用用户真实的已确认联系人与真实活动目录，文案为模板；阶段细节有界并行、结果按阶段顺序确定）；`features/plans/generator-service-factory.ts`（route 只依赖 factory；当前只提供 mock，mock 之外的 provider 缺失时 fail closed）；`features/plans/input-selector.ts`（联系人 >200 时只取近 90 天有互动的和与目标相关的，按 actor 过滤）；`features/plans/validate.ts`（拒绝不存在或不属于本人的联系人 id／活动 id）；`app/api/agent/plans/bootstrap/route.ts`（POST，带幂等键；成功时一次事务保存 v1）；`iorbit-0918/iorbit-plan-card.tsx`（一句话回答、3 个关键数字、三个阶段、这周 3 件事、现有人脉能帮什么、最大风险、30 秒自我介绍、阶段细节折叠、「已保存为你的计划 v1」）；对应测试。
- 排除：真实 AI 接入与持久化生成任务（另开 Sprint，依赖新的预算决定）；我的计划页（W0009）；在目标环境打开 `ORBIT_GUIDE_DEMO`（README 发布动作）。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0008-01 | 发送固定问题（可带一句补充）后显示「生成中」：结论、关键数字、阶段骨架先出现，其余阶段为骨架占位／排队中，按确定顺序逐段揭示后切到「已完成」，出现「已保存为你的计划 v1」与「查看和跟踪 →」；刷新或以 `?plan=<id>` 打开时直接显示已完成卡片 | 组件测试（假时钟推进揭示）+ 页面测试 + 浏览器两张截图 |
| SC-W0008-02 | 周期按目标期限切分：一个月内 2–3 段按周、3 个月内 3 段按周、一年内 4 段且只有第一段细到周；阶段细节并行生成后顺序确定，任一阶段失败则整份失败、不保存半份并提示重试 | mock-generator 测试（三种期限、2/3/4 段、单阶段失败） |
| SC-W0008-03 | 输入裁剪：联系人 199／200／201 位的边界、近 90 天互动与目标相关两条保留规则、只取本人联系人 | input-selector 测试 |
| SC-W0008-04 | 计划里引用的联系人与活动都真实存在且属于本人；校验器拒绝不存在／他人的 id；同一幂等键重复 POST 只保存一份；未登录 401 | validate 测试 + bootstrap 路由测试（非法 id、他人 id、重复提交、未登录） |
| SC-W0008-05 | 全程无付费 AI 调用；`ORBIT_GUIDE_DEMO` 开与关两种状态下第 3 步行为都正确；不引入新的回归 | 测试断言 factory 返回 mock、无外部请求；开关两态页面测试；iOrbit 对话相关测试通过；typecheck；收口一次全量基线对照 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0008/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0008-plan-generation` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（写接口、幂等、跨用户隔离）。
- 开发定向集：generator、input-selector、validate、bootstrap 路由、plan-card 组件测试。
- 操作链收口集：`app-agent-iorbit-chat.test.tsx`、`app-agent-iorbit-home.test.tsx` 与上述测试；typecheck；一次全量基线对照。
- 不运行：真实 AI；App 端。

## 失败与交接

报告写明 factory 的替换点、为什么不用对话接口、幂等键规则；README 发布动作（打开 `ORBIT_GUIDE_DEMO`）需要用户授权后执行。
