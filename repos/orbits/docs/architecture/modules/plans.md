# Plans 模块

## 模块定位

Plans 负责「我的计划」的结构化存储（RW-09，Sprint W0007）：计划按阶段、行动、人脉需求、要获得的信息和活动保存、更新和版本化，并记录进展。计划生成（W0008）、「我的计划」页（W0009）、人脉需求匹配（W0010）、长期跟踪（W0012）、活动归属（W0015）都建立在本模块之上。本模块不生成计划内容，也不改动 ledger（操作账本）。

## 期望行为

- 三张表（`features/plans/migrations.ts`，advisory lock + `plans_schema_migrations` + checksum 守卫）：
  - `plans`：`version`（按人递增）、`status`（active／archived）、`goal_snapshot`、`horizon`（month／quarter／year，与目标编辑器的期限键一致）、`starts_on`（第 1 周起点）、`analysis`、`phases`（阶段 key、标题、起止周次、按周／按季度）、`source_session_id`、`previous_plan_id`、`creation_key`。部分唯一索引 `plans_one_active_per_actor` 保证每人同一时间只有一份 active。
  - `plan_items`：`kind`（action／network_need／info／event）、`phase`、`suggested_week`、`status`、`linked_contact_ids` + `contact_links`（两级：已关联 → 已建立联系，带关联时间）、`linked_event_id`、`answer`、`criteria`（一级／二级行业、职位关键词、描述）、`sort_key`、`deferral_count`、`completed_at`、`carried_from_item_id`。
  - `plan_log`：`kind`（auto／manual）、`event`、`author`、`body`，以及结构化引用 `linked_contact_ids`、`linked_event_id`、`item_id`、`target_item_id` 和唯一的 `idempotency_key`。后续 Sprint 只读结构化字段，不从 `body` 反解引用。
  - `plan_commands`：带幂等键请求的命令回执（key、类型、计划、条目、请求指纹、结果 applied／noop、对应的记录）。
- 所有行带 `workspace_id + actor_id`；条目、记录与回执通过复合外键绑定到同一个人的计划。`plan_log.item_id`／`target_item_id` 与 `plan_commands.item_id` 按 `(workspace_id, actor_id, plan_id, id)` 引用条目，跨用户、跨计划的引用在库里就会失败。
- 状态机（`features/plans/contract.ts`）：
  - 行动：未开始 → 进行中 → 完成；未开始可直接完成（打勾）；完成可撤销回未开始。可「延后到第 N 周」（只能往后，`deferral_count` +1）。
  - 人脉需求：状态由联系人推导（open／linked／established）；联系人先关联再建立联系，已建立联系的不能取消关联。
  - 信息：填答案即 answered，清空回到 open。
  - 活动：推荐 → 已报名 → 已参加；取消报名 已报名 → 推荐；已参加是终态。
  - 非法转移返回 `ILLEGAL_TRANSITION`（409），不写库；与当前状态相同的请求不写库也不报错。
- 每次真实变化自动写一条 auto 记录；手动记录可引用联系人、活动与条目。
- 幂等：带 `idempotencyKey` 的条目变化与手动记录（包括「与当前状态相同」的无变化请求）在同一事务里写命令回执，绑定条目与请求指纹。同 key 同请求 → 返回第一次的结果（`replayed: true`，不再写库），所以延迟到达的旧请求不会覆盖之后的变化；同 key 不同请求 → `IDEMPOTENCY_KEY_REUSED`（409）。被拒绝的请求（非法转移、引用不存在等）不写回执，保持「4xx 不写库」。
- 引用归属：创建版本、关联联系人、手动记录时，新引用的联系人／活动经按 actor 构造的 `PlanReferenceValidator` 校验。live：联系人必须是本人未删除的 `orbit_records/contacts`；活动必须是 canonical 活动目录里已发布的活动（`getPublishedEvent`，只认 canonical id）。找不到或属于别人 → `REFERENCE_NOT_FOUND`（404），不写库、不回显 id。从旧版本带入的条目不重新校验。
- 新版本（`createVersion`）：在按 actor 串行的事务里归档旧版、写入新版；`basePlanId` 做乐观并发（`null` = 只在没有计划时创建），`creationKey` 让同一次生成只保存一份。继承规则：`inheritsFromItemId` 指定的旧条目并入新条目；同一活动自动并入；其余完成的行动、有答案的信息、已报名／已参加的活动、有联系人的人脉需求原样带入（旧周次清空，阶段不存在时 `phase` 为空）。旧版本只读、可按 id 读取。
- 接口（`app/api/agent/plans/**`，统一 envelope，需要登录）：`GET /api/agent/plans/current`、`POST /api/agent/plans`（新版本）、`PATCH /api/agent/plans/items/:itemId`（`{ change: { op, ... }, idempotencyKey? }`）、`POST /api/agent/plans/log`（手动记录）。他人条目与不属于本人的引用 404，坏输入 400，非法转移与幂等键冲突 409，服务不可用（含身份／服务解析时抛错）503，统一 JSON envelope。
- 迁移入口：`scripts/migrate-web-runtime.ts` 与 `scripts/setup-minimal-staging.ts`。live 模式不在请求时自动建表；生产库执行需要用户单独授权。

## Mock 行为

Mock 的引用校验是可配置白名单（联系人按 actor 分组、活动为公开目录）；mock 模式没有可核对的数据源，默认接受任意格式合法的 id，测试用 `setPlansMockReferenceAllowListForTests` 或直接注入白名单。Mock 使用进程内内存仓储（挂在 `globalThis`，dev 热重载后仍在），与 Postgres 仓储实现同一个 `PlanRepository` 接口：每个人一条串行队列，事务在副本上执行、失败即回滚，同样拒绝第二份 active 计划和重复的幂等键。不访问数据库或网络。hybrid 未单独注册，按约定回落到 mock。

## 热拔插边界

API route 与后续的 route service 只通过 `features/plans/service-factory.ts` 的 `resolvePlanService` 取服务；业务规则只在 `service.ts`，仓储只负责按 actor 串行的事务和行级读写。live 模式在数据库未配置时返回共享的 `NOT_IMPLEMENTED` 解析失败（API 以 503 envelope 返回），不回落到内存仓储。
