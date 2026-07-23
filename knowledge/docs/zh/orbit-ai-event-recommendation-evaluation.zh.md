# Orbit AI 活动推荐评估

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/orbit-ai/EVENT_RECOMMENDATION_EVALUATION.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ai-event-recommendation-evaluation.zh.md` |
| 分类 | `evaluation` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

Sprint 87 goal_relevance_v1 活动推荐规则服务的评估文档：五类信号评分（参会意图/活动主题/时间/关系机会/画像匹配）、就绪阈值 74、十个固定评估场景，以及无可解析目标时必须返回 needs_more_context 的约束。详情链接暂指向 demo-event-1 工作区并以 sourceEventId 保留来源，文末给出 live 替换所需的 provider 文件、只读权限与 fail-closed 要求。

## 审计依据

这是能力评估文档，阈值与评估用例是设计承诺；实际评分与拒绝行为以 event-recommendation-service.ts、artifact service 及其评估测试为准，demo-event-1 链接是待 live sprint 替换的已知临时状态。

## 结构化阅读入口

- 第 1 节：Orbit AI 活动推荐评估
- 第 2 节：设计 > Evaluation > Analysis
- 第 3 节：源标题：Accepted Threshold
- 第 4 节：源标题：Evaluation Cases
- 第 5 节：源标题：Mock Live Replacement

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

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
