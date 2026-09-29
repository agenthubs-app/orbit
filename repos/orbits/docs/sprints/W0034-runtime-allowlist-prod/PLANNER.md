# Sprint W0034 — 排序与联系人搜索运行时白名单覆盖生产组合

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-04（生产上线）。来源：D33（W19-1 选 (b)，2026-09-29）；W0025 REPORT「给 W0019 的发布门」；W0019 PLANNER G1、G2。
**单一目标:** 把跟进排序与联系人搜索的运行时白名单，从「精确 Node patch × 单一 PG 字面量」改为「经差分测试的 (Node 侧 ICU/Unicode/默认排序 locale) × (PG 侧主版本/编码/ICU 排序规则版本) 组合表」。在本机复现的生产组合上跑通差分后，加入生产组合；拒绝时记录实际版本元组。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（本 revision 编制时是 `b0ba400f`）；前序 W0025（功能 `749a8501`、`488dd9d6`，合并 `6921656b`）。
**进入条件:**
- W0019 的生产只读核查已完成（`~/orbit-sprint-evidence/web/sprint-W0019/run-01/prod-readonly/` N2、N3、V2），本 Sprint 不再调用任何云端工具。
- 用户对 W34-1（PG 复现方式）和 W34-6（下载 Node 24 二进制、拉取 Docker 基础镜像与 PG 源码）的授权。两者都只在本机，但会启动 Docker Desktop，并下载几百 MB。未授权就不启动。
- 本机 PG 测试库可用：`node scripts/assert-local-test-databases.mjs` 通过。3001 验收 server 不停。
- 不需要云端授权，不调用付费 AI，不部署，不碰生产库。

## 已查清的事实（2026-09-29 编制时核对）

1. **生产组合（D33，W0019 只读核查）**
   - Vercel：项目 `nodeVersion=24.x`（V2），取不到 patch 号。Vercel 会自动升 patch。
   - Neon：`PostgreSQL 16.15 (eb11870) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 10.2.1-6)`，`server_version_num=160015`，UTF8（N2）。`und-x-icu`：provider `i`，deterministic，catalog 和 actual collversion 都是 `153.14`（N3）。
2. **PG 的 153.14 对应 ICU 67。** Neon 的 `compute/compute-node.Dockerfile`（neondatabase/neon 仓库 main 分支）规定 PG14–16 用 Debian bullseye，运行库是 `libicu67`，编译时加 `--with-icu`。N2 的编译器 `gcc (Debian 10.2.1-6)` 正是 bullseye 的工具链。本机对照：Homebrew PG 16.12 链接的是 `icu4c@78`（`otool -L`，78.2），collversion 是 153.136。所以 collversion 跟着 PG 链接的 ICU 库变，与 PG 小版本无关。**Generator 必须在复现环境里实测 `pg_collation_actual_version` = 153.14，并记录链接的 libicu 版本，确认后才能引用这条对应关系。**
3. **Node 24.x 的 ICU 在同一大版本里变过两次**（nodejs/node `doc/changelogs/CHANGELOG_V24.md`；nodejs.org `dist/index.json` 显示最新是 24.21.0，发布于 2026-09-07/08）：
   - 24.0.0～24.13.0：ICU 77.1（Unicode 16.0）
   - 24.13.1～24.15.x：ICU 78.2（Unicode 17.0）
   - 24.16.0～24.21.0：ICU 78.3（Unicode 17.0）。24.21.0 另打了 ICU-23262 补丁，修的是 DateTimeFormat 的 era/月份名加载，与排序和大小写无关，版本号仍写 78.3（Generator 用实测的 `process.versions` 确认）。
   - 所以按 Node patch 精确匹配没有意义，按 major 放行又不安全（24.x 里 ICU 77→78 跨了一个 Unicode 版本）。判定键应当是 `icu` + `unicode`，patch 号只写进日志。
