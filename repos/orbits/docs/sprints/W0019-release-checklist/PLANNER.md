# Sprint W0019 — 上线清单与大目标收口

**Plan revision:** 3（2026-09-29）。
- revision 2（2026-09-28）：按 Codex 方案 review，把原「Preview 复验与上线清单」拆成本 Sprint 与 W0020。
- revision 3：并入 W0021～W0033 共 13 个 Sprint 的交接与用户决定 D12～D32。改动：
  - 加入发布门、只读生产核查做法和后续候选汇总；
  - 交付物改为本目录下的 `RELEASE-CHECKLIST.md`；
  - 全量对照改为以大目标 2 开始前为基线。

**模式:** existing-codebase / single-generator。运行状态只在登记表。

**原需求:** RV-04（上线清单部分）。另见 README 用户决定 D1、D8、D12、D20、D25、D27、D32，以及 W0025 的发布门交接。

**单一目标:** 交付两样东西：
- 一页可逐条核对的生产上线清单 `RELEASE-CHECKLIST.md`：发布门、上线步骤、上线后核对、后续候选。每项写明状态、证据和负责人。
- 大目标 2 收口的本地全量对照，外加一次本地生产构建。

生产环境只读，不做任何写操作。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:**
- 编制时 `chat-agent` HEAD 为 `2808ba3e`（W0032 已登记 completed）。
- 全量对照的基线 SHA 是 `c61ecbc2`，理由见「全量对照的基线」。

**进入条件:**
- W0018、W0021～W0033 全部 completed（登记表已满足）。✔
- 本机 PG 测试库 `orbit_test`（`ORBIT_EVENT_DATABASE_URL` → `localhost:5432`）可用，`node scripts/assert-local-test-databases.mjs` 通过。
- 同一工作树上没有其他 Generator 在跑：全量测试与生产构建会争用数据库连接、distDir 和 `next-env.d.ts`。
- 只读生产核查的原始结果已由协调者预先取回，放进证据目录（见「只读生产核查」）。取不到的项不阻止启动，在清单里标「待核实」并写明原因。
- 不需要任何云端写授权，不调用付费 AI，不部署，不 push。

## 全量对照的基线

- 选定 **`c61ecbc2`**（`docs(sprints): plan epic 2 — pre-launch verification (W0016–W0020)`）。
- 理由：
  - 它是大目标 2 第一个合并（W0017 `892c1558`）在 `chat-agent` first-parent 上的直接前驱。
  - 大目标 1 的最后一次合并是 W0012 `639d35ad`，之后到 `c61ecbc2` 之间只有 `efb94751`、`ca4f64b8`、`c61ecbc2` 三个文档提交。已核对：`git diff --name-only 639d35ad c61ecbc2` 全在 `repos/orbits/docs/` 下，代码树与 W0012 合并后相同。
  - 因此 `c61ecbc2` 正好是「大目标 1 做完、大目标 2 还没动代码」的状态。
- HEAD 取开工时的 `chat-agent` HEAD。编制时是 `2808ba3e`；若开工前又有合并，以开工时为准并在 REPORT 登记。

## 上下文包（从这里起步，不通读其他 REPORT）

### 必读文件

