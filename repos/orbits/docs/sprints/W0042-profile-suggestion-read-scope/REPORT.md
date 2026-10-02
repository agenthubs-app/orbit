# Sprint W0042 — 执行总结

> 本报告正文由 Generator（run-01）撰写；子代理写文件被环境拦截，由协调者按原文写入并提交。

改了哪些文件看 git diff，这里不逐文件复述。证据目录：`~/orbit-sprint-evidence/web/sprint-W0042/run-01/`（下称「证据目录」）。

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - 资料「更新建议」图在 Postgres 下不再整 workspace 读五个集合，只读本人相关的行。这条读取由 App 资料页、建议页、accept／dismiss、Web 资料编辑页、管理台共用。本机开发库单次读取：
    - 普通账号 `user_verify_plan`：从 9,534,477 B 降到 31,079 B（-99.67%）；
    - 新账号 `user_verify_new`：降到 1,013 B；
    - 本人数据很多的重账号 `user_orbit_primary_qa`：降到 7,316,011 B（-23.3%）。单次成本随本人数据量线性增长，见 SC-05。
  - 他人数据不再影响本人的读取量。在临时 workspace 里，由 10 个其他账号向五个集合各插 100 行（共 500 行），本人读取的字节、行数、语句数**完全不变**。改前同样条件下增加 451,400 B 和 500 行。
  - 读出的图与旧过滤逐项相等，包括行、顺序、`generatedAt`，以及坏数据下的成败。
  - 接口 JSON、写入的决定记录、handler 在读取异常时 reject，都与改前一致。本机 HTTP GET 改前改后除请求时间外相同。
- **仍未实现或未验证：**
  - 重账号情景下单次读取仍是 MB 级。按 D32 剩余额度，普通账号也只容得下每人每天约 0.02～0.1 次建议图读取（SC-05）。这是「图等价」方案（W42-1 A）的结构上限，后续选项见「交接」。
  - 生产频次（W42-9）未授权，没有连生产或 Vercel，所以 SC-05 仍是敏感度模型。
  - 「他人坏行让所有人建议接口失败」（W42-3）和间接共享（W42-10）都照旧保留，按决定不在本 Sprint 改。

## 运行记录

- 结果：completed。
- Generator：Claude Opus 5.5，2026-10-02。Planner revision 2（SHA256 `5ff6f666c1a8bab7d68d34de4d8068c2c2726c4bdd3bfcd0ff744ea726a22502`），run-01。
- 基线 `chat-agent` = `e493855d`；分支 `sprint/W0042-profile-suggestion-read-scope`。
- SHA：
  - 功能 `9a464f11`；
  - review 无修复提交；
  - 报告：本文件所在提交；
  - `chat-agent` 合并：见登记表。
- 档位 H。全量对照按 RULES §5.2，用「把本 Sprint 路径临时检出为 `chat-agent` 版本、移走新文件」代替 stash：
  - 基线 6,208 项，失败 9；
  - 改后 6,218 项，失败 9；
  - **新增失败 0**，与 W0041 基线的 9 项相同。
  - 证据：`full-baseline-failures.txt`、`full-after-failures.txt`、`full-new-failures.txt`。
- 付费 AI 调用 0 次；未 push；未部署；未连生产或 Preview。
- 与大目标 4 的重叠：开工时 HEAD = `e493855d`，W0043～W0055 的 PLANNER 都没有列出本 Sprint 修改的文件（grep 无命中）；没有大目标 4 Sprint 在跑。
- 活进程：本 run 启动的 3001 验收 server 已停止，无其他活进程。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0042-01 单次读取实测与噪声对照 | pass | 见下方「SC-01 证据」与测量表 |
| SC-W0042-02 新旧并跑：图逐项相等 | pass | 见下方「SC-02 证据」 |
| SC-W0042-03 接口与 App 行为不变 | pass | 见下方「SC-03 证据」 |
| SC-W0042-04 隔离与其他路径不回退 | pass | 见下方「SC-04 证据」 |
| SC-W0042-05 月预算表重算 | pass（报告项；按 W42-8 不以总账作通过条件） | 见「SC-05 预算」；f_max 低于 0.1 的档与重账号情景都登记为 D32 风险 |

