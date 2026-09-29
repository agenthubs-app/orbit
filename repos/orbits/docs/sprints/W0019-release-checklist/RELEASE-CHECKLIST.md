# Orbit Web 生产上线清单（W0019）

编制：W0019 run-01，2026-09-30。依据：[PLANNER.md](PLANNER.md) revision 3、README 用户决定 D1～D35、W0034 交接，以及协调者 2026-09-29 取回的只读生产核查结果。

**怎么读这页：** 每一项都写明状态、证据、负责人和下一步。部署前，第 2 节发布门里的项都不能是「阻塞」。

- 状态：
  - **已核实**：有原始结果文件和取数时间。
  - **待核实**：还缺证据，写明缺什么、由谁补。
  - **阻塞**：按已知事实，不处理就不能部署。
  - **不适用**。
- 负责人：
  - **用户**：需要用户授权或亲自执行。
  - **协调者**：可以只读完成。
- 证据简写：`prod/N1.txt` 指 `~/orbit-sprint-evidence/web/sprint-W0019/run-01/prod-readonly/N1.txt`。Neon 查询的取数时间是 2026-09-29 约 09:40–09:41 UTC，Vercel 查询是约 09:40–09:43 UTC（各文件头有记录）。
- 本清单不含任何密钥值或连接串；环境变量只写键名是否存在。

## 一览

| 发布门 | 状态 | 一句话 |
| --- | --- | --- |
| G1 跟进排序运行时 | 待核实 | 生产组合已由 W0034 在本机复现并入表，不再阻塞；等 W0020 在 Preview 日志里确认实际元组 |
| G2 联系人搜索运行时 | 待核实 | 同 G1 |
| G3 公开活动目录 | 已核实 | 已发布活动 9 个，全部 canonical；「已发布但未激活」为 0 |
| G4 迁移 | **阻塞** | 生产缺计划相关的 10 张表，部署前必须执行 `migrate-web-runtime.ts`。这是生产写操作，需用户授权 |
| G5 流量总账 | 待核实 | 三本账合计 4.93～6.26 GB/月，上端超过 Neon 免费额度 5 GB。按 D32 先发布、上线后每周检查；Neon 本月出站基线读不到 |
| G6 环境变量 | **阻塞** | 生产缺 `ORBIT_GUIDE_DEMO`、`ORBIT_GUIDE_DEMO_SINCE`（D1 要求随 W0008 上线打开）。设置属于写操作，需用户授权 |

---

## 1. 发布对象

| 编号 | 项目 | 状态 | 证据 | 负责人 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| R1 | 当前生产部署 | 已核实（部署 id）；SHA 不可得 | `prod/V4.txt`：`dpl_BKnDTsXdhvQrmM2KUqTnTmRaakUB`，2026-09-26T15:37:54Z，READY，`source=cli`，`meta={}`，无 gitSource | 协调者 | 无法从 Vercel 取得 SHA（CLI 直传）。见 R3 的推算 |
| R2 | 拟发布 SHA | 已确定：`681f56bb`（W0019 合并提交；登记提交在其后只改文档） | D34：发布 W0019 合并后的 `chat-agent` HEAD | 协调者填写，用户确认 | 用户确认后作为发布 SHA |
| R3 | 生产与拟发布的差距 | 待核实（只能推算） | 部署时间 2026-09-27 00:37 JST。此前最后一个提交是 `76716076`（2026-09-26 23:18 JST），它是 `d665ca71` 的祖先。`76716076..d665ca71` 共 160 个提交，first-parent 80 个。2026-09-25 审计记录的旧部署源码 `02ec26f0` 到 `d665ca71` 共 642 个提交 | 协调者 | 按 `76716076` 算，差距至少包括大目标 1 全部（W0001～W0015）和大目标 2 全部（W0016～W0034）。N4 里没有任何计划表，与「生产不含 W0007 之后的代码或未跑其迁移」一致 |
| R4 | 生产项目与域名 | 已核实 | `prod/V3.txt`：`orbitailink.com`、`www.orbitailink.com` 挂在 Vercel 项目 `orbit-staging-20260917`（`prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`）。旧 `orbit` 项目只剩 `orbit-puce-kappa.vercel.app`，最后生产部署是 2026-09-17（`prod/V4.txt`） | 协调者 | `prod/V2.txt` 里旧 `orbit` 项目的 `domains` 字段仍列出 orbitailink.com，与 V3 不一致，以 V3 为准 |
| R5 | 发布路径 | 待核实（用户决定） | `prod/V2.txt`：生产项目没有 git 关联和 production branch 字段，最近 5 次生产部署都是 CLI 直传 | 用户 | 建议：从拟发布 SHA 的干净导出目录用 CLI 部署，附 `--meta gitCommitSha=<SHA>`，让以后能从部署元数据查到 SHA。不预设合并到 `main`（`main` 停在 2026-06-27，落后 `chat-agent` 2,165 个提交） |
| R6 | 部署用哪份 Vercel 配置 | 待核实 | 仓库里 `vercel.json` 有每天 03:00 UTC 的 cron（`/api/internal/maintenance`）和 5 个 Queue 触发器；`vercel.staging.json` 两样都没有。生产项目名带 staging，`AGENTS.md` 又要求 staging 用 `vercel.staging.json`，容易用错。09-24 切流窗口里 `orbit_maintenance_heartbeat` 推进过一次（`bridge/2026-09-24-neon-production-cutover.md`），说明当前生产的维护调度在运行 | 协调者核实，用户部署 | 生产部署必须用 `vercel.json`。部署前按「待协调者执行」V8 读当前生产部署的 cron 与函数触发配置 |

## 2. 发布门（部署前必须全部不是「阻塞」）

### G1 跟进排序运行时 — 待核实（本机同组合已验证，待 W0020 Preview 日志确认）

