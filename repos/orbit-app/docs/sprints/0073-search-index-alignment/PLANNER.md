# Sprint 0073 — 搜索路径索引对齐

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase B 第三项（0073），设计案标注"需确认：改搜索实现是产品行为变化"。
**单一目标:** `ilike '%x%'` 搜索走三元组索引而非全集合过滤，且结果集逐条不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `26423d9b9`（0072 completed）。
**进入条件:** 0070 completed（EXPLAIN／索引断言的测试形状）。只用本机 Postgres，不连云端，不部署。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| `ilike` 使用点 | 仅 2 处：`postgres-live-record-store.ts:241`（`listRecords.searchText`）、`contact-live-record-provider.ts:667`（联系人分页 reader，另有 `:684` 的 `displayName ilike` 只用于排序） |
| 全文索引 | `orbit_records_search_text_idx` = `gin (to_tsvector('simple', search_text))`；产品源码 **0 处** `@@`／`to_tsvector` 查询——从未被使用 |
| `pg_trgm` | 本机 PG 18 可用（1.6，未安装）；PG 13+ 为 trusted extension，库 owner 可建；Neon 支持 |
| 规模（dev 库） | 9 091 行，`search_text` 均 357 B、合计 3.2 MB；旧索引 6.4 MB |
| 三元组限制 | LIKE 模式不足 3 个字符不产生三元组，索引不可用，规划器回退过滤（结果仍正确）。中文 2 字姓名查询属此类 |
| 两套搜索契约 | Web 自然搜索（`features/search/*`，NFKC + 分词 + 别名）在应用层做归一化后才下 SQL；contacts API 子串过滤在 reader。**本 Sprint 都不碰** |

**判断：只加索引，不改一行查询。** "结果逐条一致"由此在构造上成立，测试把它变成断言。设计案的"需确认"因此不触发语义变化；若执行中发现必须改查询才能走索引，停下来汇报，不自行改语义。
**判断：`create extension` 失败就让迁移失败。** 不吞错误——生产迁移由部署时显式执行，失败必须可见。

## 范围与文件

- 修改（orbits）：`shared/storage/migrations.ts`（`create extension if not exists pg_trgm`；`orbit_records_search_text_trgm_idx` = `gin (search_text gin_trgm_ops)`；`drop index if exists orbit_records_search_text_idx`）。
- 修改（测试）：`tests/services/live-record-storage.test.ts:160` 的索引名断言改为新索引 + 旧索引 drop。
- 新建（测试）：`tests/services/search-index-trgm-postgres.test.ts`。
- 本机 dev 库：`npx tsx scripts/migrate-live-records.ts`（标准迁移路径）后做运行时确认。
- 排除：任何查询改写；Web 搜索归一化；相似度搜索（`similarity()`）；云端迁移执行；部署。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0073-01 | **结果逐条一致**：同一 schema 播种 ≥40 条中英混合联系人 + 其他集合噪声，一批 ≥12 个查询词（含 2 字中文、3 字中文、英文、大小写混合、带空格）分别经 `listRecords({searchText})` 与联系人分页 reader，在**仅基础 schema**与**应用 trgm 迁移后**的结果 `deepEqual` | `search-index-trgm-postgres.test.ts` |
| SC-0073-02 | **走索引**：`enable_seqscan=off` 下 ≥3 字查询的 EXPLAIN 含 `orbit_records_search_text_trgm_idx`；旧索引 `orbit_records_search_text_idx` 迁移后不存在；`pg_trgm` 已安装 | 同上 |
| SC-0073-03 | **限制如实**：2 字中文查询的 EXPLAIN 不含 trgm 索引（记录为已知限制，不做假断言） | 同上（用 `assert.doesNotMatch` 固定，防止将来误以为覆盖） |
| SC-0073-04 | **迁移幂等且不破坏既有断言**：`ORBIT_RECORDS_SCHEMA_SQL` 连跑两次不报错；`live-record-storage.test.ts` 更新后绿；orbits 全量与 0072 收口对照零新增失败 | 命令与摘要 |
| SC-0073-05 | **运行时**：dev 库经标准迁移脚本建索引；`EXPLAIN` 真实联系人搜索走索引；Simulator 与 phoneweb 联系人搜索 3 字词结果非空、与迁移前一致 | 截图／页面结果／EXPLAIN 输出 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. RED：`search-index-trgm-postgres.test.ts`（trgm 索引不存在，SC-02 必红）。
3. 改 `migrations.ts` → GREEN；更新 `live-record-storage.test.ts`。
4. orbits 全量 + typecheck（App 零改动，只 typecheck）。
5. dev 库跑迁移脚本；EXPLAIN；Simulator + phoneweb 搜索。
6. 路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` → REPORT、登记表。

## 最小测试与检查

- 档位：**M**（schema SQL 变更影响所有 PG 测试；无查询语义变化）。收口跑 orbits 全量一次。
- 开发定向集：新测试 + `live-record-storage.test.ts` + `postgres-live-record-storage.test.ts` + `contact-search-pagination.test.ts` + `relationship-natural-search-live-store.test.ts`。

## 失败与交接

若本机无法安装 `pg_trgm`（权限），标 blocked，不得改用 `LIKE` 重写或去掉索引假装通过。
若任一查询词结果不一致，停下：那意味着操作符语义变了，不是索引问题。报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