### SC-01 证据
- (a) 改后每条图读取都带本人参数：
  - `wideGraphStatements` 改前 5、改后 0；
  - 读取器单测断言三条语句都带 workspace 与 actor。
- (b) 开发库四个账号，旧 JS 过滤与新路径选出的行按 `(collection, record_id)` 完全相同（`rowset-after.jsonl`）。
- (c) 噪声对照：
  - 改后字节／行／语句的增量为 0／0／0；改前为 +451,400 B／+500 行／0；
  - 删除后剩余 0 行；
  - 证明行显示 host=localhost、workspace=`workspace:w0042-noise-*`（`noise-before/after.jsonl`）。

### SC-02 证据
测试文件 `tests/services/profile-signal-graph-postgres.test.ts`：
- ① 边界矩阵 7 个 actor，加生成夹具（去平局后）：整图 deep-equal，选中行相同。
- ② 平局组：多重集、`generatedAt`、建议输出都相等。生成夹具原样（共享时间戳）时，多重集与 `generatedAt` 相等。
- ③ 坏数据 70 例（5 个集合 × 本人／他人 × 7 种形态）：逐例与旧路径同成败。旧路径结果分布：成功 40、TypeError 20、SyntaxError 10。SQL 失败时照旧抛出。
- ④ 读取器单测：原始记录保留两栏字段、`evidence_ids` 列和时间戳；非对象 payload 原样返回。
- RED 见 `red.txt`：读取器为空实现时 10 例失败 9 例。GREEN 见 `targeted.txt`。

### SC-03 证据
测试文件 `tests/api/profile-suggestions-postgres-parity.test.ts`，新旧两边用两个独立随机 schema、同一份快照：
- (a) list：
  - 4 个场景 × zh／ja／en，读图分支调用新读取器各 1 次；
  - failure 场景、缺 actor，调用 0 次；
  - 未配置时 provider 为 null，不可能调用。
- (b) accept／dismiss：
  - 首次决定、同 mutationId 重放、相反决定冲突、legacy mutationId、not-found，新读取器各调用 1 次；
  - 缺 actor 时 0 次；
  - 完整 JSON 与写入的决定记录相同。
- (c) handler：
  - 三个 handler 经 configured 路径，在读取异常（他人行 payload 是非法 JSON 字符串）时都 reject `SyntaxError`；
  - 结构化失败（not-found）的状态码与信封与旧 provider 相同；
  - 仓库没有能跑到 Next 运行时的集成测试手段，所以 **500 由 Next 运行时边界产生，handler 未改**。
- (d) 本机 3001 用 `user_verify_plan` 会话 GET（默认，以及 zh／ja／en）：
  - 改前改后只差 `suggestions[0].createdAt`（请求时间）；
  - server 连接上最后一条查询就是新读取器（`http-compare.txt`）。
- (e) 资料编辑页默认路径的三个建议字段（`firstSuggestion`、`reviewSummary`、`suggestionCount`），四个账号改前改后 diff 为空（`profile-vm-diff.txt`）；`app-home-profile-read-trim` 通过，首页仍 0 次。
- (f) 下列路径 `git diff chat-agent..HEAD` 为空（`sc03-zero-diff.txt`）：
  - `repos/orbit-app`
  - `shared/contract`、`shared/api-schema`、`shared/compute`、`shared/domain`
  - `app/api/profile`
  - `features/profile/live-signal-service.ts`

### SC-04 证据
- (a) A／B 隔离：
  - 矩阵测试断言 A 的选中行清单；
  - B 的图不含 A 的行；
  - 新旧路径一致。
- (b) 内存 store：
  - 不注入读取器时调用 6 次 `listRecords`（含 decisions）；
  - 注入读取器后，store 只读 decisions；
  - 既有 8 个内存用例不改断言即通过。
- (c) transactional provider：
  - 一次读图只有 4 条语句（3 轮读取加 decisions）；
  - observer spy 看到了每一条（`select`、未失败）；
  - 只用传入的 client。
- (d) 审计棘轮通过：
  - `profile-signal-live-record-provider.ts` 仍为 6。旧路径保留给内存 store，decisions 读取合并成一处。
  - 新文件 0 处。
