# Sprint 0071 — 读取预算护栏：LIMIT 下推与列投影扩面

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase B 首项（0071）。
**单一目标:** `listRecords` 不再有"默认无上限"——上限成为必填、可数、只降不升的事实；并用 0070 的尺子验收第一条真实投影优化。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `4507b3e66`（0070 completed）。
**进入条件:** 0070 completed（账本与三层拓扑测试是本 Sprint 的验收尺）。只用本机 Postgres，不连云端，不部署。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| `listRecords` 调用点 | **176 处 / 77 文件**（非测试），**0 处**传过上限；`LiveRecordListQuery` 无 `limit` 字段，Postgres `listQuery()` 从不生成 `LIMIT` |
| 已有投影能力 | `payloadFields`（jsonb 键投影）与 `omitSearchText` 在 Postgres 与内存实现都已支持 |
| 实现者 | `postgres-live-record-store.ts`、`live-record-store.ts`（`createMemoryLiveRecordStore`）、`configured-live-record-store.ts`（去重包装，透传）、`orbit-agent-chat-session-transactions.ts:583`（合并包装，透传）、`configured-canonical-reminder-maintenance.ts:85`（已主动禁止无上限读，先例） |
| GitNexus impact | 对 `listRecords` 报 LOW / 0 上游——调用全走 `LiveRecordStoreLike` 接口分发，图中无边。**该结果不可用作爆炸半径依据**；真实半径由 typecheck 逼出的 77 个文件决定 |
| 笔记 payload | 键 `operations`（操作日志，均 562 B）> `note`（490 B）；`noteRecordFromLiveRecord` 目前要求 `operations` 为数组；`operations` 只在 `get`/写路径做幂等查找，列表 DTO 不输出 |

**判断：`limit` 必填但允许显式 `"unbounded"`。** 设计案 SC"不传 limit 编译失败"若做成纯数字必填，就要替 77 个文件各挑一个数——挑小即静默截断，是行为变化而非护栏。改为 `limit: number | "unbounded"`：
现有 176 处机械补 `"unbounded"`（语义不变），`"unbounded"` 出现次数即"无上限读取"计数并冻成棘轮，新代码不写 `limit` 编译失败。四条设计 SC 同时满足，且零行为变化。

**判断：`/api/notes` 42 KB 的 SC 改用 0070 账本验收。** 42 KB 是生产数字，本机库只有 1 条笔记，无法复现；
以 `read-cost-baseline.json` 的 `notes.list`（12 条笔记 14 134 B）为尺，要求投影后下降并把 JSON 改小。

## 范围与文件

- 读取：`shared/storage/{live-record-store,postgres-live-record-store,configured-live-record-store}.ts`、`features/notes/{repository,note-record,service}.ts`、
  0070 的 `tests/performance/read-cost-*`、[RULES](../RULES.md)。
- 修改（基座，2 文件）：`shared/storage/live-record-store.ts`（`LiveRecordListQuery.limit: number | "unbounded"` 必填；内存实现按既有顺序截断；非法值抛错）、
  `shared/storage/postgres-live-record-store.ts`（数字下推 `limit $n`；`"unbounded"` 不生成 LIMIT）。
- 修改（机械，≈77 文件）：所有 `listRecords({...})` 调用补 `limit: "unbounded"`；两个包装实现透传。**只加这一行，不改任何其他逻辑。**
- 修改（笔记投影，2 文件）：`features/notes/repository.ts` 的 `list` 加 `payloadFields: ["schemaVersion", "note"]`；`features/notes/note-record.ts` 增加列表解码路径，
  `operations` 缺席时按空数组处理，仅供列表使用；`get` 路径不变。
- 新建（测试）：`tests/services/live-record-list-limit.test.ts`（类型护栏 `@ts-expect-error`、Postgres/内存 `limit: 3` 恰 3 行、非法值）、
  `tests/audits/unbounded-list-reads.test.ts` + `tests/audits/unbounded-list-reads.baseline.json`（棘轮）、`tests/services/note-list-projection-postgres.test.ts`。
