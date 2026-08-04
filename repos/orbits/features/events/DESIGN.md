# Events 模块设计文档

## 设计定位

Events 负责活动前、中、后的关系工作流。它不是日历系统本身，而是把活动变成关系机会：导入活动、看参会者、设定目标、准备开场白、记录现场遇见的人，并在活动后整理联系人和跟进。

活动相关动作必须保留来源和用户确认。想连接某个人，不等于立即发出消息。

## 子能力范围

- `event-crud-and-import`：活动创建、导入、详情；包含 mock、hybrid 和 live-store 实现。
- `attendee-roster`：参会者列表、已知联系人标记和导入批次。
- `goal-readiness`：活动目标和准备清单。
- `encounter-note`：现场记录和证据。
- `want-connect`：想认识某人的意图记录和匹配视图。
- `post-event-review`：活动后联系人草稿、复核和确认决策。

## 契约与数据边界

契约位于各子能力目录的 `contract.ts`。核心 DTO 包括 event record、attendee、goal、readiness checklist、encounter note、want-connect intent、post-event review 和 provenance。Events 不直接写正式联系人库，活动后联系人先成为 post-event contact draft，确认后再进入 Acquisition 或 Contacts 的确认边界。

Service factory 注册 event crud、attendee、goal/readiness、encounter、want-connect 和 post-event services。

## 持久化与计算边界

Events 的 live 数据链路使用 `orbit_records`，通过 `collectionName` 区分 event work records。第一阶段集合包括：

- `events`
- `event_attendees`
- `event_attendee_import_batches`
- `event_goals`
- `event_encounter_notes`
- `event_want_connect_intents`
- `post_event_contact_drafts`
- `post_event_review_decisions`

用户明确创建、选择、记录或确认过的事实需要持久化。readiness score、suggested checklist、attendee recommendation eligibility、want-connect match result、post-event summary 和 follow-up suggestion 先作为可重算 computed view，不作为主记录写入数据库。

### Event Core（Phase 1 additive schema）

`event_ops_events` 是 canonical event 的唯一物理主记录。v8 在旧表上增量加入公开编号、标题、描述、场地、时区、起止时间、v2 生命周期、来源 payload、取消/归档时间和版本号，并增加 `event_event_versions` 与 `event_aliases`。为了兼容已经存在但尚未补齐 metadata 的 event-operations 行以及尚未编辑完成的 draft，v8 metadata 字段允许为空；draft 可以从通用 reader 读出，此时时间不完整则 phase 为 `null`。一旦进入 published view，`features/events/core/service.ts` 会强校验标题、时区和有效时间范围，残缺数据不得进入公开活动列表。

活动 phase 只由读取时刻与 `starts_at`/`ends_at` 推导为 upcoming、live、ended，不落库。活动 id、public code 和 legacy route id 统一且仅经过 workspace-scoped `event_aliases` resolver；head 表中的 `event_id`/`public_code` 不构成隐式路由。canonical id 与 public code 也必须有对应 alias row，缺失即返回未解析；同一别名命中不同 event 时 fail closed。

`db:backfill:event-core` 是显式迁移命令，读取旧 `event_ops_events`、approved public catalogue 和未删除的 `orbit_records/events`，先构建稳定 count/hash 的计划，再在事务内写入。标题、时间、owner、状态或其他 canonical 字段不一致时会报告来源并停止；缺失时区和 public owner 也不猜测，运行者必须显式提供 `EVENT_CORE_BACKFILL_TIMEZONE` 与 `EVENT_CORE_PUBLIC_OWNER_ACTOR_ID`。该显式 public owner 同时用于没有 `user_id` 的 workspace-public 旧活动记录。可先加 `--dry-run` 只输出 count/hash。

一次性迁移决议 `event-canonical-v1` 只覆盖 `event_signup_02` 与 `event_signup_03` 的 title/endsAt 四个字段。每项都冻结 event id、field、selected source、reason code、rationale 和所有实际来源规范化值的 SHA-256 digest；文本先做 Unicode NFC 与 trim，时间统一为 UTC ISO。planner 只有在 event+field 精确命中且来源集合与 digest 全量一致时才采用 public catalogue，缺项、多项、未消费项、来源缺失、digest 漂移或第五个冲突都会阻断。决议证据写入 event source payload 并参与 event content hash 与 plan hash，不存在通用 `publicWins`、source priority 或 runtime fallback。

