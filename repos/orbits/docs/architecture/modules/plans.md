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
- 第一份计划的生成（W0008，RW-08；D3 不接 AI）：`POST /api/agent/plans/bootstrap`（`{ idempotencyKey, supplement?, locale? }`）。不走 `/api/ai/conversations`——回答是一份要落库、可跟踪的结构化计划，对话接口的共享契约也没有「意图」字段。一次请求内完成：已有生效计划时，同一幂等键直接返回那份（200，`replayed`），否则 409 `PLAN_ALREADY_EXISTS`（`context.planId`）；读本人已确认联系人（`input-source.ts`，与联系人计数同一归属谓词，带本人记录的最后互动）与真实活动目录（已发布、未开始，canonical id），超过 200 位时只保留近 90 天有互动的与和目标相关的（`input-selector.ts`）；生成器出骨架 + 各阶段细节（`generator.ts`，有界并行、按阶段顺序拼装，任一阶段失败整份失败 503 `PLAN_GENERATION_FAILED`、不保存）；`validate.ts` 校验结构、阶段数（一个月 2–3 段、3 个月 3 段、一年 4 段）与引用（只能引用输入里的、且经 `PlanReferenceValidator` 核对属于本人的联系人／活动，否则 404）；最后 `createVersion({ basePlanId: null, creationKey: "bootstrap:<key>" })` 一个事务保存为生效的 v1。目标从服务端资料读，不信任请求体。回答卡片数据（一句话回答、3 个关键数字、这周 3 件事、现有人脉、还缺的人、最大风险、30 秒自我介绍、每阶段跟进方式、请求与幂等键）存在 `plans.analysis`（`PlanAnalysisV1`）。
- 生成器替换点：`generator-service-factory.ts` 的 `resolvePlanGenerator()`，按 `ORBIT_PLAN_GENERATOR`（缺省 `mock`）选择，不跟随 `ORBIT_MODULE_MODE`——mock 生成器只把用户自己的真实数据套进模板，是 D3 下的产品行为，live 环境同样使用；其他取值在实现注册前 fail closed（503）。接真实 AI：新增实现 `PlanGenerator` 的 provider 并在 factory 注册，另开 Sprint 引入持久化生成任务与预算。
- 人脉需求匹配（W0010，RW-11；决定 D5）：
  - 表（`matching-migrations.ts`，独立的 `plan_matching_schema_migrations`）：`plan_match_jobs`（actor、`source_kind` batch／day + `source_key`、`batch_ids`、`contact_ids`、状态 pending／running／completed／failed、尝试次数、租约、`not_before`、`ai_state` none／started／succeeded／failed／skipped、`ai_model`、`ai_usage`、规则／AI 命中数），`(workspace, actor, kind, key)` 唯一；`plan_match_candidates`（任务、计划、需求条目、联系人、层级 rule／ai、强度 strong／candidate、理由、状态 pending／accepted／dismissed），`(workspace, actor, 需求, 联系人)` 唯一——同一对只提示一次，忽略后不再出现；`plan_match_job_contacts`（迁移 v2）记录每个联系人来自哪个批次：审阅页的规则预览与候选列表只看这一批的联系人，当天任务的 AI 仍一次覆盖当天全部联系人。
  - 触发与状态机：名片批次在 `business-card-ingest-v2/repository.ts` 的 `reconcileBatchStateLocked` 转为 completed 的同一事务里调用 `enqueuePlanMatchJob`（批次行已持锁，唯一约束兜底重放）；本批没有确认进人脉的联系人时不建任务。一张名片的批次（单张补录）按 (actor, 东京自然日) 并进同一条任务，次日 00:00 JST 才到期。表不存在（迁移未执行）时用 savepoint 吞掉 42P01，名片确认照常完成。执行者 `match-worker.ts`：pending → 领取（attempt+1、租约 120 秒）→ running → completed；出错回到 pending，满 3 次 failed；租约过期可被重新领取。两条触发路：审阅页 `POST /api/agent/plans/candidates/run`（按 actor + batch 领取、请求内执行；单张补录未到期时只跑规则层预览）与维护任务 `plan-match`（`match-maintenance-task.ts`，每次最多 20 个任务，表缺失时 skipped）。
  - 规则层（`matching.ts`）：二级行业相同 = 强候选、一级相同 = 候选，缺行业或只落在「其他」兜底分类不参与；输入本人所有生效人脉需求，只排除已关联同一联系人的，没有「已填满」概念。
  - AI 层（`ai-matcher.ts`）：provider factory 复用名片识别的 DeepSeek 文本模型配置（`DEEPSEEK_API_KEY`、`ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL`），`json_object` 输出，提示词只含联系人 id、姓名、公司、职位与需求文字（紧凑编码，空字段不出现）；一次调用覆盖本人所有生效需求（按新到旧），只设 200 条的 token 安全上限，联系人只受任务本身约束（一批最多 50 张、当天最多 200 人）；只接受本批联系人 id 与本计划需求 id，越界、重复、已关联、规则层已有的配对丢弃。每个任务最多一次调用：先把 `ai_state` 从 none 置为 started 并提交，再发请求；失败／超时记 failed 并保留规则结果，重试时不再调用；用量记在 `ai_usage`。未配置密钥 → skipped。
  - 读写接口（`matching-service.ts` + `app/api/agent/plans/candidates/**`）：`GET /api/agent/plans/candidates`（对照当前生效计划过滤后的候选、每条需求的待确认数、人数）、`POST /api/agent/plans/candidates`（`{ candidateId, decision }` 或手动关联 `{ action: "link", needItemId, contactId }`）、`POST /api/agent/plans/items/:itemId/interaction`（「记一次互动」）。确认／忽略走服务的 `decideMatchCandidate`：一个按 actor 串行的事务里锁住候选（`for update`）、严格 CAS（只从 pending 转出），接受时同一事务完成关联、行动与记录；并发的是／不是只有一个成功，另一个 409（`MATCH_ALREADY_DECIDED`），同一决定重复提交回放现状。候选列表按新到旧。手动关联走 `linkNeedContact`：关联联系人 + 在本周生成「约 TA」行动（`meta.source = "network_match"`，同一需求 + 同一联系人只一条），`contact_linked` 记录的 `targetItemId` 指向行动；`recordInteraction` 写一条手动互动记录、需求上的联系人变为已建立联系、行动完成。「起草邮件」`POST /api/agent/plans/items/:itemId/draft`：点击才生成，经 `email-draft.ts` 的 provider factory（当前为模板：联系人姓名／公司／职位、需求描述、计划目标；不调 AI），返回可编辑草稿，不保存、不发送；接 AI 只需换 `resolvePlanEmailDraftProvider` 一行，付费 AI 起草仍需用户决定。他人的批次、候选、需求、联系人一律 404。
