# Sprint 0102 执行报告：看板缺口和机会，数据没变就不重算（看板 D2）

**run-01**。Generator 为子代理，报告由协调者代存。分支 `sprint/0102-dashboard-snapshots`，未推送。
**状态：completed。** 有一个生产前提需要用户决定：生产库要有 `sync_revision` 列，快照才会生效，见第 3 节第 1 条。

## 1. 结论

- **数据没变时**：缺口、机会、联系人分析不再读整张关系图。版本号和已存的快照在同一条小查询里一起取回。缺口和机会的计算代码没有改，只是计算次数少了。
- **数据变了时**：6 类数据（联系人、关系、联系人详情状态、活动、来源记录、待办）中任意一行新增、修改或软删除后，下一次打开会重新计算，并写回快照。
- **快照存放**：放在万能表的新类别 `dashboard_snapshots`，每个用户一行，写明主人。
- **从联系人分析问 AI**：
  - 版本对不上：只执行一条查询，返回原有的 409「数据已更新，请刷新后再问」。
  - 版本对得上：给模型的资料来自 0101 的 SQL 结果加上快照，不读整张图。
- **读取上限棘轮**：减 6，171 → 165。看板那 6 处不设上限的读取已删除。

**本地生产构建上的小票**（同一个演示账号；改后一栏是数据没变的情况）：

| 路由 | 改前 | 改后 |
|---|---|---|
| GET /api/dashboard/network-gaps | 345 行 / 282,349 B | 5 行 / 12,140 B |
| GET /api/dashboard/opportunities | 345 行 / 282,349 B | 5 行 / 12,140 B |
| GET /api/mobile/contacts-dashboard | 459 行 / 390,286 B | 119 行 / 120,077 B |
| AI 联系人分析入口，版本不符 | 32 查询 / 396,620 B | 19 查询 / 18,474 B |
| GET /api/dashboard | 9,930 B | 不变 |

数据刚改过后第一次打开会重算一次，读约 516KB，之后回到上表的数字。

读取成本账本 `contacts.dashboard` 链：5,523 行 / 3,911,181 B → 456 行 / 357,627 B。剩下的约 300KB 是 0101 留下的按编号读联系人、关系、来源。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 数据不变不读整图；「看板」账本 ≤ 20KB | 通过 | `dashboard` 链 6,660 B。开启逐条计量后，所有路由加上一次成功的 AI 提问里，整图查询的指纹出现次数为 0 |
| 02 任意改动后会重算 | 通过 | 6 类 × 新增/修改/软删除共 18 种组合；另有一条测试覆盖提交顺序颠倒的情况 |
| 03 A/B 隔离 | 通过 | B 写入不影响 A 的版本；伪造的快照行（编号属于 A、主人是 B）既不会返回给 A，也不会被 A 的写入覆盖；B 拿 A 的版本号去问 AI 会被拒绝 |
| 04 AI 入口 | 通过 | 服务层真库测试；原有路由测试；真实 HTTP：版本不符返回 409，新版本返回 200 并得到完整报告 |
| 05 快照与现算一致、棘轮 −6、全量、typecheck、phoneweb | 通过 | 快照在两个将来的时间点仍与现算结果一致。Simulator 没有跑，因为 App 代码没有改动 |

**变异检查**：9 项有效变异全部让测试变红，例如版本号不计流水号之和、读快照时不看主人、AI 入口跳过预检。另有 2 项无效变异，已如实记录。

## 3. 需要用户知道的

1. **（最重要）生产库可能没有 `sync_revision` 列。** 这一列来自同步功能的迁移 `features/sync/migrations.ts`，没有接进任何自动迁移脚本。本机 `orbit_events` 上有这一列，用的是 0069 手工放宽过的触发器，不要求写锁。正式的同步迁移会强制要求写锁，而现有的写入代码并不取这个锁。所以直接在生产上执行正式同步迁移，会让待办写入失败。
   - 没有这一列时，代码会自动退回整图计算：结果正确，只是读得多，日志会出现 `dashboard_graph_version_unavailable`。
   - **需要用户决定**：生产环境用什么方式得到 `sync_revision`。这件事还影响「断网也能用」：同步本身就依赖这一列。
