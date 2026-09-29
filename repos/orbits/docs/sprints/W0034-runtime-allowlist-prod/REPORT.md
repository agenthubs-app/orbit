# Sprint W0034 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - **生产组合已复现并通过**：生产是 Vercel Node 24.x（ICU 78.3 或 78.2，Unicode 17.0，`en-US`）配 Neon PG 16（UTF8，`und-x-icu` 153.14）。本机在 Debian bullseye 上用 libicu67 从源码编译 PG 16.15，实测 collversion 为 153.14。在复现的 PG 上，跟进和联系人两侧的差分都跑通，全码位探针矩阵逐项通过。**跟进与联系人两侧都已入表**：上线后「先联系谁」、`/app/tasks` 跟进分页、首页跟进补位、关系任务分页接口、联系人搜索不再因运行时检查显示不可用。实际元组待 W0020 在 Preview 日志里确认。
  - **按对放行，不卡小版本**（SC-01）：同一 ICU 下 Node 24.16.0、24.21.0、24.99.0 都放行；PG 16.15、16.16、16.99 都放行。拒绝：ICU 77.1、未测过的 ICU 或 collversion、catalog≠actual、非 ICU、非确定性、非 UTF8、PG 15 或 17、locale 不同、缺字段。
  - **fail-closed、日志与流量**（SC-04）：拒绝时服务端记一条只含版本号的 JSON 日志，字段固定，同一元组每个进程只记一次；日志本身出错也不改变错误码。PG 元组不符时现在抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`（以前抛 zod 错误）。首页在查库前先做 Node 侧预检。查询次数、SQL 文本、返回列都不变。
  - **联系人分页全程只走一条匹配路径**（SC-03）：游标的 scope 摘要带上匹配路径（`unfiltered`、`js` 或 `pg-icu:<组合 id>`）；路径变了，旧游标明确报 `CONTACT_CURSOR_INVALID`，Web 联系人页显示「分页已失效，请从第一页重新加载。」。95 个大小写差异字符 × 8 个字段 × 页大小 1、2 的 PG→JS、JS→PG 切换测试全部通过。
  - **本机 3001 回归**（Node 26.10.0 / PG 16.12 / 153.136）：策略页、`/app/tasks`、联系人关键词搜索和接口翻页都可用；桌面 1440 和手机 375 控制台 0 错误。本机联系人搜索也从「暂不支持」变成可用（本机 ICU 78.3 × 153.136 一并验证并入表）。
- **仍未实现或未验证：**
  - 生产的实际元组只能上线后从日志确认（W0020）。本机复现是高度可信的代理，不是 Neon 的二进制本身。
  - `/api/contacts`、`/api/contacts/search`（App 端在用）遇到路径切换时同样拒绝旧游标，但路由没有把 `CONTACT_CURSOR_INVALID` 映射成专门文案，客户端看到的是 500。改映射属于路由／App 契约，超出本 Sprint 范围。
  - 联系人 PG 差分里有 7 项在基线上就失败，与运行时无关（见「偏差」1）。

## 运行记录

- 结果：completed
- Generator：Opus 5.5／2026-09-29～30；Planner revision 2（`PLANNER.md` SHA256 `a0f0261d419ed322fb09b192e435178b19161a55acc55015079123c6af593190`）；run-01
- 基线 `chat-agent` `164f8ae8`；分支 `sprint/W0034-runtime-allowlist-prod`；功能 SHA `0af468b9`（功能）、`b964c37a`（探针测试改为每次遍历 10 个字符，只改测试）；`chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照（`git archive` 导出 `164f8ae8` 与 `0af468b9` 对称运行，排除 `event-registration-readback`，不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`）：基线 5828 项／48 失败，HEAD 5842 项／47 失败，**新增失败 0**；变绿 1 项 `known ICU SQL incompatibility falls back once…`；跳过 278→281（新增 3 个 PG 用例在全量里按设计跳过）。副本已删除
- typecheck：`npx tsc --noEmit -p .` exit 0
- 付费 AI 调用 0；未 push、未部署；未调用任何云端工具；未碰 Neon
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0034/run-01/`

## 验收结果

