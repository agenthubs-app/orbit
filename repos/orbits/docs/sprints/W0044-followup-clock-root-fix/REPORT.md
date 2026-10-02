# W0044 REPORT — 跟进与提醒按「现在」算到期，逾期说逾期（run-01）

**状态（Generator 交接时）：** 本地完成，待协调者合并 chat-agent 并验证合并树。
**分支：** `sprint/W0044-followup-clock-root-fix`（从 chat-agent `535efdd3` 切出）
**最终功能 SHA：** `dfda6f92`（功能 `be2676f5` + review 修复 `dfda6f92`）
**PLANNER SHA256：** `147831f51c0ee53de94099ffc8cab633f262ef673ee38ecd0bfa91a51960345d`（启动后未改）
**档位：** H。**DeepSeek / 付费 AI 调用：0 次。** 无迁移、无生产写入、无部署、无 push。
报告由协调者按 Generator 原文写入（子代理写文件被拦）。

## 结果（易读）
- 已能做到：
  - 跟进任务和提醒的「还有几天到期」改为以每次请求的真实时刻为准，按东京日历日计算。
  - 已过期的任务现在是负数（如 −65），排在最前面。
  - 复核卡片显示「已逾期 N 天 · 绝对日期」，优先级显示「已逾期」，不再误说「今天」。
  - 记录的 updatedAt 不再影响到期天数。
  - 本机库 QA 账号 58 条逾期任务实测正确。
- 仍不能做到（不在本 Sprint 范围）：
  - App 端 `shouldNormalizeTaskToToday` 仍把逾期显示成今天（C-6，归 App 线）。
  - bootstrap 的同类时钟问题没改。
  - 跟进任务目前没有已挂载的只读 HTTP 端点（见「PLANNER 事实过时」）。

## 时钟注入的最终签名
- `createLiveFollowupTaskGenerationService({ now?: () => Date, provider? })`
- `createLiveReminderScheduleNotificationService({ now?: () => Date, provider? })`
- 两者默认 `() => new Date()`，每次 list/generate 调用只取一次。这个时刻用于：
  - dueInDays
  - 跟进触发器的 occurredAt
  - provenance.collectedAt，包括缺 actor 和未配置两条失败路径
- 纯函数：
  - `followupDaysUntil(dueAt, now)`
  - `reminderDaysUntil(dueAt, now)`、`reminderPriorityFor`、`reminderFrequencyFor`（改为导出，便于测试）
  - `shared/compute/tokyo-calendar-days.ts`：`tokyoCalendarDaysUntil(dueAt, now): number | null`、`parseStrictTokyoInstant(value)`
- 枚举不变：逾期任务的跟进 priority 仍为 today；提醒仍为 high / once。
- hybrid 夹具模式保留夹具时钟（W44-3），只接受「可为负」。

## SC 表

| SC | 结果 | 文件 | SHA | 证据 |
| --- | --- | --- | --- | --- |
| 01 「现在」显式注入 | 通过 | followups/live-service.ts、notifications/live-service.ts | be2676f5、dfda6f92 | `tests/capabilities/followup-clock.test.ts`：只差 updatedAt 的两份图输出逐字段相等；每次调用只取一次时钟；collectedAt 等于注入的 now；now 推后 1 天，带 dueAt 的任务恰好 −1；失败路径的 collectedAt 也等于 now |
| 02 逾期为负、东京日历日 | 通过 | task-generation-projection.ts、shared/compute/tokyo-calendar-days.ts、notifications/live-service.ts | be2676f5、dfda6f92 | 表驱动：7/29 10:00 JST 对 8/25 09:00 JST 为 −27；当天为 0；昨天 23:00 为 −1；非法输入兜底 7；严格解析；三个时区结果一致；priority、frequency 断言；逾期排在最前 |
| 03 展示层说逾期 | 通过 | orbit-ai/followup-review-artifact-service.ts | be2676f5 | `orbit-ai-artifact-task-mock.test.ts` 新用例：「已逾期 27 天 · 7月29日（周三）」、chip「已逾期」；英文 `Overdue by 27 day(s) · Jul 29 (Wed)`；dueInDays 为 0 显示「今天」；派生任务无绝对日期。RED 证据显示改前是「今天 · 7月29日」 |
| 04 消费者无回归、契约只放宽 | 通过（替代证据，见下） | shared/contract/followups.ts（只改注释）及 App 同步副本 | be2676f5 | 收口集 150 例，0 失败；Postgres 集 40 过、0 失败；tsc（.next 外）0 错误；lint 0；枚举未变 |
| 05 H 档收口 | 通过 | — | dfda6f92 | 1440 / 375 截图；控制台只有既有的 inbox 503；全量与基线对照新增失败 0；Codex review 已处理；App sync 10/10 |

