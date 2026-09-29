# Sprint W0025 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - 本机验收 server（Node 26.10.0 / ICU 78.3）上，策略页「先联系谁」不再显示「来源暂时不可用」：verify-legacy 没有跟进，显示「当前没有待推进的联系人机会。」；`/app/tasks` 的「人脉跟进」正常显示「当前跟进（0）」；`/api/relationship-tasks/page` 返回 200。桌面 1440、手机 375 各一次，控制台 0 错误（SC-04）。
  - 白名单只含两组经差分测试的组合（`25.6.0/78.2/17.0`、`26.10.0/78.3/17.0`），三个字段完全相等才放行；其他组合（含同 major 不同 patch、ICU／Unicode 不同、无 ICU）仍抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`；PG 元组 schema 未改（SC-02）。
  - 本机组合先作为候选加入，两组 PG 差分测试 7/7 通过、0 skip 后才提交（SC-01）。
  - 首页在跟进来源 `unavailable` 时不再说「今天没有必须处理的事。」，改为「部分数据来源暂时不可用…」；有要事时提示条写「跟进暂时读取不到」；跟进可读且为空时仍是原空态（SC-03）。
- **仍未实现或未验证：**
  - 生产运行时（Vercel Node/ICU/Unicode + Neon PG／排序规则）没有验证，**不能当作生产可用**，见「交接」里的 W0019 发布门。
  - verify-legacy 没有跟进数据，真实页面只验证了「可用且为空」一种；「有列表」由 PG 差分测试与组件测试覆盖。

## 运行记录

- 结果：completed（待协调者合并）
- Generator：Opus 5.5／2026-09-29；Planner revision 2，`PLANNER.md` SHA256 `ab200e6025bb5b1f6ca29a07066c853e977cb16e49b3353fb037dfbf6b7e1bd6`；run-01
- 基线 `chat-agent` `935cfa02`；分支 `sprint/W0025-lifecycle-sort-runtime`
- 功能 SHA：`749a8501`（白名单）、`488dd9d6`（首页 partial）；`chat-agent` 合并 SHA：等待协调者
- 档位 H。全量对照（排除挂起的 `tests/pages/event-registration-readback.test.tsx`；不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`；不 source `.env`）：
  - 功能已提交，且 3001 从工作树热更新，所以没有在工作树回退；改用 `git archive` 导出 `935cfa02` 与 `488dd9d6` 两份副本（`node_modules`、`.env.local` 用软链）对称运行。基线 5681 项／63 失败，HEAD 5685 项／62 失败，**新增失败 0**。
  - **变绿 1 项**（旧基线因运行时不符而失败）：`tests/pages/app-home-facts-followup-reader.test.ts`「home default uses bounded summary SQL while the legacy loader uses the scoped graph query」。
  - 副本比工作树多 34 项失败，原因是副本缺仓库根目录文件和未跟踪文件（如 `repos/orbit-app/app`、`docs/audits/.../inventory.json`），两份副本相同。真实工作树 HEAD 全量：5687 项／28 失败，全部在副本失败清单内，与约 30 的历史基线一致。
- typecheck：`npx tsc --noEmit -p .` exit 0
- 付费 AI 调用 0；未 push、未部署、未改生产库
- REPORT 由协调者按 Generator 交回的正文落盘

## 验收结果

| SC | 结果 | 证据（`~/orbit-sprint-evidence/web/sprint-W0025/run-01/`） |
| --- | --- | --- |
| SC-W0025-01 | pass | `assert-local-dbs.txt`；`pg-diff-before-candidate.txt`（候选加入前 5 项因 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED` 失败）；`pg-diff-with-candidate.txt`（加入后 7/7 pass、0 skip，含 `ORBIT_FOLLOWUP_PAGE_GROWTH=1` 两项增长用例）；`runtime-versions.json`。库 `orbit_neon_audit_20260925`@localhost。`process.versions` node 26.10.0 / icu 78.3 / unicode 17.0；`select version()` = PostgreSQL 16.12 (Homebrew, aarch64-apple-darwin)，`server_version_num` 160012，UTF8；`und-x-icu` provider i、deterministic、`collversion` = actual = 153.136 |
| SC-W0025-02 | pass | `tests/services/lifecycle-sort-runtime.test.ts`（3 项，注入版本号）；`red-sc02.txt` → `green-sc02-sc03.txt` |
| SC-W0025-03 | pass | `tests/pages/app-agent-iorbit-home.test.tsx`「an unavailable follow-up source never reads as an all-clear (SC-W0025-03)」；`red-sc03.txt` → `green-sc02-sc03.txt`（整文件 66 项全过） |
| SC-W0025-04 | pass | `browser-flow.json`、`desktop-1440-{1-strategy,2-home,3-tasks}.png`、`mobile-375-{1-strategy,2-home,3-tasks}.png`（playwright 无头，verify-legacy 会话 cookie，`http://127.0.0.1:3001`）；发布门见「交接」 |
| SC-W0025-05 | pass | `sc05-consumers-with-pg.txt`（六个消费者文件 + SC-02 单测，66/66、0 skip）；`typecheck.txt`；`full-base.txt`、`full-head.txt`、`full-head-worktree.txt`、`fail-*.txt` |