W0034（合并 `af7da1a8`）已经把生产组合写进跟进白名单 `VERIFIED_LIFECYCLE_SORT_RUNTIMES`（`features/followups/storage/lifecycle-task-pages.ts`）。

- 白名单现在按「Node 侧 ICU、Unicode、默认 locale」加「PG 主版本 16、编码、排序规则元组」判定，**不再卡 Node patch 和 PG 小版本**。
- W0019 PLANNER 写的「白名单只有 25.6.0、26.10.0 两组，Node 24 不可能命中」已被 W0034 取代（D33、D35）。

| 字段 | 生产值 | 白名单（生产对应的两对） | 是否相符 | 证据 |
| --- | --- | --- | --- | --- |
| Node major 设置 | `24.x` | Node 侧不看 major／patch | 不参与判定 | `prod/V2.txt` |
| 精确 Node | 不可得（构建日志 403） | 不看 patch。W0034 验过 24.15.0、24.21.0；同 ICU 下 24.16.0、24.21.0、24.99.0 放行 | 不参与判定 | `prod/V5.txt`；W0034 REPORT |
| ICU | 不可得。按 Node 发行版推断：24.13.1～24.15.x 为 78.2，24.16.0～24.21.0 为 78.3 | `78.2` 或 `78.3` | 按推断相符，待 W0020 确认 | W0034 REPORT 交接 |
| Unicode | 不可得（推断 17.0） | `17.0` | 按推断相符，待确认 | 同上 |
| 默认 locale | 不可得（预期 `en-US`） | `en-US` | 待确认。不是 `en-US` 时会 fail-closed 并记日志 | 同上 |
| PG `server_version_num` | `160015` | 主版本 16 | 相符 | `prod/N2.txt` |
| `server_encoding` | `UTF8` | `UTF8` | 相符 | `prod/N2.txt` |
| catalog collversion | `153.14` | `153.14` | 相符 | `prod/N3.txt` |
| actual collversion | `153.14` | `153.14` | 相符 | `prod/N3.txt` |
| provider | `i` | `i` | 相符 | `prod/N3.txt` |
| deterministic | `true` | `true` | 相符 | `prod/N3.txt` |

- **PG 侧**：6 个字段全部已核实相符。
- **Node 侧**：拿不到精确值。W0034 已在本机复现同组合（Debian bullseye + libicu67 源码编译的 PG 16.15，实测 `160015/UTF8/i/true/153.14/153.14`；Node 24.15.0 与 24.21.0 两个 ICU），跟进差分 10/10、0 skip，全码位探针矩阵通过。证据在 `~/orbit-sprint-evidence/web/sprint-W0034/run-01/`（`pg-diff-node24-icu78{2,3}.txt`、`unicode-probe-node24-icu78{2,3}.txt`、`env/Dockerfile`）。
- **不符时的后果**（fail-closed）：「先联系谁」、`/app/tasks` 跟进分页、首页跟进补位、关系任务分页接口显示不可用。首页如实显示「部分数据来源暂时不可用」。服务端同时记一条只含版本号的 JSON 日志，`event = sort_runtime_unverified`。
- **W0020 怎么确认**（照录 W0034 交接）：
  1. Preview 部署后，在 Vercel 运行时日志里搜 `sort_runtime_unverified`。
  2. 实际打开「先联系谁」、`/app/tasks`、首页。
  3. 没有这条日志、页面都可用，才算确认。
  4. 出现日志就按日志里的元组在本机补测（复现方法见 W0034 `env/Dockerfile`），**不临时放宽白名单**。
- 前提：Vercel 连接器要能读 team `liqys-projects-33c8ddec` 的运行时日志（现在 403，见「待用户处理」U1）。
- **观察项**：PG 16.16 预计 2026-11 发布。届时重看发布说明，有 ICU、排序或 `lower()` 相关修正时，把 PG 侧收紧到已验证的 `server_version_num` 范围（W0034 交接）。

### G2 联系人搜索运行时 — 待核实（本机同组合已验证，待 W0020 Preview 日志确认）

对照的是 `VERIFIED_CONTACT_SEARCH_RUNTIMES`（`features/contacts/storage/contact-list-postgres-reader.ts`）。它取代了已删除的 `APPROVED_CONTACT_SEARCH_RUNTIME`，组合与 G1 相同的四对；PG 键另含 `collation = und-x-icu` 和 `matcher_policy_version = ecmascript-lower-substring-v1`。

| 字段 | 生产值 | 白名单 | 是否相符 | 证据 |
| --- | --- | --- | --- | --- |
| Node major／精确 Node | `24.x`／不可得 | 不看 major／patch | 不参与判定 | `prod/V2.txt`、`prod/V5.txt` |
| ICU／Unicode／locale | 不可得（推断 78.2 或 78.3／17.0／en-US） | `78.2` 或 `78.3`／`17.0`／`en-US` | 按推断相符，待 W0020 确认 | W0034 REPORT |
| PG 主版本、编码 | `160015`、`UTF8` | 16、`UTF8` | 相符 | `prod/N2.txt` |
| collation 与 catalog／actual／provider／deterministic | `und-x-icu`、`153.14`／`153.14`／`i`／`true` | 同左 | 相符 | `prod/N3.txt` |

- W0034 在复现 PG 上跑了联系人差分：25/32 通过，失败的 7 项与基线完全相同，原因是夹具 owner 数据，与运行时无关，协调者 2026-09-30 已接受。另有 95 个大小写差异字符 × 8 个字段 × 页大小 1、2 的路径切换矩阵，4,560 个断言全过。
- **不符时的后果**：联系人关键词搜索显示「暂不支持」，服务端日志 `event = contact_search_runtime_unsupported`。
- **W0020 怎么确认**：在 Preview 日志里搜 `contact_search_runtime_unsupported`，并实际做一次联系人关键词搜索和翻页。
- **发布影响**：上线时联系人搜索的旧游标（含空查询的游标）会失效一次，用户从第一页重新加载。Web 联系人页会显示「分页已失效，请从第一页重新加载。」；`/api/contacts`、`/api/contacts/search`（App 在用）会返回 500，见候选 C28。

