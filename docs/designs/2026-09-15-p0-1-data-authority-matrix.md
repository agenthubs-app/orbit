# Orbit P0-1 数据权威最小矩阵

> 2026-09-16 修订：用户确认仅有 mock/fixture，没有真实历史数据，并授权放入 Production 测试。当前正式站已接通 Neon Production，身份/报名/人脉生命周期整理和 Web 回读已完成；原生双端及后台 worker 的验证仍有精确缺项。本表下方的 canonical store/权限分类仍作参考；旧源库、空库状态和历史迁移前置条件只保留追溯，不再适用。执行以 [修订计划](2026-09-15-data-and-launch-readiness.md#当前执行计划2026-09-16-用户确认后修订) 为准。

## 文档定位

- **日期**：2026-09-15
- **目标**：为 Neon 第一次迁移演练提供最小、完整、可执行的数据盘点结果。
- **范围**：只覆盖本轮上线主链路必须回答的数据域；不把所有历史兼容、后台任务和外部服务细节提前变成阻塞项。
- **数据库事实**：P0-0 已创建独立 Neon `orbit` 项目并完成只读连接验证；当前 `neondb.public` 没有业务表。尚未执行 Orbit migration、seed、业务写入或数据迁移。
- **使用方式**：本表是迁移演练的入口，不是对当前线上已完成接通的声明。凡标记“待确认”的项目，在 P0-2 前必须补证据或明确阻塞。
- **基线快照**：见 [P0-1 数据库基线快照](2026-09-15-p0-1-database-baseline-snapshot.md)；该快照明确区分 9 月 10 日源库核查和 9 月 15 日 Neon 空库基线。

## 最小权威矩阵

| 数据域 | canonical store | 当前写入入口 | 当前读取入口 | owner / 权限 | ID / 版本 / 删除 | 迁移决定 | 未决阻塞 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 账号与 canonical identity | `orbit_records/auth_users` + `accounts`；Auth 原始 subject 只用于认证映射，不替代 canonical `accountId` | `/api/account/me`；auth provisioning、session/password service | `/api/account/me`；App 只经 HTTP API 读取 | 认证 subject → canonical `accountId`；账号数据按 actor/account 隔离 | auth/account 稳定 ID；账号生命周期和 session/revocation 状态必须可回读 | **迁移 + 重建 schema**；保留 account ID；`auth_users` 与账号映射先做唯一性校验 | 尚未取得待迁移本地库的账号数量、ID 冲突和认证映射快照；未做 Web/API 运行时回读 |
| 用户资料 | `orbit_records/profiles`；公开资料是从私有 profile 按字段白名单产生的 projection | `/api/profile`、`/api/account/language-preference`；profile service、account-language service | `/api/profile`、公共 profile projection；App 只经 HTTP API 读取 | 默认仅本人可写/读；公开预览只暴露 manifest 允许字段，不包含生日、跟进节奏和私密 handles | profile 稳定 ID；updatedAt、expectedUpdatedAt、mutationId/CAS；软删除/状态按服务语义 | **迁移 profile canonical 记录；重建公开投影**；不迁移客户端缓存 | 尚未取得资料数量、隐私字段范围和版本冲突快照；需补本人/另一 actor 可见范围回读 |
| 人脉与关系 | `orbit_records/contacts`、`connections`、`evidence`、`contact_detail_states`；关系事件侧的 `event_ops_*relationship*` 是活动内关系事实，不是普通联系人替代品 | `/api/contacts`、`/api/contacts/:id`、联系人搜索/邀请、contact-draft confirm；关系生命周期 service/repository | `/api/contacts`、`/api/contacts/:id`、`/api/connections/*`、`/api/mobile/contacts-dashboard`；App 通过对应 API contract | 以 `actorId/accountId` 隔离本人联系人和关系；活动参与者/邀请关系按 participant/eligibility scope 放行 | contact/connection/evidence 各有稳定 ID；关系更新有 version/CAS/idempotency；软删除/撤销不能直接物理覆盖证据 | **迁移 canonical 记录；重建/保留派生视图**；建议、review queue、mock 不迁为事实 | 待确认本地联系人重复、跨账号 owner、证据引用和关系事件表之间的映射；权限需用双 actor 回读补证 |
| 活动与报名 | 活动 canonical 为 `event_ops_events`；报名 canonical 为 `event_ops_membership_heads` + `event_ops_membership_versions`；`orbit_records/events` 及 event work collections 是 legacy/能力数据或兼容投影 | `/api/events/:id`、`/api/events/:id/registration`、`/registration/cancel`、event access/operations routes；写入走 event core/operations repository | 活动目录、活动详情、报名/取消、attendee/analytics routes；App 只经 API 读取 | 活动由 `organizer_actor_id`/主办方归属；报名由 participant actor 和活动资格控制；主办方、参与者、管理员范围不同 | `event_id`、membership revision/head；活动有 lifecycle/version；取消、归档和历史版本必须保留语义 | **先执行官方 event schema migration，再做 canonical membership migration**；不把 analytics、recommendation、generation、fixture 当报名事实 | 必须先取得旧源/本地库的活动与报名快照，并完成 canonical membership dry-run；`event_ops_*` 迁移量大，不能用空 Neon 直接推断无数据 |
| Tasks / To-do | `orbit_records/tasks`；`taskSuggestions` 只是不确定的推荐/候选，不是已确认任务 | `/api/tasks`、`/api/tasks/:id`；生成类 route 只产生建议或显式确认后的任务 | `/api/tasks`、Today、followups 投影、任务详情；App `/tasks` 等页面经 API 读取 | `user_id = accountId = ownerUserId`；关系任务还需 connection scope；不能因为推荐命中就扩大权限 | task ID 稳定；完成/恢复、dueAt、version、mutationId/幂等；软删除或归档按服务语义 | **迁移已确认 tasks；不迁移/不提升 taskSuggestions 为任务**；relationship followup 继续作为 tasks 的明确投影 | 待确认本地任务数量、重复 ID、旧 followup 数据和建议数据的边界；需用一条 Web→App 同记录完成/恢复回读补证 |
| 个人日程与预约 | canonical `orbit_records/personal_schedule_items`；`orbit_records/orbitScheduleItems` 为 legacy compatibility reader；活动预约的共享事实仍由 event/appointment 规则控制 | `/api/schedule-items`、`/api/schedule-items/:id`、meeting-details route；写入应收口到 `PersonalScheduleService` | `/api/schedule-items`、Today/Schedule、会议详情和 agent action；App 只经 API 读取 | 个人日程 `user_id = accountId = ownerUserId`；共享预约按 participant/organizer scope，不可当作私有日程 | 稳定 schedule ID；updatedAt/version/idempotency；开始/结束时间和 timezone 必须保留；取消/删除需可回读 | **迁移到 canonical personal schedule；旧 collection 只做兼容读取和迁移窗口**；外部 Calendar 双向同步暂不作为本次阻塞 | 需做旧/新 schedule parity dry-run，确认冲突、孤儿和 timezone 差异为 0；远程 Web/API 尚未重启验证 |
| I ORBIT / AI 读取上下文 | **没有独立业务 canonical store**；上下文是服务端按 actor 组装的临时输入，事实来自 notes/tasks/connections/schedule 等 canonical 域；AI 输出不能反写成事实 | AI query tools、agent runtime 和显式 API action；写入业务事实仍回到各自域的 API/service | `notes.query`、`tasks.query`、`followups.query`、`schedule.query` 等 actor-scoped 只读入口；App 不直接给模型数据库权限 | 必须使用服务端注入的 authenticated `actorId`；按 visibility manifest/allowlist；消息正文、provider token、设备 ID 等默认拒绝 | 上下文不迁移；若持久化会话/报告另有其独立版本与 owner，需单独登记；生成结果必须带来源/版本或标记为建议 | **不迁移临时上下文；先迁移其依赖的 canonical 数据**。AI 历史/报告只在明确属于 P0 时单独盘点 | 尚未在 Neon 目标 schema + 运行 Web/API 上验证 visibility/actor 隔离；不能以本地工具测试替代远程权限证据 |

## 已确认的共同基础

- 服务端数据库连接解析顺序是 `ORBIT_EVENT_DATABASE_URL` → `ORBIT_LIVE_DATABASE_URL` → `ORBIT_DATABASE_URL`，驱动是通用 `pg`。
- Orbit 通用业务存储的基础表是 `orbit_records`；其主键为 `workspace_id + collection_name + record_id`，记录含 `user_id`、生命周期状态、来源、更新时间和 JSON payload。
- 活动/报名不是单纯的 `orbit_records` collection：`runEventOperationsMigrations` 会建立 `event_ops_*` 表族，canonical event 读取明确来自 `event_ops_events`。
- App 的业务边界是 HTTP API；App SQLite `api_snapshots`、SecureStore 设备标识和浏览器缓存只能作为缓存/设备身份，不能作为线上业务事实。
- Neon 当前为空库，因此现在不能用“Neon 中没有记录”推断业务数据不存在；必须先确认待迁移源库和范围。

证据入口：

- `repos/orbits/shared/storage/live-database-config.ts`
- `repos/orbits/shared/storage/migrations.ts`
- `repos/orbits/shared/storage/postgres-live-record-store.ts`
- `repos/orbits/features/data-authority/registry.ts`
- `repos/orbits/features/auth/storage/auth-account-provisioning-provider.ts`
- `repos/orbits/features/profile/storage/profile-live-record-provider.ts`
- `repos/orbits/features/contacts/storage/contact-live-record-provider.ts`
- `repos/orbits/features/events/core/storage/postgres-repository.ts`
- `repos/orbits/features/events/event-operations/storage/migrations.ts`
- `repos/orbits/features/events/storage/event-work-record-provider.ts`
- `repos/orbits/app/api/`
- `repos/orbit-app/README.md` 与 `repos/orbit-app/src/api/client.ts`

## P0-1 结论

1. 统一目标可以固定为 Neon；当前真正缺的不是再选一次云服务，而是把现有源库按上表分类后迁移到 Neon。
2. 不能只执行 `orbit_records` 建表就宣布完成：活动/报名必须同时执行 `event_ops_*` migration 和 canonical membership 校验。
3. 不能把所有 collection 原样搬迁：任务建议、AI 上下文、缓存、mock、analytics/recommendation 等必须按上表分类处理。
4. P0-1 还不能关闭，剩余阻塞只有四类：源库基线快照、ID/owner 映射、event membership dry-run、Web/API + App 共享 Neon 的回读证据。

## 下一步（进入 P0-2 前的最小动作）

1. 只读取得待迁移源库的表/collection 数量、记录数量、最大更新时间和按 owner 的计数；不导出业务正文。
2. 在 Neon 创建隔离分支或等价测试数据库，执行 `orbit_records` 与 `event_ops_*` migration。
3. 对账号/资料、人脉、活动/报名、任务、日程各挑选脱敏样本做稳定 ID、owner、权限和回读演练。
4. 生成冲突清单；任何重复 ID、owner 不明、权限无法证明或来源冲突都先阻塞该域，不做“先迁移再看”。
