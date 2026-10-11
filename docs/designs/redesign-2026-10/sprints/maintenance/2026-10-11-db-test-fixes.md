# 2026-10-11 连库测试的旧失败修复

R25 收口时第一次让 orbits 全量测试连本机 Postgres 跑，暴露出 8 条在基线 `3b8f0d20` 上同样失败的旧问题（见 `R25-plan-review-goals-cleanup/REPORT.md`「基线 → 收口」）。本次逐条查根因并修复。

- 测试库：本机全新的 `orbit_test_fixes`（`ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test_fixes`），每轮跑前 `dropdb` + `createdb`，确认不依赖库里的旧数据。没有连 Neon，没有调用付费 AI。
- 日志：`~/orbit-sprint-evidence/maintenance/2026-10-11-db-test-fixes/`（`before-fresh.log` 修复前复现、`after-targeted.log`、`full-orbits-test*.log`、类型检查与 lint 日志）。

## 结论

| # | 失败 | 根因 | 归类 | 线上影响 |
| --- | --- | --- | --- | --- |
| 1–3 | 通知发现 worker 3 条 | 测试直接读写所配库的 public schema，却从不建表；以前只在手动迁移过的开发库上跑过 | 测试准备缺失 | 无 |
| 4–5 | 活动访问 schema 2 条 | 这两条专门检查「所配库的主 schema 已迁移、读操作不改数据」，同样假设库已经手动迁移 | 测试准备缺失 | 无 |
| 6 | 联系人详情 live 路由 1 条 | 配了库时，模块级运行时会去查 `event_ops_relationship_sides`；库没迁移 | 测试准备缺失 | 无 |
| 7 | party live 路由 1 条 | 配了库时，报名运行时会去查 `event_ops_events`；库没迁移 | 测试准备缺失 | 无 |
| 8 | 名片批次 schema 包装 1 条 | 表层：库地址守卫写死了另一台开发机的用户名 `xzhao` 和一组旧库名，任何别的机器都过不了。守卫修好后测试第一次真正跑起来，又暴露出 **两处真实的契约漂移** 和两处测试过时（见下） | 测试环境写死 + **产品 bug** | **App 受影响**（见下） |

修复过程中，在全新空库上还多冒出 2 条同类问题：`agent-preferences-routes` 2 条（偏好服务写所配库的 `orbit_records`，测试没建表；以前在 `orbit_test` 上能过，是因为别的测试或旧数据早就建过表）。已一并修复。

## 1–7（以及 agent-preferences 2 条）：测试没准备库

在库上先跑一次产品自己的迁移 `runOrbitRecordsMigration`（`orbit_records`、关系生命周期、活动运营、关系消息、同步版本号），这 9 条就全部通过，说明产品代码没有问题，问题只在测试假设「库已手动迁移」。

改动：

- 新增 `repos/orbits/tests/support/migrated-configured-database.ts`：`migrateConfiguredTestDatabase()` 对所配的本机库跑一次 `runOrbitRecordsMigration`（就是安装脚本对真实库跑的那一套）。可重复执行；用 advisory lock 防止多个测试文件并行时同时建表冲突；没配库时什么都不做（`scripts/run-node-tests.mjs` 已经拒绝非本机地址）。
- 6 个测试文件在 `before` 里调用它：`notification-discovery-worker-postgres`、`event-access-migrations-postgres`、`event-access-repository-postgres`、`app-contact-detail-live-route-services`、`app-party-live-route-services`、`agent-preferences-routes`。

断言一条没删、没放宽。说明一点：`event-access-repository` 里「主 schema 已切换」这一条原本检查的是**开发者手里那个库**有没有迁移到位；现在由测试先把库迁移好，它检查的是「产品迁移能把一个空库带到 v15 以上、角色表存在，而且读一个不存在的活动不会改动任何数据」。线上库是否已迁移属于上线检查，不该由单元测试检查。

## 8：名片批次 schema 包装

### 8a 库地址守卫写死了另一台机器（测试问题）

`isApprovedBatchSchemaTestUrl` 要求用户名必须是 `xzhao`、主机必须是 `127.0.0.1:5432`、库名必须在一个旧清单里。改为：任何开发者自己的本机专用测试库都可以——回环地址或本机 socket、默认端口、不带密码和连接参数、库名里有独立的 `test` 片段（如 `orbit_test`、`orbit_test_fixes`、`orbit_0137_event_v2_test`）。身份检查不再写死用户名，改为「当前用户就是这个库的所有者」。反例保留并补充：非 test 库、`orbit_testing`、带 `options`、带密码、5433 端口、远程主机、非 postgres 协议都会被拒绝。测试本身仍在随机 schema 里跑、结束时删除。

### 8b 产品 bug：确认接口的响应与 schema 不一致（App 受影响）

守卫修好后测试第一次真正执行，发现服务端返回的内容通不过共享 schema：

| 服务端返回 | 加入时间 | 契约类型 | schema（Web 与 App 各一份，内容相同） |
| --- | --- | --- | --- |
| `state: "created"` 带 `merged` | `c9f465ca`（2026-09-27，合并到已有联系人） | 有 | **没有**（严格对象，多出的键直接判失败） |
| `state: "created"` 带 `metEventId` | `70d038e6`（2026-09-28，在活动认识） | **没有** | **没有** |
| `state: "duplicate_review"` 带 `candidate` | `c9f465ca` | 有 | **没有** |