## PLANNER 事实过时（协调者已裁决接受替代证据，不降 SC）
- PLANNER 写的「`/api/tasks` GET 返回跟进任务」与当前代码不符：`app/api/tasks/route.ts` 挂的是任务工作台（`collection-handler.ts` → features/tasks），不经过跟进服务。
- 跟进版 `createTasksGetHandler`（`app/api/tasks/handler.ts`）没挂到任何路由，只被 `followup-task-generation-mock.test.ts` 引用。所以这些测试只能证明 handler 本身的行为。
- HTTP 层证据改用：
  - `GET /api/notifications`：live、QA 账号，dueInDays −65，collectedAt 为真实时刻；
  - live 跟进服务只读探针：476 条任务，58 条逾期，并用真实数据渲染复核卡。
- 另外实测 `/api/tasks` GET：200，结构 `{success, data:{tasks}}` 未变。

## Review 处理（Codex 代码 review 一次，全文见证据目录 codex-review.txt）

| # | 意见 | 裁决 | 处理 |
| --- | --- | --- | --- |
| 1 | P1：/api/tasks 实际接的是 canonical tasks，测试测的是死入口 | 不采纳为代码改动（新建端点属于范围变更） | REPORT 如实登记（见上节）；「`app/api/tasks/handler.ts` 跟进版的去留」登记为 W0055 死代码清理候选 |
| 2 | P2：tokyo-calendar-days 解析不严 | 采纳 | 严格 ISO：不带偏移按东京本地；2 月 30 日、非法时分秒、非法偏移视为非法，走兜底 7；不用运行时日期解析，不随 TZ 变化。补 TZ=UTC、Asia/Tokyo、America/Los_Angeles 一致性用例，以及 2 月 30 日、非法 offset、无 offset 用例。现存 dueAt 只有 `+00:00`（80 条）与 `.sssZ`（1 条）两种写法，均有用例 |
| 3 | P2：缺 actor 或未配置时 collectedAt 写成 epoch | 采纳 | now 传入 `graphOrFailure`、`unconfiguredFailure` 和提醒的 failure；提醒 failure 的 `collectedAt` 改为必填；补 actor-required 与 unconfigured 两条链路的固定时钟断言（跟进和提醒各覆盖） |
| 4 | P2：东京日纯函数放在不同步的 shared/utils | 采纳 | 移到 `shared/compute/tokyo-calendar-days.ts`，通过 shared-compute 审计；同一提交执行 `npm run sync:contract`，App 只多了 `src/api/compute/tokyo-calendar-days.ts` 同步副本；App 4 个 *-sync 测试 10/10 |

## Impact
- `createStorageFollowupTaskProvider`：**CRITICAL**（流程 `POST /api/agent/signals`；消费者有 signals、首页 facts、生命周期页、/api/relationship-tasks、worker）。
  - 处理：provider 的签名、读取行为和 `generatedAt` 赋值都没改，只给 `LiveFollowupGraph.generatedAt` 加注释，说明它只表示数据新鲜度，不是「现在」。
  - 文本搜索确认 `graph.generatedAt` 只有跟进 live-service 在读，而它已不再使用这个字段。消费者相关测试通过。
- 其余为 LOW：followupDaysUntil 10 处、followupPriorityFor 11 处、createLiveFollowupTaskGenerationService 1 处、toReminder 4 处、createLiveReminderScheduleNotificationService 1 处、overdueDaysFor 3 处（已删除）。
- UNKNOWN 项，均用文本搜索补查：`dueLabelFor`、`itemFor`（同名多个，本文件内各 1 处调用）；`latestTimestamp`（两个 provider 各自私有，未改）；`priorityFor`（同名 6 个，notifications 内只有 2 处调用，已改名导出）。
- detect-changes（staged）两次：风险 low，受影响流程 0，无 partial / truncated。