| 文件 | 为什么读 |
| --- | --- |
| `docs/sprints/RULES.md` §5.2、§6、§8 | 全量对照做法、证据目录、提交规则 |
| `features/followups/storage/lifecycle-task-pages.ts` 第 121–194 行 | `LIFECYCLE_SORT_RUNTIME_CTE`、`lifecycleSortRuntimeSchema`、`VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES` |
| `features/contacts/storage/contact-list-postgres-reader.ts` 第 1247–1306 行 | `APPROVED_CONTACT_SEARCH_RUNTIME` 与运行时探针 SQL |
| `features/events/core/public-catalogue.ts` 的 `itemsFor`（约第 264–290 行） | 缺参与人数摘要时抛 `missing participant summary`，整个目录不可用 |
| `features/events/event-operations/storage/postgres-repository.ts` 的 `listCatalogueSummaries`（约第 1740 行起） | 只对 `registration_migration_state = 'canonical'` 且已发布的活动出摘要；这是只读计数 SQL 的判定依据 |
| `vercel.json`、`vercel.staging.json` | 生产 cron（`/api/internal/maintenance` 每天 03:00 UTC）和 5 个 Queue 触发器；staging 没有 cron／Queue |
| `shared/config/guide-demo.ts` | `ORBIT_GUIDE_DEMO`、`ORBIT_GUIDE_DEMO_SINCE` 的取值规则（D1、D2） |
| `scripts/migrate-*.ts`（10 个） | 迁移入口，用于列迁移顺序 |
| `features/*/migrations.ts`、`features/*/storage/migrations.ts` | 各迁移建的表 |
| `docs/operations/2026-09-25-neon-egress-audit.md` 第 1 节 | 用户未提交文件，只读。生产部署源码 `02ec26f0`，落后主线；`ORBIT_PG_READ_METRICS` 已设 |
| `bridge/2026-09-24-neon-production-cutover.md`「范围与版本」「配置与验证」 | 用户未提交文件，只读。生产 Vercel 项目、生产 Neon 项目与分支、Preview 没有数据库变量、staging Neon 项目已删除 |
| `docs/operations/postgres-read-metrics.md` | `ORBIT_PG_READ_METRICS` 的日志口径，供上线后核对 |
| `docs/sprints/README.md`「用户决定」「发布动作」 | D1～D32 与已登记的发布动作 |

### 前序交接要点（已由 Planner 从各 REPORT 摘出；Generator 不必再读原 REPORT，引用时写 REPORT 路径即可）

**W0025 发布门**
- 生产 Node `process.versions.node/icu/unicode` 必须精确等于白名单里的某一组。白名单目前只有两组：`25.6.0/78.2/17.0`、`26.10.0/78.3/17.0`。
- PG 元组必须精确等于 `160012 / UTF8 / catalog 153.136 / actual 153.136 / provider i / deterministic true`。
- 不符时的后果：「先联系谁」、`/app/tasks` 跟进分页、首页跟进补位、关系任务分页接口都显示不可用。首页会如实显示「部分数据来源暂时不可用」。
- 要加入新组合，必须先在该组合上跑通两份 PG 差分测试且 0 skip：
  - `tests/services/lifecycle-task-pages-postgres.test.ts`（含 `ORBIT_FOLLOWUP_PAGE_GROWTH=1`）
  - `tests/services/relationship-task-page-postgres.test.ts`
- 联系人搜索的 `APPROVED_CONTACT_SEARCH_RUNTIME` 只认 Node `25.6.0` / ICU `78.2` / Unicode `17.0`，PG 元组与上面相同，列入同一发布门。
- 不符的分页请求在断言前已经读过一次库（观察项）。

**Vercel 运行时事实**
- Vercel Functions 只支持 Node 18–24 的 major。白名单里的两组都不是 Vercel 能选的 major，而且白名单按 patch 精确匹配，Vercel 会自动更新 patch。
- 所以这一门在部署前很可能是**阻塞**。清单必须写明实测到的生产 Node 设置和上述结论，不能写成「待部署后看」。

**W0026 公开目录**
- 任何已发布但 `registration_migration_state` 不是 `canonical` 的活动，都会让整个公开目录抛错。
- 这个错误会被 `loadHomeDashboardSnapshot`、`createPublicGoalRecommendationsService` 吞成「来源暂时不可用」，不留日志。
- 生产在 09-24 迁库时有 10 场 `event_ops_events`（`bridge/…cutover.md`）。

**流量总账**（W0017 口径，1000 人日活 × 30 天，十进制）

| 路径 | 实测 | 上限 | 决定 |
| --- | --- | --- | --- |
| 用户路径 | 1,106.83 MB | ≤1.2 GB | D20、D27（W0029） |
| `/api/account/me` | 2,214 MB（跨实例不去重；单实例 1,751 MB） | ≤2.5 GB | D25（W0031） |
| 登录会话有效性检查 | 1,610–2,941 MB | ≤3.0 GB | D32（W0032） |

- 三项合计约 4.9–6.3 GB，Neon 免费额度是 5 GB/月出站。
- D32 发布门：上线后每周看 Neon 出站，到 3.5 GB 启动下一轮瘦身或升级套餐。下一轮瘦身的方向是收件箱轮询间隔、轮询端点自身的账号解析等。

**上线后 Neon 核对项**（按语句指纹或注释对照返回量）