### G3 公开活动目录 — 已核实（通过）

| 项目 | 值 | 证据 |
| --- | --- | --- |
| 已发布（`published`）活动 | 9 个，全部 `canonical` | `prod/N5.txt`，2026-09-29 约 09:41 UTC |
| 已发布但 `registration_migration_state <> 'canonical'` | **0** | 同上 |
| 其他 | 1 个 `draft`／`legacy`（workspace `workspace:orbit-small-staging-20260917`） | 同上 |

- 结论：不会触发 `features/events/core/public-catalogue.ts` 的 `missing participant summary`（D34 已确认）。
- **观察项**：那 1 个 draft 活动的报名状态是 `legacy`。如果以后直接发布它而不先激活 canonical，整个公开目录会抛错，而且被吞成「来源暂时不可用」、不留日志（候选 C12）。发布这场活动之前，先对它执行 0 人 canonical 激活（与 W0026 `activateCanonicalRegistrations(eventId, [])` 同一路径），需用户授权。

### G4 迁移 — 阻塞（部署前需用户授权执行生产迁移）

**对照方法**：拟发布代码里所有 `create table` 语句涉及 75 张表，生产现有 64 张（`prod/N4.txt`）。前者减去后者，得到下面 11 张。

| 缺的表 | 建表的迁移 | 入口脚本 | 是否部署前必需 |
| --- | --- | --- | --- |
| `plans_schema_migrations`、`plans`、`plan_items`、`plan_log`、`plan_commands` | `features/plans/migrations.ts` v1（W0007） | `scripts/migrate-web-runtime.ts`（`runPlanMigrations`） | **必需**。计划页、引导第 3 步、首页本周推进、周一小结、重新分析都读这些表 |
| `plan_matching_schema_migrations`、`plan_match_jobs`、`plan_match_candidates` | `features/plans/matching-migrations.ts` v1（W0010） | 同上（`runPlanMatchingMigrations`） | **必需**。名片确认后的人脉需求匹配、「约 TA」 |
| `plan_match_job_contacts` | 同文件 v2 | 同上 | **必需** |
| `plan_maintenance_daily_runs` | 同文件 v3（W0017） | 同上 | **必需**。缺表时维护任务「把关放行」（日志 `ungated: 1`），每天最多一次的限制不生效，省不下流量 |
| `relationship_lifecycle_migration_receipts` | `features/connections/lifecycle/migration-schema.ts` | 无（「只在明确维护时建立，不由应用工厂注册」） | 不需要。不是本次发布引入的，只有人工执行关系生命周期迁移时才建 |

**`migrate-web-runtime.ts` 还会做的事**（都是幂等的 `if not exists`，或带 checksum 守卫；对已有表不改数据）：

1. `runOrbitRecordsMigration`：
   - `orbit_records` 表结构与索引。
   - **`create extension pg_trgm`**（N6 显示生产目前只有 `plpgsql`）。
   - 新建 `orbit_records_search_text_trgm_idx` 等部分索引，删除从未被查询的旧索引 `orbit_records_search_text_idx`。
   - 关系生命周期、event-ops 的迁移。
   - 这些改动来自 2026-09-18 之后的提交（`git diff 02ec26f0..d665ca71 -- shared/storage/migrations.ts`）。生产索引现状没查（N4 只有表名），见 N7。
2. `runEventExperienceMigrations`、`runEventAnalyticsMigrations`、`runAppointmentMigrations`、`runBusinessCardIngestV2Migrations`：自 `02ec26f0` 以来源码未变，预期全部跳过。各自的 checksum 守卫会拒绝与生产记录不一致的版本，部署前可用 N8 预检。
3. `runPlanMigrations`（v1）、`runPlanMatchingMigrations`（v1～v3）：建上表的 10 张表。

**执行顺序与回退**

| 步 | 动作 | 执行者／授权 | 验证 | 回退 |
| --- | --- | --- | --- | --- |
| M0 | 记录恢复点：记下 UTC 时间，确认 Neon 恢复窗口。`history_retention_seconds = 21600`，即 6 小时（`prod/N1.txt`） | 用户（控制台）或协调者（只读） | 恢复时间点在窗口内 | — |
| M1 | 可选：N7、N8 只读预检（索引现状、各 `*_schema_migrations` 的版本与 checksum） | 协调者（只读，需用户同意表外查询） | 各模块已记录版本 ≤ 代码版本，且 checksum 相同 | — |
| M2 | 用拟发布 SHA 的代码，对生产库执行 `scripts/migrate-web-runtime.ts` | **用户授权后由用户或协调者执行（生产写）** | 输出 `Web runtime schemas migrated; no demo data seeded.`；重跑 N4 应多出 10 张计划表（共 74 张）；N6 出现 `pg_trgm` | 全部是新增对象。**首选回退是不回退**：旧代码不读这些表。确需清除时，按 `plan_match_job_contacts`、`plan_match_candidates`、`plan_match_jobs`、`plan_maintenance_daily_runs`、`plan_matching_schema_migrations`、`plan_commands`、`plan_log`、`plan_items`、`plans`、`plans_schema_migrations` 的顺序 `drop table`，同样需授权。索引变更：`drop index orbit_records_search_text_trgm_idx` 后重建旧 `to_tsvector` 索引（旧代码也不查它）。最坏情况用 M0 的恢复点，在 6 小时内做 Neon 时间点恢复 |
| M3 | 部署（见第 3 节 S3） | 用户 | 见 S3 | 见 S3 |