Web 端直接读 JSON、不过 schema，不受影响。**App 受影响**：`BusinessCardIngestScreen`（`/contacts/new/batch2/[id]`）用 `acceptedIngestReview` → `ingestConfirmationResponseSchema.safeParse` 校验确认结果，校验失败就当作「结果无法确认」：

- 确认一张名片：联系人其实已经建好（服务端已提交），但 App 显示「操作结果无法确认，请刷新后重试。」，随后重新加载才看到已收录。每一张都这样。
- 名片与已有联系人相似（同邮箱 / 同电话 / 同名同公司，但字段不完全一致）：App **永远弹不出重复确认框**，只显示同一句错误；重新加载后名片还是待确认，再点还是一样——这类名片在 App 里无法完成确认（只能去 Web 处理）。

线上是否已经发生：引入这两处的提交在 `chat-agent`、`redesign` 等分支上，`origin/main` 没有。所以只要线上服务端部署的是包含 `c9f465ca` 之后的代码、同时用户在用当前 App 的批量名片复核，就会遇到上面两种情况。本次按约束没有连生产核实部署版本，需要看部署记录确认。

修复（Web `shared/` 与 App `src/api/` 两份同步，内容保持一致）：

- schema：`created` 增加可选的 `merged`（布尔）、`metEventId`（非空字符串或 null）；`duplicate_review` 增加可选的 `candidate`（与契约 `IngestContactCandidateContract` 一致的严格对象，可为 null）。旧的 `businessCardBatchConfirmationResponseSchema`（旧接口）不变，仍拒绝 `candidate`。
- 契约：`IngestConfirmationResponseContract` 的 `created` 补上 `metEventId?: string | null`。
- 结尾的 `transform` 改为逐个写出字段：App 开着 `exactOptionalPropertyTypes`，不能把 `undefined` 当可选字段的值。
- 只加可选字段，旧服务端（不回这些字段）照常通过，属于向后兼容的改动。

测试：

- `tests/api-schema/business-card-batch-schema.test.ts`：`merged` / `metEventId` / `candidate` 的正例与反例（类型不对、空 id、`matchedOn` 非法值、多余键都拒绝）。
- App `tests/business-card-ingest-view-model.test.ts` 新增一条：带这三个字段的确认结果会被 `acceptedIngestReview` 接受，`duplicate_review` 会带着 `candidate` 返回。**换回旧 schema 时这条失败**，换上新 schema 通过。

### 8c 测试过时：产品行为已有意改变

同一条测试里还有两处按旧行为写的步骤，产品是在 `c9f465ca` 里有意改的：

- **最后一张传完自动开始识别**：测试原来把 4 张都传完再「替换第 4 张」，现在 4 张传完批次已经进入识别，替换会版本冲突。改为先传前 3 张（批次仍在收集），替换第 3 张，排除未上传的第 4 张，再手动开始识别。上传、重复上传、替换、排除、开始识别、重复开始识别的响应包装校验全部保留。
- **字段完全一致的名片直接并入已有联系人，不再询问**：测试原来用完全相同的输入期待 `duplicate_review`。改为只换职务（同邮箱、字段不完全一致）来覆盖「相似 → 询问」这条路径，并检查 `candidate` 指向第一张建出来的联系人。「完全一致 → 直接并入」由 `tests/api/business-card-ingest-v2-routes.test.ts`「links identical cards」覆盖。

## 验证

在全新的 `orbit_test_fixes` 上：

- 修复前复现：目标 6 个文件里 8 条全部失败（`before-fresh.log`）。
- orbits 全量 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`：**7041 条，通过 6524，失败 0**，跳过 517（与 R25 相同，都是需要另配其他专用库变量的测试，例如 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`）。日志 `full-orbits-test-2.log`。
- orbits `typecheck` / `typecheck:app` / `lint`：0 / 0 / 0；App `tsc --noEmit`：0。
- App 相关测试（名片批量 view-model、双面名片、schema 与领域同步）：60 条 0 失败。

## 全量结果

第一轮全量（`full-orbits-test.log`，修 agent-preferences 之前）：失败 3 条——agent-preferences 2 条（已修，见上）和 `tests/plans/flow-review-fixes.test.ts` 的 M3 1 条。后者的测试文件和 `features/plans/v2/ai/*` 当时都是计划 v2.2 会话正在改、尚未提交的文件，不属于本次范围，没有碰；第二轮全量里它已经通过。

第二轮全量（全新库）：7041 条，0 失败。GitNexus `detect-changes --scope all`：风险 low，无受影响流程（`detect-changes.log`，含计划会话的未提交改动）。

## 留给后续

- `app/api/agent/preferences/route-handler.ts` 的 PUT 把**所有**异常（包括数据库错误）都返回 400 `AGENT_PREFERENCES_INVALID`，并把原始错误文字（例如「relation "orbit_records" does not exist」）回给客户端。应当只把校验错误映射成 400，其他错误给 5xx 和通用文案。本次没改。
- 依赖所配库 public schema 的测试，今后应调用 `migrateConfiguredTestDatabase()`，不要假设库已迁移；否则在全新库上会因为测试执行顺序而时过时不过。
