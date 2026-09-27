# Sprint 0115 — 活动现场放进手机（断网 1a）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「断网也能用」第 6 步第 1 期 1a（你报名的活动：地点、时间、介绍、议程，以及当天发布给你的座位和推荐人选）、第 5 步办法二中的「取消报名、报名没通过：报名记录主人还是你，发布给你的座位和推荐跟着撤下」、第 7 步检查表、第 8 步决定 5（第 1 期一起放，只放属于你的那一份）与「活动工作人员能看到的参会者名单不放进手机」。
**单一目标:** 已报名活动的现场所需数据可离线读取，活动详情与现场页断网可用。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0114 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 0113（专用表流水号与读取）、0107（App 现场页）已完成。

## 已查明的事实（2026-09-27）

- 数据来源（专用表）：`event_ops_events`（标题、介绍、场地、时区、开始/结束、公开编码、生命周期状态、source_payload）；`event_ops_membership_heads`/`_versions`（status rsvped/cancelled）；`event_ops_admission_application_heads`（pending_review/waitlisted/admitted/rejected/withdrawn）；`event_ops_configuration_heads`/`configurations`（签到开放、结果可见时间）；`event_ops_publication_heads` → `event_ops_publications.published_dto`（不可变）；座位/桌位/推荐细节按 generation 存于 `event_ops_seats`、`event_ops_tables`、`event_ops_recommendations`、`event_ops_recommendation_results`。开发库发布结果为 0 行，测试需造数。
- **议程**：契约字段存在（`shared/domain/contracts.ts:214`），但服务端没有任何代码产生议程，开发库 16 场活动都没有。只下发已存在的数据，不编造。
- 接口：`/api/events/public/:id` → `public-catalogue.ts:372-407`；`/api/events/:id/registration` → `registration/runtime.ts`；**发给本人的座位与推荐实际由 `GET /api/events/:id/operations`（`attendeeWorkspace` → `getPublishedResult(ForAttendee)`，`postgres-repository.ts:1669-1700`）提供**；`/api/recommendations/event/:id` 读的是万能表里生成的推荐数据（不是活动发布结果），不在本期范围。
- App：活动详情 `EventDetailScreen`（public/:id、registration、readiness、recommendations/event/:id、operations 等）、0107 的现场页（attendee workspace）；离线策略中 `GET /api/events/public` 目前为 `encrypted_ttl_snapshot`。
- 取消报名写新的 membership 版本（status cancelled，`canonical-registration-repository.ts:877-943`），主人仍是本人。

## 范围与文件

1. **同步类别**（按 0113 说明书，来源为专用表）：
   - 我报名的活动：本人有 membership（rsvped）的活动的公开信息与配置窗口（签到、结果可见时间）；
   - 我的报名：本人的 membership 与录取申请状态；
   - 发布给我的结果：本人在当前发布中的座位、桌位、推荐人选（字段白名单只含本人那一份与现场页需要的对方公开信息）。
   - 可见范围规则写进说明书：membership.actor_id = 本人；取消/被拒后「发布给我的结果」不再下发并在手机上撤下。
2. **App**：活动详情与现场页在离线或本地有数据时读本地；显示「截至」；需要联网的操作（签到、交换名片、约时间、笔记）断网时给出提示。离线策略与路由清单更新。
3. 公开活动目录、全平台推荐、参会者名录（工作人员视角）不放进手机。
- 排除：断网写；公开活动列表的离线；AI 推荐接口。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0115-01 | 隔离：参会者 A 的手机里没有 B 的座位/推荐，也没有主办方视角的数据；未报名的活动不下发 | 真库测试（A、B、主办方三方数据） |
| SC-0115-02 | 取消报名、录取被拒后，下一次同步时「发布给我的结果」从手机上撤下，报名状态显示已取消/未通过 | 真库测试 |
| SC-0115-03 | 增量：首次全量 → 活动改一处只传一行 → 再同步 0 行；新发布结果到达后手机更新 | 真库测试 |
| SC-0115-04 | 飞行模式下 phoneweb 与 Simulator 打开活动详情和现场页，看到地点、时间、介绍、报名状态、座位与推荐（有议程则显示），并标明「截至」 | 截图 |
| SC-0115-05 | 读取成本不超过账本基线、棘轮不增加；两端全量、typecheck 通过 | 摘要 |

## 测试

- 档位 H（新同步类别 + 专用表来源 + App 离线读取）。开发集：新类别的同步拓扑 Postgres 测试、活动运营/报名测试、App 活动屏幕与同步测试；收口：两端全量。
- 运行时：本地库造一场含发布结果的活动（用后清理或列出），两个参会者账号 + 主办方账号。

## 失败与交接

报告列出下发字段白名单、说明书内容、离线时每个现场操作的提示文案。

## 协调者追加范围（2026-09-28，来自 0130）

- `/schedule` 日历页断网时三张卡片都显示「暂时连不上」，因为它聚合的是服务器接口：`/api/tasks/page`、公开活动、scheduleItems。本 Sprint 活动放进手机以后，日历页也要改为本地优先：活动部分读本 Sprint 的本地活动数据，待办和个人日程部分读 0108 的本地副本。补上断网截图。