`publicCode` 只来自冻结的 public catalogue；仅存在于 `orbit_records/events` 的活动保持 `null`，迁移不会为私有或测试来源臆造公开 URL。CLI 必须显式且互斥使用 `--dry-run` 或 `--apply`；裸命令与未知参数都会失败且不写 canonical event。dry-run 只输出 reviewed count、hash、migrationId 与 resolutionCount。apply 还必须同时提供 `--expected-plan-hash <64hex>` 和 `--expected-count <positive int>`，并在进入业务事务前与即时计划精确比较；来源增加、减少或内容变化都会使旧 review 失效并阻断写入。

Phase 1 不改变 event CRUD、报名或活动生命周期写链。旧 public catalogue 与 `orbit_records/events` 在完成迁移后只作为 backfill/import 来源；产品页面的 canonical read cutover 需要独立受控切换与页面/API 一致性回归后才能完成。

Phase 2-A1 只增加 canonical public catalogue 基础边界，不切换任何生产消费者。`features/events/core/public-catalogue.ts` 只接受 `EventCoreService`、canonical participant summary reader 与读取时刻注入：公开编号、名称、场地、时间和描述均来自 PostgreSQL canonical event；只有 published 且具有 canonical `publicCode` 的活动进入公开快照，其他公开必需字段残缺时 fail closed；快照通过 `publicCodes[eventId]` 直接暴露已校验的 canonical public code，消费者不得再按列表顺序派生 route code。每个公开活动必须有显式 canonical participant summary，真实零人也必须保存 count `0` 的 summary；缺行时 fail closed，不得把未迁移或读取失败伪装成零人，也不得读取旧 catalogue 补数。来源统一标记为 `event-core-postgres`，证据只从受校验的 canonical `sourcePayload` 提取，没有证据时按 event version 生成稳定 evidence id。下一独立 commit 才会删除生产页面/API 对旧 public catalogue 的读取并做消费者切换回归。

Phase 2-B1 只建立 canonical admission foundation，不切换现有报名消费者。Admission application 表示申请、审批、候补和退出，不扩展也不等同于旧 `EventRegistration.status`，更不等同于 canonical membership。v9 以不可变 policy/application version 和唯一 head 保存每个 application version 所依据的 `policyVersion`；容量、窗口、审批与候补提升均在 event row lock 下使用数据库时钟原子执行并写入既有 audit log。Policy mode 只决定新申请的入队状态；已有 `pending_review` 不会因模式切换被卡死，仍可审核且使用最新 policy 执行容量/候补约束。后续独立切换只有在 application 为 `admitted` 时，才能在同一受控事务边界投影为 canonical membership；pending、waitlisted、rejected 与 withdrawn 均不得进入参会者目录或匹配计算。

Phase 2-B2A 仍不切换 UI 或生产消费者，只把 admission 的已录取状态与 canonical membership 建立同事务桥接。v10 为 membership version 记录 `legacy_registration` 或 `admission_application` origin；admission origin 必须以同 workspace/event/actor/applicationVersion 外键指向不可变 application version。Instant admitted、审批 admitted 与候补提升原子写入 `rsvped` membership，admitted 退出原子追加 `cancelled` membership；pending、waitlisted、rejected 不写 membership。共享 executor writer 在同一事务写 profile、逐字段 answers、自适应 response snapshot、membership、audit 和 outbox，任何一步失败都会连同 application 变更整体回滚。新 policy 必须显式配置 `profileEditDeadlineAt`；v10 不用 registration close 猜测旧 policy 的 deadline，历史 null policy 在重新配置前 fail closed。Catalogue summary 解耦、legacy admission 迁移和生产读取切换保留给 Phase 2-B2B。

