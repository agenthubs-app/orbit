# 活动聚合分析与参会者活动报告

## 边界

- 这是独立、只读的 PG read model，不调用 `createPostgresOnsiteOperationsMethods` 或任何活动运营写入方法。
- 组织者端只返回数字、状态和桌次/座位总数；没有 actor、participant、联系人、档案、互动原文或单条约谈。
- 参会者端先由 API 的 active registration guard 拦截，read model 也再次验证 canonical `rsvped` membership。它仅按当前 actor 查询签到、联系请求汇总、人工交流证据、约谈汇总及本人桌次。

## 真实数据来源

| 证据 | canonical 存储 |
| --- | --- |
| 报名 | `event_ops_membership_heads` |
| 签到 | `event_ops_checkins` |
| 联系请求 | `event_ops_contact_requests` |
| 已发布分组 | `event_ops_publication_heads` → `event_ops_publications.published_dto` 的 immutable grouping snapshot |
| 人工交流 | `orbit_records` 的 `human_encounters` |
| 约谈 | `appointment_aggregates` |
| 参会者 AI 会后产物 | 既有 `event_attendee_post_event_ai_artifacts` reader |

## ROI 口径与归因边界

- 双向连接参与率的分母是活动内 distinct check-in actor；分子是已接受 `event_ops_relationship_pairs` 中、恰有两侧且双方都已签到的 distinct relationship-side owner。接受但仅一方签到的关系不会进入分子；零分母返回 `null`。
- 有效连接先满足 accepted relationship pair + 双方签到，再要求从 `accepted_at` 到 `event_ends_at + 7 days` 至少出现一项强行动：canonical human encounter（按 owner actor + contact + event 精确连接 relationship side）、completed `save_message_draft`、completed `create_followup_reminder`，或携带同一 event/pair 且未取消的 appointment。约谈还校验 owner/invitee 与 relationship side 一致。
- Agent 强行动只读取 `agentExecutionReceipts` 中 `completed` receipt，并按 `actionId + operationId` 精确连接 `agentActionsV2`。operation 必须是消息草稿或跟进提醒，且 `eventOrigin` 包含同一 `eventId`、有效 `relationshipPairId` 与非空 `sourceActionId`。窗口时间只信任 receipt `updated_at`；payload `eventOrigin.attributedAt` 是可选元数据，即使缺失、错误或超出窗口也不会覆盖 receipt 时间。
- 不按 action 标题、联系人、workflow 名称或时间邻近性反推活动。`attributionCoverage` 的分母仅是消息草稿/跟进提醒中已经声明 exact `eventOrigin.eventId` 的完成 operation，分子是其中精确连接到本活动 accepted pair 且时间有效的 operation。因此该 coverage 能揭示“已声明、ROI-eligible agent 行动的归因是否完整”，不能估算完全未携带 eventOrigin 的历史操作。

ROI 的观察窗口在 canonical `event_ends_at + 7 days` 截止。窗口关闭前返回带 `status=live` 的实时聚合；关闭后由 analytics 自有 finalizer 追加不可变 snapshot。初次固化为 revision 1；重算必须同时提供当前 `expectedRevision` 与非空 `recomputeReason`，只追加新 revision 并移动 head，不更新旧 snapshot。每个 snapshot 固化 `metricVersion`、`formulaHash`、窗口截止时间和由各 canonical source 的 count + revision/timestamp 组成的 source watermark。

定时固化使用 `npm run event-analytics:finalize-due`。它是一次性进程，适合由 cron 重复启动：先运行 analytics migration，再按数据库 `statement_timestamp()` 选择窗口已关闭且当前 metricVersion 尚无 snapshot 的 published canonical events。候选 configuration heads 在同一事务中用 `FOR UPDATE SKIP LOCKED` 按截止时间领取，并在释放锁前完成 snapshot/head 写入；多个 worker 可并发运行，已有 snapshot 会被跳过。单批默认 50，`ORBIT_EVENT_ANALYTICS_FINALIZE_LIMIT` 可设为 1–100。

生产环境的 one-shot runner 会精确解析 `ORBIT_EVENT_PILOT_EVENT_IDS`，并要求列表中的每个活动均通过 `eventPilotDecision({ capability: "effective_connection_roi" })`；只把这份 exact allowlist 传入 `finalizeDue`。空列表、global/capability kill switch 或任一活动未获准都会 fail closed。非生产环境可以省略 event filter，便于本地和测试验证。legacy analytics GET endpoints 不经过该 pilot gate，避免 rollout 配置改变已有只读行为。该能力没有公开或匿名 HTTP API。

## API

- `GET /api/events/:id/analytics/aggregate`：`analytics.read_aggregate` capability guard，供活动组织者/被授权分析者读取。
- `GET /api/events/:id/analytics/attendee`：exact event + active canonical registration guard，供参会者读取本人证据。

AI 端点不配置 provider、不触发任务、不把 queued/running/failed 转换成其他状态。只有 reader 已验证的 `ready` artifact 才被返回和渲染；`queued`、`running`、`failed`、`unconfigured` 均原样显式呈现。

## UI

已发布分组不从可空的 normalized child tables/seats 推断。read model 只从 publication head 指向的 `published_dto.grouping.roundOne/roundTwo` 读取桌次与 members；DTO 的 event/generation 对齐、轮次数组、桌号、成员、座位和重复分配均会校验，异常快照直接失败，不会以零值或其他存储降级替代。

`EventAnalyticsReport` 是纯展示组件，不发请求、不开启轮询、不触发 AI 生成，也不依赖活动详情页或运营管理工作区。

独立页面位于 `/app/events/:id/analytics`：服务端先验证登录，未登录会携带当前路径跳转登录页；页面使用统一 Orbit 样式与活动导航。客户端先读取 aggregate endpoint，只有得到 `403` 时才尝试本人 attendee endpoint。因此 owner、operations 和 read-only analyst 会看到聚合页；只有无聚合权限但有该活动有效报名的用户会看到本人报告。`401`、`5xx` 和网络错误不会降级为 attendee 请求，并提供显式重试。页面提供返回活动详情的入口，但不会修改详情页或运营工作区。

组织者的可解释比率为：签到率 = 已签到 / 有效报名、联系同意率 = 已同意 / 全部联系请求状态、完成约谈率 = 已完成 / 全部约谈状态、双向连接参与率 = 双方均签到关系中的 distinct 签到者 / distinct 签到者、有效连接率 = 至少有一项强行动的关系中的 distinct 参与者 / distinct 签到者、行动归因覆盖率 = 强归因完成 operation / 已声明本活动的 ROI-eligible 完成 operation。UI 同时展示整数百分比和准确分子/分母；零分母明确显示“暂无样本”。