## 假设与额外阅读

- 上下文包之外的阅读：`app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx` 第 120–140 行（策略页文案）；`app/(app)/app/tasks/relationship-lifecycle-tasks-section.tsx`（`/app/tasks` 不可用文案，grep）；`app/api/relationship-tasks/page/handler.ts`（接口参数，grep）；`scripts/verify-server.sh`、`scripts/verify-session-cookie.ts`、`scripts/run-node-tests.mjs`、`scripts/assert-local-test-databases.mjs`（运行方式）。全部只读。
- `assertLifecycleNodeSortRuntime()` 签名与抛错码不变，内部委托新增纯函数 `assertLifecycleNodeSortRuntimeFor(versions)`；白名单常量 `VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES` 冻结导出，三字段严格相等。
- 首页提示条：原逻辑在 snapshot 可用时一律说「关系信号暂时读取不到」，只加跟进条件会误报成信号；所以 snapshot 可用且跟进不可用时改说「跟进暂时读取不到」。其他来源判断与文案不变。
- `lifecycle-task-pages-postgres` 的两项增长用例另受 `ORBIT_FOLLOWUP_PAGE_GROWTH=1` 门控，为达到 0 skip 一并开启。
- `app-home-facts-task-summary-reader.test.ts` 的两项 PG 用例也读 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，SC-05 定向集显式导出后 0 skip。
- GitNexus upstream impact：`assertLifecycleNodeSortRuntime` **CRITICAL**（partial；图谱直接调用方 1，文本搜索确认实际 3 处：`lifecycle-task-pages.ts` 分页 `read`、`lifecycle-home-summary.ts:69`、`connections/lifecycle/task-page.ts:46`）；`IOrbitHome` **CRITICAL**（partial，直接调用方 3）。按共享契约处理，未降级。两次 `detect-changes --scope staged` 均为 low、0 受影响流程、非 partial（`detect-changes-chain1.txt`、`detect-changes-chain2.txt`；`cursorCodec`／`sign` 只因行号位移被列出）。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）：无意见——跟进不可用时如实处理，白名单按完整元组精确匹配、其余 fail-closed | — | 无需修改 |

## 交接

- **给 W0019 的发布门（部署 chat-agent 之前必须完成）：**
  1. 取得目标生产环境的 Vercel Node `process.versions.node / icu / unicode`，以及 Neon PG 的 `server_version_num`、`server_encoding`，和 `pg_catalog."und-x-icu"` 的 `collprovider`、`collisdeterministic`、`collversion`、`pg_collation_actual_version`。
  2. 若 PG 元组不等于 `160012 / UTF8 / 153.136 / 153.136 / i / true`，`lifecycleSortRuntimeSchema` 会拒绝；需另立 Sprint 在该 PG 上跑差分后再决定是否扩展（本 Sprint 未放宽）。
  3. 在该 Node/ICU/Unicode + PG 组合上跑通 `tests/services/lifecycle-task-pages-postgres.test.ts`（含 `ORBIT_FOLLOWUP_PAGE_GROWTH=1`）与 `tests/services/relationship-task-page-postgres.test.ts`，0 skip，之后才把该组合加入 `VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES`。
  4. 未完成就部署：「先联系谁」、`/app/tasks` 跟进分页、首页跟进补位、关系任务分页接口在生产都会显示不可用（首页现在会如实显示「部分数据来源暂时不可用」）。
  5. 联系人搜索 `features/contacts/storage/contact-list-postgres-reader.ts` 的 `APPROVED_CONTACT_SEARCH_RUNTIME` 同样只认 `25.6.0 / 78.2`，列入同一发布门（本机 26.10.0 下联系人搜索也会被拒）。
- **观察项（未处理）：** 联系人搜索单一运行时组合；分页 `read`（`lifecycle-task-pages.ts`、`connections/lifecycle/task-page.ts`）在断言前已查询数据库，不通过时仍产生一次读库流量。
- **接口：** `VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES`、`assertLifecycleNodeSortRuntimeFor(versions)`（`features/followups/storage/lifecycle-task-pages.ts`）；以后加入新组合只改该常量，并附差分证据。
- **回退：** `git revert 488dd9d6 749a8501`（两次提交相互独立）。