Phase 2-B2B1 把 legacy registration 激活与 AI/运营 configuration 解耦，但不改变运行时报名 gate。迁移时 profile deadline 优先读取现有 configuration；没有 configuration 时必须由 operator manifest 显式提供严格 ISO 时间和非空 evidence ID，禁止从 Event Core `startsAt`、环境变量或其他字段推断，并在 migration audit payload 与 evidence IDs 中记录确切来源、证据和原因；两种可信来源都缺失时在任何业务写入前 fail closed。event row 的 migration count/hash 与唯一 activation audit 共同构成不可变迁移基线；已经 canonical 的事件重放校验两者的一致性，不再与允许正常报名、画像编辑和取消的 current membership heads 比较，也不读取或覆盖可能漂移的 legacy projection，不要求 migration option 或 configuration。Catalogue summary 只依赖 published canonical Event Core、canonical membership 和可选 publication，零报名事件也返回显式零值；`lifecycle_state_v2 is null AND lifecycle_state = active` 仅作为 pre-Event-Core operations row 的阶段性兼容，draft、cancelled、archived 等 v2 非 published 状态一律不展示。Memory repository 必须通过 `publishedEventIds` 获得 manifest-only 活动的显式发布知识；有 configuration 的 memory 活动仅模拟上述 legacy-active compatibility。没有 canonical membership 激活或发布生命周期证据的活动继续不对外暴露。

Phase 2-B2B2a1 只定义 canonical membership migration 的事实输入、operator manifest v1 parser 和纯 planner，不读取数据库、不写入、不提供 CLI，也不切换运行时。Planner 的 canonical fact 类型不接收 legacy projection，因此 canonical source hash 不会被旧投影漂移污染；Event Core 的 eventVersion/contentHash 单独形成 `eventCoreHash`。Manifest 固定为 `{ schemaVersion, events }`，event map 的 value 只允许 deadline/source/evidence 三个字段；RFC3339 `Z` 或 offset 时间在解析边界规范化为 UTC ISO 后参与稳定 hash。原始 JSON string 通过共享递归 parser 在所有 object 层级按解码后的 key 拒绝重复字段，再进入 manifest shape 校验，不能被 `JSON.parse` 的后值覆盖语义绕过。Canonical event 的 deadline 不读取可变 current configuration；legacy event 才能使用现有 configuration 或显式 manifest，包含零报名在内都不推断缺失 deadline。任何 blocker 都使 `applyPlanHash` 为 null，而 `diagnosticHash` 始终可复现。

Phase 2-B2B2a2 增加只读 source reader，并强制通过模块私有 brand 的 snapshot runner 在 PostgreSQL `repeatable read`（未来 apply 可选 `serializable`）事务内读取；Event Core head、版本、audit、legacy records 与 canonical current heads 必须来自同一个数据库快照。Canonical 事件只从 membership/profile current heads 读取，旧 `orbit_records` 投影即使恶意或损坏也不参与事实或 hash；mutable current operations configuration 对 canonical fact 完全无效，immutable activation baseline 只由事件迁移 metadata 与唯一 activation audit 验证。Activation audit 有显式兼容版本：历史 v1 必须精确为 `{count,hash}` 且 evidence 为空；新 writer 只写带 `contractVersion:2` 的 deadline/source/reason/evidence 完整契约，partial 或混合形态 fail closed。

Source fact 与 plan 显式报告 physical `rawCount`、`validCount`、`invalidCount`；三者必须是非负安全整数且 `raw = valid + invalid`。`total.registrations` 是所有已知物理 legacy rows/canonical heads，`rsvped`、`cancelled` 与 source hash 只统计严格验证通过的 registration，因为非法行的 status 不可信。Legacy wrapper、record/provider/source/user/target identity 与完整 registration 使用 exact-key、稳定 identity、canonical ISO timestamp、正式 RSVP→cancel→reactivate→cancel 生命周期、all-false side effects，以及 signed adaptive/legacy_unknown interview snapshot 闭合校验；重复 identity 的所有冲突行都计入 invalid，不选择赢家。Blocker 的 record identity 只输出 domain-separated SHA-256 diagnostic token，不输出原 record/user/provider/source/answer。

