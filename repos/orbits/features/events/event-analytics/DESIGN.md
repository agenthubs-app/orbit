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

## API

- `GET /api/events/:id/analytics/aggregate`：`analytics.read_aggregate` capability guard，供活动组织者/被授权分析者读取。
- `GET /api/events/:id/analytics/attendee`：exact event + active canonical registration guard，供参会者读取本人证据。

AI 端点不配置 provider、不触发任务、不把 queued/running/failed 转换成其他状态。只有 reader 已验证的 `ready` artifact 才被返回和渲染；`queued`、`running`、`failed`、`unconfigured` 均原样显式呈现。

## UI

已发布分组不从可空的 normalized child tables/seats 推断。read model 只从 publication head 指向的 `published_dto.grouping.roundOne/roundTwo` 读取桌次与 members；DTO 的 event/generation 对齐、轮次数组、桌号、成员、座位和重复分配均会校验，异常快照直接失败，不会以零值或其他存储降级替代。

`EventAnalyticsReport` 是纯展示组件，不发请求、不开启轮询、不触发 AI 生成，也不依赖活动详情页或运营管理工作区。

独立页面位于 `/app/events/:id/analytics`：服务端先验证登录，未登录会携带当前路径跳转登录页；页面使用统一 Orbit 样式与活动导航。客户端先读取 aggregate endpoint，只有得到 `403` 时才尝试本人 attendee endpoint。因此 owner、operations 和 read-only analyst 会看到聚合页；只有无聚合权限但有该活动有效报名的用户会看到本人报告。`401`、`5xx` 和网络错误不会降级为 attendee 请求，并提供显式重试。页面提供返回活动详情的入口，但不会修改详情页或运营工作区。

组织者的可解释比率为：签到率 = 已签到 / 有效报名、联系同意率 = 已同意 / 全部联系请求状态、完成约谈率 = 已完成 / 全部约谈状态。UI 同时展示整数百分比和准确分子/分母；零分母明确显示“暂无样本”。
