# Sprint W0034 — 排序与联系人搜索运行时白名单覆盖生产组合

**Plan revision:** 2（revision 1 为 `0b318402`；本版按 D35 与 Codex 方案 review 修订，见文末两张表）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-04（生产上线）。来源：D33（W19-1 选 (b)）、D35；W0025 REPORT 的「给 W0019 的发布门」；W0019 PLANNER 的 G1、G2。
**单一目标:** 把跟进排序与联系人搜索的运行时白名单，从「精确 Node patch × 单一 PG 字面量」改为经差分测试的组合表。组合表每一项同时规定两侧：Node 侧是 ICU、Unicode、默认排序 locale；PG 侧是主版本、编码和 ICU 排序规则版本。联系人搜索要把匹配路径绑定进游标，确保同一段分页不会在 PG 路径和 JS 回退路径之间切换。在本机复现的生产组合上跑通差分后，才加入生产组合。检查不通过时，服务端日志记下实际版本元组。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（本版编制时是 `0b318402`）；前序 W0025（功能提交 `749a8501`、`488dd9d6`，合并 `6921656b`）。
**进入条件:**
- W0019 的生产只读核查已完成（`~/orbit-sprint-evidence/web/sprint-W0019/run-01/prod-readonly/` 的 N2、N3、V2）。本 Sprint 不调用任何云端工具。
- D35 授权（2026-09-29）：本 Sprint 可以启动 Docker Desktop，拉取 `debian:bullseye` 和 `postgres:16.9-bullseye`，下载 PG 16.15 源码和 nodejs.org 官方 Node 24 压缩包。以上都只在本机进行，用完即删。
- 本机 PG 测试库可用：`node scripts/assert-local-test-databases.mjs` 通过。3001 验收 server 不停。
- 不需要云端授权，不调用付费 AI，不部署，不碰生产库。

## 已查清的事实（2026-09-29 编制时核对）

1. **生产组合（D33，W0019 只读核查）**
   - Vercel：项目 `nodeVersion=24.x`（V2），取不到 patch 号，Vercel 会自动升 patch。
   - Neon：`PostgreSQL 16.15 (eb11870) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 10.2.1-6)`，`server_version_num=160015`，UTF8（N2）。
   - `und-x-icu`：provider `i`，deterministic，catalog 与 actual collversion 都是 `153.14`（N3）。
2. **153.14 与 ICU 67：高度可信的复现代理，不是已证明等同。**
   - 依据一：Neon 仓库 main 分支的 `compute/compute-node.Dockerfile` 让 PG14–16 使用 Debian bullseye 的 `libicu67`，并以 `--with-icu` 编译。
   - 依据二：N2 的编译器 `gcc (Debian 10.2.1-6)` 就是 bullseye 的工具链。
   - 对照：本机 Homebrew PG 16.12 链接 `icu4c@78`（`otool -L` 显示 78.2），collversion 是 153.136。可见 collversion 取决于链接的 ICU 库，与 PG 小版本无关。
   - 局限：main 分支的 Dockerfile 不一定就是生产二进制的构建方式；在 bullseye 上源码编译只能复现同一版本族。**判定依据始终是生产实测元组**，组合表按实测值 153.14 写入，不写成「ICU 67 即可」。复现环境要留下全部溯源记录（SC-02）。
3. **Node 24.x 的 ICU 在同一个大版本里变过两次**（来源：nodejs/node 的 `doc/changelogs/CHANGELOG_V24.md`；nodejs.org 的 `dist/index.json` 显示最新是 24.21.0）：

   | Node 版本 | ICU | Unicode |
   | --- | --- | --- |
   | 24.0.0～24.13.0 | 77.1 | 16.0 |
   | 24.13.1～24.15.x | 78.2 | 17.0 |
   | 24.16.0～24.21.0 | 78.3 | 17.0 |

   24.21.0 另打了 ICU-23262 补丁，修的是 DateTimeFormat 的 era/月份名加载，与排序和大小写无关。