## 假设与额外阅读
- 新增文件：
  - `repos/orbits/shared/compute/tokyo-calendar-days.ts`：东京日纯函数（RULES §0 必要补充）；
  - App 同步副本 `repos/orbit-app/src/api/compute/tokyo-calendar-days.ts`；
  - `repos/orbits/tests/capabilities/followup-clock.test.ts`。
- `service-factory.ts`（followups、notifications）未改：默认时钟已放在服务构造器里。hybrid-service 未改。
- 额外阅读：
  - `features/orbit-ai/todo-summary-service.ts`：事实 5。`followupTaskConversationRecord` 只吃静态 `mockFollowupTasks`（dueInDays 都是正数），live 的负数到不了这里；即使是负数也推出过去的日期，按 dueAt 升序排在最前，不会反转。因此没写额外测试。
  - `tests/support/shared-compute-audit.ts`、`shared/compute/compute-text.ts`：shared/compute 规则。
  - `app/api/tasks/*`、`app/api/notifications/*`：HTTP 承载路径。
  - `scripts/verify-session-cookie.ts`：签 cookie 的方法。
- 浏览器验证账号：本机库 `user_orbit_primary_qa`（58 条逾期任务；verify-* 账号都没有逾期任务）。用 next-auth/jwt 自签 1 小时 cookie，cookie 不入库、不进证据目录。逾期卡片只能经 AI 对话触发，为不调付费 AI，展示层证据用 live 探针渲染输出。
- 流量：没有新增读取，语句数和返回字节不变；read-receipts 的 memory 版与 Postgres 版都通过。

## 测试与基线
- 数据库测试只把指向 localhost 的本机库地址作为单个环境变量传入，先跑了 `assert-local-test-databases`；未 source 任何 .env。
- 全量 `npm test`：基线 6252 例 / 9 失败，Sprint 树 6261 例 / 9 失败，失败清单相同，**新增 0**。
  - 9 个历史失败：operator script ×2、fixture CLI、manifest、offline preflight ×2、runtime evidence file:line、全项目 typecheck、visible controls。
  - 对照方法：提交后把本 Sprint 路径临时换回 535efdd3 版本跑基线，再恢复，恢复后已核对与 HEAD 无差异。
- 已知环境问题（与本 Sprint 无关）：`read-projection-parity-postgres` 的 B3 ×3 断言库名为 `orbit_cutover_test_20260917`，本机库名不同；`.next/types/validator.ts` 有 8 个旧路由类型错误；`/api/inbox/summary` 本机返回 503。

## App 影响
- 只有同步副本变化：`src/api/contract/followups.ts`（只改注释）和 `src/api/compute/tokyo-calendar-days.ts`（新增）。
- App 界面与 App typecheck 未验证，不在本 Sprint 验收内。
- App 观察项：`schedule.ts` 的 `shouldNormalizeTaskToToday` 会把逾期显示为「今天」，建议 App 线另开（C-6）。

## 后续候选
1. W0055：清理死入口 `app/api/tasks/handler.ts`（跟进版 GET）。
2. bootstrap 同类时钟问题：`features/bootstrap/live-service.ts` 的 `dueLabel(task, graph.generatedAt)` 与 bootstrap provider 的 `latestTimestamp`。
3. App 线 C-6：逾期显示。

## 证据
目录：`~/orbit-sprint-evidence/web/sprint-W0044/run-01/`
- RED：red-followup-clock.txt、red-artifact-overdue.txt
- 收口集：closing-set-nonpg(-r2).txt、closing-set-pg(-r2).txt
- 静态检查：tsc(-r2).txt、lint(-r2).txt
- App 同步：app-sync-contract(-r2).txt、app-sync-tests(-r2).txt
- 接口与探针：api-notifications(-r2).json、api-tasks.txt、live-followups-qa-account(-r2).txt
- 截图与控制台：home-1440.jpg、home-375.jpg、console.txt
- 全量对照：full-baseline.txt、full-after.txt、fail-baseline.txt、fail-after.txt
- 其他：detect-changes-feature.json、detect-changes-review.txt、codex-review.txt

## 回退
`git revert dfda6f92 be2676f5`（合并前直接丢弃本分支即可）。