- 活动归属（W0015，RW-11 Q26A；不新增表与迁移）：
  - 时间窗口（`event-attribution.ts`，纯函数）：以名片条目的 `createdAt`（扫描上传时间，不可变；两面名片取 seq 最小的一面）为准，不看确认时间；按东京日历日（Asia/Tokyo）比较，扫描日 = 已报名活动开始日当天或次日；多场都符合时取开始时间离扫描时间最近的一场。数据来源 `EventAttributionSource`：live（`event-attribution-runtime.ts`）活动取 canonical 已发布目录，报名用 `listRuntimeEventRegistrationsForUser`（只认 rsvped，按 Auth.js 用户 id）；目录不可用时视为没有候选。
  - 候选接口 `GET /api/agent/event-attribution/candidates?batchId=`：批次按本人读取（他人批次 404），返回 `{ events, cards: { cardId: eventId | null } }`。审阅页只对**当前这张名片自己的候选**询问（没有候选不问，不回落到本批其他活动），默认勾选、可取消，决定按名片记。有候选的名片不自动导入（审阅页与全站后台宿主都一样），一定经过询问；没有候选的名片照旧自动导入。完成页按每张名片确认回执里实际写入的活动分组显示。
  - 确认写入（`batches/v2/handlers.ts` 的确认／手工录入）：请求体可带 Web 独有的 `metEventId`（不进共享 schema，App 契约不变）；服务端按这张名片的扫描时间重算本人的候选，不一致 → 409 `EVENT_ATTRIBUTION_REJECTED`，非字符串 → 400，都不写库。核实后在联系人 payload 写 `metEventId`／`metEventTitle`（新建直接写；合并到已有联系人只补空，已记着任何一场活动都不动），OCR 来源 `source` 不变；该字段参与确认指纹。联系人是主数据：确认提交后尽力调用 `markEventAttended`，失败只记日志、不影响确认结果。
  - `markEventAttended`：本人生效计划里 `linkedEventId` 相同的活动条目按状态机推进到已参加（只是「推荐」时内部先经过「已报名」），只写一条「参加活动」auto 记录（`payload.source = "event_attribution"`，幂等键 `event-attended:<条目>`）；已参加是终态，重复调用不再写；没有计划或计划里没有这场时不做任何事。
  - 对账（`event-attendance-reconcile.ts`，维护任务 `plan-event-attendance`，每次最多 50 个）：按同一 actor 连接联系人与计划，找出联系人记着 `metEventId`、但生效计划里对应活动还没「已参加」的 (actor, 活动)，逐个调用 `markEventAttended`。确认后的计划写入失败或计划服务当时未配置时由它补上；未配置时 skipped。
  - 匹配排序：联系人 payload 有 `metEventId` 时，与该活动关联的需求（需求与该活动条目同属一个阶段）在规则层排在最前；候选列表在 SQL 里按同一 actor 计算这一优先级并在 `LIMIT` 之前排序（较旧的也不会被截掉）。只调整顺序，不产生新候选。
