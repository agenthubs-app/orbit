# Sprint 0128 执行报告：报名问题只生成一次

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0128-registration-question-cache`，基线 `1ad360ebf`，开工提交 `bcf74fcec`。唯一的功能提交是 `109074615`，没有推送。

## 1. 结论

**状态：completed。**

- 活动没有发布问题集时，同一场活动、同一种语言只调用一次模型。结果存进新表，之后所有账号、所有服务器实例都读这一份。
- 本地 3100 上，两个新账号共读了 10 次报名页（6 次顺序读、4 次并发读），**只有 1 次 DeepSeek 调用**。10 次拿到的是同一套问题（同一个 hash）。
- 活动的标题、介绍、关系背景或地点变了，才会生成新的一份。这四项是模型实际读到的内容。改其他字段（比如准备事项）不会重新生成。
- 主办方发布问题集后，一律用已发布的，不再调模型。
- 提交时带上页面给的问题集 hash：
  - 这场活动生成过的任何一代都接受，所以活动改了内容之后，已经打开旧表单的人仍能提交。
  - 这场活动从没出现过的 hash 返回 409「问题变了」。
  - 用生成问题打开的表单，在主办方发布问题集后提交，也返回 409，因为问题确实换了。
- 模型失败不缓存。退避从 60 秒起，每次翻倍，最长 1 小时。退避期间显示固定的默认问题，失败会写日志。
- `portraitProofs=true` 的路径不受影响（网页和 App 目前的报名界面都走这条路径）：仍是固定问题，不读写缓存。
- 付费调用 **1 次**（上限 1 次）。其余测试都用计数桩。

## 2. 验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 连读 N 次只调用 1 次；换语言再 1 次 | 通过 | 真库测试：两个账号读中文 7 次调用 1 次，读英文 3 次再调用 1 次；另一场内容相同的活动单独生成 |
| 02 10 个并发读只调用 1 次、问题相同 | 通过 | 真库测试：10 个读者分布在两个独立连接池（相当于两台服务器），调用 1 次，10 个 hash 相同，只有 1 个响应标记为「本次调用了模型」 |
| 03 内容变化、发布问题集、旧表单提交 | 通过 | 真库测试：无关字段不触发生成；内容变化后生成第二份，旧行保留；旧 hash 提交 200，伪造 hash 提交 409 且不写库；用真实的 experience 服务存草稿并发布后，读到已发布的问题且不调模型，旧的生成 hash 提交 409，已发布 hash 提交 200 |
| 04 失败不缓存、退避、显示默认问题 | 通过 | 真库测试：失败后 4 次重读都不调模型，返回默认问题且不带 hash；表里是 `failed`、没有问题数据、`last_error_code` 已记录、日志有记录；退避到期后重试一次，间隔翻倍（第一次 ≥30 秒，第二次约为两倍）；模型返回不合格式的内容也算失败；恢复后正常缓存 |
| 05 运行时、全量、typecheck、lint、棘轮 | 通过（有一项需知悉，见第 6 节） | 第 5、6 节 |

**先 RED 后 GREEN**：把 `route-handlers.ts` 换回 HEAD 版本（没用 stash）跑新测试文件，9 条里失败 8 条。实际调用次数分别是 7/10/2/5 次，期望都是 1 次；伪造 hash 在旧代码下返回 200，期望 409。唯一通过的是画像路径那条，它本来就是防回归的测试。换回新代码后 9/9 通过。日志在 `commands/red-question-cache.txt`、`red-question-cache-2.txt`、`green-question-cache.txt`。

模型桩放在 DeepSeek 的 HTTP 边界上：测试里的请求走真实的路由处理函数、真实的 DeepSeek 客户端和真实的 Postgres，只有 `api.deepseek.com` 由测试进程内的桩应答并计数。所以 RED 数到的就是旧代码真实会发出的付费请求数。

## 3. 设计选择

**存放位置：活动专用表，不用万能表。** 新表 `event_ops_registration_question_cache` 作为 event-experience 迁移的 v2。理由：
- 这是平台数据，范围是一场活动，不属于任何用户；万能表 `orbit_records` 是按用户归属的记录。
- 已发布的问题集也在 experience 这组表里，两者是「已发布优先、否则用生成的」的关系，放在一起最自然。
- 有到 `event_ops_events` 的外键，活动删除时这些行跟着删除。
- 单次生成依赖唯一约束，专用表可以直接用主键 `(workspace_id, event_id, language, content_digest)` 实现。
- experience 迁移已经被 event-operations worker、`migrate-web-runtime.ts` 和 `npm run event-experience:migrate` 三个入口调用，不用新增上线步骤。
- 归属写在迁移注释和 `features/events/experience/README.md` 里：按活动划分的平台数据，不属于任何用户。

**棘轮和离线清单**：
- 只按主键读单行，没有 `listRecords`，读取量棘轮文件没有改。
- 没有新接口，App 的离线清单里 `/api/events/:id/registration` 本来就在 `registrations` 下，所以没改。

**单次生成的做法：先占位再填充，没用 advisory lock。**
- 读者先插入一行 `generating`。以下情况可以接手：没有这一行、行是 `failed` 且退避已到期、行是 `generating` 但 45 秒租约已过期。
- 占到位的读者在事务外调用模型，然后只在自己仍持有占位时写入结果。
- 其他读者轮询这一行，间隔从 100ms 递增到 1 秒，最多等 25 秒；超时就返回默认问题，不会自己去调模型。
- 不用 advisory lock，是为了不在模型调用的 20 秒里一直占着数据库连接和事务（连接池上限只有 8），也避开了 0123 遇到的锁键在库内全局冲突的问题。
- 测试里每条用例用独立的 schema 和 workspace。

**摘要**：sha256，内容是生成器版本号、语言，以及标题、介绍、关系背景、地点。改提示词时调高 `GENERATOR_VERSION`，旧的缓存就不会再被复用。

**没有缓存时的兜底**：
- 路由处理函数没拿到缓存，或者缓存报错（比如先部署代码、后执行迁移时表还不存在），就返回固定问题，**不调模型**。
- 日志会写 `registration_question_cache_unavailable` 和 pg 错误码。
- 生产环境由 `route.ts` 显式传入配置好的运行时。

**有意不做的事**：生成问题集的 hash 只用于提交校验，不写进报名记录。报名记录里的 `questionSetHash` 仍然只存已发布问题集的 hash，画像和 event-ops 快照都按「已发布」理解这个字段，不改它的含义。

## 4. 文件

- `repos/orbits/features/events/registration/question-cache.ts`（新）
- `repos/orbits/features/events/experience/storage/migrations.ts`（v2 建表和唯一索引）
- `repos/orbits/app/api/events/[id]/registration/route-handlers.ts`、`route.ts`
- `repos/orbits/features/events/experience/README.md`

**新增测试**：`tests/services/registration-question-cache-postgres.test.ts`，共 9 条：
- SC-01 重复读（含换语言，以及不同活动之间的隔离）
- SC-02 两个实例 10 个并发读
- SC-03 内容变化、旧表单提交、伪造 hash 被拒且不写库
- SC-03 真实发布问题集后改用已发布的
- SC-04 失败、退避翻倍、格式不合、恢复
- 画像路径不调模型、不写缓存
- 租约过期后被接手（模拟实例崩溃）
- 没有缓存时绝不调用模型（这条不需要数据库）

**改动的旧测试**：
- `event-experience-migrations.test.ts`：迁移记录数改成等于迁移条数，并断言新表存在。
- `web-runtime-migration.test.ts`：必须存在的表里加上新表。

## 5. 提交与运行时证据

**提交**：`109074615` fix(events): generate registration questions once per event and language (0128)

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0128/run-01/`

