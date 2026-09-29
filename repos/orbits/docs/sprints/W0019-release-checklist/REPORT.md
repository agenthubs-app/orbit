# Sprint W0019 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - 交付一页可逐条核对的生产上线清单 [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)，含：发布对象；发布门 G1～G6；按时间顺序的上线步骤（每步写明执行者、授权、验证、回退）；24 小时与每周的上线后核对（含 W0021、W0028～W0032 的语句核对）；W0020 需要先刷新的输入；35 条后续候选；待用户处理事项与表外只读查询。
  - 发布门结论：
    - G3（公开目录）已核实通过。
    - G1、G2（运行时白名单）已按 W0034 改为「本机同组合已验证，待 W0020 Preview 日志确认」，不再阻塞。
    - G5（流量）是已知风险，按 D32 先发布、上线后每周检查。
    - **G4（生产缺 10 张计划相关表）和 G6（缺 `ORBIT_GUIDE_DEMO`／`ORBIT_GUIDE_DEMO_SINCE`）是阻塞项**，解法都是需要用户授权的写操作。
  - 大目标 2 收口的本地全量对照：基线 `c61ecbc2` 对 HEAD `d665ca71`，**新增失败 0**，变绿 2 项。工作树 typecheck 和本地生产构建都是 exit 0。
- **仍未实现或未验证：**
  - 生产当前部署的 SHA 拿不到（CLI 直传，`meta={}`）。
  - 生产 Node 的精确 patch、ICU、locale 拿不到（Vercel 构建日志 403）。
  - Neon 本月出站基线拿不到（Free 计划 API 回 0，不可信）。
  - 生产 `orbit_records` 的索引现状和各迁移模块记录的 checksum 没查（表外查询 N7、N8，交协调者）。
  - 当前生产用的是 `vercel.json` 还是 `vercel.staging.json` 没确认（V8）。

## 运行记录

- 结果：completed
- Generator：Opus 5.5／2026-09-30；Planner revision 3（`PLANNER.md` SHA256 `c4fbc378b602cc3f26bbb66962590219f6fa18d6f026b6f0fb503b7e0e889472`）；run-01
- 分支 `sprint/W0019-release-checklist`，从 `chat-agent` `d665ca71` 切出（PLANNER 编制于 `2808ba3e`，其间合并了 W0034）；提交 SHA `4d43f2a1`（清单）；`chat-agent` 合并 SHA：见登记表
- 档位：I（全量对照）+ D（文档）
- 全量对照：`git archive` 分别导出 `c61ecbc2` 与 `d665ca71` 的 `repos/orbits`（`node_modules`、`.env.local` 软链），依次运行；排除 `tests/pages/event-registration-readback.test.tsx`；`ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`；不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`；不 source `.env`。基线 5,627 项／81 失败／278 跳过；HEAD 5,840 项／79 失败／281 跳过；新增失败 0；两份副本已删除。副本比真实工作树多失败（缺根目录文件和兄弟仓库，其中 `full-product-functional-audit` 占 39 项），两边相同，不影响对照
- typecheck：`npx tsc --noEmit -p .` exit 0
- 本地生产构建：`ORBIT_NEXT_DIST_DIR=.next-w0019-build npx next build --webpack` exit 0（5 条 QueueClient region 警告）；构建目录已删除（删除前核对前缀）；`next-env.d.ts` 与开工前逐字相同（`cmp`）；`tsconfig.json` 未变；未动 3001、`.next`、`.next-verify`
- 付费 AI 调用 0；未 push、未部署；本 run 未调用任何云端工具，只读核查用的是协调者预先取回的 `prod-readonly/`
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0019/run-01/`

## 验收结果

| SC | 结果 | 证据（证据目录下） |
| --- | --- | --- |
| SC-W0019-01 发布门 | pass | 清单第 2 节：G1、G2 逐字段对照表；G3 为 N5 计数；G4 为「缺表 → 迁移 → 顺序 → 回退」表；G5 为三本账、合计、出站基线不可得的原因、D32 周检；G6 为键名存在性表。每个「已核实」都引用了 `prod-readonly/` 下的文件和取数时间 |
| SC-W0019-02 上线步骤与上线后核对 | pass | 清单第 1、3、4、5 节：S0～S7 各有执行者、授权、验证、回退；P1～P7；P6-1～P6-12 各有语句特征、预期字节和查法；「W0020 需要先刷新的输入」 |
| SC-W0019-03 本地全量对照 | pass | `full-base.txt`、`full-head.txt`、`fail-base.txt`（81）、`fail-head.txt`（79）、`new-failures.txt`（0 行）、`went-green-or-gone.txt`（2 行：`contact-search-pagination`「known ICU SQL incompatibility falls back once…」、`app-home-facts-followup-reader`「home default uses bounded summary SQL…」）、`tsc.txt`、`build.txt`、`status-before.txt`／`status-after.txt`、`next-env.d.ts.before`、`detect-changes.txt` |
| SC-W0019-04 后续候选 | pass | 清单第 6 节：C1～C27 照录（C27 注明已由 W0034 解决），补 C28～C35；每条都有来源、一句话问题、档位、是否影响流量 |
| SC-W0019-05 只读与只改文档 | pass | 分支 diff 只有本目录下的文件；本 run 云端调用 0 次；`prod-readonly/calls.txt` 写操作 0 次；用户未提交文件未动 |