- **必须在部署前执行**：M2，至少包含 `plan_maintenance_daily_runs`（W0017）和计划 5 张表（W0007）。
- 部署后才迁移的代价：计划页和引导第 3 步读表失败；维护任务无闸门运行。
- 迁移本身：返回很少，出站可忽略；会唤醒一次 compute。生产 `orbit_records` 约 262 行，建索引耗时可忽略。

### G5 流量总账 — 待核实（已知风险，按 D32 先发布）

口径：W0017，1000 人日活 × 30 天，十进制 MB／GB，按每条语句返回行的 JSON 字节之和计。

| 本账 | 实测 | 上限 | 决定 | 来源 REPORT |
| --- | --- | --- | --- | --- |
| 用户路径（计划、名片、活动归属、匹配、活动页本人报名、详情页、名单与预览） | 1,106.83 MB | ≤1.2 GB | D20、D27 | `W0029-attendee-roster-trim/REPORT.md`（884 + 10.35 + 18.30 + 25.2 + 50.00 + 118.98） |
| `/api/account/me`（收件箱轮询与页面加载） | 2,214 MB（跨实例不去重；单实例 1,751 MB） | ≤2.5 GB | D25 | `W0031-inbox-identity-polling/REPORT.md` |
| 登录会话有效性检查（`isPasswordSessionCurrent`） | 1,610～2,941 MB | ≤3.0 GB | D32 | `W0032-session-revocation-read/REPORT.md` |
| **合计** | **4,930.83～6,261.83 MB（约 4.9～6.3 GB）** | Neon Free 5 GB/月出站 | D32：先发布，加周检 | — |

- **不在三本账里的**：
  - 后台维护：每天 cron 一次，加 Queue 心跳。
  - App 端（iOS）自己的请求。
  - 公开页和运营侧页面。
  - 迁移与只读核查的一次性读取。
  - 协议开销：W0017 口径是解码后的行 JSON 字节，不是 Neon 计费的线路字节。
  
  所以真实出站可能高于上表。
- **Neon 本月出站基线：不可得。** `describe_project` 与 `list_branches` 的 `data_transfer_bytes` 都返回 0，同一响应里 `compute_time_seconds`、`active_time_seconds` 也是 0，而 `compute_last_active_at` = 2026-09-29T09:37:45Z，说明 compute 确实运行过（`prod/N1.txt`）。判断是 Free 计划下这个 API 不回填本月用量，**不能把 0 当作基线**。Vercel 运行时日志又因 team 权限 403（`prod/V7.txt`），`ORBIT_PG_READ_METRICS` 日志也读不到。
  - 补救：用户在 Neon 控制台看项目 `orbit-production-20260924` 本月的 Network transfer，记到附录 A 作为上线前基线（U4）。
- **D32 周检与触发线（D34 口径）**：见第 4 节 P7。任一成立就启动下一轮瘦身（收件箱轮询间隔、轮询端点自身的账号解析等，见候选 C17、C20）或升级套餐：
  - 当月累计出站 ≥3.5 GB；
  - 或按当月日均外推到月底 ≥3.5 GB。

### G6 环境变量 — 阻塞（缺 D1 开关；设置需用户授权）

生产项目 `orbit-staging-20260917`，只核对键名，未解密（`prod/V6.txt`，2026-09-29 约 09:43 UTC）。

| 键 | Production | Preview | 结论与建议 |
| --- | --- | --- | --- |
| `ORBIT_GUIDE_DEMO` | 无 | 无 | **阻塞**。D1：W0008 上线时一起打开，建议设为 `on`（`shared/config/guide-demo.ts` 只认 `on`／`true`／`1`；缺省即关闭，新用户看不到示例与引导） |
| `ORBIT_GUIDE_DEMO_SINCE` | 无 | 无 | **阻塞**，与上一项一起设。建议设为**上线当天的东京日期** `YYYY-MM-DD`（按东京当天 00:00 解释）。D2：账号创建早于这个日期、且首次判定时已确认联系人 ≥3 的老用户，直接当作完成第 1、2 步，不进示例。不设时判定退化为「已确认联系人 ≥3 即老用户」 |
| `ORBIT_PG_READ_METRICS` | 有 | 有 | 值未核（不解密）。只有 `1`／`true`／`yes` 生效；上线后核对依赖它（第 4 节） |
| `ORBIT_READ_BUDGET_ROWS_PER_MINUTE`／`…_BYTES_PER_MINUTE` | 无 | 无 | 不影响发布：闸门是 opt-in，未设就不生效（`features/sync/read-budget-gate.ts`）。要不要设阈值是另一个决定，不在本次 |
| `ORBIT_EVENT_DATABASE_URL` | 有 | **无** | 生产正常。Preview 缺它是 W0020 的输入问题（第 5 节） |
| `ORBIT_EXPECTED_DATABASE_HOST` | 有 | 无 | 生产正常（09-24 切流后已同步） |
| `ORBIT_WORKSPACE_ID` | 有 | 有 | 正常 |
| `ORBIT_EXPECTED_WORKSPACE_ID` | 有 | 无 | 生产正常 |
| `ORBIT_DATABASE_TARGET` | 无 | 无 | 正常。只有设成 `local` 才改连本机库；生产不应设 |
| `CRON_SECRET` | 有 | 无 | 生产正常 |
| `DEEPSEEK_API_KEY`（名片识别） | 有 | 无 | 生产正常 |
| `ORBIT_PLAN_GENERATOR` | 无 | 无 | 正常。缺省 `mock`（D3：计划生成先不接 AI），生产应保持不设 |
| `AUTH_SECRET` | 有 | 有 | 值未核。游标签名在没有 `ORBIT_READ_CURSOR_SECRET` 时退回 `AUTH_SECRET`，要求 ≥32 字节；现行生产已依赖同一退回，本次没有新增要求 |

