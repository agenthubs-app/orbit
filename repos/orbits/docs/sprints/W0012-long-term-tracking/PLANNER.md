# Sprint W0012 — 长期跟踪

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-12。**单一目标:** 计划可长期使用：所有自动进展由各生产者幂等写入，手动进展可 @ 联系人／活动；每周一导语换成上周小结；偏离时提示重新分析（每月 1 次）；周期到期先回顾再制定下一份；一年期进入下一阶段时补充周级行动。重新分析与补充按 D3 仍用 mock 生成器。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0008、W0009、W0010。
**进入条件:** W0008、W0009、W0010 completed。时区统一 Asia/Tokyo（自然月、周一边界）。

## 范围与文件

- 读取：W0007 服务与 `plan_log` 结构化引用字段、W0008 生成器 factory、W0009 页面与 `week.ts`、W0010 确认流程、`app/api/events/[id]/registration/route-handlers.ts`（报名）、活动参加记录所在位置（开工时用 impact 定位）、`iorbit-home.tsx`（导语）。
- 修改：`features/plans/service.ts`（`recordAutoLog(kind, refs, idempotencyKey)`；@ 解析只写结构化引用，不从正文反解；重新分析额度计数）、报名路由处理（报名／取消后对本人生效计划中对应活动项写状态与日志）、参加记录处（写「已参加」与日志）、W0010 确认流程（写「已关联」「已建立联系」日志）、W0009 行动打勾（写完成日志）、`iorbit-plan.tsx`（进展输入、提示条、到期回顾）、`iorbit-home.tsx`（周一导语）及测试。
- 新建：`features/plans/weekly-summary.ts`（从 plan_log 规则拼出上周小结，不调 AI）；`features/plans/reanalysis.ts`（四种触发：目标被改、阶段提前完成、延后 ≥2 次的行动累计 3 条、周期到期；自然月 1 次额度，到期后的下一份不占额度）；`features/plans/phase-refinement.ts`（一年期进入下一阶段时补充周级行动，不占额度）；「进入新阶段」的生产者：读取计划时按周次惰性判定并幂等写日志与补充，另在 `features/operations/maintenance/configured-tasks.ts` 注册有上限的 `plan-phase` 维护任务每日兜底；对应测试。
- 排除：真实 AI；邮件／推送提醒。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0012-01 | 自动进展的每个生产者（行动完成、联系人关联、建立联系、活动报名、活动取消（按 W0007 的 `registered → recommended` 回退迁移）、活动参加、进入新阶段）都幂等写一条 auto 记录：重复触发只留一条；跨用户不串写 | 各生产者的服务／路由测试（重复触发、他人计划负例） |
| SC-W0012-02 | 手动进展可 @ 联系人或活动，引用以结构化字段保存；@ 某人后该联系人在所属人脉需求里变为「已建立联系」；每周一（东京时间）iOrbit 导语显示上周小结，其他日子保持今日导语 | 服务测试 + weekly-summary 纯函数测试（周日 23:59 / 周一 00:00 JST、UTC 输入边界）+ home 组件测试 |
| SC-W0012-03 | 四种触发各自产生「要不要重新分析」提示，只提示不自动重做；重新分析每自然月（东京时间）1 次，页面显示剩余次数；同时提交两次只成功一次 | reanalysis 纯函数测试（月末边界）+ 并发提交测试 |
| SC-W0012-04 | 周期到期先显示回顾（完成行动、新认识人数、在哪些活动认识），再提供「制定下一份计划」，生成新版本且不占额度；事务失败时不留下半份新版本 | 服务测试（含事务失败）+ 组件测试 |
| SC-W0012-05 | 一年期计划进入下一阶段时补充该阶段的周级行动，不占额度、只补一次；不引入新的回归 | phase-refinement 测试（重复进入只补一次）；plan、iOrbit、活动报名相关测试；typecheck；一次全量基线对照 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0012/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0012-long-term-tracking` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（多个写入生产者、额度并发、事务）。
- 开发定向集：weekly-summary、reanalysis、phase-refinement、plan service、各生产者测试。
- 操作链收口集：plan、iOrbit、活动报名相关测试文件；typecheck；一次全量基线对照。
- 不运行：App 端。

## 失败与交接

报告写明每个自动记录生产者的位置与幂等键、额度计数存储、时区边界测试证据。