## 发布门一览

| 门 | 状态 | 要点 |
| --- | --- | --- |
| G1 跟进排序运行时 | 待核实 | PG 侧 6 个字段全部相符（N2、N3）；Node 侧由 W0034 本机复现同组合并入表，待 W0020 在 Preview 日志搜 `sort_runtime_unverified` 确认 |
| G2 联系人搜索运行时 | 待核实 | 同 G1，日志关键字 `contact_search_runtime_unsupported` |
| G3 公开活动目录 | 已核实，通过 | 已发布 9 场，全部 canonical；另有 1 场 draft/legacy，列为观察项 |
| G4 迁移 | **阻塞** | 生产缺 10 张表：`plans`、`plan_items`、`plan_log`、`plan_commands`、`plans_schema_migrations`、`plan_match_jobs`、`plan_match_candidates`、`plan_match_job_contacts`、`plan_matching_schema_migrations`、`plan_maintenance_daily_runs`。部署前需执行 `scripts/migrate-web-runtime.ts`（第 11 张缺表 `relationship_lifecycle_migration_receipts` 不需要）；该脚本还会建 `pg_trgm` 扩展并调整 `orbit_records` 索引 |
| G5 流量总账 | 待核实 | 三本账合计 4,930.83～6,261.83 MB/月，上端超过 5 GB；Neon 本月出站基线不可得；按 D32 先发布、每周检查，按 D34 口径到 3.5 GB 触发 |
| G6 环境变量 | **阻塞** | 生产缺 `ORBIT_GUIDE_DEMO`（建议 `on`）和 `ORBIT_GUIDE_DEMO_SINCE`（建议上线当天的东京日期）；其余缺的键缺省即正确 |

新发现：生产 Vercel 项目名为 `orbit-staging-20260917`，而 `AGENTS.md` 要求 staging 用没有 cron／Queue 的 `vercel.staging.json`，容易用错；生产部署必须用 `vercel.json`（R6、V8）。按语句核对流量目前做不到：`ORBIT_PG_READ_METRICS` 的日志不含 SQL 文本，生产没装 `pg_stat_statements`（C33）。

## 假设与额外阅读

- 额外阅读（全部只读）：W0034 REPORT；W0021、W0028～W0032 REPORT 中的字节实测表；`features/connections/lifecycle/migration-schema.ts`；`shared/storage/postgres-read-metrics.ts`、`features/sync/read-budget-gate.ts`、`features/plans/generator-service-factory.ts`、`shared/storage/live-database-config.ts`；`features/plans/maintenance-daily-gate.ts`；`AGENTS.md` 中与 `vercel.staging.json` 有关的一行。
- 判定：「生产缺表」= 代码里所有 `create table` 的表名（75 张）减去 N4（64 张）；「新引用的环境变量」= `76716076` 与 `d665ca71` 两份源码里 `process.env.*` 键名之差。
- G1、G2 状态按协调者指示用 W0034 结果取代 PLANNER 的 W19-1／W19-6 默认值。
- G6 判「阻塞」：D1 要求 W0008 上线时打开示例开关，而生产没有这两个键。
- 生产与拟发布的差距只能用部署时间推算：以部署前最后一个提交 `76716076` 为参照，约 160 个提交。
- `detect-changes --scope staged`：1 个文件，没有已索引符号落在改动区域（只改文档，预期）。

## 交接

- **给用户**：清单「一览」与「待用户处理」U1～U7。阻塞项的解法：G4 = 授权执行生产迁移（M2）；G6 = 授权设两个开关（S4）。发布路径见 R5、R6。
- **给协调者**：合并后把合并 SHA 填到清单 R2；执行 N7、N8、V8（只读）；U1 完成后补跑 V5、V7；每周一按 P7 记附录 A。
- **给 W0020**：需要重写 PLANNER（清单第 5 节）：staging 库已删除，需用户决定 Preview 用哪个库；Preview 缺 DB 等变量；Vercel 连接器 team 授权；按 W0034 方法在日志里搜 `sort_runtime_unverified`、`contact_search_runtime_unsupported`；需部署才能核实的项目清单。
- **回退**：本 Sprint 只有文档；需要时 `git revert 4d43f2a1`。