B2B2a2 不写库、不提供 apply/CLI、不读取真实 operator manifest。2026-08-04 对 main 的 branded snapshot 盘点会如实 fail closed：19 个事件、raw 144、valid 120、invalid 24；24 个 canonical profile 含 present empty-string answer，两个 canonical event 均 blocked，`applyPlanHash = null`。空字符串不会被删除、trim、默认或修补；它们只能由后续独立、显式、可审计的 canonical profile repair 流程处理。在 repair 完成并重新通过 snapshot plan 前，apply 与 runtime cutover 均禁止。

Phase 2-B2B2a3a 只建立上述 24 个 canonical profile 的只读修复事实、纯删除变换和审批计划，不提供 writer、CLI 或任何数据库写入口。Reader 复用 B2B2a2 的 branded repeatable-read snapshot、严格 registration validator 与 activation audit validator；每个 event 固定 Event Core version/content hash、configuration head revision/version、画像截止时间与 activation audit fingerprint，每个 target 固定 membership/profile head revision、current version、生命周期 hash、response hash、删除路径及修复前后 payload hash。所有 plan/token/hash 都使用 domain-separated SHA-256；计划不包含 actor、participant、姓名、画像答案或 response 内容，也不拿当前时间重新判定 deadline。

唯一允许的变换是删除 `registrationProfile.answers` 与已存在的 `participant.profileAnswers` 中 `trim()` 后为空的 string key；非空值不 trim、不改写、不补全、不推断。历史 canonical participant 若完全缺少可选 mirror 可以兼容读取，且 repair 不会创建该字段；mirror 一旦存在，就必须与 registration answers 在删除空白后逐字段精确一致。未知字段、非 string、非规范非空值、非空冲突、response 漂移、head/version/revision 漂移或来源证据异常都会产生 blocker，并令 `applyPlanHash = null`。2026-08-04 对真实 main 的只读验证固定得到两个 canonical event、24 个 deletion-only target，且计划可审批；后续独立批次才可在即时重读并核对这些证据后实现写入。

审批计划不能只绑定 24 个候选。Reader 对两个 canonical event 的每个严格有效 current row（candidate 与 unchanged）都生成不含身份和答案的 inventory row fingerprint，绑定 target token、membership/profile current version 与 head revision、current payload hash、生命周期/迟到状态、response hash、candidate state 和删除路径；每个 event 再固定 `inventoryCount` 与按 UTF-16 code-unit 顺序汇总的 `inventoryHash`。因此合法 noncandidate 的 head/version/payload/lifecycle/response 漂移也会改变 apply plan。所有 object key、blocker、event、target、response 与 deletion path 的 hash 关键排序统一使用显式 UTF-16 code-unit comparator，不依赖机器 locale。workspace 中每条 `registration_migration_activated` audit 也必须归属于当前 canonical event inventory；legacy/noncanonical/unknown/orphan audit 一律使用散列 diagnostic token fail closed，不能被忽略。

Planner 是不信任 TypeScript caller 的运行时边界，入口类型为 `unknown`。Source root、blocker、event、inventory 与 target 都必须先通过 plain-object、exact-key、primitive type 和语义白名单解析；hash 只接受 64 位 lowercase hex，版本/revision 为正安全整数，count 为非负安全整数，deadline 为毫秒精度 UTC canonical RFC3339，source authority 必须精确为 canonical，target token 只能是 `profile-target-sha256:<64hex>`。删除路径只能指向已知画像字段；candidate 至少包含一个 registration answer 路径，participant 路径不能独立存在，unchanged 必须为空。Inventory 对 candidate 固定 after payload hash，对 unchanged 固定 null；row fingerprint、event inventory aggregate 与 target link 都由 planner 重算，并精确校验 candidate after hash。未知、额外字段、prototype path、自签 hash 漂移、NaN/fraction/negative、明文 token 或不可信 blocker 都只生成固定文案和安全散列 token 的 sanitized blocker；raw source、raw message 和 raw token 永不进入 plan 或 diagnostic hash。任意 unknown 或异常对象都必须返回稳定的 ineligible plan，不能 throw。