4. **排序等价实际依赖什么（按源码）**
   - 跟进：旧路径在 JS 里用 `localeCompare` 排序，不传 locale（`app/(app)/app/tasks/relationship-lifecycle-tasks.ts:145–147`，`features/connections/lifecycle/task-list.ts:13`，`features/followups/live-service.ts:278`）。结果取决于 Node 的 ICU 版本**和进程默认 locale**（本机无 `LANG` 时是 `en-US`）。新路径在 PG 里 `order by due collate "und-x-icu", id collate "und-x-icu", record_id collate "C"`，游标比较也在 PG 里做（`lifecycle-task-pages.ts:131–141`，`lifecycle-home-summary.ts:35,48`，`connections/lifecycle/task-page.ts`）。
   - 联系人搜索：匹配策略 `ecmascript-lower-substring-v1`，PG 用 `lower(... collate "und-x-icu")` 模拟 JS `toLowerCase()`。快速路径（PG）和回退路径（JS）共用存储顺序游标（`contact-list-postgres-reader.ts`；测试「fast and fallback pages share storage-order cursors」）。探针失败后有 30 秒退避，退避期间走回退路径。
   - **关键风险：** 以前两个白名单组合的 Node 和 PG 都是 ICU 78，两边 Unicode/UCA 版本一样。生产是 Node ICU 78（Unicode 17）配 PG ICU 67（Unicode 13）。现有夹具（`É e é E 东京 東京 a-2 a_2 😀`，希腊字母 ΟΣ/ß/İ 等）大概率仍然一致。但 Unicode 14–17 新增的字符在两边的排序权重和大小写映射预计不同：例如 🫠 U+1FAE0（14.0）在 ICU 67 里是未分配码位，按隐式权重排到字母后面，在 ICU 78 里是符号，排在字母前面；再如 Vithkuqi U+10570–U+105BC（14.0）、Latin U+A7C0/A7C1、A7D0/A7D1、A7D6–A7D9（14.0）、Garay U+10D50 起（16.0）这些新增大小写对，JS 会转小写，ICU 67 的 `lower()` 不会。**所以只跑旧夹具通过不能证明等价。** 本 Sprint 必须加新增字符探针（SC-02），结论交给 W34-4。
5. **现有检查点（文本搜索确认）**
   - `features/followups/storage/lifecycle-task-pages.ts`：`lifecycleSortRuntimeSchema`（第 174 行，PG 字面量 `160012/UTF8/153.136/153.136/i/true`）、`VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES`（第 182 行，`25.6.0/78.2/17.0`、`26.10.0/78.3/17.0`，三字段全等）、`assertLifecycleNodeSortRuntimeFor`（第 187 行）、`assertLifecycleNodeSortRuntime`（第 192 行）。分页 `read` 先查库，再做 zod 校验和 Node 断言（第 223–235 行）。
   - `features/followups/storage/lifecycle-home-summary.ts:69`：**查库前**断言 Node 元组，查库后用 `lifecycleSortRuntimeSchema` 校验 PG 元组（第 54 行）。
   - `features/connections/lifecycle/task-page.ts:45–46`：先做 PG schema 校验，再做 Node 断言。
   - `features/contacts/storage/contact-list-postgres-reader.ts`：`APPROVED_CONTACT_SEARCH_RUNTIME`（第 1247 行，Node `25.6.0/78.2/17.0` + PG `160012/UTF8/153.136`）、`runtimeTupleMatches`（第 1291 行）、探针缓存键 `runtimeProbeCacheKey`（含 node patch）、`verifiedContactSearchRuntime`（30 秒负缓存）。拒绝后抛 `CONTACT_SEARCH_RUNTIME_UNSUPPORTED`，`features/contacts/card-service.ts:48` 把它映射为 503「当前环境暂不支持此搜索」。
   - PG 元组不符时，跟进三处抛的是 zod 错误，不是 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`；调用方统一吞成「不可用」，但日志里看不出原因。
   - 现有日志惯例：`console.warn(JSON.stringify({ event: "...", ... }))`（`features/sync/read-budget-gate.ts:177`、`app/api/queues/event-operations/route.ts:17`）。
6. **差分测试的数据库守卫**：`tests/services/lifecycle-task-pages-postgres.test.ts` 断言主机是 localhost/127.0.0.1/[::1]，库名是 `/orbit_neon_audit_20260925`；联系人搜索测试（`tests/capabilities/contact-search-pagination.test.ts`）用库名 `orbit_cutover_test_20260917`；`scripts/assert-local-test-databases.mjs` 拒绝非本机主机。**所以 Neon 分支方案必须放宽测试守卫，本 Sprint 不做。** 本机复现的 PG 只要监听 localhost 的其他端口、建同名库即可，不改任何守卫。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/followups/storage/lifecycle-task-pages.ts` 第 121–126 行（runtime CTE）、第 174–194 行（schema／白名单／断言）、第 219–245 行（分页 `read`）。
- `features/followups/storage/lifecycle-home-summary.ts` 第 30–75 行。
- `features/connections/lifecycle/task-page.ts` 第 1–50 行。
- `features/contacts/storage/contact-list-postgres-reader.ts` 第 80–110 行（runtime_fingerprint CTE）、第 1125–1160 行（`execute`）、第 1225–1370 行（元组、探针、缓存）。
- `tests/services/lifecycle-sort-runtime.test.ts`（W0025 白名单单测，要改写）。
- 差分测试：`tests/services/lifecycle-task-pages-postgres.test.ts`（6 项，其中 2 项另需 `ORBIT_FOLLOWUP_PAGE_GROWTH=1`）、`tests/services/relationship-task-page-postgres.test.ts`（1 项）、`tests/pages/app-home-facts-task-summary-reader.test.ts`（2 项 PG）、`tests/capabilities/contact-search-pagination.test.ts`（PG 用例都读 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，库名 `orbit_cutover_test_20260917`；重点是「approved local ICU lower matches JS fields…」「unknown Unicode tuple falls back…」「fast and fallback pages share storage-order cursors…」「real PostgreSQL preserves microsecond keyset…」）、`tests/services/contact-card-page-postgres.test.ts`，以及 `tests/api/contact-card-page.test.ts`、`tests/pages/contact-card-route.test.ts`（引用了运行时错误码）。
- 证据：`~/orbit-sprint-evidence/web/sprint-W0019/run-01/prod-readonly/N2.txt`、`N3.txt`、`V2.txt`（生产元组原始结果）。