- 拟发布代码相对 `76716076` 新引用的环境变量只有 4 个：`ORBIT_GUIDE_DEMO`、`ORBIT_GUIDE_DEMO_SINCE`、`ORBIT_PLAN_GENERATOR`、`ORBIT_NEXT_DIST_DIR`。最后一个只用于本地构建目录，生产不设。
- 旧 `orbit` 项目的 env 列表被工具截断（`prod/V6.txt`）。它已不承载正式域名，不影响本次发布。

## 3. 上线步骤（按时间顺序）

| 步 | 动作 | 执行者 | 需要的授权 | 验证 | 回退 |
| --- | --- | --- | --- | --- | --- |
| S0 | 前置：W0020 在 Preview 完成复验，含 G1／G2 日志确认；Vercel 连接器已重新授权（U1） | 协调者／W0020 | W0020 的部署授权 | W0020 REPORT | — |
| S1 | 记录恢复点（M0）；在 Neon 控制台记下本月出站读数，作为基线（附录 A） | 用户 | 无（只读） | 截图或读数写进附录 A | — |
| S2 | 生产迁移（M1 预检 → M2 执行） | 用户或受托的协调者 | **生产写：迁移** | N4 共 74 张表，N6 有 `pg_trgm` | 见 G4 表 |
| S3 | 部署拟发布 SHA 到 `orbit-staging-20260917` production：用 `vercel.json`（不是 `vercel.staging.json`），附 `--meta gitCommitSha=<SHA>` | 用户 | **部署** | 部署 READY；alias 含 `orbitailink.com`；`get_deployment` 的 meta 里有 SHA；构建日志里的 Node 版本记进附录 A | 在 Vercel 把 production 回滚到 `dpl_BKnDTsXdhvQrmM2KUqTnTmRaakUB`（instant rollback）。迁移不用跟着回退 |
| S4 | 设开关：`ORBIT_GUIDE_DEMO=on`、`ORBIT_GUIDE_DEMO_SINCE=<上线当天东京日期>`（Production），再重新部署一次，让新值生效 | 用户 | **改 env** | `filter_project_envs` 能看到两个键名；新用户进 `/app/agent` 能看到示例，由用户登录验证 | 删除 `ORBIT_GUIDE_DEMO` 或设为 `off`，再重新部署 |
| S5 | cron／Queue 是否生效 | 协调者（只读） | 无 | 部署配置里有 `/api/internal/maintenance`（`0 3 * * *`）和 5 个 Queue topic（V8）。次日 03:00 UTC 之后 `plan_maintenance_daily_runs` 出现当天记录（P2） | 用错配置就用 `vercel.json` 重新部署 |
| S6 | 公开冒烟：`GET https://orbitailink.com/api/health` 返回 `success=true`、`status=ok`、`mode=live`；`GET /api/events/public` 返回 `success=true` 和 9 条公开活动（09-24 基线为 22,755 bytes） | 协调者 | 无（公开接口，不登录） | 两个域名各一次 | 回到 S3 回滚 |
| S7 | 登录后冒烟：iOrbit 首页、「先联系谁」、`/app/tasks`、联系人关键词搜索与翻页、计划页、引导 `/app/start`、名片扫描 | 用户 | 无 | 页面可用；没有「部分数据来源暂时不可用」 | 回到 S3 回滚 |

- S2 必须在 S3 之前。
- S4 可以与 S3 合并：先设 env 再部署，省一次重新部署。

## 4. 上线后核对

### 24 小时内

| 编号 | 项目 | 查法 | 预期 | 负责人 |
| --- | --- | --- | --- | --- |
| P1 | 运行时白名单 | Vercel 运行时日志搜 `sort_runtime_unverified`、`contact_search_runtime_unsupported` | 0 条 | 协调者（需 U1） |
| P2 | 维护任务每天最多一次（W0017） | `select run_day, task_name, status, run_count from plan_maintenance_daily_runs order by 1 desc, 2 limit 20;`（只看计数和状态） | 每个 `run_day × task_name` 一行，`run_count` 小；维护日志里没有 `ungated: 1` | 协调者 |
| P3 | 收件箱轮询频次（W0031） | Vercel 请求日志按 `/api/account/me`、`/api/inbox/*` 计数 | 收件箱打开时每 15 秒最多确认 1 次身份；每 60 秒约 4 次请求（W0031 生产构建实测） | 协调者（需 U1） |
| P4 | 错误日志关键词 | `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`、`missing participant summary`、`CONTACT_CURSOR_INVALID`、`READ_CURSOR_SECRET_MISSING`、`relation "plan` | 除 `CONTACT_CURSOR_INVALID` 在上线当天会因旧游标出现少量外，都是 0 条 | 协调者（需 U1） |
| P5 | 公开目录 | 重跑 N5 | 已发布活动全部 canonical | 协调者 |

### 7 天内与每周

- **P6 查法说明**：`ORBIT_PG_READ_METRICS` 的日志**不含 SQL 文本**，只有查询类型、行数和字节（`docs/operations/postgres-read-metrics.md`），所以按语句核对需要 `pg_stat_statements`。N6 显示生产没装这个扩展。
  - 建议用户授权 `create extension pg_stat_statements`（写操作，只加扩展，不改数据），之后协调者按下表用只读语句核对：`select calls, rows, left(query, 120) from pg_stat_statements where query ilike '%<特征>%'`。
  - 不装时退而求其次：用 `ORBIT_PG_READ_METRICS` 日志，按请求路径汇总每次请求的行数和字节，对照下表「每次请求」一列。这样能区分路径，分不开语句。
  - 两种方式都要先完成 U1。