结构与公开 SHA 只能证明来源内部自洽，不能证明来源确实来自数据库快照。Snapshot runner 因此只接受 exact-key、非空 `connectionString` 配置，在模块内部创建并关闭真实 PostgreSQL client；公共 API 不接受 client、executor、pool 或 factory 注入。Runner 仅在真实 transaction callback 期间把 freeze 后的 snapshot 登记到模块私有 WeakSet，公开身份查询只对 active snapshot 返回 true；callback 正常完成或抛错都会先 revoke，随后关闭内部 client。Snapshot 暴露的 executor 在每次 query 前后复核 active 身份，canonical migration 与 profile repair reader 也分别在首 query 前和最终 return/盖章前复核，未 await 的异步读取不能越过事务边界生成来源。Profile repair reader 完成读取后递归 freeze source 的所有 plain object 与 array，再以模块私有 `WeakMap<source, snapshot>` 绑定来源；`isTrusted` 必须同时命中该绑定且 snapshot 仍 active，因此 planner 只能在同一个 transaction callback 内消费刚读到的 source，callback 成功提交或抛错回滚后，捕获的原 source、clone、spread 或 Proxy 都不能再次生成 plan。Planner 的第一道门禁之后仍运行 strict parser 作为纵深防御；完整重签的 coherent source、删除 unchanged row 后重算全部公开 hash，也会因对象身份不受信而得到固定 sanitized ineligible plan。生产模块不暴露 sign/add/attest factory、WeakSet/WeakMap、private symbol、测试后门或环境变量旁路；合法 snapshot 中没有 canonical event 时固定生成 `REPAIR_CANONICAL_SCOPE_EMPTY` blocker，空 scope 永不产生 apply hash。

Phase 2-B2B2a3b0 只增加 profile contract repair 的 append-only audit ledger schema foundation，不增加 apply writer、service、CLI、outbox 投递或任何 main 数据写入。`event_ops_data_repair_runs` 固定 operator 分配的 `repair_id`、算法 `repair_type = canonical_profile_empty_answer_v1`、schema version、plan/result hash、expected count 与 apply/revert 时间；`repair_id` 不是 planner 中代表算法版本的既有 `repairId`。同 workspace/type/plan 只能登记一次。所有时间必须 finite，apply 不晚于 create，revert 不早于 create。`event_ops_data_repair_items` 固定 event/actor/participant、修复前后 profile/membership version 与 hash、删除路径和 finite create 时间，target version 必须是 source + 1，并通过 run FK 与复合主键保持可回放。数据库 guard trigger 拒绝 item 的 UPDATE/DELETE/TRUNCATE 与 run 的 DELETE/TRUNCATE；run 唯一允许的 UPDATE 是 `reverted_at` 从 NULL 单向设置为不早于 create 的 finite 时间，其他字段不可变且 revert 不可二改或清空。Ledger 不存画像答案、response、payload 或无界 JSONB；`removed_paths` 只能取已知画像答案路径，必须非空、排序、去重、至少包含一条 registration answer 路径，且 participant mirror 路径必须有同字段 registration 路径。当前批次只验证临时 PostgreSQL schema 的幂等升级、约束与事务回滚；真实 main 只读确认未应用或空 ledger。

Phase 2-B2B2a3b1 只建立 repair audit/outbox 的严格契约和 projector policy，不增加 writer、service、CLI、任务调度或 main 数据写入。唯一 event type 与 audit action 都是 `event.registration.profile_contract_repaired`；payload 只包含 operator repair run、算法/schema、plan hash、公开 event 证据、不可逆 target token、修复前后 profile/membership version 与 hash、删除路径、保持不变的 membership status、configuration version、画像截止时间、activation audit fingerprint 和发生时间，不包含 workspace、actor、participant、user、姓名、答案、response 或 profile payload。Runtime parser 是不信任输入的 total boundary：使用 `Reflect.ownKeys`、plain data descriptor、exact key、lowercase hash、NFC canonical event ID、毫秒 UTC 时间、正安全整数及与 ledger 一致的删除路径语义；getter、Proxy、revoked Proxy、循环对象、额外字段、明文 token 或 malformed value 都只返回固定无回显错误。成功结果会复制并 freeze，不保留原 payload 或 paths 引用。