### 关键符号与影响等级（GitNexus，2026-09-29 编制时；索引有 staleness 提示，开工先刷新）
- `export function assertLifecycleNodeSortRuntimeFor(versions: { node?: string; icu?: string; unicode?: string })`：LOW（直接调用方 1）。
- `assertLifecycleNodeSortRuntime()`：W0025 记为 **CRITICAL**；实际调用方 3 处（事实 5）。
- `lifecycleSortRuntimeSchema`：**UNKNOWN**（图上 0 调用方，因为是模块常量）。文本搜索确认有 3 处使用：`lifecycle-task-pages.ts`、`lifecycle-home-summary.ts`、`connections/lifecycle/task-page.ts`，外加测试。不能当低风险。
- `runtimeTupleMatches`：**CRITICAL**（影响 10，直接调用方 3）；`verifiedContactSearchRuntime`：**CRITICAL**（影响 9，直接调用方 2）。
- 按共享契约处理，不因 `riskSharedAxes` LOW 降级。

### 前序交接要点
- W0025：白名单接口是 `VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES` 和 `assertLifecycleNodeSortRuntimeFor(versions)`，版本号可注入。首页在跟进来源不可用时显示「部分数据来源暂时不可用」。
- W0025 的差分跑法：`ORBIT_LIFECYCLE_TEST_DATABASE_URL` 显式导出；用户名和密码取自本机 `ORBIT_EVENT_DATABASE_URL`；不要 source `.env`；两项增长用例需要 `ORBIT_FOLLOWUP_PAGE_GROWTH=1` 才不 skip。
- W0021／D32：流量口径是数据库返回字节。本 Sprint 不许增加查询次数或返回列。