| 编号 | 来源 | 语句特征 | 预期单次返回 | 对照 |
| --- | --- | --- | --- | --- |
| P6-1 | W0021 | 投影版 `plans` 读取 + `select 1 as found from plan_log` | 计划 GET 整次 4,363 B／6 条语句（改前 7,526 B／9 条） | — |
| P6-2 | W0021 | `plan_items` 投影读取 | 含在 P6-1 内 | — |
| P6-3 | W0021 | `select event_id, title, starts_at from event_ops_events … starts_at >= $2::timestamptz` | 活动归属整次 1,473 B／6 条；行数只随窗口内活动数变化 | W0017 的 `canonicalEventSelect` 全目录读取应明显减少 |
| P6-4 | W0021 | `bc_ingest_items` 精简列（`?view=cards`） | 每个进行中批次 1,198 B／2 条（改前 6,782 B） | `select * from bc_ingest_items` 应明显减少 |
| P6-5 | W0021 | `plan_match_candidates` 精简列 | 待确认 5 条时 1,851 B／3 条 | — |
| P6-6 | W0021 | `plan_log … order by seq desc limit 50` | 随记录增长，满 50 条时计划页一次约 17.6 KB | 剩余大头，见候选 C5 |
| P6-7 | W0028 | `listRegistrationStatusesForUser`（`orbit_records`，带 `issue` 列） | 5 场报名时每次 ≤345 B | 改前 12,760 B |
| P6-8 | W0028 | `listCanonicalRegistrationStatusesForUser`（带 `valid` 列） | 5 场报名时 ≤330 B；详情页单场 66 B | 改前 10,365 B |
| P6-9 | W0029 | `listCanonicalRosterEntries`、`listRegistrationRosterEntries` | 30 人活动：名单 2,500 B，预览 ≤1,983 B；100 人活动：名单 8,380 B，预览 ≤6,044 B，按人数线性增长 | 改前 92,300 B |
| P6-10 | W0030 | 账号解析语句（`orbit_records`，只返回 `payload`、`readable`） | 每次 420 B／3 条（按资料 id 登录时 409 B／2 条）；资料行约 235 B，账号行约 185 B | 19 列旧语句应只剩账号会话服务一处 |
| P6-11 | W0031 | 会话服务语句（只返回 `payload`、`updated_at`、`evidence_ids`、`readable`） | 每次 898 B／2 条（按资料 id 887 B） | 19 列完整图语句应只剩 `features/guide/progress.ts` 等非 `/api/account/me` 调用方 |
| P6-12 | W0032 | `auth_users` 读取，带 `/* auth-session-revocation:v1 */` 注释 | 每条 145～172 B；API 请求 2 条，页面文档和 RSC 请求 3 条 | 整行读取（约 850 B）只剩登录时的 `getUserByEmail` 等非检查路径 |

**P7 D32 周检**（D34 口径）

- 每周一由协调者只读读取 Neon 本月 Network transfer，来源是控制台或 `describe_project`（Free 计划 API 读数为 0 时以控制台为准），记进附录 A。
- 计算：`外推 = 当月累计 ÷ 已过天数 × 当月天数`。
- 当月累计 ≥3.5 GB，**或**外推 ≥3.5 GB，任一成立就交用户决定：启动下一轮瘦身（候选 C17、C20），或升级套餐。

## 5. W0020 需要先刷新的输入

- **库**：W0020 PLANNER 写的 staging Neon `orbit-staging-20260917`／`orange-forest-30108072` 已于 2026-09-24 删除（`bridge/2026-09-24-neon-production-cutover.md`）。**需要用户决定 Preview 用哪个库**，二选一，都是写操作，须授权：
  - 新建一个 Neon Free 项目；
  - 从生产库建一个只读分支。
- **Preview 环境变量**：Preview 没有 `ORBIT_EVENT_DATABASE_URL`、`ORBIT_EXPECTED_DATABASE_HOST`、`ORBIT_EXPECTED_WORKSPACE_ID`、`CRON_SECRET`、`DEEPSEEK_API_KEY`（`prod/V6.txt`）。另外 `vercel.staging.json` 没有 cron 和 Queue，维护调度链路在 Preview 上验证不了。
- **Vercel 连接器**：要重新授权到 team `liqys-projects-33c8ddec`，否则构建日志和运行时日志都是 403（`prod/V1.txt`、`V5.txt`、`V7.txt`）。
- **W0020 PLANNER 需要重写**：上面三点，加上 W0034 的日志确认方法（G1、G2），以及下面的待核实清单。

**需部署才能核实的项**

| 项 | 做法 |
| --- | --- |
| 实际 Node patch、ICU、Unicode、默认 locale | 构建日志，或运行时日志里 G1／G2 的拒绝日志（没有拒绝日志即通过） |
| 迁移后的计划页、引导第 3 步 | 在 Preview 库上跑 `migrate-web-runtime.ts` 后实际打开 |
| 收件箱轮询频次与 `/api/account/me` 的真实单实例去重率 | 请求日志计数 |
| `ORBIT_PG_READ_METRICS` 每路径字节 | 运行时日志 |
| `ORBIT_GUIDE_DEMO=on` 下新老用户分流（D2） | Preview 设开关后用测试账号验证 |

## 6. 后续候选（不在本次发布范围，供用户排序；不代表已排期）

档位：L 局部、H 高风险／共享。「流量」一列指是否影响 Neon 出站。C1～C27 来自 PLANNER，已按来源核对；C28 起是本次补充。