- (e) 连读两次，语句数从 4 变为 8，没有缓存。
- (f) `saveSuggestionDecision`、advisory lock 与重试代码零改动，diff 只在读路径与新增导出。

### 测量（W0017 口径：每条语句返回行 JSON 字节之和，十进制）

warm-up 一次不计。改前见 `measure-before.jsonl`，改后见 `measure-after.jsonl`。不投影的对照见 `noproj-after.jsonl`：同一读取器把投影分支改为返回整个 payload 与 search_text。

| 账号 | 路径 | 改前 B／行／语句 | 改后 B／行／语句 | 降幅 | 改后不投影 B |
| --- | --- | --- | --- | --- | --- |
| `user_verify_new` | 建议服务（GET 的读取） | 9,534,477／5,681／6 | 1,013／1／4 | 99.99% | 1,209 |
| `user_verify_new` | 资料编辑页默认路径 | 9,535,781／5,683／8 | 2,317／3／6 | 99.98% | 2,513 |
| `user_verify_legacy` | 建议服务 | 9,534,477／5,681／6 | 25,219／21／4 | 99.74% | 33,592 |
| `user_verify_legacy` | 资料编辑页默认路径 | 9,535,929／5,683／8 | 26,671／23／6 | 99.72% | 35,044 |
| `user_verify_plan` | 建议服务 | 9,534,477／5,681／6 | **31,079**／26／4 | 99.67% | 41,483 |
| `user_verify_plan` | 资料编辑页默认路径 | 9,535,899／5,683／8 | **32,501**／28／6 | 99.66% | 42,905 |
| `user_orbit_primary_qa` | 建议服务 | 9,534,477／5,681／6 | **7,316,011**／5,557／4 | 23.27% | 9,338,410 |
| `user_orbit_primary_qa` | 资料编辑页默认路径 | 9,536,610／5,683／8 | 7,318,144／5,559／6 | 23.26% | 9,340,543 |

- **accept／dismiss 的读取部分**：
  - 在临时 workspace `workspace:w0042-dec-*` 测。生成夹具 8,085 行，actor 拥有其中绝大部分；测完删除后剩余 0 行。
  - accept：8,604,427 → 6,648,949 B（语句 11 → 9）；
  - dismiss：8,605,642 → 6,650,164 B（`decisions-before/after.jsonl`）。
  - 夹具账号属于「本人数据多」的形态，降幅与 QA 账号同量级。
- **语句数**：每次读图 3 条读取语句加 1 条 decisions，原来是 6 条。第 1 轮与 decisions 并行。
- **`EXPLAIN (ANALYZE, BUFFERS)`**（`explain.txt`，只作报告）：

  | 账号 | 三轮耗时（ms） | 返回行 | 过滤掉的行 |
  | --- | --- | --- | --- |
  | `user_verify_plan` | 3.9／1.2／5.2 | 6／5／15 | 491／645／4,527 |
  | `user_orbit_primary_qa` | 7.5／6.1／33.2 | 463／611／4,483 | — |

  - 本机开发库的计划用了一个**不在仓库迁移里**的索引 `orbit_records_actor_collection_idx (workspace_id, collection_name, user_id)`。
  - 生产按 W42-5 不加索引，计划会落在现有的 `(workspace_id, collection_name, …)` 索引上逐行过滤，只影响库内计算，不影响返回字节。

### 本机统计（W42-10 安全复核登记与非对象 payload）

- **间接共享**：四个账号都是 **0 行**（`rowset-after.jsonl` 的 `indirect`）。统计范围是他人拥有、经本人 connection 引用进入本人图的联系人，以及连带的他人 evidence 和 memory。
  - 规则按 W42-10 保持等价，**登记为后续安全复核项**：他人的联系人只要 id 被本人 connection 的 `contactId` 引用，就会进入本人的建议图，显示名可能出现在建议摘录里。
  - 收紧会改变用户可见行为，需要用户授权。
- **非对象 payload 行**：开发库五个集合都是 **0 行**。

## SC-05 预算