- 修改（测试）：`tests/performance/read-cost-baseline.json` 的 `notes.list` 往下改；既有测试里的 `listRecords` 调用同样补 `limit`（typecheck 逼出）。
- 排除：给任何现有调用挑数字上限；水位线/304（0072）；搜索索引（0073）；App 端；部署；云端。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0071-01 | **类型护栏与下推**：不传 `limit` 的 `listRecords` 调用 typecheck 失败（测试内 `@ts-expect-error` 固定，去掉该注释即红）；Postgres 实现 `limit: 3` 生成的 SQL 含 `limit $n` 且对 10 行数据恰返回按既有排序的前 3；内存实现同；`0`／负数／非整数抛错；`"unbounded"` 不生成 LIMIT | `live-record-list-limit.test.ts`；typecheck 退出码 |
| SC-0071-02 | **棘轮**：审计测试扫描 `features/ app/ shared/ scripts/`（非测试）统计 `limit: "unbounded"`，按文件与总数 ≤ 冻结 JSON；未登记文件出现即红；把冻结值人为调低 1 测试红（`assert.throws` 固定）；冻结值 = 机械补齐后的真实计数 | `unbounded-list-reads.test.ts` 与 JSON 进仓库 |
| SC-0071-03 | **零行为变化**：orbits 全量同环境前后对照零新增失败；调用点 diff 核对脚本证明新增行去掉 `limit: "unbounded"` 与包装透传后为空（笔记两文件与基座两文件除外） | 前后全量摘要 + 失败集合 diff；核对脚本输出 |
| SC-0071-04 | **笔记投影**：列表路径出库行的 payload 不含 `operations` 键（0067 式包装 client 断言）；`notes.list` 账本字节数低于 0070 冻结值且 JSON 改小；`get`／`update` 幂等用例（读 `operations`）不变绿 | `note-list-projection-postgres.test.ts`；`read-cost-baseline.test.ts` 绿；notes 既有测试绿 |
| SC-0071-05 | **运行时无回归**（常设）：Simulator 进入笔记列表与联系人列表；phoneweb 同两页可用 | 截图／页面结果 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。**先在未改动树上跑一次 orbits 全量作对照**（H 档）。
2. RED：`live-record-list-limit.test.ts`（此时 `limit` 字段不存在，typecheck 与运行皆红）。
3. 基座两文件落 `limit`；typecheck 逼出全部调用点，机械补 `limit: "unbounded"`；两个包装透传。
4. 写核对脚本验证 SC-03 的 diff 形状；跑 orbits 全量与 0070 定向集。
5. RED→GREEN：审计棘轮（先空 JSON 必红，再冻结真实计数）。
6. RED→GREEN：笔记投影测试；改 `repository.list` 与列表解码；跑账本测试拿到新 `notes.list` 数字，往下改 JSON。
7. 两端 typecheck；重启 Web/API；Simulator + phoneweb 无回归。
8. 路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` 回 `chat-agent` → REPORT、登记表。

## 最小测试与检查

- 档位：**H**（共享存储基座 + 77 文件机械改动）。
- 开发定向集：新增 3 个测试 + `tests/performance/*` + `tests/services/flow-topology*` + `tests/services/*note*`。
- 收口集：orbits 全量（前后对照）+ 两端 typecheck。App 端无源码改动，只跑 typecheck。
- 不运行：真实设备、部署、云端。

## 失败与交接

若某调用点补 `"unbounded"` 后 typecheck 仍红（例如自建 query 对象未经字面量），只做最小类型补齐，不改逻辑；若必须改逻辑，停下记录为 blocked 项。
若笔记列表解码在缺 `operations` 时无法与既有 DTO 逐字段一致，放弃投影、保留基座与棘轮部分，如实记录 SC-04 fail。
棘轮 JSON 一旦冻结，后续只能向下修改。报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。
