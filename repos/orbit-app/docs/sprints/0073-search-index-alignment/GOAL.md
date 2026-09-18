# Sprint 0073 — 搜索路径索引对齐

## 要实现什么

联系人搜索和通用记录搜索走的是 `search_text ilike '%词%'`——对 Postgres 来说这是把整个集合逐行读出来过滤，
而库里那个 `to_tsvector('simple', search_text)` 的 GIN 索引从来没有任何查询用过。本 Sprint 启用 `pg_trgm`，
给 `search_text` 建三元组 GIN 索引，让同一条 `ilike` 直接走索引；删掉那个没人用的索引。
**不改任何查询语句，不改任何搜索语义**：Web 端"NFKC + 分词 + 别名"的自然搜索和 contacts API 的子串过滤两套契约原样保留。

## 做完能看到什么

- 同一批中文／英文查询词，改前改后结果集逐条一致（这是断言，不是承诺）。
- `EXPLAIN` 上 3 字及以上的查询显示 `Bitmap Index Scan on orbit_records_search_text_trgm_idx`，而不是 `Seq Scan … Filter`。
- 2 字的中文查询（如"佐藤"）三元组不够、仍走过滤——如实记录，不假装它也快了。
- 本机 dev 库跑一次标准迁移脚本后，Simulator／phoneweb 的联系人搜索行为不变。

## 怎么验收

本机 Postgres：迁移前后同一 schema 上跑同一批查询逐条对比；EXPLAIN 断言；旧索引已删；
orbits 全量对照（schema SQL 变了，所有 PG 测试都会重跑它）；Simulator + phoneweb 各做一次联系人搜索。
不连云端：生产库需在部署时用 `scripts/migrate-live-records.ts` 显式跑一次迁移（Neon 支持 `pg_trgm`），本 Sprint 只记录不执行。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
