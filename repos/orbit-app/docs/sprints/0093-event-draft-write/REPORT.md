# Sprint 0093 报告 — 活动草稿写入

**状态:** 见登记表（**completed**）。**run-01。** 四条 SC 全部有证据；同时留下一个**已创建但在 App 里打不开**的缺口，单列 0096，不算进本 Sprint 的完成。

## SC-0093-01：是产品规则，不是 mock 遗留

三个实现全都强制，不止 mock：

| 实现 | 位置 |
| --- | --- |
| mock | `features/events/event-crud-and-import/mock-service.ts:235` |
| hybrid | `.../hybrid-service.ts:363` |
| **live** | `.../live-service.ts:415` |

错误文案里的 `in the mock` 只是当年只有 mock 时留下的措辞，不代表规则本身只在 mock 里。契约注释写得很清楚：`sourceNote 记录为什么纳入 Orbit`（`contract.ts:83`），recovery 文案是「Ask the operator why the event belongs in Orbit」。**没有任何东西校验它的内容**——它是出处，不是审批门。

## 怎么做的

agent 草稿的真实出处就是那次对话，所以：

- 模型为活动草稿产出 `sourceNote`（一句话，用用户自己的说法）；卡片把它作为**可编辑行**显示，用户在确认前就能改——这就是"缺什么的补救入口"，而不是等写入被拒才知道。
- 模型没给理由时，适配器退回到"由 IORBIT 会话 X 中的草稿 Y 经用户确认创建"。这句话是真的、可核对的，所以确认不会因为缺一条注释而失败。

实测模型确实给出了像样的理由，不是套话：「你计划赴大阪参加这场跨境对接会，目的是谈制造业的试点合作，因此值得放进 Orbit 提前准备参会目标与跟进。」它最终落在活动记录的 `evidence[].excerpt` 与 `relationshipContext` 上。

## 真跑才发现的两个问题

**1. 中文标题的活动全都写进同一行。** `slugFromTitle` 只保留 `[a-z0-9]`，中文标题——也就是这个产品的常态——slug 成空串，于是每个手动创建的活动 id 都是 `event:live-record:`，后一个覆盖前一个。是"建了两个不同的活动、库里只有一行"看出来的，不是读代码读出来的。三份一模一样的私有副本合成一个 helper，空 slug 时回退到标题摘要——仍然稳定（同一个活动建两次还是一条），但不再互相覆盖。

**2. 一处 `as unknown as EventCreatePort` 把契约漂移藏住了。** port 少声明了服务要求的 `sourceNote`，类型检查照样通过——这正是这个 bug 能存在的原因。已去掉强制转换（服务对 staged 活动是同步返回，所以 port 的返回类型放宽成 `T | Promise<T>`），这次调用重新受类型检查保护。

## 顺手修正的两处不一致

- 两处草稿 prompt 还在告诉模型「contact needs name」「contact organization/role/note」，而 0093 修订版已经把人脉从 `ENTITY_DRAFT_KINDS` 里去掉了。已删。
- 草稿卡"打开已创建记录"的日程链接是 `/schedule/${id}`——与 0095 修的是同一个死路由（日程详情按 personal／meetings／events 分三条）。草稿创建的是个人日程，改为 `/schedule/personal/${id}`。

## 验收对照

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0093-01 | pass | 上表三处源码位置 + 契约注释 |
| SC-0093-02 | pass | 真实库：草稿 → 确认 → `events` 16→17，返回 `createdRecordId=event:live-record:a01ba7732eb1fad7`；换一个标题再来一次 17→18，两条 id 不同 |
| SC-0093-03 | pass | 发消息后确认前 `events` 计数不变；确认 #1 200、#2 404「There is no draft awaiting confirmation」，计数 17→17 |
| SC-0093-04 | pass | 两端 typecheck 0；events + entity-draft 定向集 56/56；App 3557/3557；orbits 4019 pass / 48 fail，对照 HEAD 基线 49 fail 无新增 |

计数那一步第一次量错了：过滤条件写成 `collection_name ilike '%event%'`，把 `agentAnalyticsEvents` 这类遥测也算了进去，于是"确认前未写入"显示成 false。改成只看 `events` 集合后为 true。**错的是量法，不是行为**——但当时如果就那么记下来，就会是一条假的违规记录。

## 缺口：建出来了，App 里打不开（→ 0096）

确认成功、库里有行、`GET /api/events/<id>` 能读到完整内容。但 App 的活动详情页请求的是 `GET /api/events/public/<id>`，返回 404——**App 的整个活动面（首页、活动列表、详情、报名、主办方、日程预览）读的都是 canonical 公共活动目录**，而聊天里建的是一个未发布的私有活动。

这不是接线错误，是一个产品问题：agent 建的私有活动应该有自己的详情路径，还是应该进公共目录（那意味着对外可见、要有主办方身份和报名）。**不在本 Sprint 里替用户决定**，也没有为了让链接看起来能点而绕过去。已单列 0096。