- W0021：
  - 投影版 `plans` 读取与 `select 1 as found from plan_log`
  - `plan_items` 投影读取
  - `select event_id, title, starts_at from event_ops_events … starts_at >= $2::timestamptz`
  - `bc_ingest_items` 精简列（`?view=cards`）
  - `plan_match_candidates` 精简列
  - 对照项：W0017 的 `select * from bc_ingest_items` 和 `canonicalEventSelect` 全目录读取应明显减少
  - 另盯 `plan_log … order by seq desc limit 50`，它的字节随记录增长
- W0028：
  - `listRegistrationStatusesForUser`（`orbit_records`，带 `issue` 列）
  - `listCanonicalRegistrationStatusesForUser`（带 `valid` 列）
- W0029：
  - `listCanonicalRosterEntries`、`listRegistrationRosterEntries`
  - 100 人以上的活动，流量按人数比例增长
- W0030：账号解析语句（`orbit_records`，只返回 `payload`、`readable`）。19 列的旧语句应只剩账号会话服务一处。
- W0031：会话服务语句（只返回 `payload`、`updated_at`、`evidence_ids`、`readable`）。19 列完整图语句应只剩 `features/guide/progress.ts` 等非 `/api/account/me` 调用方。
- W0032：
  - `auth_users` 读取应只剩带 `/* auth-session-revocation:v1 */` 注释的轻量语句，每条约 145–172 B
  - 整行读取只剩登录时的 `getUserByEmail` 等非检查路径

**发布动作**（README，需用户授权）
- D1：W0008 已上线的前提下，在目标环境设 `ORBIT_GUIDE_DEMO=on`，并设 `ORBIT_GUIDE_DEMO_SINCE`。
- W0003、W0007、W0010 等含迁移的 Sprint：生产库执行迁移。
- W0017：部署前或随部署执行 `scripts/migrate-web-runtime.ts`，建 `plan_maintenance_daily_runs`。不执行时把关放行，省不下流量。

**W0020 的输入已过时**
- W0020 PLANNER 写的 staging Neon `orange-forest-30108072` 已在 2026-09-24 被删除（`bridge/…cutover.md`）。
- Preview 当前没有 `ORBIT_EVENT_DATABASE_URL`。
- W0019 只在交接里登记这一点，不改 W0020 文件。

### 易错边界（都写进 SC）

- **生产只读。** 不部署、不 promote、不迁移、不改 env/flag、不写库、不建 Neon 分支、不取连接串、不解密 env 值。允许用的工具与语句见「只读生产核查」；清单以外的调用一律不做。
- **不虚报「已核实」。** 标「已核实」的项必须引用证据目录里的原始结果文件和取数时间。只能靠部署才能得到的值，标「待核实（需部署，交 W0020）」。按已知事实已经不可能满足的项，标「阻塞」并给出处理选项。
- **只改文档。** 不改产品代码、测试、脚本。W0020 的 GOAL／PLANNER 不改。
- **用户未提交文件不动：** `bridge/`、`docs/designs/Orbit_0918/`、`docs/development/web-2026-09-17/`、`docs/operations/2026-09-25-neon-egress-audit.md`、`next-env.d.ts`。
  - `next-env.d.ts` 当前被 3001 改成指向 `.next-verify`。生产构建若改写它，跑完还原成开工前的内容，不提交。
- **全量对照：**
  - 排除 `tests/pages/event-registration-readback.test.tsx`（会挂起）。
  - 不 source `.env`。
  - 不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，与 W0018、W0025 的对照条件一致。
  - 两份副本**依次**跑，不并行。并行会触发 `too many clients`，W0029 遇到过。

## 只读生产核查

**对象**

| 平台 | 对象 |
| --- | --- |
| Neon 生产 | 项目 `orbit-production-20260924`（`curly-block-17385488`），production 分支 `br-royal-darkness-b3c76ac4`（以 `list_branches` 实际结果为准），库名以 `describe_branch`／`list_postgres_databases` 为准 |
| Vercel | 项目 `orbit-staging-20260917`（`prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`；按 09-24 交接，它承载正式域名 `orbitailink.com`）和 `orbit`（旧生产项目，只确认是否仍有流量或域名） |