口径：D39 1.6 GB；1 MB = 1,000,000 B；人群为 1000 位活跃用户 × 30 天。f = 每人每天读建议图的次数，包括 App 资料页、App 建议页、每次 accept／dismiss、Web 资料编辑页、管理台。

**① 开工时总账**（D32，W0041 后，未含建议图读取这一行）：

| 档位 | 总账 去重／直接相加 MB | 剩余 去重／直接相加 MB |
| --- | --- | --- |
| 10% | 1,508.14／1,522.64 | 91.86／77.36 |
| 20% | 1,567.99／1,582.49 | 32.01／17.51 |
| 100% | 2,046.74／2,061.24 | 已超 446.74／461.24 |

**情景一：普通账号**（单次 = `user_verify_plan` 改后 31,079 B；f=1 时每月 932.37 MB）

| f | ② 新增行：建议图月流量 MB | 10% 档总账 去重／直接相加 | 20% 档总账 去重／直接相加 | 100% 档总账 去重／直接相加 | ③ 被消除的项（改前 9,534,477 B，同 f）MB |
| --- | --- | --- | --- | --- | --- |
| 0.05 | 46.62 | 1,554.8／1,569.3 | 1,614.6／1,629.1 | 2,093.4／2,107.9 | 14,301.72 |
| 0.1 | 93.24 | 1,601.4／1,615.9 | 1,661.2／1,675.7 | 2,140.0／2,154.5 | 28,603.43 |
| 0.25 | 233.09 | 1,741.2／1,755.7 | 1,801.1／1,815.6 | 2,279.8／2,294.3 | 71,508.58 |
| 0.5 | 466.19 | 1,974.3／1,988.8 | 2,034.2／2,048.7 | 2,512.9／2,527.4 | 143,017.15 |
| 1 | 932.37 | 2,440.5／2,455.0 | 2,500.4／2,514.9 | 2,979.1／2,993.6 | 286,034.31 |
| 4 | 3,729.48 | 5,237.6／5,252.1 | 5,297.5／5,312.0 | 5,776.2／5,790.7 | 1,144,137.24 |

④ f_max = 剩余额度 ÷（30,000 × 单次）：

| 档位 | f_max 去重 | f_max 直接相加 |
| --- | --- | --- |
| 10% | **0.0985** | **0.0830** |
| 20% | **0.0343** | **0.0188** |
| 100% | **0**，开工基线已超 446.74 MB | **0**，开工基线已超 461.24 MB |

规划估算是 0.0987／0.0831／0.0344／0.0188，实测一致。

**情景二：全员都是重账号**（压力上界；单次 = `user_orbit_primary_qa` 改后 7,316,011 B；f=1 时每月 219,480.33 MB；与情景一是替代关系，不相加）

| f | ② 新增行 MB | 10% 档总账 去重／直接相加 | 20% 档总账 去重／直接相加 | 100% 档总账 去重／直接相加 |
| --- | --- | --- | --- | --- |
| 0.05 | 10,974.02 | 12,482.2／12,496.7 | 12,542.0／12,556.5 | 13,020.8／13,035.3 |
| 0.1 | 21,948.03 | 23,456.2／23,470.7 | 23,516.0／23,530.5 | 23,994.8／24,009.3 |
| 0.25 | 54,870.08 | 56,378.2／56,392.7 | 56,438.1／56,452.6 | 56,916.8／56,931.3 |
| 0.5 | 109,740.16 | 111,248.3／111,262.8 | 111,308.2／111,322.7 | 111,786.9／111,801.4 |
| 1 | 219,480.33 | 220,988.5／221,003.0 | 221,048.3／221,062.8 | 221,527.1／221,541.6 |
| 4 | 877,921.32 | 879,429.5／879,444.0 | 879,489.3／879,503.8 | 879,968.1／879,982.6 |

④ f_max：

| 档位 | f_max 去重 | f_max 直接相加 |
| --- | --- | --- |
| 10% | 0.00042 | 0.00035 |
| 20% | 0.00015 | 0.00008 |
| 100% | 0 | 0 |