### 易错边界（都对应到 SC）
- 组合表是**成对**的：只有一起跑过差分的 (Node 侧, PG 侧) 才放行。不能拆成「Node 元组集合 × PG 元组集合」的笛卡尔积，比如本机 Node + Neon PG 没测过就不能放行。（SC-01）
- 不按 Node major 放行：24.x 里有 ICU 77.1。不能写成「只比较 ICU major」。78.2 与 78.3 各自实测后各自列入。（SC-01、SC-02）
- 只跑旧夹具不算等价，必须加新增字符探针。探针显示有差异时按 W34-4 处理，不能删掉探针或放宽断言来换通过。（SC-02）
- 差分只在本机复现的 PG 上跑，collversion 必须实测为 153.14。不在 Neon 上建分支、写库、跑测试。测试守卫（localhost、库名）一律不改。（SC-02）
- 日志只含版本号，不含用户 id、查询词、连接串或 SQL。同一进程同一元组只记一次，不能每个请求刷一条。（SC-03）
- 日志和判定不产生额外查询：Node 侧不符时首页摘要仍在查库前拒绝；PG 元组用已有查询返回的 `runtime`／`runtime_fingerprint` 取得。（SC-03、SC-05）
- 排序 SQL、游标格式、匹配策略版本（`ecmascript-lower-substring-v1`）都不改。（SC-04）
- Node 版本切换只用独立目录里的二进制，用完删除。不改全局 Node、`nvm`／`brew`、shell 配置和系统设置；不停 3001。（SC-02）

## 范围与文件