4. **排序和匹配的等价实际依赖什么（按源码）**
   - **跟进。** 旧路径在 JS 里用不传 locale 的 `localeCompare` 排序（`app/(app)/app/tasks/relationship-lifecycle-tasks.ts:145–147`、`features/connections/lifecycle/task-list.ts:13`、`features/followups/live-service.ts:278`），结果取决于 Node 的 ICU 和进程默认 locale；本机不设 `LANG` 时默认是 `en-US`。新路径的排序和游标比较都在 PG 里完成：`order by due collate "und-x-icu", id collate "und-x-icu", record_id collate "C"`（`lifecycle-task-pages.ts:131–141`、`lifecycle-home-summary.ts:35,48`、`connections/lifecycle/task-page.ts`）。
   - **联系人搜索有两族读取器：**
     - (i) 卡片分页 `createPostgresContactCardPageReader` 一类（`contact-list-postgres-reader.ts:1110–1160`，`seal`／`unseal` 签名游标）。运行时不符就抛 `CONTACT_SEARCH_RUNTIME_UNSUPPORTED`，由 `card-service.ts:48` 映射为 503，**没有 JS 回退**。
     - (ii) 列表搜索 `createPostgresContactRecordPageReader`（`encodeCursor`／`decodeCursor`，`queryScope` 摘要中含 `sortVersion: "contact-list-keyset-v1"`，约在第 1390–1460 行）。探针不符或失败时返回 `mode: "fallback"`（约第 1620 行），由 `contact-live-record-provider.ts:563,700` 改走 JS 投影和 JS `toLowerCase()` 匹配。**快速路径和回退路径共用同一种存储顺序游标**，探针失败后有 30 秒退避，所以同一段分页可能在两条路径间来回切换。
     - 匹配策略是 `ecmascript-lower-substring-v1`，PG 用 `lower(... collate "und-x-icu")` 模拟 JS `toLowerCase()`。
   - **关键风险。** 以前的两个组合，Node 和 PG 都是 ICU 78。生产却是 Node ICU 78（Unicode 17）配 PG ICU 67（Unicode 13）。Unicode 14–17 新增的字符预计会出现两类差异：
     - 排序权重不同。例如 🫠 U+1FAE0 在 ICU 67 里是未分配码位，按隐式权重排在字母之后。
     - 大小写映射不同。例如 Vithkuqi U+10570–U+105BC、Latin U+A7C0/A7C1、Garay U+10D50 起，JS 会转小写，ICU 67 的 `lower()` 不转。

     结果是，同一个联系人在 PG 路径能被搜到、在 JS 路径搜不到（或反过来）。如果分页中途换了路径，共用的游标就可能漏人或重复。现有夹具覆盖不到这些字符。
5. **现有检查点（已用文本搜索确认）**
   - `features/followups/storage/lifecycle-task-pages.ts`：
     - `lifecycleSortRuntimeSchema`（第 174 行），PG 字面量是 `160012/UTF8/153.136/153.136/i/true`。
     - `VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES`（第 182 行）。
     - `assertLifecycleNodeSortRuntimeFor`（第 187 行）、`assertLifecycleNodeSortRuntime`（第 192 行）。
     - 分页 `read` 先查库，再做 zod 校验和 Node 断言（第 223–235 行）。
   - `lifecycle-home-summary.ts:69`：查库前断言 Node，查库后用 schema 校验 PG（第 54 行）。
   - `connections/lifecycle/task-page.ts:45–46`：先校验 PG schema，再断言 Node。
   - PG 元组不符时，以上三处抛的是 zod 错误，日志里看不出原因。
   - `contact-list-postgres-reader.ts`：`APPROVED_CONTACT_SEARCH_RUNTIME`（第 1247 行）、`runtimeTupleMatches`（第 1291 行）、`runtimeProbeCacheKey`（含 node patch）、`verifiedContactSearchRuntime`（负缓存 30 秒，单飞）。
   - 日志惯例：`console.warn(JSON.stringify({ event: "...", ... }))`，例如 `features/sync/read-budget-gate.ts:177`，那里已经用 try/catch 包住。