| # | 候选 | 一句话问题 | 来源 | 档位 | 流量 |
| --- | --- | --- | --- | --- | --- |
| C1 | 计划页标题重复 | 目标文字带「（3 个月内）」后缀，标题字面重复 | W0018 观察 | L | 否 |
| C2 | 名片解析完成瞬间闪「需要核对」 | 可靠名片先显示「需要核对」再自动导入 | W0018 观察 | L | 否 |
| C3 | 首次进入 iOrbit 的弹层 | 「解析完毕」弹层盖住首页一次 | W0018 观察 | L | 否 |
| C4 | 重新分析没有确认步骤 | 点了就执行 | W0018 观察 | L | 否 |
| C5 | 进展记录分页／折叠 | `plan_log … limit 50` 是计划页剩余大头，满 50 条约 17.6 KB／次（需用户决定） | W0021 交接 | L | 是 |
| C6 | 旧入口残留 | 对话页快捷入口（`iorbit-chat.tsx:127`）、策略页底部药丸仍指向旧入口 | W0022 W22-4 | L | 否 |
| C7 | 社群状态读取失败被当成「没加入」 | 会误显示第 4 步提醒 | W0022 | L | 否 |
| C8 | 首页「本周推进」排序 | 前 3 件是否优先显示新生成的「约 TA」（D21 先不改） | W0023、D21 | L | 否 |
| C9 | 跟进分页在断言前已查库 | 运行时检查不通过时仍产生一次读库 | W0025 观察、W0034 交接 | L | 是（少量） |
| C10 | 中文目标分词 | 整句成段，只切标点和空格；≥2 位纯数字也成词 | W0026 观察、D13 | L | 否 |
| C11 | 手机 375 策略页活动行 | 「下一步去哪」活动行被封面和日期块挤成每行 2 字 | W0026 观察 | L | 否 |
| C12 | 公开目录一场坏活动就整体不可用 | 异常被吞成「来源暂时不可用」、不留日志（G3 观察项相关） | W0026 观察 | H | 否 |
| C13 | 活动子页面仍用会话 id | `events/[id]/operations`、`analytics`、`live`、`center` 用会话 id 做权限／身份判定 | W0027 观察、W0030 | H | 否 |
| C14 | W28-2 整行消费者 | 活动归属 3 处 `listRuntimeEventRegistrationsForUser`、`reconcileEventRegistrationsBatch`、journeys、目标推荐仍读整行；每人 10 场报名时活动页＋详情页合计约 38.55 MB，超 30 MB | W0028、D19 | H | 是 |
| C15 | 「谁会来」匿名预览卡片未挂载 | D26 先不恢复 | W0029 偏差 1、D26 | L | 是（恢复后增加） |
| C16 | 运营侧整行读取 | `currentParticipantsFor`、通知 handler 的 canonical 列表、迁移来源读取仍读整行 | W0029 | H | 是 |
| C17 | 轮询端点自身的账号解析 | W31-5 未做 | W0031、W31-5、D25 | H | 是 |
| C18 | 名片批次轮询 | 身份与读取未瘦身 | W0030、W0031 | H | 是 |
| C19 | `configuredAccountCreatedAt` 读完整会话图 | `features/guide/progress.ts`，`/app/agent` 每次 1～2 条 | W0030、W0031 | L | 是 |
| C20 | 下一轮流量瘦身 | 收件箱轮询间隔；页面文档／RSC 每请求 3 次会话检查（D30 未做请求内去重） | D32、W0032 偏差 1 | H | 是 |
| C21 | 4 个动态路由可能重复编码 | `events/[id]/register`、`invitations/[token]`、`o/[slug]`、`contacts/analysis/[dimension]/[bucketId]` | W0033 观察 | L | 否 |
| C22 | 审计基线失败 `unbounded-list-reads` | `orbit-agent-chat-session-live-record-provider.ts` 5 > 4 | W0028、W0029、W0030 | L | 是 |
| C23 | `read-cost-baseline` | 联系人预算超基线 | 2026-09-25 审计 | L | 是 |
| C24 | `event-registration-readback.test.tsx` 挂起 | 每次全量都要排除 | W0018 起每次全量 | L | 否 |
| C25 | 3001 验收 server 改写 `next-env.d.ts` | 让 Codex review 反复误报，每次要还原；`.next-verify` 曾损坏 | W0016、W0023、W0026、W0027、W0031、W0032、W0034 | L | 否 |
| C26 | 验收脚本缺陷 | `seed-verify-accounts.ts --reset verify-plan` 会删掉 `guideState.grandfathered`；`verify-session-cookie.ts` 不接受 verify-host | W0032 偏差 3、W0027 偏差 3 | L | 否 |
| C27 | 白名单按 Node patch 精确匹配 | 与 Vercel 自动升级 patch 冲突。**W0034 已解决**：改为按 ICU／Unicode／locale 判定；保留条目供追溯 | W19-1 → W0034 | — | 否 |
| C28 | `/api/contacts`、`/api/contacts/search` 返回 500 | 遇到匹配路径切换的旧游标时，没把 `CONTACT_CURSOR_INVALID` 映射成 400 +「分页已失效」；上线当天 App 会遇到 | W0034 交接① | L（涉及 App 契约） | 否 |
| C29 | 联系人 PG 夹具 owner | `contact:evidence-only` 的 owner 是 shared-owner，与「私有联系人必须本人拥有」不符，导致 7 项联系人 PG 差分基线失败 | W0034 交接②、偏差 1 | L | 否 |
| C30 | 不传 locale 的 `localeCompare` | 其他 `localeCompare` 调用依赖运行时默认 locale | W0034 交接③ | L | 否 |
| C31 | PG 16.16 复核 | 2026-11 发布后重看发布说明，必要时把 PG 侧收紧到已验证的小版本范围 | W0034 交接 | L | 否 |
| C32 | 生产部署不可追溯 | CLI 直传部署没有 git SHA（`meta={}`），无法确认生产跑的是哪版代码；建议发布流程固定带 `--meta gitCommitSha` | 本 Sprint（`prod/V4.txt`） | L | 否 |
| C33 | 按语句核对流量的手段 | `ORBIT_PG_READ_METRICS` 日志不含语句标识，生产也没有 `pg_stat_statements`；需要用户决定装扩展，或给读取指标加上稳定的语句标签 | 本 Sprint（`prod/N6.txt`） | L／H | 是（可观测性） |
| C34 | 生产项目名带 staging | 生产跑在名为 `orbit-staging-20260917` 的项目上，与 `AGENTS.md`「staging 用 `vercel.staging.json`」冲突，易误用无 cron／Queue 的配置；考虑改名或写进部署手册 | 本 Sprint（`prod/V3.txt`、R6） | L | 否 |
| C35 | draft 活动为 legacy | 1 个 draft 活动的报名状态仍是 `legacy`，发布前需先做 canonical 激活，否则触发 C12 | 本 Sprint（`prod/N5.txt`） | L（运营动作） | 否 |