Projector 只有在 payload eventId 与 message eventId 一致、`aggregateType = event_participant_profile` 且 aggregateId 精确等于 redacted target token 时，才返回 `{ policy: canonical_only, projection: none, projectedIds: [] }`；它永不写 `orbit_records`，也不触发旧 registration upsert/cancel、evidence、contact 或 connection provider。未知 repair event、错误 aggregate 或 parser 异常都 terminal fail closed，错误不可重试且不回显事件或 payload 内容。专项测试同时覆盖 rsvped/cancelled、registration-only 删除路径、participant mirror 对称路径、十次重放、PII key/value 扫描及临时 PostgreSQL 真实 legacy repository 的逐字节不变；outbox/audit 的原子写入仍留给后续独立 writer 批次。

Phase 2-B2B2a3c1 增加唯一显式的 canonical profile repair apply repository，但仍不提供 CLI、路由、后台任务或 main apply。Public command 以 unknown 进入 exact-key parser，必须显式提供 connection、workspace、operator repair ID、reviewed count 与 lowercase plan hash；结果只返回 applied/already_applied、count、plan/result hash。Repository 复用 attested snapshot runner 的单一 SERIALIZABLE transaction 与内部 client 生命周期；每次 40001/40P01 retry 都从原 expected count/hash 重建事实，不接受漂移后的新计划。事务按 repair run、workspace/type/plan、与正常报名相同的 event/actor advisory key 顺序加锁，再锁 event、current configuration、profile 与 membership heads；所有 trusted source/planner、raw identity、before/after payload、lifecycle、membership provenance（origin/admission application）、response、audit/outbox contract 与 result hash 校验都在首个 insert 前完成。v8 source 缺少 provenance 列时只规范为未来 v10 的确定性 backfill 值 `legacy_registration/null`；v10+ 则严格验证合法 pair，并把它们纳入 lifecycle/plan hash。

Phase 2-B2B2a3c2 增加唯一显式 operator CLI。scope manifest 只能从 regular、非 symlink 的 UTF-8 文件在 `O_NOFOLLOW` 打开后读取；原始 JSON 在 parse 丢失证据前拒绝重复 root key，打开及两次完整读取之间以 bigint dev/ino/size/mtimeNs/ctimeNs 与字节一致性复核，任何路径、编码、JSON 或契约错误只产生固定无回显失败。dry-run 只在 repeatable-read snapshot 内盘点，返回去身份化、冻结的 count/hash、blocker code 与 event aggregate，绝不运行 migration、readiness 或 repair writer。apply 仍只把 review 参数交给 repository 的 serializable、ledger-first 事务：runner 不以当前 eligibility/count/hash 提前拒绝，否则成功 repair 的重放会被当前零 target 阻断；scope 与 workspace 不一致才会在写前阻断。CLI 的 readiness 只读验证 schema v11+ 与两张 ledger 表，绝不升级 main schema；测试在临时 schema 真实 spawn 验证 dry-run 零写、drift fail closed、正确 apply/replay 与 legacy projection 不变，并对 main 只运行 dry-run。

Phase 2-B2B2a4a 只增加 canonical membership 全局 apply 的 v12 audit ledger 与严格纯命令契约，不增加 writer、CLI、路由、worker 或 main schema 写入。Run 固定 workspace、operator migration run ID、算法 migration ID/schema、reviewed plan/manifest hash、允许为零的 registration count、result hash 与数据库时间；同 workspace/migration/plan 只能存在一个 run。Event aggregate 只保存 event ID、迁移前 authority、去身份化 aggregate hash、deadline evidence hash 与 target count，不保存 actor、participant、姓名、答案、profile 或 response；canonical verify 行必须没有 deadline hash，legacy activate 行必须有 deadline hash。两表通过复合 FK 关联且 UPDATE/DELETE/TRUNCATE 全部以 SQLSTATE 55000 拒绝，临时 PostgreSQL 测试验证 v11→v12 幂等升级、pair/format/count/FK/unique 约束和事务失败全回滚；main 只读保持 v11 且 ledger 不存在。后续独立 repository 批次必须在一个 SERIALIZABLE transaction 内重建并校验全局 plan 后，原子完成所有 event activation 与 ledger 写入，禁止逐 event 部分成功。