- **③ 敏感度变化**：W0040 时单次读整个 workspace 的五个集合，随 workspace 总人数 N 增长，总流量 ∝ N²。改后单次**与 N 无关，与本人数据量线性**，噪声对照的增量为 0 即是证据。
- **⑤ 资料编辑页默认路径改后单次**：

  | 账号 | 单次 B |
  | --- | --- |
  | `user_verify_plan` | 32,501（其中建议图 31,079） |
  | `user_verify_new` | 2,317 |
  | `user_orbit_primary_qa` | 7,318,144 |

- **判定（W42-8）**：不以总账 ≤ 1.6 GB 作通过条件。
  - 普通账号情景：10% 档和 20% 档的 f_max 都低于 0.1 次／人／天；
  - 重账号情景：各档 f_max ≤ 0.0005。
  - 以上**全部登记为 D32 风险**。
  - 生产只有一个共享 workspace，数据量远小于本机（规划估算整图约 276 KB／次）。真实的 f 需要按 W42-9 经授权观测后回填。

## 已知且接受的差异

- **平局顺序。**
  - 排序键（`coalesce(occurred_at, updated_at)`、`updated_at`）完全相同的行，旧读取（整集合排序）和新读取（候选子集排序）的相对顺序可能不同。旧读取在平局时的顺序本来就不确定。
  - 本机生成夹具（共享时间戳）就出现了这种情况：业务相关度同为 89 的两条 connection 平局，新旧选中的「最强 connection」不同，建议的来源摘录随之不同。多重集、`generatedAt`，以及建议的种类、字段、置信度都相同。
  - 测试处理：平局组按多重集比较；非平局组与接口级比对先把时间戳去平局，再做 deep-equal。
  - 开发库四个账号的 HTTP 响应与资料页三个建议字段，改前改后相同。
- **多个坏行并存时先抛哪个错误。**
  - 新路径分三轮读，每轮之后做部分判定；旧路径先全部读完再判定。
  - 所以多个坏行并存时，先抛出的错误可能不同，例如一个 SyntaxError 与一个 TypeError 并存。
  - 单个坏行时，成败与错误完全相同，70 例逐例证明。

## 假设与额外阅读

- **上下文包之外读的文件**（调用方先用 GitNexus 查）：
  - `shared/storage/migrations.ts`：payload 非空、现有索引；
  - `shared/storage/postgres-read-metrics.ts`：observer 对每条语句都触发，按首个关键字判定 `select`；
  - `shared/storage/live-database-config.ts` 与 `shared/services/module-mode.ts`：handler 测试走 configured 路径需要的 env；
  - `features/profile/service-factory.ts`；
  - `app/(app)/app/profile/.../profile-route-view-model.ts` 的建议字段（SC-03 (e)）；
  - `scripts/verify-server.sh`、`verify-session-cookie.ts`：HTTP 比对；
  - `tests/audits/unbounded-list-reads.test.ts`；
  - `seed-generated-fixtures.ts` 的签名。
- **GitNexus**（输出在 `impact-*.txt`、`detect-changes-feature.txt`）：
  - 开工时跑了 `analyze --index-only --force`，共 144,036 节点。
  - upstream impact：
    - `createStorageProfileSignalProvider`：LOW，direct 2；
    - `createTransactionalStorageProfileSignalProvider`：LOW，direct 1；
    - `createConfiguredStorageProfileSignalProvider`：LOW，direct 1；
    - `readSignalGraph`：报 `UNKNOWN`（2 个同名符号、0 调用方）。文本搜索复核，调用点只有 `live-signal-service.ts` 第 585、648、720 行三处，与 PLANNER 一致。
  - detect-changes（staged）：4 个文件，风险 low，0 个流程。
- **新读取器的结构**：
  - 文件：`features/profile/storage/profile-signal-graph-postgres-reader.ts`，入口 `createPostgresProfileSignalGraphRecordReader`。
  - 注入点：`StorageProfileSignalProviderOptions.graphRecordReader`。只在 `createTransactionalStorageProfileSignalProvider` 里用传入的 `client` 注入，configured provider 经它继承。
  - 两栏字段表：`PROFILE_SIGNAL_PAYLOAD_FIELDS`，放在 provider 文件解析器的正上方。
  - 共用组装纯函数：`buildProfileSignalGraph`。选择逻辑拆为 `actorConnectionReferences`、`selectActorRecordsBeforeEvidence`、`selectActorEvidenceRecords`、`selectActorSignalRecords`，判定谓词原样保留。
  - 各轮语句数：1／1／1。第 1 轮与 decisions 并行，合计 4 条。