- **修改：**
  - `features/followups/storage/lifecycle-task-pages.ts`：组合表常量、可注入的纯判定函数（Node 侧预检、完整组合判定）、拒绝日志；`assertLifecycleNodeSortRuntime()` 签名和抛错码不变。PG 元组不符时改为记日志并抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`，不再抛 zod 错误。
  - `features/followups/storage/lifecycle-home-summary.ts`、`features/connections/lifecycle/task-page.ts`：改用上面的判定。
  - `features/contacts/storage/contact-list-postgres-reader.ts`：`APPROVED_CONTACT_SEARCH_RUNTIME` 改为组合表，`runtimeTupleMatches` 改为按组合判定并注入 Node 侧版本，探针缓存键保持按进程元组，拒绝日志。
  - 对应测试：`tests/services/lifecycle-sort-runtime.test.ts`，以及联系人搜索运行时的单测（放在 `tests/capabilities/contact-search-pagination.test.ts` 的非 PG 用例区，或新建 `tests/services/contact-search-runtime.test.ts`）。
- **新建：**
  - 新增字符探针：跟进（`tests/services/lifecycle-task-pages-postgres.test.ts` 里加用例，或新建 `tests/services/sort-runtime-unicode-probe-postgres.test.ts`）；联系人搜索（`contact-search-pagination.test.ts` 里加用例）。
  - 如果共享运行时判定和日志放进一个小模块（例如 `shared/storage/sort-runtime.ts`），在 REPORT 登记。
  - 复现环境的脚本／Dockerfile **不进仓库**，放在证据目录 `~/orbit-sprint-evidence/web/sprint-W0034/run-01/env/`；REPORT 记录路径和摘要。
- **排除：** 部署、Preview、Neon／Vercel 任何调用（包括只读）、迁移；改排序 SQL、游标、匹配策略；分页 `read` 断言前移（W0025 观察项，仍保留）；其他 `localeCompare` 使用点（例如 `initialization.ts` 的键排序，与分页无关）；App 端。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0034-01 | **组合判定（纯函数，注入版本）。** 两处白名单都改成组合表，每项是 Node 侧 `{icu, unicode, collatorLocale}` 加 PG 侧 `{pgMajor, encoding, catalog, actual, provider, deterministic}`（跟进）；联系人搜索另加 `collation`、`matcher_policy_version`。PG 侧取 `server_version_num` 的主版本（W34-2）。放行：已有两个本机组合；生产组合（Node ICU 78.3 和/或 78.2，只加入 SC-02 实测通过的，PG 16 / 153.14）在 `node` 为 `24.16.0`、`24.21.0`、`24.99.0` 时都放行。拒绝：ICU 77.1/Unicode 16.0；本机 Node 配 153.14 PG（没测过的交叉组合）；Neon 的 Node 配 153.136 PG（若没实测）；catalog≠actual；provider≠i；非 deterministic；非 UTF8；PG 17；`collatorLocale` 不同；缺字段或没有 ICU | 单测 RED→GREEN（`tests/services/lifecycle-sort-runtime.test.ts` 与联系人搜索运行时单测），不改 `process.versions` |
| SC-W0034-02 | **生产组合差分（加入白名单的前提）。** 本机复现的 PG 实测 `server_version_num` 为 16 系、UTF8、`und-x-icu` provider i、deterministic、catalog = actual = `153.14`，链接 libicu 67（W34-1）。在这个 PG 上，分别用 Node 24.21.0（ICU 78.3）和 24.15.x（ICU 78.2）独立二进制跑：跟进差分（lifecycle 6 项含增长 2 项、relationship 1 项、task-summary-reader 2 项）、联系人搜索全部 PG 用例、`contact-card-page-postgres`，**0 skip，全部通过**；再跑新增字符探针（Unicode 14–17 新字符：排序与 `lower()`，覆盖 id、due、名字、组织、证据、标签字段）。探针断言：同一运行时下跨页不漏不重、总数与逐页合计一致；PG 顺序与 JS `localeCompare`／`toLowerCase()` 的差异逐字符记录下来。有差异时按 W34-4 的已定处理执行，不删探针。候选组合先加入、跑完才提交；任何一项失败就撤回该组合，SC 记 failed | 证据目录：`repro-pg-versions.txt`（`select version()`、元组、`otool`／`ldd` 的 libicu）、`node-versions-*.json`、`pg-diff-node24-icu783.txt`、`pg-diff-node24-icu782.txt`、`unicode-probe-*.txt`；跑前 `node scripts/assert-local-test-databases.mjs` |
| SC-W0034-03 | **fail-closed 与日志。** 组合表以外的组合，跟进三处仍抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`（PG 元组不符也是这个错误码，不再是 zod 错误），联系人搜索仍抛 `CONTACT_SEARCH_RUNTIME_UNSUPPORTED`，页面照旧显示不可用。每次拒绝前 `console.warn` 一条 JSON：`event`（`sort_runtime_unverified`／`contact_search_runtime_unsupported`）、`check`（`lifecycle_pages`／`lifecycle_home`／`relationship_task_page`／`contact_search`）、`node`、`icu`、`unicode`、`cldr`、`collatorLocale`，以及 PG 侧（能拿到时）`server_version_num`、`server_encoding`、`catalog`、`actual`、`provider`、`deterministic`，拿不到时为 `null`（首页在查库前的 Node 预检）。同一进程同一元组只记一次。日志不含 actor、workspace、查询词、连接串、SQL | 单测：捕获 `console.warn`，断言字段集合完全一致、没有多余字段；同一元组调用两次只记一条；日志抛错不影响抛出原错误码 |
| SC-W0034-04 | **本机回归（3001 组合不变）。** 本机组合（Node 26.10.0 / ICU 78.3 + PG 16.12 / 153.136）下，W0025 SC-05 的六个消费者文件、`tests/services/lifecycle-sort-runtime.test.ts`、两组跟进 PG 差分、联系人搜索全部 PG 用例、`tests/api/contact-card-page.test.ts`、`tests/pages/contact-card-route.test.ts` 通过，0 skip。排序 SQL 和游标文本不变（`git diff` 里 SQL 常量没有变化）。3001 上用 verify-legacy：策略页「先联系谁」、`/app/tasks` 跟进、联系人页输入关键词搜索都可用，桌面 1440、手机 375 各一次，控制台 0 错误。typecheck 通过；一次全量基线对照没有新增失败（RULES §5.2） | 定向集输出、截图、`typecheck.txt`、`full-*.txt` |
| SC-W0034-05 | **流量不增加，并完成交接。** 跟进三处和联系人搜索在放行与拒绝两种情况下，数据库查询次数、SQL 文本和返回列与改动前一致（用计数 client 测：首页 Node 预检拒绝时 0 次查询；联系人探针仍是 30 秒负缓存加单飞）。REPORT 给 W0019 更新 G1／G2 的对照表（生产值、组合表项、差分证据），并给 W0020 写 Preview 上线后读日志的检查方法：搜 `sort_runtime_unverified`／`contact_search_runtime_unsupported`，没有出现且页面可用才算确认 | 计数 client 单测；REPORT |

## 一次 Generator 的执行顺序