- **环境**：`node scripts/local-stack.mjs start --build`，库是本机 `orbit_events`。worker 启动时自动执行了 experience v2 迁移。
- **QA 数据**：用 SQL 复制 `event_signup_02` 的活动行和配置，建了 `event_qa_0128`（开始时间 2026-10-10），没有发布问题集。两个新 QA 账号通过 `/api/auth/register` 和 `/api/auth/mobile/credentials` 登录。
- **读取结果**（`api/runtime-reads.json`）：
  - 10 次读取都是 200，`allowedActions=["register"]`。
  - 第一次 3286ms，`aiProviderRequested=true`，模型 deepseek-v4-flash。
  - 之后 9 次每次 10–30ms，`aiProviderRequested=false`。
  - 10 次的 hash 相同（`a06acb75c3a9…`），第一题的题目也相同。
  - A 带这个 hash 提交返回 200（rsvped）；B 带伪造的 hash 提交返回 409 CONFLICT。
- **账本对照**（`commands/runtime-ledger.txt`）：
  - 3100 日志里 `registration_questions_generated` 只有 **1 行**，失败或缓存不可用的日志 0 行。
  - 缓存表只有 1 行：zh、ready、`attempt_count=1`、deepseek。
  - 请求小票：`GET /api/events/[id]/registration` 两个账号各 5 张，状态码都是 200；POST 各 1 张（200 和 409）。
- **付费调用**：1 / 1。

**清理**（`commands/cleanup.txt`）：
- 在一个事务里删掉了 QA 活动的各表数据、缓存行、两个账号的 7 条记录、本次产生的小票。
- `event_ops_canonical_membership_migration_events` 有不可改的触发器，那一行 QA 数据是我自己插入的，所以只对这一行用 `session_replication_role=replica` 绕过删除。
- 与开工前对比，66 张表里只有两处不同：
  - `event_ops_experience_schema_migrations` 从 1 变成 2：这是 v2 迁移本身，有意保留；新表是空的。
  - `orbit_read_receipts` 多 11 条：都是你的 3000 上演示账号的 `/api/inbox/summary`，不是 QA 数据，我没有动。