Phase 2-B2B2a4b 增加唯一的 canonical membership 全局 apply repository，但仍不提供 CLI、路由、worker，不自动运行 migration，也不写 main。Public command 继续走 exact-key parser；原始 operator manifest 只在首次 apply 时由 repository 自己执行有长度上限、拒绝解码后重复 key 的解析，并与 reviewed manifest hash 精确比较。每次首次 apply 都在一个 attested SERIALIZABLE transaction 内按 run、workspace、plan、与正常报名完全相同的 event/actor advisory key、Event Core、configuration head/current configuration、membership head、profile head 的固定顺序加锁；锁后重新读取 source、重建完整 plan，并精确核对 eligibility、plan/manifest hash、valid/invalid count。所有 event ledger facts 与 result hash 都只包含迁移算法、review hash、count、event ID、迁移前 authority 与去身份化 event/deadline hash，不包含时间或个人数据；run/event ledger 先写入同一事务，随后只有 legacy `activate` event 调用共享 executor core，canonical `verify_canonical` 只验证且不写，任何中途错误都会把所有 ledger、membership/profile version、event state 与 activation audit 一起回滚。

相同 run 的 replay 在 raw manifest、current source、planner 与 activation 之前读取全部 immutable event ledger，重新校验 authority/deadline pair、count sum 与 result hash；审核参数不一致返回固定 replay mismatch，ledger 缺失或内部不一致 fail closed，不会退回首次 apply。不同 run 的相同 migration/plan 被唯一 plan gate 拒绝。`40001`、`40P01` 以及仅限 run-ledger insert 的并发唯一冲突会以全新 connection transaction/snapshot 最多重建三次；domain、manifest、plan、readiness 与其他数据库错误不重试。v12 readiness 精确核对当前 schema 内的 migration name/checksum 与两张 ledger 表，未来即使存在更高版本也不能用 `max(version)` 代替该证据。真实临时 PostgreSQL 验收覆盖 configuration/manifest deadline、canonical verify、零报名、RSVP/cancel/reactivate、AI adaptive response、并发 replay、serialization/deadlock retry、故障全回滚、ledger 独立重算及 legacy projection/canonical domain 不变；main 继续只读保持 v11，等待 operator CLI 与 17 个明确 deadline 证据后才允许执行。

Phase 2-B2B2a4c 增加唯一显式的 canonical membership operator CLI；仍不提供路由、worker 或定时任务，也不自动升级或写入 main。`--dry-run` 只接受 workspace 与安全读取的 manifest 文件，在 REPEATABLE READ snapshot 内生成完整、去身份化、可保存的 v1 review envelope；它绑定 migration/schema/workspace、manifest/plan/diagnostic hash、全局与逐 event registration counts、authority/action/deadline source、blocker codes 和 domain-separated aggregate hash，不包含 actor、participant、画像、答案、原始 manifest、连接串或文件路径。`--apply` 只接受同一 manifest、完整 review 文件与 operator run ID；review 与 manifest 必须 exact-key、无重复 JSON key、内部计数一致、apply eligible 且 invalid 为零，随后只把 reviewed facts 交给全局 SERIALIZABLE repository，由 repository 锁后重读并拒绝任何 drift。

两个 operator 共用一个 reviewed-file reader：regular file、`O_NOFOLLOW`、bigint inode/size/mtime/ctime、64 KiB、双读 byte-for-byte 一致和 fatal UTF-8；profile repair 保留原 public compatibility wrapper。CLI 不接受 inline JSON、stdin、连接串参数、重复/未知/`--x=y` 选项；数据库与 workspace 仅来自显式环境配置且 workspace 必须与 argv/review 相同。stdout/stderr 都是单行脱敏 JSON，稳定退出码区分 blocker、命令/配置、证据文件、v12 readiness、drift/replay/activation、retry exhausted 与内部失败。main 仍保持 v11；只有 dry-run 可以只读盘点，apply 固定 fail closed。