| SC | 结果 | 证据（证据目录下） |
| --- | --- | --- |
| SC-W0034-01 | pass | `tests/services/lifecycle-sort-runtime.test.ts`、`tests/services/contact-search-runtime.test.ts`（版本号注入）；RED→GREEN `red-sc01-sc04-lifecycle.txt`、`red-sc01-sc03-sc04-contact.txt`；`pg-minor-release-notes.md`：截至 2026-09-29，16.15 就是最新的 PG 16 小版本，PG 侧保持「主版本 16」 |
| SC-W0034-02 | pass（联系人差分 7 项基线既有失败，协调者裁定见文末） | 复现环境 `env/Dockerfile`、`env/build.log`、`repro-pg-provenance.txt`：基础镜像 digest `debian@sha256:6f519a81…`；源码 SHA256 `c1575341…` 与官方一致；`ldd` 链接 `libicu*.so.67.1`；架构 `aarch64`；实测 `160015/UTF8/i/true/153.14/153.14`。`a1-precheck.txt`（16.9 预检，仅作补充）。Node：`node-shasums-verification.txt`、`node-versions-*.json`。差分 `pg-diff-node24-icu783.txt`、`pg-diff-node24-icu782.txt`：跟进 10/10、0 skip；联系人 25/32，失败 7 项为基线既有失败、清单相同。探针矩阵 `probe-matrix-generation*.txt`、`tests/fixtures/sort-runtime-unicode-probe.json`；探针运行 `unicode-probe-node24-icu783.txt`、`unicode-probe-node24-icu782.txt`、`unicode-probe-local-node26.txt`，2/2 全过；混用分析 `lifecycle-mixing-analysis.md` |
| SC-W0034-03 | pass | `contact-path-binding.md`；`contact-search-pagination.test.ts`「SC-W0034-03 lower() matrix…」在复现 PG（两个 Node）和本机 PG 上都通过；`contact-search-runtime.test.ts` 路径绑定用例通过 |
| SC-W0034-04 | pass | 日志字段集合与规定完全相同、同一元组只记一条；`console.warn` 抛错或输入不可序列化时仍返回原错误码；计数 client：PG 不符时仍 1 次查询、首页 Node 预检拒绝时 0 次查询、放行时 SQL 文本不变；既有 single-flight／30 秒负缓存用例通过 |
| SC-W0034-05 | pass | `sc05-local-targeted.txt`：跟进差分、W0025 六个消费者文件、运行时单测 77/77；联系人组 36/43（失败为那 7 项既有失败）；`consumers-local.txt` 3 项失败均出在无关模块；`sql-unchanged-check.txt`：diff 里涉及排序／匹配 SQL 的只有注释行；浏览器 `browser/browser-flow.json` 与 8 张截图；`verify-fingerprint-before/after.txt` 非 verify 数据指纹不变；`typecheck.txt`；全量 `full-base.txt`、`full-head.txt`、`fail-*.txt` |

### 组合表最终内容（跟进与联系人是同样四对）

| 组合 id | Node 侧 | PG 侧 | 差分证据 |
| --- | --- | --- | --- |
| `icu78.2-u17.0-en-US/pg16-153.136` | ICU 78.2 / Unicode 17.0 / en-US | 16 / UTF8 / 153.136 / i / 确定性 | 本 Sprint 之前已有（Node 25.6.0，本机 PG 16.12） |
| `icu78.3-u17.0-en-US/pg16-153.136` | ICU 78.3 / 17.0 / en-US | 同上 | 跟进：W0025；联系人：`local-contact-with-candidate.txt`、`sc05-local-targeted.txt` |
| `icu78.3-u17.0-en-US/pg16-153.14` | ICU 78.3 / 17.0 / en-US | 16 / UTF8 / 153.14 / i / 确定性 | Node 24.21.0 × 复现 PG 16.15：`pg-diff-node24-icu783.txt`、`unicode-probe-node24-icu783.txt` |
| `icu78.2-u17.0-en-US/pg16-153.14` | ICU 78.2 / 17.0 / en-US | 同上 | Node 24.15.0 × 复现 PG 16.15：`pg-diff-node24-icu782.txt`、`unicode-probe-node24-icu782.txt` |

联系人侧的 PG 键另含 `collation = und-x-icu` 和 `matcher_policy_version = ecmascript-lower-substring-v1`。

### 探针矩阵摘要（全码位对照，审定后写入 fixture）