- 3100 和两个 worker 已按 PID 停止，3000 没碰过。`repos/orbits/next-env.d.ts` 是构建生成的改动，没有提交。

## 6. 测试、typecheck、棘轮、GitNexus

- **orbits 全量**：5197 条，4734 通过，**0 失败**，462 跳过。
- **App 全量**：3690/3690。
- **typecheck 和 lint**：orbits `typecheck`、`typecheck:app`、`lint`，App `typecheck`，全部 0 错误。
- **Postgres 测试**：
  - 用 `orbit_test` 跑了 12 个文件，其中 11 个全部通过：本 Sprint 的新文件、experience 迁移冒烟、生命周期 4 个、首页事实、联系人卡片、主人边界 2 个、同步锁。
  - `contact-search-pagination` 在 `orbit_test` 上失败 23 条，原因是它要求 `orbit_cutover_test_20260917` 库。
  - **需要你知悉**：把它指向 `orbit_cutover_test_20260917` 单独跑，结果是 30 条里 7 条失败。失败的是结果不一致和「unknown Unicode tuple」这类，跟 Node/ICU 运行时有关，当前是 Node 25.8.1。本 Sprint 没有改 `features/contacts` 或 `shared`，它的依赖里也没有我改过的文件，所以不是本 Sprint 引起的。但我没在基线上用同一条命令跑过对照。
- **棘轮**：`tests/audits` 和 `read-cost-baseline.json` 都没有变化，新代码里没有 unbounded 读取。
- **GitNexus**：
  - `createEventRegistrationRouteHandlers`、`EVENT_EXPERIENCE_MIGRATIONS`、`runEventExperienceMigrations` 都是 LOW。
  - `generateEventRegistrationQuestions` 有同名符号，工具返回 ambiguous，但我没有修改它，只是调用它。
  - 以 `bcf74fcec` 为基准的 compare 结果是 medium：影响 2 个流程，都是 registration 的 GET。

## 7. 生产步骤

1. **先迁移，再部署。** 对生产的活动库执行下面两条中的任意一条，都幂等，有校验和记录：
   - `ORBIT_DATABASE_TARGET=cloud npm run event-experience:migrate`
   - `ORBIT_DATABASE_TARGET=cloud npx tsx scripts/migrate-web-runtime.ts`

   event-operations worker 启动时也会自动执行。只新建一张空表和一个部分唯一索引，不改旧表。
2. 部署。
3. 如果先部署、后迁移：迁移完成前报名页返回固定问题，**不会产生付费调用**；日志会出现 `registration_question_cache_unavailable`，错误码 42P01。
4. 上线后，每场没有发布问题集的活动，每种语言在第一次被读取时生成一次。

## 8. 需要你知道的事

1. 本机 `orbit_events` 已经执行了 experience v2 迁移，留下一张空表。0128 合并后这张表本来就需要，所以没有回滚。
2. 发布问题集以前打开、用生成问题填写的表单，在发布之后提交会返回 409。这是问题确实换了，我认为是正确的处理；如果你希望这种情况也接受，需要改规则。
3. 返回的问题集里，`provenance.aiProviderRequested` 现在表示「这一次请求有没有调用模型」。缓存命中时它是 false，不再表示「这份问题当初是模型生成的」。生成方式仍然看 `generationMethod`。
## 9. 协调者复核

协调者在 `109074615` 上独立复核：

- **orbits 全量**：5197 条，4734 通过，0 失败，462 跳过。
- **App 全量**：3690/3690 通过。
- **Postgres 测试**（`orbit_test`）：新文件 `registration-question-cache-postgres`，加上 experience 迁移和 web-runtime 迁移两个文件，共 12 条，11 通过，0 失败，1 跳过。跳过的是不需要数据库的那条，改在默认全量里跑。
- **代码审查**（`question-cache.ts`）：
  - 占位用唯一键加 `on conflict … where`，只允许接手两种行：已到退避时间的 failed 行，和租约已过期的 generating 行。
  - 填充和失败都要求 `claim_token` 匹配，租约被别人接手后，旧的持有者写不进去。
  - 退避为 `least(base·2^(n-1), max)`。
  - 模型调用在事务之外进行，不占连接。
  - 协调者认可这个设计。
- **第 8 节第 2 条**（发布问题集之后，提交旧的生成问题表单返回 409）：协调者认可，因为问题确实换了。第 8 节第 3 条（`aiProviderRequested` 的含义）已在报告中写明。
- **`contact-search-pagination` 在 cutover 库上的 7 条失败**：0126 已登记为既有问题，与本 Sprint 无关。
- **生产步骤**：已写入 `PRODUCTION_ROLLOUT.md`。