- **循环 import**：读取器与 provider 互相 import。读取器只在调用时读 provider 的常量（`collectionName()`），模块求值时不碰，所以任一方先加载都可用。
- **夹具去平局**：生成夹具的时间戳相同（平局）。SC-02 ① 与 SC-03 用夹具时，先在两侧做同样的去平局：按 `(collection_name, record_id)` 给每行加 n 毫秒。原样夹具放在 ② 平局组。
- **测试连接**：
  - `ORBIT_EVENT_DATABASE_URL=postgresql://li@localhost:5432/orbit_test`，`assert-local-test-databases.mjs` 通过；
  - 两个新测试文件开头断言 host 是 localhost；
  - 定向集 101 项，0 skip（`targeted.txt`）；
  - 全量对照时没有设该变量，新 PG 用例在全量里按既有约定 skip，与其他 PG 测试一致。
- **测量**：
  - 用 `node --env-file=.env.local`，连开发库 `orbit_newui_events_20260922`；probe 断言 host 为 localhost；没有 source `.env`。
  - 噪声、accept、dismiss 都在临时 workspace 里测，结束后剩余 0 行。
- **`tsc`**：只有 `.next/types/validator.ts` 的 8 个既有错误，源码没有新错误（`tsc.txt`）。

## review 处理（H 档，Codex `gpt-5.6-sol` 一次，全文 `codex-review.txt`）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 无（0 条）。Codex 结论：读取器保持了原有的选择、解析、排序与错误语义，非 Postgres 存储仍走原路径 | — | 无需修改。Codex 自己运行时 PG 用例因为没有配置数据库 URL 而 skip，这些用例本 run 已在本机 `orbit_test` 跑过、0 skip |

## 交接

- **分支与目标**：分支 `sprint/W0042-profile-suggestion-read-scope`，功能 SHA `9a464f11`，最终 SHA 为报告提交，合并到 `chat-agent`。
- **大目标 4 后跑方需要重跑的测试**：
  - 文件：
    - `tests/services/profile-signal-graph-postgres.test.ts`
    - `tests/api/profile-suggestions-postgres-parity.test.ts`
  - 两个文件都要把 `ORBIT_EVENT_DATABASE_URL` 指到本机 `orbit_test`，否则会 skip。
  - 触发条件（结构判据），改了以下任一项就要重跑：
    - profiles、contacts、connections、interactionMemories、evidence 的写入、seed、迁移；
    - 这些集合里 `user_id`、`payload.accountId`、`payload.id`、`contactId`、`connectionId`、`evidenceIds`／`evidence_ids` 的写法；
    - `shared/storage/postgres-live-record-store.ts`。
- **字段表约束**：解析器新读一个 payload 字段时，**必须同时加进 `PROFILE_SIGNAL_PAYLOAD_FIELDS`**，否则 Postgres 路径会丢掉这个字段（并跑测试会抓到）。W0046 若给 contacts payload 加 `enrichment.fields`，只要建议解析器不读它，投影就会自动丢弃，不会增加本读取的字节。
- **f_max 偏紧时的后续选项（按推荐顺序）**：
  1. W42-7：Web 资料编辑页传 W0040 的 `skip`。用户看不到变化，L 档。
  2. W42-1 B：建议只读所需的行（top-1 connection／memory、3 条 evidence）。单次与本人数据量无关，同时能解决重账号情景。
  3. App 端缓存：资料页、建议页打开时不必每次 `network-only`。
  4. W42-3 故障面修复：他人坏行让所有人 500，需要用户授权。
- **需要用户决定或授权**：
  - W42-9 生产只读观测（Vercel 请求计数、`ORBIT_PG_READ_METRICS`），用来回填真实的 f；
  - W42-10 间接共享收紧（会改变用户可见行为）；
  - W42-3 坏数据故障面。
- **回退**：`git revert` 功能提交，即回到整 workspace 读取。这是只读路径，没有迁移，也没有数据变化。