- 迁移入口：`scripts/migrate-web-runtime.ts` 与 `scripts/setup-minimal-staging.ts`（计划表与匹配表）。live 模式不在请求时自动建表；生产库执行需要用户单独授权。

## Mock 行为

计划生成的 mock 生成器（`mock-generator.ts`）是确定性的模板：同样的输入永远得到同样的计划，周期按期限切分（一个月内 2–3 段按周，现有人脉 ≥3 位时 3 段；3 个月内 3 段共 12 周；一年内 4 个季度段、只有第一段细到周），人脉需求的行业条件与职位关键词来自 `goal-signals.ts`（行业 id 取自 `shared/domain/industries.ts`），不发任何网络请求。Mock 的引用校验是可配置白名单（联系人按 actor 分组、活动为公开目录）；mock 模式没有可核对的数据源，默认接受任意格式合法的 id，测试用 `setPlansMockReferenceAllowListForTests` 或直接注入白名单。Mock 使用进程内内存仓储（挂在 `globalThis`，dev 热重载后仍在），与 Postgres 仓储实现同一个 `PlanRepository` 接口：每个人一条串行队列，事务在副本上执行、失败即回滚，同样拒绝第二份 active 计划和重复的幂等键。不访问数据库或网络。hybrid 未单独注册，按约定回落到 mock。

## 热拔插边界

API route 与后续的 route service 只通过 `features/plans/service-factory.ts` 的 `resolvePlanService` 取服务（匹配接口通过 `matching-runtime.ts` 的 `getConfiguredPlanMatchingRuntime`，只在 live 模式且数据库已配置时可用，否则 503；AI 匹配器通过 `createConfiguredPlanAiMatcher` 注入，worker 只依赖 `PlanAiMatcher` 接口）；业务规则只在 `service.ts`，仓储只负责按 actor 串行的事务和行级读写。live 模式在数据库未配置时返回共享的 `NOT_IMPLEMENTED` 解析失败（API 以 503 envelope 返回），不回落到内存仓储。