1. 复核进入条件（含 W34-1、W34-6 授权），保存基线和 Planner 哈希。刷新 GitNexus，对上文五个符号做 upstream impact；UNKNOWN 的用文本搜索补查。
2. **准备复现环境（不改仓库）：**
   - Node：在证据目录外的临时目录（例如 `$TMPDIR/w0034-node/`）下载 nodejs.org 官方 `node-v24.21.0-darwin-arm64.tar.gz` 和 24.15.x 版，用 `SHASUMS256.txt` 校验，只用绝对路径调用。记录 `process.versions` 和 `new Intl.Collator().resolvedOptions().locale`，用完删除。
   - PG：按 W34-1 的已定方案起一个监听 `127.0.0.1:<非 5432 端口>` 的 PG 16，建库 `orbit_neon_audit_20260925`、`orbit_cutover_test_20260917`，实测元组。collversion 不是 153.14 就停下，SC-02 记 blocked。
3. RED：SC-01 组合判定单测、SC-03 日志单测、SC-05 查询计数单测。
4. 实现组合表和判定：先只放两个已有本机组合，行为不变，SC-04 定向集保持绿；再加日志。
5. 加入候选生产组合，跑 SC-02 全套差分和探针。失败就撤回候选，写 REPORT，结束为 failed（或按 W34-4 转 blocked）。
6. 本机回归（SC-04），3001 浏览器，暂存区 `detect-changes`，提交。
7. 全量基线对照，一次 Codex 代码 review，同一 Generator 修复，写 REPORT，交接。清理：停掉并删除复现 PG 的容器、镜像和数据目录，删除 Node 二进制；Docker Desktop 如果是本 Sprint 启动的就退出。REPORT 记录清理结果。

## 最小测试与检查

- **档位：H。** 理由：两个共享 fail-closed 契约（跟进三个入口、联系人搜索），图谱 CRITICAL；放宽白名单一旦出错，会造成生产分页漏数据或重复。
- **开发定向集：** SC-01/03/05 单测；本机 PG 的跟进和联系人差分（确认没回归）；复现 PG 的 SC-02 全套。
- **收口：** SC-04 定向集、`npx tsc --noEmit -p .`、一次全量基线对照（不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，不 source `.env`）、一次 Codex 代码 review。
- **浏览器：** 3001，verify-legacy。
- **不运行：** 任何 Neon／Vercel 调用（包括只读）、Preview、付费 AI、App 端。

## 开放问题（附推荐默认）