Phase 2-B2B2a5a 只增加 event access v13 foundation，不提供 authorization repository、writer、API、route guard 或 UI，也不自动迁移 main。Owner 继续只从 Event Core `organizer_actor_id` 派生，绝不写入 delegated assignment；普通角色只有 `operations`、`check_in`、`reviewer`、`read_only_analyst`。每个 event/subject 的 assignment version 永久 append-only，current head 只能以 assignment version/revision 同时加一的方式单调推进，role/state 必须通过复合 FK 精确指向对应 version；version 的 UPDATE/DELETE/TRUNCATE 和 head 的回退、DELETE/TRUNCATE 全部以 SQLSTATE 55000 拒绝。两个 head 索引分别服务 actor 活动中心与 event 授权查询。

纯 capability policy 默认拒绝未知、撤销或畸形事实。Owner 拥有角色管理、专用 owner transfer、敏感运营、完整名单/导出、签到、审核、生成和聚合分析；运营不具备角色/owner transfer/报名审核；签到人员只能读取有限签到名单并写签到；审核员只能读取和决定 admission；只读分析员只能查看聚合分析。foundation 不读取参会者/profile/contact，也不把 workspace 全局角色映射为 event 权限。临时 PostgreSQL 验收 v1→v13 幂等迁移、FK/check/index、version immutability、head 单调推进及失败事务回滚；main 只读保持 v11 且两张 role table 不存在。

每个 target 只追加 profile version、原样复制当前 response rows、追加指向新 profile 的 membership version并以 optimistic revision 推进两个 head；报名状态、注册/取消/重启时间、late、origin、admission application、response payload/answeredAt/createdAt 均保持不变，repair DB timestamp 只用于新 version 与投递事实。24 个 target、24 个 redacted audit/outbox、24 个 ledger item 与一个 run 在同一事务提交；任一写阶段失败全部回滚。相同 repair ID 精确重放直接返回原 result，即使 heads 后续已变化；同 ID 事实不符或同 plan 换 ID 均 fail closed。真实临时 PostgreSQL 测试从两个 canonical event 的 24-target 多样 fixture 克隆事实，验证完整 apply/replay、错误 count、同 plan 不同 ID、中途 trigger 注入回滚，以及 legacy `orbit_records` byte-for-byte 不变。

## Mock 行为

Mock 使用本地活动 fixture，不访问真实日历、会议平台、联系人库、消息系统或通知服务。want-to-connect 只记录本地意图，post-event review 只生成复核候选。

## Live 替换方案

第一阶段 live 只指 Events Live Store：`event-crud-import` 可以通过 live service 读取 Orbit 自有活动、读取详情、手动创建活动。后续 live data links 会按 `attendee-roster`、`goal-readiness`、`encounter-note`、`want-connect`、`post-event-review` 的顺序补齐。缺少 live store provider 配置时必须返回受控失败，不能退回 mock/hybrid。

Calendar Provider Import 是后续独立集成。它可以接日历、活动平台、badge 扫描、会议系统或现场记录工具，但必须先通过单独设计处理 OAuth、权限、去重、后台同步和 provider payload 映射。活动后写入联系人前仍必须经过 Acquisition/Contacts 的确认流程。

## API 与页面使用

产品入口包括 `/app/events` 和 `/app/events/[id]`。API 包括 events、attendees、goal、readiness、matches、encounters、want-to-connect 和 post-event review。页面应按活动前准备、现场动作、活动后复核组织信息。

## 测试要求

- event import 测试确认 no live calendar/database write。
- attendee roster 测试确认已知联系人和推荐池稳定。
- want-connect 测试确认没有消息发送。
- post-event review 测试确认候选联系人仍需确认。
- 页面测试覆盖列表页和详情页的 empty/pending/failure。

## 团队协作规则

Events 团队维护活动上下文，不直接实现联系人导入和消息发送。参会者转联系人走 Acquisition；跟进任务走 Followups；开场白推荐可调用 Recommendations。