**执行方式**
- 优先：协调者在派发 Generator 之前，按下表逐条执行，原始结果存到 `~/orbit-sprint-evidence/web/sprint-W0019/run-01/prod-readonly/`，每条一个文件，文件头写工具名、参数、执行时间。
- Generator 若本身有 Neon／Vercel MCP 工具，可以自己补跑表内的查询，但不得超出下表。
- Generator 发现还需要表外的只读查询时：把查询写进 REPORT 的「待协调者执行」，交回协调者，不自行扩大范围。

**只读 SQL 的规则**
- 只允许 `select`、`show`。
- 每条先由协调者核对原文再执行。
- 不查任何用户内容列：不查 payload、姓名、邮箱，只查计数、版本和元数据。
- 这些查询会唤醒一次 compute，返回字节合计 <20 KB，出站流量可忽略。

**Neon（`run_sql` 只跑下列语句；其余工具只用列出的只读工具）**

| 编号 | 工具／语句 | 用途 |
| --- | --- | --- |
| N1 | `describe_project`、`list_branches` | 确认 production 分支、PG 版本、本月 data transfer 读数（作为上线前出站基线） |
| N2 | `select version(), current_setting('server_version_num') as server_version_num, current_setting('server_encoding') as server_encoding;` | PG 元组 |
| N3 | `select c.collname, c.collprovider, c.collisdeterministic, c.collversion as catalog_collversion, pg_catalog.pg_collation_actual_version(c.oid) as actual_collversion from pg_catalog.pg_collation c where c.oid = 'pg_catalog."und-x-icu"'::pg_catalog.regcollation;` | 排序规则元组，与 `LIFECYCLE_SORT_RUNTIME_CTE` 取法相同 |
| N4 | `select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by 1, 2;` | 表清单，只有名字。与迁移脚本对照，得出哪些迁移在生产还没执行 |
| N5 | `select workspace_id, coalesce(lifecycle_state_v2, 'v1:' \|\| lifecycle_state) as state, registration_migration_state, count(*) from event_ops_events group by 1, 2, 3 order by 1, 2, 3;` | 公开目录发布门：计已发布（`published`，或 v2 为空且 v1 为 `active`）但 `registration_migration_state <> 'canonical'` 的活动数。表或列不存在时，照录报错，本身就是结论（相应迁移未执行） |
| N6 | `select extname, extversion from pg_extension order by 1;` | 有没有 `pg_stat_statements`，决定上线后按语句核对的方式 |

**Vercel（只用读工具；`filter_project_envs` 只看键名、目标环境、类型，不解密）**