6. **测试的数据库守卫。**
   - `tests/services/lifecycle-task-pages-postgres.test.ts` 断言主机是本机、库名是 `/orbit_neon_audit_20260925`。
   - 联系人搜索测试的库名是 `orbit_cutover_test_20260917`。
   - `scripts/assert-local-test-databases.mjs` 会拒绝非本机主机。
   - 复现的 PG 监听 `127.0.0.1` 的另一个端口，建同名库即可。**守卫一律不改。**

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/followups/storage/lifecycle-task-pages.ts`：第 121–126 行（runtime CTE）、第 174–194 行、第 219–245 行。
- `features/followups/storage/lifecycle-home-summary.ts`：第 30–75 行。
- `features/connections/lifecycle/task-page.ts`：第 1–50 行。
- `features/contacts/storage/contact-list-postgres-reader.ts`：
  - 第 80–110 行，runtime_fingerprint CTE；
  - 第 1105–1160 行，卡片读取器的 `seal`／`unseal`／`execute`；
  - 第 1225–1370 行，元组、探针、缓存；
  - 第 1385–1470 行，`queryScope`／`decodeCursor`／`encodeCursor`；
  - 第 1560–1660 行，回退页的构造与 `mode`。
- `features/contacts/storage/contact-live-record-provider.ts` 第 540–580 行、第 690–720 行：回退路径的分派，以及 `contactListFallback.cursorScope`。
- `features/contacts/card-service.ts` 第 40–50 行：错误码映射（`CONTACT_CURSOR_INVALID` 映射为「分页已失效，请从第一页重新加载」）。
- `tests/services/lifecycle-sort-runtime.test.ts`：要改写。
- 差分测试：
  - `tests/services/lifecycle-task-pages-postgres.test.ts`：6 项，其中增长 2 项需要 `ORBIT_FOLLOWUP_PAGE_GROWTH=1`；
  - `tests/services/relationship-task-page-postgres.test.ts`：1 项；
  - `tests/pages/app-home-facts-task-summary-reader.test.ts`：2 项 PG；
  - `tests/capabilities/contact-search-pagination.test.ts`：全部 PG 用例，重点是「approved local ICU lower…」「unknown Unicode tuple falls back…」「unknown Unicode fallback pages use JS prefix rank…」「fast and fallback pages share storage-order cursors…」「real PostgreSQL preserves microsecond keyset…」；
  - `tests/services/contact-card-page-postgres.test.ts`、`tests/api/contact-card-page.test.ts`、`tests/pages/contact-card-route.test.ts`。
- 证据：`~/orbit-sprint-evidence/web/sprint-W0019/run-01/prod-readonly/` 下的 `N2.txt`、`N3.txt`、`V2.txt`。

### 关键符号与影响等级（GitNexus，2026-09-29；索引有 staleness 提示，开工先刷新）
- `export function assertLifecycleNodeSortRuntimeFor(versions: { node?: string; icu?: string; unicode?: string })`：LOW，直接调用方 1 个。
- `assertLifecycleNodeSortRuntime()`：W0025 记为 **CRITICAL**，实际调用方 3 处。
- `lifecycleSortRuntimeSchema`：**UNKNOWN**，图谱里 0 个调用方（它是模块常量）。文本搜索找到 3 处使用加若干测试。不能当成低风险。
- `runtimeTupleMatches`：**CRITICAL**（影响 10 个符号，直接调用方 3 个）。
- `verifiedContactSearchRuntime`：**CRITICAL**（影响 9 个，直接调用方 2 个）。
- `queryScope`、`decodeCursor`、`encodeCursor`：开工时补做 impact。
- 以上都按共享契约处理，不因为 `riskSharedAxes` 是 LOW 就降级。

### 前序交接要点
- W0025 提供了版本号可注入的 `VERIFIED_LIFECYCLE_NODE_SORT_RUNTIMES` 和 `assertLifecycleNodeSortRuntimeFor(versions)`。首页在跟进来源不可用时显示「部分数据来源暂时不可用」。
- 差分的跑法：显式导出 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，用户名和密码取自本机 `ORBIT_EVENT_DATABASE_URL`；不要 source `.env`；增长用例需要 `ORBIT_FOLLOWUP_PAGE_GROWTH=1`。
- W0021／D32：流量口径是数据库返回字节。本 Sprint 不许增加查询次数或返回列。

### 易错边界（都对应到 SC）
- **组合表按对放行。** 只有一起跑过差分的 (Node 侧, PG 侧) 组合才放行，不做笛卡尔积。不按 Node major 放行，也不只比较 ICU major。78.2 和 78.3 各自实测，各自入表。（SC-01）
- **PG 侧只认主版本 16（D35／W34-2）。** 前提是 Generator 查过 16.15 之后发布的各个小版本的 release notes，确认没有相关修正。查到相关修正就收紧为已验证的小版本范围。（SC-01）
- **旧夹具通过不算等价。** 探针按显式矩阵逐项断言，只打日志不算。差异不能靠删除矩阵项或放宽断言来消掉。（SC-02）
- **联系人搜索的一段分页全程只走一条路径。** 路径切换时，旧游标必须明确失效（`CONTACT_CURSOR_INVALID`）；不能被当成首页静默重来，否则会重复。如果做不到绑定，联系人搜索在 `lower()` 有差异时硬阻断。（SC-03）
- **只在本机复现的 PG 上跑。** collversion 必须实测为 153.14。不在 Neon 上建分支、写库或跑测试；测试守卫不改。（SC-02）
- **日志是 best-effort。** 对象只从显式挑选的版本字段构造，不展开数据库行、异常对象或请求上下文。日志本身出错时，仍要抛出原业务错误码。（SC-04）
- **不增加查询。** Node 侧不符时，首页仍在查库前拒绝；PG 元组从已有查询返回的 `runtime`／`runtime_fingerprint` 中取。（SC-04）
- **不改的东西：** 排序 SQL、PG 侧匹配 SQL、匹配策略版本 `ecmascript-lower-substring-v1`。联系人游标只允许在 `queryScope` 摘要里加入路径标识。（SC-03、SC-05）
- **切换 Node 只用独立目录里的二进制，用完删除。** 不改全局 Node、nvm/brew、shell 配置或系统设置，不停 3001。（SC-02）

## 范围与文件

- **修改：**
  - `features/followups/storage/lifecycle-task-pages.ts`：
    - 新增组合表常量，以及可注入版本号的纯判定函数（Node 侧预检、完整组合判定）；
    - 加拒绝日志；
    - `assertLifecycleNodeSortRuntime()` 的签名和错误码不变；
    - PG 元组不符时改为记日志并抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`。
  - `features/followups/storage/lifecycle-home-summary.ts`、`features/connections/lifecycle/task-page.ts`：改用新的判定。
  - `features/contacts/storage/contact-list-postgres-reader.ts`：
    - `APPROVED_CONTACT_SEARCH_RUNTIME` 改成组合表；
    - `runtimeTupleMatches` 改为按组合判定，Node 侧版本可注入；
    - 加拒绝日志；
    - 在 `queryScope` 中加入匹配路径标识，快速路径为 `pg-icu:<组合 id>`，回退路径为 `js`。路径不符时抛 `CONTACT_CURSOR_INVALID`，不再是 `decodeCursor` 返回 null 后当作首页。
  - `features/contacts/storage/contact-live-record-provider.ts`：只在需要时改，用来传递回退路径的 `cursorScope`。
  - 对应测试：`tests/services/lifecycle-sort-runtime.test.ts`；联系人运行时单测，放在 `contact-search-pagination.test.ts` 的非 PG 区，或新建 `tests/services/contact-search-runtime.test.ts`。