- **`lower()`**：对照 1,112,063 个码位。153.14（ICU 67）与 JS 有 **95** 处差异，全部是 Unicode 14/16/17 新增的大写字母（西里尔 TJE、格拉哥里、拉丁 A7C0–A7DC 补充、Vithkuqi、Garay、U+16EA0–16EB8）：JS 会转小写，PG 不转。153.136（ICU 78）与 JS 差异为 0。
- **排序**：对照 159,865 个已分配码位。153.14 与 JS 有 **19,942** 个字符位置不同：15,942 个是 Unicode 14–17 新增字符，4,000 个是 CLDR 37→48 根排序调整过的旧字符。153.136 与 JS 逐字节一致；ICU 78.2 与 78.3 的 JS 排序完全相同。
- **跟进侧（W34-4 条件成立）**：三个 reader 的排序和游标比较都在 PG 里完成，运行时不混用 JS 排序和 PG 分页；首页只对 PG 选出的至多 3 条做展示重排，集合和计数都来自 PG。19,942 个差异字符逐字符断言通过（`/app/tasks` 的 id、due 两个键，关系任务分页的 id 键，首页每次取 3 条滑动覆盖全部字符）。
- **联系人侧（W34-4 条件成立）**：95 个差异字符 × 8 个字段 × 页大小 1、2 × {PG 全量、JS 全量、PG 重来} 共 4,560 个断言单元全部通过，两个方向的路径切换都被拒。

## 偏差

1. **联系人差分 7 项基线既有失败**：`live no-limit returns the complete literal DTO…`、`…found only in evidence`、`unknown Unicode tuple falls back…`、`live no-limit reads isolate actor…`、`live bounded pages match an evidence-only substring`、`real PostgreSQL preserves microsecond keyset…`、`real PostgreSQL batches a 1000-contact…`。原因是夹具里 `contact:evidence-only` 的 owner 是 shared-owner，与 `caf9bd8a` 之后「私有联系人必须本人拥有」不符，每项都少一个联系人。在基线副本里只把旧白名单临时改成本机 Node，同一文件失败的正是这 7 项（`baseline-diag-contact-local-summary.txt`）；失败清单在本机基线、本机 HEAD、复现 PG × Node 24.21 与 × Node 24.15 四处完全相同。全量里这些 PG 用例本来就跳过。
2. **Debian 软件源**：`bullseye-security` 里 libicu67 已 404，改用镜像自带的 snapshot 源 `20260824T000000Z`，装到的仍是 `libicu67 67.1-7+deb11u1`。
3. **重建复现镜像**：首次构建缺 `pg_trgm`，加 contrib 重建了一次，重建后实测元组相同。复现 PG 监听 `127.0.0.1:55434`，启动前确认过端口空闲。
4. **关系任务分页的探针只走 id 键**：它的响应 schema 只接受 ISO 格式的 `dueAt`。探针遍历改为每次 10 个字符（`b964c37a`），期望位次仍取自 fixture。
5. 全量对照跑在 `0af468b9` 上；`b964c37a` 只改了一个在全量里本来就跳过的 PG 测试。
6. 本机测试库 `orbit_cutover_test_20260917` 残留一个 schema `w0_b1_contact_e442950d…`（49 行标准夹具，不含本 Sprint 探针数据，来源无法确认），未动。

## 假设与额外阅读

- 上下文包之外的阅读（全部只读）：`features/contacts/contact-graph-query.ts`；`features/contacts/live-service.ts`、`app/api/contacts/handler.ts`、`app/api/contacts/search/handler.ts`、`app/api/_shared/conditional-read.ts`；`app/(app)/app/contacts/contact-card-route-service.ts`、`shared/api-schema/contact-card-page.ts`；`app/(app)/app/tasks/relationship-lifecycle-tasks.ts`、`features/connections/lifecycle/task-list.ts`、`features/followups/live-service.ts`、`app/(app)/app/agent/home-facts-route-service.ts`、`app/(app)/app/tasks/lifecycle-pages-route-service.ts`；`shared/storage/migrations.ts`；`scripts/verify-session-cookie.ts`、`scripts/seed-verify-accounts.ts`；PostgreSQL 16.13–16.15 发布说明；Unicode 17 `DerivedAge.txt`。
- 新增文件：`shared/storage/sort-runtime.ts`（读取 Node 侧版本、比较组合键、`pgMajorVersion`、best-effort 拒绝日志）；`tests/services/contact-search-runtime.test.ts`；`tests/services/sort-runtime-unicode-probe-postgres.test.ts`；`tests/fixtures/sort-runtime-unicode-probe.json`（约 310 KB）。
- 五个读取器工厂各加了一个可选参数 `nodeRuntime`，只供测试注入；`assertLifecycleNodeSortRuntime()` 签名和错误码不变；`lifecycleSortRuntimeSchema`、`VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES`、`APPROVED_CONTACT_SEARCH_RUNTIME` 已删除，由组合表取代。
- 按 W34-3 的判定键，本机 Node 26.10.0 与生产 Node 24.21.0 是同一个 Node 侧键，单测里的「未测交叉」改用真正没测过的值（ICU 78.4／79.1、collversion 153.120、locale zh-CN）。
- 首页 `compareCandidates` 的 `localeCompare` 只作用于 PG 已选出的至多 3 条，未改。
- 日志去重键是 event 加版本元组；每个进程最多记 32 个不同元组。