| 编号 | 工具 | 用途 |
| --- | --- | --- |
| V1 | `list_teams`、`list_projects` | 定位两个项目 |
| V2 | `get_project`（两个项目） | `nodeVersion` 设置、framework、production branch、git 关联 |
| V3 | `list_project_domains` | 正式域名挂在哪个项目 |
| V4 | `list_deployments`（target=production，最近 5 条）、`get_deployment`（当前 production） | 当前生产部署的 SHA、分支、创建时间，确认生产落后主线多少 |
| V5 | `list_deployment_events`（当前 production 部署的构建日志，只取含 `Node`／`node` 的行） | 构建使用的 Node 版本；有精确 patch 就记下 |
| V6 | `filter_project_envs`（Production、Preview，只取键名） | 下列变量是否存在：`ORBIT_GUIDE_DEMO`、`ORBIT_GUIDE_DEMO_SINCE`、`ORBIT_PG_READ_METRICS`、`ORBIT_READ_BUDGET_*`、`ORBIT_EVENT_DATABASE_URL`、`ORBIT_EXPECTED_DATABASE_HOST`、`ORBIT_WORKSPACE_ID`、`ORBIT_EXPECTED_WORKSPACE_ID`、`ORBIT_DATABASE_TARGET`、cron／内部接口密钥、名片识别模型凭据键名 |
| V7（可选） | `get_runtime_errors`／`get_runtime_logs`（production，最近 7 天，关键词 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`、`missing participant summary`、`contact search`） | 只记条数和首末时间，不抄日志正文。用来判断当前生产是否已经在拒绝这些功能 |

**不做（需要写权限或部署；交 W0020 或新 Sprint，都要用户授权）**
- 部署、promote 或 rollback。
- 跑迁移、改 env/flag。
- 为拿到精确 `process.versions` 在生产或 Preview 加探针。
- 建 Neon 分支来跑 PG 差分测试。
- 取连接串，或解密 env。
- 对正式域名做需要登录的请求。

## 范围与文件

- 读取：上下文包列出的文件，以及 `prod-readonly/` 下的原始结果。另外为了列迁移清单，允许 `git diff --stat <生产 SHA>..HEAD -- scripts/ 'features/**/migrations.ts'` 和 `git log`。
- 新建：
  - `docs/sprints/W0019-release-checklist/RELEASE-CHECKLIST.md`
  - `docs/sprints/W0019-release-checklist/REPORT.md`（由协调者按 Generator 交回的正文落盘）
- 修改：无产品代码、无测试、无脚本。README 登记由协调者做。
- 排除：
  - 修任何问题，含发布门阻塞项。发现的问题只登记为候选或新 Sprint。
  - 改 W0020。
  - 任何云端写操作。

## RELEASE-CHECKLIST.md 的结构（Generator 按此产出）

每一项都用同一种行格式：`编号 | 项目 | 状态（已核实／待核实／阻塞／不适用） | 证据（文件路径或 SHA + 取数时间） | 负责人（用户／协调者） | 下一步`。
- 「用户」指需要用户授权或亲自执行的动作。
- 「协调者」指可以只读完成的核对。

1. **发布对象**：当前生产部署 SHA（V4）；拟发布的 SHA（W19-2）；两者之间的提交数；生产项目与域名的对应关系（V2、V3）。
2. **发布门（部署前必须全部不是「阻塞」）**
   - G1 跟进排序运行时：
     - 逐字段对照表：生产值 → 白名单值 → 是否相符。字段为 Node major 设置、精确 Node、ICU、Unicode，以及 PG 的 `server_version_num`、`server_encoding`、catalog、actual、provider、deterministic。
     - 不符时写后果，并给出处理选项（W19-1）。
   - G2 联系人搜索运行时：同上，对照 `APPROVED_CONTACT_SEARCH_RUNTIME`。
   - G3 公开活动目录：N5 的计数。不是 0 就判阻塞，并给出只读可得的活动 id 数量（不列标题），处理方式交用户授权（在生产激活 canonical 或下线该活动）。
   - G4 迁移：
     - 列出拟发布 SHA 需要、但生产表清单（N4）里缺的表，每张表对应哪个迁移脚本。
     - 给出执行顺序、每步的回退，并指出必须在部署之前执行的迁移（至少 `migrate-web-runtime.ts` → `plan_maintenance_daily_runs`）。
   - G5 流量总账：上面三本账和合计、Neon 本月出站基线（N1），对照 5 GB/月。写明 D32 的判断。
   - G6 环境变量：V6 的存在性表。`ORBIT_GUIDE_DEMO`／`ORBIT_GUIDE_DEMO_SINCE` 的建议取值与理由（D1、D2；SINCE 取上线当天的东京日期）。缺必要变量就判阻塞。
3. **上线步骤**：按时间顺序列出，每步写执行者、需要的授权、验证方法、回退方式：
   - 备份或确认可恢复（Neon 恢复点）
   - 迁移
   - 部署
   - 设开关
   - cron／Queue 是否生效
   - 冒烟检查（只列公开接口 `/api/health`、`/api/events/public`，登录后的冒烟交用户）
4. **上线后核对**：
   - 24 小时内：维护任务每天最多一次（W0017）；收件箱轮询频次；错误日志关键词。
   - 7 天内与每周：
     - D32 周检，写明口径与触发线（W19-4）。
     - W0021、W0028～W0032 的语句核对：每项写语句特征、预期单条返回字节，以及用 N6 可行的方式（`pg_stat_statements`，或 `ORBIT_PG_READ_METRICS` 日志）怎么查。
5. **W0020 需要先刷新的输入**：staging 库已删除；Preview 没有 DB 变量；需部署才能核实的项目清单。
6. **后续候选**：去重后的清单，见下一节。每条写来源 REPORT、一句话问题、建议档位（L/H）、是否影响流量。
7. **本地收口结果**：全量对照与生产构建的摘要，链接到 REPORT。

## 后续候选（不在本次发布范围；Planner 已去重，Generator 核对来源后照录，可补漏但不删）

| # | 候选 | 来源 |
| --- | --- | --- |
| 1 | 目标文字带「（3 个月内）」后缀，计划页标题字面重复 | W0018 观察 |
| 2 | 名片解析完成瞬间，可靠名片先显示「需要核对」再自动导入 | W0018 观察 |
| 3 | 首次进入 iOrbit 时「解析完毕」弹层盖住首页一次 | W0018 观察 |
| 4 | 重新分析没有确认步骤 | W0018 观察 |
| 5 | 计划页进展记录分页／折叠（`plan_log … limit 50` 是剩余大头，满 50 条约 17.6 KB／次） | W0021 交接（需用户决定） |
| 6 | 对话页快捷入口（`iorbit-chat.tsx:127`）、策略页底部药丸仍指向旧入口 | W0022 W22-4 |
| 7 | 社群状态读取失败与「没加入」分不清，会误显示第 4 步提醒 | W0022 |
| 8 | 首页「本周推进」前 3 件是否优先显示新生成的「约 TA」 | W0023、D21 |
| 9 | 跟进分页 `read` 在运行时断言前已查库，不通过仍产生一次读库 | W0025 观察 |
| 10 | 中文目标分词：整句成段，只切标点和空格；≥2 位纯数字也成词 | W0026 观察、D13 |
| 11 | 手机 375 策略页「下一步去哪」活动行被封面和日期块挤成每行 2 字 | W0026 观察 |
| 12 | 公开目录一场坏活动就整体不可用，且异常被吞成「来源暂时不可用」、不留日志 | W0026 观察 |
| 13 | 活动子页面 `events/[id]/operations`、`analytics`、`live`、`center` 仍用会话 id 做权限／身份判定（建议 H） | W0027 观察、W0030 |
| 14 | W28-2 仍读整行的消费者：活动归属 3 处 `listRuntimeEventRegistrationsForUser`、`reconcileEventRegistrationsBatch`、journeys、目标推荐；每人 10 场报名时活动页＋详情页合计约 38.55 MB 超 30 MB | W0028、D19 |
| 15 | 「谁会来」匿名预览卡片未挂载 | W0029 偏差 1、D26 |
| 16 | 运营侧 `currentParticipantsFor`、通知 handler 的 canonical 列表、迁移来源读取仍读整行 | W0029 |
| 17 | 轮询端点自身的账号解析 | W0031、W31-5、D25 |
| 18 | 名片批次轮询的身份与读取 | W0030、W0031 |
| 19 | `features/guide/progress.ts` 的 `configuredAccountCreatedAt` 仍读完整会话图（`/app/agent` 每次 1–2 条） | W0030、W0031 |
| 20 | 下一轮流量瘦身：收件箱轮询间隔；页面文档／RSC 每请求 3 次会话检查（D30 未做请求内去重） | D32、W0032 偏差 1 |
| 21 | 4 个动态路由可能重复编码：`events/[id]/register`、`invitations/[token]`、`o/[slug]`、`contacts/analysis/[dimension]/[bucketId]` | W0033 观察 |
| 22 | 审计基线失败 `tests/audits/unbounded-list-reads.test.ts`（`orbit-agent-chat-session-live-record-provider.ts` 5 > 4） | W0028、W0029、W0030 |
| 23 | `tests/performance/read-cost-baseline.test.ts` 联系人预算超基线 | 2026-09-25 审计 |
| 24 | `tests/pages/event-registration-readback.test.tsx` 挂起 | W0018 起每次全量 |
| 25 | 3001 验收 server 改写 `next-env.d.ts`，让 Codex review 反复误报，每次需还原；`.next-verify` 曾损坏 | W0016、W0023、W0026、W0027、W0031、W0032 |
| 26 | `seed-verify-accounts.ts --reset verify-plan` 会删掉 `guideState.grandfathered`；`verify-session-cookie.ts` 不接受 verify-host | W0032 偏差 3、W0027 偏差 3 |
| 27 | 运行时白名单按 Node patch 精确匹配，与 Vercel 自动升级 patch 冲突（见 W19-1） | 本 Sprint |

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0019-01 发布门 | `RELEASE-CHECKLIST.md` 含 G1～G6，每项都有状态、证据、负责人、下一步。G1／G2 有逐字段对照表；G3 有 N5 计数；G4 有「缺表 → 迁移脚本 → 顺序 → 回退」表；G5 有三本账、合计、Neon 本月出站基线，以及 D32 周检口径。**每个「已核实」都引用 `prod-readonly/` 下的原始文件和取数时间**；没有原始结果的项不得标「已核实」 | 清单文档；`prod-readonly/`；协调者抽查 3 项证据引用与原始文件一致 |
| SC-W0019-02 上线步骤与上线后核对 | 清单含：发布对象（生产当前 SHA、拟发布 SHA、差距）；按时间顺序的上线步骤，每步有执行者、授权、验证、回退；开关建议取值；24 小时／7 天／每周核对项。W0021、W0028～W0032 的语句核对每条都有语句特征、预期字节、查法。另有「W0020 需先刷新的输入」一节 | 清单文档 |
| SC-W0019-03 本地全量对照 | 基线 `c61ecbc2` 与 HEAD 各导出一份 `git archive` 副本（`node_modules`、`.env.local` 软链），相同环境依次跑 `npm test`，排除 `event-registration-readback`。`comm` 对照失败清单，分成三类：① 两边都有的测试里新增的失败；② 只在 HEAD 存在的新测试的失败；③ 变绿项。①② 合计为 0；或每条都有 HEAD 副本上单文件隔离重跑 2 次的结果，通过的判为偶发，不通过的写进清单「阻塞」并登记新 Sprint（不在 W0019 修）。另在真实工作树跑 `npx tsc --noEmit -p .`，以及 `ORBIT_NEXT_DIST_DIR=.next-w0019-build npx next build --webpack`，两者退出码为 0；跑完删除 distDir，`next-env.d.ts` 与开工前逐字相同 | `full-base.txt`、`full-head.txt`、`fail-*.txt`、`new-failures.txt`、隔离重跑记录、`tsc.txt`、`build.txt`；`git status --short` 前后对比 |
| SC-W0019-04 后续候选 | 清单第 6 节包含上表 27 项（Generator 可补漏，不能删）。每项有来源、一句话问题、建议档位、是否影响流量；不写成已排期 | 清单文档 |
| SC-W0019-05 只读与只改文档 | 本 Sprint 分支 diff 只含 `docs/sprints/W0019-release-checklist/` 下的文件。云端调用记录只含「只读生产核查」表内的工具和语句，0 次写工具、0 次解密、0 次部署。用户未提交文件不变 | `git diff --name-only chat-agent...HEAD`；`prod-readonly/calls.txt`（协调者或 Generator 逐条记录）；`git status --short` 前后对比 |

## 一次 Generator 的执行顺序

1. 复核进入条件，记录 PLANNER SHA256、基线 `c61ecbc2`、HEAD、`git status --short`，并保存 `next-env.d.ts` 的开工前内容。确认 `prod-readonly/` 已有协调者取回的结果；缺的项先记下，继续往下做。
2. 建分支 `sprint/W0019-release-checklist`（从 `chat-agent`）。
3. 全量对照（SC-03）：先 `assert-local-test-databases`，再依次跑基线副本和 HEAD 副本，然后 `comm`，需要时隔离重跑。之后在工作树跑 tsc 和生产构建，再还原。全量运行期间写清单草稿。
4. 按「RELEASE-CHECKLIST.md 的结构」写清单（SC-01、02、04）。需要表外只读查询时，写进 REPORT「待协调者执行」，交回协调者。
5. 路径限定提交 `RELEASE-CHECKLIST.md`。纯文档不需要 GitNexus impact。提交前跑 `detect-changes --scope staged`，应为 0 符号。
6. 交回 REPORT 正文（短模板），内容包括：SC 表、全量数字、发布门结论一句话、待协调者执行的查询、交接。由协调者落盘、合并、登记。

## 最小测试与检查

- 档位：**I**（大目标 2 收口的一次全量对照，RULES §1.1「一个大目标全部合并后再跑一次」），其余部分为 D（只写文档）。没有 H 档代码，不做代码 review。
- 已知偶发（出现在「新增」里时先按偶发处理，但仍要隔离重跑 2 次留证）：
  - `PostgreSQL keeps shared appointment details idempotent and accepts only one concurrent version`
  - `read-projection-parity-postgres` 的 statement timeout
  - `event-operations-onsite-concurrency` 的 `too many clients`
- 已知基线失败：
  - `unbounded-list-reads`
  - `read-cost-baseline`（若在清单内）
  - 真实工作树约 28–30 项失败
  - 导出副本因为缺未跟踪文件和兄弟仓库，两边会各多约 34–60 项失败，两边相同，不影响对照
- 不跑：浏览器验收（没有可见变化）、PG 差分测试（生产 PG 元组在本机复现不了）、付费 AI。
- 预算：全量 2 次，加隔离重跑。每次全量超过 90 分钟无输出，就结束挂起的进程并记录。

## 开放问题（附推荐默认；用户未另行决定就按默认执行）

| 编号 | 问题 | 推荐默认 |
| --- | --- | --- |
| W19-1 | 生产 Node 不可能落在白名单上（Vercel 只到 24.x，白名单是 25.6.0、26.10.0，且按 patch 精确匹配）。跟进排序与联系人搜索怎么办？ | W0019 标 G1／G2 为**阻塞**，给用户三个选项：(a) 接受上线后这几个功能显示「暂时不可用」，先发布；(b) 发布前另开 H Sprint（建议 W0034）：运行时检查失败时在服务端日志记下实际元组（只记版本号），并把白名单改为按排序实际依赖的 ICU／Unicode 与 PG 元组判定，在与 Vercel 同 major 的 Node 上本机跑差分测试后加入；(c) 同 (b)，另在 W0020 Preview 部署后从日志读实际元组再补测。推荐 **(b)**，并让 W0020 顺带读日志确认 |
| W19-2 | 发布哪个 SHA，经什么路径发布（生产项目的 production branch 是否仍是 `codex/production-cutover-read-write-20260917`） | 发布 W0019 合并后的 `chat-agent` HEAD。路径以 V2 读到的 production branch 为准，写成用户待决项，不预设 merge 到 `main` |
| W19-3 | G3 不是 0 时怎么处理 | 标阻塞；由用户授权后，对该活动执行 0 人 canonical 激活（与 W0026 `activateCanonicalRegistrations(eventId, [])` 同一路径）或下线该活动。W0019 不执行 |
| W19-4 | D32 周检「到 3.5 GB」的口径 | 当月累计出站 ≥3.5 GB，**或**按当月日均外推到月底 ≥3.5 GB，任一成立就触发。读数来源为 Neon 控制台／`describe_project`，每周一由协调者只读读取，记在清单附录 |
| W19-5 | 是否对本 revision 做 Codex 方案 review | 不做：没有代码改动，SC 可由协调者抽查。W0020 刷新时再一起 review |
| W19-6 | 拿不到精确 `process.versions`（N/V 读不到 patch、ICU）时，G1 写什么 | 写「阻塞（major 已知不在白名单）」，不写「待核实」。精确值留给 W19-1 的方案取得 |

## 失败与交接

- 发布门出现「阻塞」**不算本 Sprint 失败**：清单如实写出阻塞就是交付物。SC-01～05 任一缺证据才算失败。
- 全量对照发现真实回归时：记入清单「阻塞」，登记新 Sprint，W0019 仍可 completed（SC-03 允许逐条说明）。
- 交接给用户：
  - 清单链接（协调者可发布为 Artifact）
  - 阻塞项与待决项：W19-1～4
  - 需要用户授权的动作列表（迁移、部署、开关、G3 处理）
- 交接给 W0020：
  - 刷新 PLANNER。staging 库已删除，Preview 没有 DB 变量；需要用户决定 Preview 用哪个库（新建 Neon Free 项目，或生产库的只读分支），这属于写操作，须授权。
  - 需部署才能核实的项。
  - W19-1 选 (b)／(c) 时，从 Preview 日志读取运行时元组。

## 修订记录

| revision | 日期 | 内容 |
| --- | --- | --- |
| 1 | 2026-09-28 | 初版：Preview 复验与上线清单 |
| 2 | 2026-09-28 | 按 Codex 方案 review 拆出 W0020；本 Sprint 只做上线清单与本地全量对照 |
| 3 | 2026-09-29 | 并入 W0021～W0033 交接与 D12～D32：加入 G1～G6 发布门（W0025 运行时、公开目录、迁移、流量总账与 D32 周检、环境变量）；加入只读生产核查的工具与 SQL 白名单，以及协调者代执行方式；W0021、W0028～W0032 的上线后语句核对；后续候选 27 项；交付物改为本目录 `RELEASE-CHECKLIST.md`；全量基线改为 `c61ecbc2`（大目标 2 开始前）；登记 W0020 输入过时（staging 库已删除）；开放问题 W19-1～6 |