2. **版本号的算法**：不只看最大流水号，还同时看行数和流水号之和。只看最大值，会漏掉「先领号、后提交」的修改和硬删除，有变异检查证明这一点。
3. **索引是新建的**：`orbit_records_graph_version_idx`，只覆盖这 6 类数据。原来的同步索引没有扩展，因为那会拖慢同步分页。改前改后的 EXPLAIN 显示同步查询仍走 `sync_actor_idx`。迁移命令是 `npm run db:migrate:dashboard-graph-version`，库里没有 `sync_revision` 列时会拒绝执行。
4. **快照只存与时间无关的部分**：到期标签和行动建议每次请求时按当前时间生成。以后改了缺口或机会的规则，要把 `DASHBOARD_SNAPSHOT_SCHEMA_VERSION` 加一。
5. **页面版本号的格式没变**：仍是 64 位十六进制，现在是关系图版本的 sha256，App 不用改。已有的 AI 报告会显示一次「需要更新」。修改个人资料不会让版本号变化，这是有意的取舍。
6. **AI 入口版本不符时读取约 16.7KB**，而不是设计估算的 100 字节。原因是版本号和快照合成了一条语句，这样联系人分析页的查询数才不超过账本上限（分开写是 14 条，上限 13 条）。
7. **GET 请求现在会写库**：快照缺失或过期时写一行。写入失败只记一条警告，照常返回结果。

## 4. 提交与文件

- `9bb4e5552` feat(orbits): dashboard gaps/opportunities snapshots keyed by relationship-graph version (0102 D2)
- `a8e118c19` fix(orbits): keep the graph version out of the contacts-analysis model input (0102)

这次提交保证给模型的资料和改前完全一样，属于 Planner 文件表之外的必要补充。

- **新增**：
  - `features/dashboard/storage/dashboard-snapshot.ts`
  - `scripts/migrate-dashboard-graph-version.ts`
  - `tests/services/dashboard-snapshot-postgres.test.ts`
  - `tests/support/` 下的两个测试辅助文件
- **修改**：
  - 看板的 provider：只走 SQL，删除不设上限读取的分支
  - 缺口和机会的 service：拆成「核心计算 + 渲染」两部分
  - `contacts-dashboard-service`
  - AI 路由与 `contacts-analysis-execution`
  - `features/sync/migrations.ts`：新增索引 SQL
  - `package.json`
  - 账本和棘轮的基线
  - 6 个原先用内存存储的测试，改用测试替身

## 5. 子代理执行的测试

- 7 条新增真库测试加 1 条单测，都先看到失败再改到通过。
- orbits 全量：5153 条，34 条失败。和已知清单对照，只多出 `contacts.recommend`，这是已知的不稳定用例，单独跑 3 次都是 25/25 通过。
- App 全量：3597 条，1 条失败（route-parity）。
- Postgres 相关测试 29 条：28 通过，另 1 条跳过；跳过的那条是既有的，需要另一个库地址才会运行。B3 对照 5/5 通过。
- typecheck：三处都是 0 错误。

## 6. 运行时证据

证据目录：`build/harness-state/evidence/sprint-0102/run-01/`。

- 改前改后四个 GET 的响应，去掉时间字段后完全相同，只有 `sourceDataVersion` 按预期变化。
- phoneweb（390 宽）：改前改后页面文字相同。新建一条待办后，联系人分析显示「需要更新」。
- AI 提问：用新版本提问，第三次返回 200。前两次是 DeepSeek 在 20 秒内没返回导致超时，和本 Sprint 无关。用旧版本提问返回 409。
- 测试中新建的待办和会话都已通过 API 删除。

## 7. 费用（付费账本）

子代理调用付费模型 5 次（DeepSeek，其中 3 次是完整报告请求，2 次超时）。按每次最多 $0.002 保守登记，共 **$0.010**。账本从 $0.032249 记到 **$0.042249 / $5**（登记在 README 本行）。

## 8. 上线步骤

1. 确认生产 `orbit_records` 有没有 `sync_revision` 列：
   - 有：执行 `npm run db:migrate:dashboard-graph-version`（大表上建议手工改成 `create index concurrently`）。
   - 没有：等用户决定用什么方式补上。在那之前行为和改前一样。
2. 0101 的前提仍然成立：Neon 要有 `und-x-icu`。

## 9. 遗留

1. 生产环境 `sync_revision` 的来源（第 3 节第 1 条）。
2. 联系人分析剩下约 300KB 按编号读取的量。
3. 完整联系人分析报告常常超过 DeepSeek 的 20 秒超时。
4. **AI 提问成功后，有一条查询执行了 3 次，每次约 535 行、720KB（指纹 `7fabfcb2…`），而且随消息条数增长。** 很可能就是会话消息的不设上限读取，也就是 AI 方案 B1 要解决的问题，交给 0109。
5. 设计案中「联系人分析」「从联系人分析问 AI」两条账本链还没加，因为现有的小票测试要求每条链都对应一个 GET 路由。

## 10. 协调者复核

- Postgres 测试（`ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost:5432/orbit_test`）：快照、0101 对照、账本基线共 11 条，全部通过。
- orbits 全量：5153 条，4713 通过，34 失败，406 跳过。和已知清单对照，只多出 Gemini 实时测试，这条已登记为不稳定用例；单独跑 2 次都是 43/43 通过。
- App 全量：3597 条，1 条失败（route-parity）。
- diff 审查：没有新增 skip 或 only；棘轮基线只删掉了看板那一行（6 处）。
