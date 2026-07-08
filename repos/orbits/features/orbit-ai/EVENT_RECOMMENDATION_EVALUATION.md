# Orbit AI 活动推荐评估

## Design -> Evaluation -> Analysis

Sprint 87 的活动推荐采用 `goal_relevance_v1` 规则服务：

- `features/orbit-ai/event-recommendation-service.ts` 接收用户目标、上下文消息、语言和 `toolArguments`。
- 服务把目标拆成概念，再按五类信号评分：`attendee_intent`、`event_topic`、`schedule_timing`、`relationship_opportunity`、`profile_fit`。
- 推荐必须带来源证据、为什么是这个活动、建议认识的人、时间说明、可信度、详情页链接和拒绝原因。
- `features/orbit-ai/event-recommendation-artifact-service.ts` 把结果映射成 Orbit Agent artifact。它只生成可复核视图，不报名、不写日历、不发通知、不执行外部动作。
- `/app/agent` 入口使用中性的 `Ask Orbit` 提交动作，避免把活动发现误导成只找联系人；空白 `q` 仍由 route adapter 忽略，不会生成推荐或调用对话 preview service。
- 详情页链接当前进入已组合完成的 `/app/events/demo-event-1` 工作区，并通过 `sourceEventId=<ranked event id>` 保留活动推荐来源。这样 `/app/agent` 的行动链接始终能打开活动详情页，同时不越过 Sprint 87 文件边界去改 `features/recommendations/**`。后续 live/detail sprint 需要把 `sourceEventId` 替换为真实动态 event detail id。

## Accepted Threshold

最低可展示分数是 `74`，由 `ORBIT_AI_EVENT_RECOMMENDATION_READY_SCORE_THRESHOLD` 定义。低于该分数，或缺少参会意图/活动主题证据的活动，即使很热门，也不能展示为推荐。
如果输入没有可解析的参会人、活动主题、时间、关系或画像目标，服务必须返回 `needs_more_context`，页面也不得把空白查询预填成已提交目标。

## Evaluation Cases

`ORBIT_AI_EVENT_RECOMMENDATION_EVALUATION_CASES` 固定覆盖十个命名场景：

- `meeting_investors`
- `china_market_partners`
- `hiring_ai_talent`
- `restaurant_expansion`
- `organizer_networking`
- `language_preference`
- `schedule_conflict`
- `negative_event_filtering`
- `chinese_input`
- `english_input`

评估测试必须断言每个正向场景的 top event、ready threshold、五类证据覆盖，以及负向场景对热门但不相关活动的拒绝。

## Mock To Live Replacement

当前实现是确定性 mock/rules 服务，live 替换路径如下：

- `event-recommendation-service.ts` 保留 DTO、阈值、评估用例和排序解释，是 mock/live 共用 contract。
- 后续新增 `features/orbit-ai/event-recommendation-live-service.ts` 读取真实 Events、attendee roster、profile、relationship graph 和 schedule availability。
- 后续新增 `features/orbit-ai/event-recommendation-provider.ts` 负责 provider 选择；`service-factory.ts` 使用 `ORBIT_MODULE_MODE` 或显式测试 mode 在 mock/hybrid/live 间切换。
- 所需权限必须显式声明：Events 只读、attendee roster 只读、profile/relationship graph 只读、schedule availability 只读。禁止 ticketing、payments、calendar writes、registration、notification 和外部联系。
- 所需环境变量应集中在 provider 文件，例如 `ORBIT_EVENTS_PROVIDER`、`ORBIT_RELATIONSHIP_GRAPH_PROVIDER`、`ORBIT_SCHEDULE_PROVIDER`。缺失 live provider 时必须 fail closed，返回 shared `NOT_IMPLEMENTED` service-resolution shape。
- live provenance 必须保留 evidence ids、source labels、generation method 和 privacy scope。UI 不得读取 raw provider payload。
- 替换测试需要覆盖：十个评估场景、热门无关活动拒绝、schedule conflict 降权、中文输入、英文输入、`/app/agent?q=...` server-seeded GET preview、artifact safety flags、详情页链接从 `sourceEventId` 切换到真实动态 event id、no external side effects。