## GitNexus

- 开工前 `analyze --force --index-only`。CRITICAL：`runtimeTupleMatches`、`verifiedContactSearchRuntime`、`invalidateVerifiedContactSearchRuntime`、`decodeCursor`、`encodeCursor`、`createPostgresContactListPageReader`、`parseFallbackContactRecordPage`。LOW：`assertLifecycleNodeSortRuntime`（直接调用方 3 个）。UNKNOWN：`lifecycleSortRuntimeSchema`，文本搜索确认 3 处源码和 1 个测试在用，已全部改掉。全部按共享契约处理。
- 功能提交前 `detect-changes --scope staged`：10 个文件、65 个符号、0 个受影响流程、risk low、非 partial。测试提交那次提示「no indexed symbols overlap」（该文件是索引之后新建的）。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex P2：`next-env.d.ts` 指向 `.next-verify` | 不成立：工作树未提交文件，分支 diff 不含它 | 无需修改；对功能改动无意见 |

## 交接

- **给 W0019（G1／G2）**：生产 Node 24.x（24.13.1–24.15.x 为 ICU 78.2，24.16.0–24.21.0 为 78.3；locale 预期 `en-US`）与 PG 16／UTF8／i／true／153.14 对应的两对已入表；G1（跟进）和 G2（联系人搜索）不再被运行时白名单阻塞，待 W0020 日志确认。若生产 Node 的默认 locale 不是 `en-US`，检查会 fail-closed 并记日志。
- **给 W0020（上线后确认）**：Preview 部署后在 Vercel 运行时日志搜 `sort_runtime_unverified` 和 `contact_search_runtime_unsupported`；实际打开「先联系谁」、`/app/tasks`、首页、联系人关键词搜索；没有这两类日志且页面都可用才算确认；出现日志就按日志里的元组在本机补测（复现方法见证据目录 `env/Dockerfile`），不临时放宽。
- **PG 小版本**：16.16 发布后（预计 2026-11）重新查发布说明；如有 ICU、排序或 `lower()` 相关修正，把 PG 侧收紧为已验证的 `server_version_num` 范围。
- **接口**：`features/followups/storage/lifecycle-task-pages.ts`（`VERIFIED_LIFECYCLE_SORT_RUNTIMES`、`lifecycleSortRuntimeEntryFor`、`assertLifecycleSortRuntimeFor`、`assertLifecycleNodeSortRuntimeFor`）；`features/contacts/storage/contact-list-postgres-reader.ts`（`VERIFIED_CONTACT_SEARCH_RUNTIMES`、`contactSearchRuntimeEntryFor`、`ContactMatchPath`）；`shared/storage/sort-runtime.ts`（`logSortRuntimeRejection`、`currentNodeSortRuntime`）。以后加组合：表里加一行，同时附差分和探针证据；遇到新的 collversion 要重新生成并审定探针 fixture。
- **发布影响**：上线时联系人搜索的旧游标（包括空查询的游标）会失效一次，用户从第一页重新加载。
- **跟进项（需另立）**：①`/api/contacts`、`/api/contacts/search` 把 `CONTACT_CURSOR_INVALID` 映射为 400 +「分页已失效」；②修联系人 PG 夹具里 `contact:evidence-only` 的 owner；③观察项：分页 `read` 在断言前就已读库（W0025 遗留）；其他不传 locale 的 `localeCompare`。
- **回退**：`git revert b964c37a 0af468b9`，回到只认本机组合的状态，生产照旧 fail-closed。
- **清理**：已删复现容器、本 Sprint 构建的镜像、当天新建的构建缓存、Node 临时目录、PG 源码目录；剩余约 636MB 构建缓存是 `debian:bullseye` 的共享底层，随镜像保留；保留拉取的 `debian:bullseye`、`postgres:16.9-bullseye`；Docker Desktop 是本 Sprint 启动的（原本未运行），已正常退出。

## 协调者裁定

- review 表：Codex `codex review --base chat-agent`（全文 `codex-review.txt`）唯一意见 P2「`next-env.d.ts` 指向 `.next-verify`」不成立——3001 验收 server 自动改写的工作树未提交文件，分支 diff 不含它；对运行时组合改动本身无意见。
- 偏差 1（联系人差分 7 项基线既有失败）：失败清单在基线、HEAD 与两个复现组合上完全相同，原因是夹具 owner 数据，与运行时无关；差分的目的「生产组合不引入新的排序／匹配差异」成立。协调者接受联系人组合入表（2026-09-30）；夹具修复登记为后续候选。