| 编号 | 问题 | 推荐默认 |
| --- | --- | --- |
| W34-1 | 本机怎么得到与 Neon 同 ICU（153.14）的 PG 来跑差分？(a1) Docker 官方镜像 `postgres:16.9-bullseye`（bullseye 线最后一个 16 版，libicu67，aarch64 原生；PG 小版本 16.9 与 16.15 不同，但 collversion 只看 ICU）。代价：启动 Docker Desktop、拉取约 150 MB，几分钟。(a2) Docker `debian:bullseye` 装 `libicu-dev`（67），用 gcc 10.2.1 从源码编 PG 16.15，与 Neon 的 ICU、编译器、小版本都一致。代价：再拉 `debian:bullseye` 和 PG 源码约 30 MB，编译 5～10 分钟。(a3) 不用 Docker，在临时目录从源码编 ICU 67.1 和 PG 16.15（macOS 原生）。代价：20～30 分钟，约 1 GB 临时空间，与 Neon 的平台和编译器不同。(b) Neon 临时分支：写操作，需要用户单独授权，有少量计算和出站；而且测试守卫只认 localhost，必须放宽守卫，风险大于收益。(c) Homebrew 没有 icu4c@67，不可行 | **(a2) 为准，(a1) 做快速预检。** 两者都是本机 Docker，用完删除容器和镜像。(a2) 编不过时退到 (a1)，REPORT 注明小版本差异。Docker 不可用就用 (a3)。**(b) 不做**；以后要做，另立 Sprint 并单独授权 |
| W34-2 | PG 侧判定要不要卡小版本（`160015`）？Neon 会自动升小版本，卡死的话下次升级就会让功能再次 fail-closed | **不卡小版本，只卡主版本 16**，外加编码、catalog = actual collversion、provider、deterministic。排序和大小写结果由 collversion（即 ICU）决定；日志记完整 `server_version_num`。PG 主版本升级或 collversion 变化仍然拒绝 |
| W34-3 | Node 侧判定键：只要 `icu` + `unicode`，还是再加默认排序 locale？旧路径 `localeCompare` 不传 locale，结果取决于进程默认 locale，Vercel 的默认值我们没有实测 | **`icu` + `unicode` + `collatorLocale`（`new Intl.Collator().resolvedOptions().locale`），不含 node patch。** 组合表里生产项按 `en-US` 登记（与本机无 `LANG` 时一致）。Vercel 如果不是 `en-US`，会 fail-closed，并在日志里看到实际值，再补测。`cldr` 只进日志，不进判定键 |
| W34-4 | 新增字符探针显示 ICU 67（PG）与 ICU 78（Node）对 Unicode 14–17 新字符排序或转小写不同（预计会出现）时，是否仍接受生产组合？ | **有条件接受：** Generator 要先证明两件事。(1) 跟进：翻页的比较和计数全部在 PG 里完成，运行时没有把 JS 排序结果和 PG 分页混用，所以差异只让这些字符的相对顺序与旧 JS 顺序不同，不会漏也不会重（用探针的跨页不漏不重断言证明）。(2) 联系人搜索：在稳定运行时下所有页都走 PG 路径；已知的残余风险是探针失败后 30 秒退避期间快速路径切到回退路径，含这些字符的联系人可能被漏或重复，写进 REPORT。两件都证明了就接受，并在 REPORT 列出差异字符。任何一件证明不了，这一侧就不加入生产组合，Sprint 记 blocked，交给用户在「上线后显示暂时不可用」和「另开 Sprint 修混用」之间选 |
| W34-5 | 要不要把 Node 24.0～24.13.0（ICU 77.1 / Unicode 16.0）也加入组合表？ | **不加。** Vercel 会自动升到最新 24.x（现在 ICU 78.3）；万一落在 77.1 就 fail-closed，并从日志看到 |
| W34-6 | 本机切 Node 的方式 | **官方 dist 压缩包**（nodejs.org，按 `SHASUMS256.txt` 校验）解压到 `$TMPDIR/w0034-node/`，用绝对路径跑测试（`<dir>/bin/node --import tsx --test …`），用完删除。备选 `npx -y -p node@24.21.0`，并把 `npm_config_cache` 指到临时目录。两种都不改全局 Node 和 shell 配置。下载约 2×50 MB，需要用户授权 |
| W34-7 | 上线后怎么确认 | **W0020 Preview 部署后读 Vercel 运行时日志：** 没有 `sort_runtime_unverified`／`contact_search_runtime_unsupported`，且「先联系谁」和联系人搜索可用，才算生产确认。有这条日志就按日志里的元组补测，不临时放宽 |

## 失败与交接

外部条件缺失（W34-1、W34-6 未授权，Docker 和源码编译都不可用，复现 PG 的 collversion 不是 153.14）时不启动，或把 SC-02 记为 blocked。已完成的本机部分（组合表重构只含旧组合、日志）可以作为独立提交交接，但**不把生产组合写进白名单**。

REPORT 必须写：
- 复现环境的方法、镜像/源码版本、实测 PG 元组和 libicu 版本；Node 二进制版本和 `process.versions`；清理结果。
- 组合表最终内容，每项对应的差分证据文件。
- 新增字符探针的差异清单和 W34-4 的处理结论。
- **给 W0019：** 更新 G1／G2 的逐字段对照（Node 侧 icu/unicode/collatorLocale，PG 侧 major/encoding/collversion/provider/deterministic）。生产组合已加入的，G1／G2 改为「本机同组合差分已通过，待 W0020 日志确认」；没加入的保持阻塞，并写明原因。
- **给 W0020：** 日志检查方法（W34-7）。
- 观察项：分页 `read` 在断言前已读库（W0025 遗留，未处理）；其他不传 locale 的 `localeCompare` 使用点。
- 回退：`git revert <本 Sprint 功能 SHA>`，回到只认本机组合的状态（生产照旧 fail-closed）。

## 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 1 | 2026-09-29 | 按 D33 编制。核实 Neon PG16 用 bullseye libicu67（对应 153.14），本机 PG 链接 icu4c 78（153.136）；Node 24.x 的 ICU 在 24.13.1 和 24.16.0 两次变更；指出生产是 Node ICU 78 配 PG ICU 67 跨 Unicode 版本，旧夹具不足以证明等价，加入新增字符探针和 W34-4；开放问题 W34-1～7 |
