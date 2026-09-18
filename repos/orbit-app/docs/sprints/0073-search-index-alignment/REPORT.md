# Sprint 0073 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256
`9d4f24ac04d3a442aa126d922091dc62ed8fc24155c644a98fdc77b97772e5a2`。

## 先用人话说

联系人／记录的子串搜索（`search_text ilike '%词%'`）现在有三元组索引可走；库里那个从未被任何查询用过的
`to_tsvector` 索引删了。**没有改一行查询、没有改任何搜索语义**：同一批 14 个中英查询词，迁移前后两条读路径的结果
逐条相等，这是测试断言。dev 库经标准迁移脚本建索引后，真实联系人 3 字搜索在默认规划器设置下已是
`BitmapAnd(private_owner_idx, search_text_trgm_idx)`。

设计案上"需确认：改搜索实现是产品行为变化"——本 Sprint 没有触发这个确认点，因为实现路径变了、行为一字未变。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `26423d9b9`；登记后 `d0c70e912` |
| 功能提交 | `aeb479247` feat(sprint-0073) |
| 合并 | `cbe229437` merge(sprint-0073)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0073-01 结果逐条一致 | pass | `search-index-trgm-postgres.test.ts`：24 位中日英联系人 + 24 条关系 + 40 条笔记噪声；14 个查询词（2 字／3 字中文、英文大小写、带空格、不存在的词）经 `listRecords({searchText})` 与联系人分页 reader，仅基础 schema 与应用迁移后 `deepEqual` |
| SC-0073-02 走索引 | pass | 同上：`enable_seqscan=off` 下 "佐藤健"／"cloud" 的 EXPLAIN 命中 `orbit_records_search_text_trgm_idx`；旧索引不存在；`pg_extension` 有 `pg_trgm` |
| SC-0073-03 限制如实 | pass（**事实修正**） | PLANNER 原写"2 字查询 EXPLAIN 不含 trgm 索引"。实测：2 字模式产生不了三元组，但规划器在禁 seqscan 时仍会用索引做**全索引扫描**（估价 10 589 vs 3 字的 23）。断言改为"2 字查询成本 >10× 3 字查询"，同样固定了"2 字没被加速"这个事实；dev 库默认设置下 2 字词实际走 `Index Scan … Filter`（不用 trgm） |
| SC-0073-04 迁移幂等、既有断言 | pass | 同一 schema 连跑两次 `ORBIT_RECORDS_SCHEMA_SQL` 不报错；`live-record-storage.test.ts` 索引断言更新后绿；并发定向集 9 文件 24/25（唯一失败 `live database config prefers event-specific URL` 属基线既有）；orbits 全量 4221 / 3981 / 85，失败集合与 0072 收口**零新增**（第一次全量多出 1 项 `trace contacts.recommend…`，单跑 25/25 ×2、重跑全量未现，判定波动）；两端 typecheck 0 |
| SC-0073-05 运行时 | pass | dev 库 `npx tsx scripts/migrate-live-records.ts` 成功，索引 6 000 kB、扩展在 public；真实 3 字搜索 EXPLAIN 走 BitmapAnd；phoneweb 联系人搜索 "云端机" 1 位、"餐饮" 33 行、"佐藤" 6 行，请求 `/api/contacts?query=…` 200；Simulator 输入 "Orbit"（idb 无法输入中文）→ "没有匹配的人脉"，与 phoneweb 同词结果一致 |

## 执行中修掉的两个真问题（都在迁移 SQL 里）

1. **并发 `create extension if not exists` 不原子**：多个测试文件同时跑 schema SQL 时报 `duplicate key … pg_extension_name_index`。改为 do-block 捕获 `unique_violation`。
2. **扩展装错 schema**：会话 `search_path` 是私有 schema 时，`create extension` 把 pg_trgm 装进那个 schema，别的会话找不到 `gin_trgm_ops`（`42704`）。改为 `with schema public` + 索引里 `public.gin_trgm_ops` 限定 + 存在于别处时 `alter extension … set schema public` 自愈。

## 顺带发现（不在本 Sprint 修）

1. App 的 `/api/contacts?query=…` 不带 `limit` 时不走分页 reader，而是整图读回内存再按姓名／机构过滤——三元组索引对这条链暂时无用；0074／0076 让 App 传 `limit` 后即受益。search_text 里含 id 令牌（如 "orbit"），与姓名／机构过滤语义不同，是两套契约的既有差异，未改。
2. 生产（Neon）尚未建索引：部署时须显式跑一次 `scripts/migrate-live-records.ts`；Neon 支持 pg_trgm，脚本已能自愈 schema 位置。

## 未提交、影响与下一步

- 未提交：`repos/orbits/next-env.d.ts` 等用户既有改动，全程未暂存。
- `detect_changes`（staged）：3 符号 / 3 文件 / 0 流程 / LOW。
- 回退方式：`git revert -m 1 cbe229437`；dev 库回退需手动 `drop index orbit_records_search_text_trgm_idx`（旧索引可由旧版 schema SQL 重建）。
- 运行环境：本机 Postgres `orbit_sprint0067_test`（随机 schema）与 dev 库 `orbit_events`（已迁移）；未连云端、未部署。
- 预算：无 AI/OCR 调用。
- 下一步：**0074 连接池、超时与成本熔断**。