- **新建：**
  - 探针测试：`tests/services/sort-runtime-unicode-probe-postgres.test.ts`（跟进排序，加联系人 `lower()` 单字符全码位对照）；联系人双向切换测试，加在 `contact-search-pagination.test.ts` 里。
  - 探针矩阵数据文件：`tests/fixtures/sort-runtime-unicode-probe.json`，列出字符、字段、操作和期望，由 SC-02 第 3 步生成后人工审定，不在测试里动态生成期望。
  - 如果把运行时判定和日志放进一个共享小模块（例如 `shared/storage/sort-runtime.ts`），在 REPORT 里登记。
  - 复现环境的 Dockerfile 和脚本**不进仓库**，放在 `~/orbit-sprint-evidence/web/sprint-W0034/run-01/env/`。
- **路径绑定的合理范围（SC-03 的判定线）：** 改动只落在上面两个联系人文件内，HTTP 契约、App 端和游标外形都不变（游标仍是不透明字符串，只是 scope 摘要多一个输入）。如果需要改契约或改 App 端，就算超出范围：不做绑定，改走硬阻断。发布时旧游标会失效一次，用户从第一页重新加载，这可以接受。
- **排除：** 部署、Preview、任何 Neon／Vercel 调用（包括只读）、迁移；改排序或匹配 SQL；分页 `read` 断言前移（W0025 遗留观察项）；其他不传 locale 的 `localeCompare`；App 端。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0034-01 | **组合判定（纯函数，注入版本）与 PG 小版本依据。** 两个白名单都改成组合表。跟进的每一项包含 Node 侧 `{icu, unicode, collatorLocale}` 和 PG 侧 `{pgMajor, encoding, catalog, actual, provider, deterministic}`；联系人搜索另加 `collation`、`matcher_policy_version`。**放行：** 已有的两个本机组合；生产组合（只加 SC-02／SC-03 实测通过的；PG 16 / 153.14 / `en-US`）在 `node` 取 `24.16.0`、`24.21.0`、`24.99.0` 时都放行。**拒绝：** ICU 77.1/Unicode 16.0；没测过的交叉组合（本机 Node 配 153.14 PG、生产 Node 配 153.136 PG）；catalog 与 actual 不等；provider 不是 i；非 deterministic；非 UTF8；PG 17；`collatorLocale` 不同；缺字段或没有 ICU。**PG 小版本：** Generator 查阅 16.15 之后已发布的每个 PG 16 小版本的 release notes，逐条记录与 ICU、collation、`lower()`/`upper()`、文本比较、`pg_collation_actual_version` 有关的条目（没有也要写「无」和查阅日期）。有相关修正时，PG 侧改为已验证的小版本范围（`server_version_num` 上下界），在 REPORT 标出 | 单测 RED→GREEN（不改 `process.versions`）；`pg-minor-release-notes.md`（证据目录：版本、链接、相关条目、结论） |
| SC-W0034-02 | **复现环境与探针矩阵（入表的前提）。** 1) 按 (a2) 构建：`debian:bullseye` 加 `libicu-dev`（67），用 gcc 10.2.1 源码编译 PG 16.15。实测 `server_version_num=160015`、UTF8、`und-x-icu` 为 i、deterministic、catalog = actual = `153.14`，架构 aarch64。记录基础镜像 digest、PG 源码 tarball 的 SHA256（对照官方 `.sha256`）、`ldd` 显示的实际 libicu 路径和版本、`uname -m`。(a1) `postgres:16.9-bullseye` 只作预检和补充证据，不能宣称复现了 16.15。2) 分别用 Node 24.21.0（ICU 78.3）和 24.15.x（ICU 78.2）的官方二进制跑差分：跟进 9 项（含增长）、联系人搜索全部 PG 用例、`contact-card-page-postgres`，0 skip，全部通过。3) 生成探针矩阵：对全部码位，比较 PG `lower(chr(cp) collate "und-x-icu")` 与 JS `toLowerCase()`，得到全部 `lower()` 差异字符；对 Unicode 17 已分配的全部码位，分别用 PG `order by … collate "und-x-icu"` 和 JS `localeCompare` 排序，比较得到排序差异字符。矩阵每一行包含：字符（码位）、字段、操作（排序或 lower）、PG 结果、JS 结果、页大小、期望集合或期望位置。**跟进排序行**的字段是 `id` 与 `due` 两个排序键（首页摘要的 `'followups:'||id` 也算），页大小 30，每个字符插入 >30 行，强制跨页。**联系人 lower 行**覆盖每个大小写差异字符 × 每个搜索字段（名字、组织、职位、地点、简介、关系摘要、证据摘要、自定义标签，以 `contact-search-pagination` 的现有字段为准），页大小取 1 和 2。4) 断言，每一行都要有：跟进行的逐页并集等于全部应得行，不漏不重，计数一致，页间顺序按 PG 单调，PG 位置等于矩阵期望；联系人行的 PG 路径集合和 JS 路径集合各自等于矩阵期望，`summary.total` 等于该路径逐页并集。只输出差异不算通过。5) 跟进侧还要证明运行时没有把 JS 排序结果和 PG 分页混用：列出全部调用链，给出结论（W34-4 的条件）。任何一项失败，就撤回对应一侧的候选组合 | 证据目录：`env/`（Dockerfile、构建日志）、`repro-pg-provenance.txt`、`node-versions-*.json`、`pg-diff-node24-icu783.txt`、`pg-diff-node24-icu782.txt`、`probe-matrix-generation.txt`、`tests/fixtures/sort-runtime-unicode-probe.json`、`unicode-probe-*.txt`、`lifecycle-mixing-analysis.md`；跑前先跑 `node scripts/assert-local-test-databases.mjs` |
| SC-W0034-03 | **联系人搜索不在 PG 与 JS 路径之间切换。** `queryScope` 纳入匹配路径标识后，一段分页全程只走一条路径。路径变了，旧游标抛 `CONTACT_CURSOR_INVALID`，用户看到「分页已失效，请从第一页重新加载」，不会静默当作首页。**双向切换多页测试**（真实 PG，用可控探针 client 模拟）：PG→JS（第 1 页探针通过，第 2 页探针失败或退避）；JS→PG（第 1 页在退避期，第 2 页探针恢复）。覆盖矩阵里每个大小写差异字符 × 每个搜索字段，页大小 1 和 2。断言：切换后旧游标一律被拒；从头重来的同一路径序列不漏不重，`summary.total` 等于逐页并集；不存在「部分页来自 PG、部分页来自 JS」的成功序列。**判定：** 绑定在「范围与文件」规定的合理范围内实现且测试全部通过，联系人生产组合才可入表（差异按 W34-4 有条件接受）。超出范围或任何一项失败时，只要 `lower()` 有差异就**硬阻断**：联系人生产组合不入表，G2 保持阻塞；跟进侧照常评估 | 双向切换测试输出；`contact-path-binding.md`（改动点和范围判定） |
| SC-W0034-04 | **fail-closed、日志与流量。** 组合表以外的组合，跟进三处都抛 `LIFECYCLE_SORT_RUNTIME_UNVERIFIED`（PG 不符也是这个），联系人搜索抛 `CONTACT_SEARCH_RUNTIME_UNSUPPORTED`，页面照旧显示不可用。拒绝前调用一个 best-effort 日志函数：只从显式挑选的字段构造对象，内部用 try/catch 包住 `JSON.stringify` 和 `console.warn`，永不抛出。字段：`event`（`sort_runtime_unverified`／`contact_search_runtime_unsupported`）、`check`（`lifecycle_pages`／`lifecycle_home`／`relationship_task_page`／`contact_search`）、`node`、`icu`、`unicode`、`cldr`、`collatorLocale`，以及 `server_version_num`、`server_encoding`、`catalog`、`actual`、`provider`、`deterministic`（拿不到时为 `null`）。同一进程同一元组只记一次。不含 actor、workspace、查询词、连接串、SQL、异常对象。**流量：** 放行和拒绝两种情况下，查询次数、SQL 文本和返回列都与改动前一致；首页 Node 预检拒绝时 0 次查询；联系人探针仍是 30 秒负缓存加单飞 | 单测：捕获 `console.warn`，断言字段集合完全相同；同一元组只记一条；把 `console.warn` 换成抛错的桩、给 `JSON.stringify` 喂不可序列化的值时，仍抛原错误码；计数 client 断言查询次数 |
| SC-W0034-05 | **本机回归与交接。** 本机组合（Node 26.10.0 / ICU 78.3 + PG 16.12 / 153.136）下，下列测试全部通过且 0 skip：W0025 SC-05 的六个消费者文件、`lifecycle-sort-runtime.test.ts`、两组跟进 PG 差分、联系人搜索全部 PG 用例、`tests/api/contact-card-page.test.ts`、`tests/pages/contact-card-route.test.ts`。`git diff` 中排序 SQL 和匹配 SQL 常量不变。3001 verify-legacy 上，策略页「先联系谁」、`/app/tasks` 跟进、联系人关键词搜索（含翻页）都可用，桌面 1440 和手机 375 各看一次，控制台 0 错误。typecheck 通过，一次全量基线对照没有新增失败（RULES §5.2）。REPORT 给 W0019 更新 G1／G2，给 W0020 写日志检查方法（D35/W34-7） | 定向集输出、截图、`typecheck.txt`、`full-*.txt`；REPORT |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线和 Planner 哈希。刷新 GitNexus，对上文符号做 upstream impact；结果为 UNKNOWN 的用文本搜索补查。
2. **准备环境，不改仓库。**
   - Node：从 nodejs.org 下载官方 `node-v24.21.0-darwin-arm64.tar.gz` 和 24.15.x 版本，用 `SHASUMS256.txt` 校验，解压到 `$TMPDIR/w0034-node/`，只用绝对路径调用。记录 `process.versions` 和 `new Intl.Collator().resolvedOptions().locale`。
   - PG：先用 (a1) 预检，再按 (a2) 构建并启动容器，监听 `127.0.0.1:<非 5432 端口>`，建两个同名库，记录溯源信息。collversion 不是 153.14 就停下，SC-02 记 blocked。
   - 查阅 PG 16 各小版本的 release notes（SC-01）。