## 7. 本地收口结果（大目标 2）

对照 `c61ecbc2`（大目标 2 开始前）与 `d665ca71`（W0019 开工时的 `chat-agent`）。详情见 [REPORT.md](REPORT.md)。

| 项目 | 基线 `c61ecbc2` | HEAD `d665ca71` |
| --- | --- | --- |
| 全量（`git archive` 副本，依次运行，排除 `event-registration-readback`） | 927 个文件，5,627 项，失败 81，跳过 278 | 946 个文件，5,840 项，失败 79，跳过 281 |
| ① 两边都有的测试里新增的失败 | — | **0** |
| ② 只在 HEAD 存在的新测试的失败 | — | **0** |
| ③ 变绿 | — | 2 项：`contact-search-pagination`「known ICU SQL incompatibility falls back once…」（W0034）、`app-home-facts-followup-reader`「home default uses bounded summary SQL…」（W0025） |
| `npx tsc --noEmit -p .`（工作树） | — | exit 0 |
| `ORBIT_NEXT_DIST_DIR=.next-w0019-build npx next build --webpack`（工作树） | — | exit 0；构建后已删除该目录，`next-env.d.ts` 已还原并逐字比对一致 |

- 结论：**本地没有发现回归，不新增阻塞项。**
- 副本比真实工作树多失败，原因：
  - 副本只导出 `repos/orbits`，缺仓库根目录文件、未跟踪文件和兄弟仓库；其中 `full-product-functional-audit` 一个文件就占 39 项。
  - 两边相同，不影响对照。
- 已知基线失败 `unbounded-list-reads` 两边都在；已知偶发的三项这次都没有出现。

## 待协调者执行的只读查询（表外，需先经用户同意）

| 编号 | 工具／语句 | 用途 |
| --- | --- | --- |
| N7 | `select indexname from pg_indexes where schemaname = 'public' and tablename = 'orbit_records' order by 1;` | 生产 `orbit_records` 索引现状，预估 M2 的索引变更 |
| N8 | `select 'appointment' as m, version, name, checksum from appointment_schema_migrations union all select 'bc_ingest', version, name, checksum from bc_ingest_schema_migrations union all select 'event_analytics', version, name, checksum from event_analytics_schema_migrations union all select 'event_experience', version, name, checksum from event_ops_experience_schema_migrations order by 1, 2;` | 迁移预检：生产记录的版本与 checksum 应与拟发布代码一致，不一致时 M2 会报 checksum mismatch。列名以实际表结构为准，列不存在就照录报错 |
| V8 | `get_deployment`（`dpl_BKnDTsXdhvQrmM2KUqTnTmRaakUB`）里的 crons／functions 配置，或 `get_project` 的 crons 字段 | 确认当前生产用的是 `vercel.json`（R6） |
| V5、V7 重跑 | 与 PLANNER 相同 | U1 完成后补取 Node 版本行和运行时日志条数 |

## 待用户处理

| 编号 | 事项 | 性质 |
| --- | --- | --- |
| U1 | 把 Vercel 连接器重新授权到 team `liqys-projects-33c8ddec`（构建日志、运行时日志、团队级项目列表现在都是 403） | 授权 |
| U2 | 生产迁移（G4 的 M2）；可选再装 `pg_stat_statements`（P6、C33） | 生产写，需授权 |
| U3 | 设 `ORBIT_GUIDE_DEMO=on`、`ORBIT_GUIDE_DEMO_SINCE=<上线当天东京日期>`（G6） | 改 env，需授权 |
| U4 | 在 Neon 控制台读本月 Network transfer，写进附录 A（G5 基线） | 只读，用户亲自看 |
| U5 | 发布路径：从拟发布 SHA 用 CLI 部署并带 `--meta gitCommitSha`；配置用 `vercel.json`（R5、R6） | 决定 + 部署授权 |
| U6 | W0020：决定 Preview 用哪个库（新 Neon Free 项目，或生产只读分支），并授权重写 W0020 PLANNER（第 5 节） | 决定 + 写操作授权 |
| U7 | 同意执行表外只读查询 N7、N8、V8 | 同意 |

## 附录 A：出站读数记录（D32 周检）

| 日期（周一） | 读数来源 | 当月累计 | 已过天数 | 外推到月底 | 是否触发（≥3.5 GB） | 记录人 |
| --- | --- | --- | --- | --- | --- | --- |
| 上线前基线 | Neon 控制台 | 待 U4 | | | | |

## 附录 B：协调者补跑的表外只读查询（2026-09-30）

- **N7**（`prod-readonly/N7.txt`）：生产 `orbit_records` 现有 13 个索引，没有 `orbit_records_search_text_trgm_idx`；与 N6（无 `pg_trgm`）一致。M2 迁移会 `create extension pg_trgm` 并在 `orbit_records` 上建 trgm 索引——这是生产写操作，建索引期间有额外计算与写入，纳入 U2 授权范围。
- **N8**（`prod-readonly/N8.txt`）：appointment v1–v4、bc_ingest v1–v5、event_analytics v1、event_experience v1 的 name 与 checksum 已记录。与拟发布代码的逐项比对需在 M2 前用迁移脚本的 dry-run／本地校验完成（放进 W0020 或迁移 Sprint 的预检步骤）。
- **V8**（`prod-readonly/V8.txt`）：`get_deployment` 不返回 crons／functions 配置，仍无法判断当前生产用的是 `vercel.json` 还是 `vercel.staging.json`；需 U1（team 授权）后从构建日志确认。R6 维持「待核实」。