3. 生成探针矩阵，人工审定后写入 fixture（SC-02 第 3 步），再做跟进混用分析（SC-02 第 5 步）。
4. 写 RED 测试：SC-01 判定、SC-04 日志、best-effort 与计数、SC-03 双向切换（绑定前应当失败或暴露混用）。
5. 实现组合表和判定，先只放两个本机组合，行为不变；再加日志；再做联系人路径绑定。
6. 加入候选生产组合，跑 SC-02 全套和 SC-03。哪一侧失败就撤回哪一侧，写 REPORT（failed 或 blocked）。
7. 本机回归（SC-05）、3001 浏览器，对暂存区跑 `detect-changes`，提交。
8. 全量基线对照，做一次 Codex 代码 review，由同一 Generator 修复，写 REPORT 并交接。**清理：** 停止并删除复现 PG 的容器、镜像、构建缓存和数据目录；删除 Node 二进制；Docker Desktop 如果是本 Sprint 启动的，就退出。REPORT 记录清理结果。

## 最小测试与检查

- **档位：H。** 两个共享的 fail-closed 契约，图谱 CRITICAL。放宽出错会让生产分页漏数据或重复，而且要改联系人游标的作用域。
- **开发定向集：** SC-01/03/04 的单测；本机 PG 上跟进和联系人的差分（防回归）；复现 PG 上 SC-02 和 SC-03 的全套。
- **收口：** SC-05 定向集、`npx tsc --noEmit -p .`、一次全量基线对照（不设 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`，不 source `.env`）、一次 Codex 代码 review。
- **浏览器：** 3001，verify-legacy。
- **不运行：** 任何 Neon／Vercel 调用、Preview、付费 AI、App 端。

## 开放问题

无（W34-1～7 已由 D35 决定，见文末）。

## 失败与交接

- **外部条件缺失**（Docker 不可用且源码编译也做不成，或复现 PG 的 collversion 不是 153.14）：SC-02 记 blocked，不把任何生产组合写进白名单。
- **本机部分可以独立交接**：只含旧组合的组合表重构、日志、联系人路径绑定。
- **两侧分开判定：** 跟进和联系人搜索各自是否入表，互不牵连。

REPORT 必须写：
- 复现环境的溯源：镜像 digest、源码 SHA、libicu、架构、实测元组；Node 二进制版本；清理结果。
- PG 小版本 release notes 的查阅结论，以及 PG 侧最终是「主版本 16」还是「已验证的小版本范围」。
- 组合表的最终内容，每一项对应哪份差分证据。
- 探针矩阵的差异清单；跟进混用分析的结论；联系人路径绑定是否实现、是否在范围内，还是走了硬阻断。
- **给 W0019：** 更新 G1／G2 的逐字段对照。已入表的项标「本机同组合差分已通过，待 W0020 日志确认」；上线后在日志里核对实际 `server_version_num`、`icu`、`collatorLocale` 是否落在组合表内。没入表的项保持阻塞，写明原因。
- **给 W0020：** 在 Preview 上搜 `sort_runtime_unverified` 和 `contact_search_runtime_unsupported`。没有这两类日志、且页面可用，才算确认。出现了，就按日志里的元组补测，不临时放宽。
- **观察项：** 分页 `read` 在断言前已经读了库（W0025 遗留）；其他不传 locale 的 `localeCompare`。
- **回退：** `git revert <本 Sprint 功能 SHA>`。回到只认本机组合的状态，生产照旧 fail-closed。

## review 处理（Codex 方案 review，`codex-plan-review.txt`，revision 1 = `0b318402`）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P1 联系人 `lower()` 差异，加上 PG/JS 路径切换，可能漏或重复；原方案只列为残余风险 | 接受 | 路径切换列为必须消除的风险：优先把匹配路径绑定进游标，一段分页全程只走一条路径，切换时明确报 `CONTACT_CURSOR_INVALID`。超出合理范围或测试失败时，`lower()` 有差异就硬阻断，联系人生产组合不入表（SC-03、「范围与文件」判定线） |
| P1 PG 只认主版本 16，差分只在 16.15 上跑 | 部分接受 | 保留用户决定 D35/W34-2（主版本 16 + collversion 等）。新增三条：Generator 查阅 16.15 之后各小版本 release notes 并记录相关条目；拒绝日志带出实际 `server_version_num`，W0019/W0020 上线后核对；查到相关修正时改为已验证的小版本范围，并在 REPORT 标出（SC-01）。取舍：换来不因 Neon 自动升小版本而反复 fail-closed，代价是未测小版本的实现变更风险，由 release notes 审阅和上线日志核对兜底 |
| P1 探针缺少双向路径切换的多页测试 | 接受 | SC-03 加入 PG→JS 和 JS→PG 的多页测试，覆盖每个大小写差异字符 × 每个搜索字段；有漏、有重，或 `summary.total` 与逐页并集不一致，都阻止入表 |
| P2 153.14↔ICU 67 是推断 | 接受 | 事实 2 改为「高度可信的复现代理」。SC-02 要求记录镜像 digest、PG 源码 SHA、`ldd` 实际库、架构、探针输出；生产实测元组始终是判定依据；(a1) 只作补充证据 |
| P2 探针不够客观可测 | 接受 | SC-02 改为显式矩阵（字符/字段/操作/PG 结果/JS 结果/页大小/期望），由全码位对照生成，审定后写入 fixture，每一行都要有断言，只打日志不算 |
| P2 日志出错可能改变错误码 | 接受 | SC-04：日志封装为 best-effort，永不抛出；只从显式挑选的版本字段构造；单测覆盖 `console.warn` 抛错和不可序列化输入两种情况 |

## 已定决定（D35，2026-09-29）

| 编号 | 问题 | 决定 |
| --- | --- | --- |
| W34-1 | 本机怎么复现 Neon 的 PG | (a2)：Docker `debian:bullseye` + libicu67 + gcc 10.2.1，源码编译 PG 16.15。(a1) `postgres:16.9-bullseye` 只作预检。已授权启动 Docker Desktop 和下载。不用 Neon 分支 |
| W34-2 | PG 是否卡小版本 | 按推荐：只认主版本 16 + 编码 + collversion（catalog = actual）+ provider + deterministic。附加 release notes 审阅和日志核对（见 review 处理） |
| W34-3 | Node 侧判定键 | 按推荐：`icu` + `unicode` + `collatorLocale`，不含 node patch；生产项按 `en-US` 登记；`cldr` 只进日志 |
| W34-4 | 新增字符有差异时是否接受 | 有条件接受。跟进：证明运行时没有混用 JS 排序与 PG 分页，且矩阵断言全过。联系人：路径绑定且双向切换测试全过（SC-03）。证明不了就 blocked，交用户决定 |
| W34-5 | 是否加入 ICU 77.1 | 按推荐：不加 |
| W34-6 | 本机怎么切 Node | 官方 dist + `SHASUMS256.txt` 校验，解压到临时目录，用完删除。已授权下载 |
| W34-7 | 上线后怎么确认 | 按推荐：W0020 Preview 部署后读日志确认 |

## 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 1 | 2026-09-29 | 按 D33 编制（`0b318402`） |
| 2 | 2026-09-29 | 按 D35 和 Codex 方案 review（3 条 P1、3 条 P2）修订：新增 SC-03，联系人路径绑定进游标，做不到则硬阻断；探针改为全码位对照生成的显式矩阵；补充 PG 小版本 release notes 审阅；153.14↔ICU 67 改为复现代理并要求溯源；日志改为 best-effort；原 SC-03 与 SC-05 合并为 SC-04，原 SC-04 与交接合并为 SC-05；开放问题清空 |
