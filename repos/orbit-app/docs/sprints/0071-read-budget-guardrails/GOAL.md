# Sprint 0071 — 读取预算护栏：LIMIT 下推与列投影扩面

## 要实现什么

给共享存储读接口 `listRecords` 加上"必须声明上限"的约束：`limit` 成为必填项，值是一个正整数或
明确写出的 `"unbounded"`。Postgres 实现把数字下推成 SQL `LIMIT`，内存实现同样截断。
现有 176 处调用（77 个文件）一律机械补 `"unbounded"`——语义与今天完全一样，只是把"没上限"从
默认行为变成写在代码里、能被数出来的事实。再把这个数冻成棘轮：以后只能变少，不能变多。

顺手拿 0070 量出来的一条链开刀：笔记列表把每条笔记的操作日志（`operations`，占 payload 一半以上）
也从库里拉出来，列表根本不用。列表读改成只投影 `schemaVersion` + `note` 两个键。

## 做完能看到什么

- 写 `store.listRecords({ workspaceId, collectionName })` 而不写 `limit`，`npm run typecheck` 直接报错。
- `tests/audits/unbounded-list-reads.test.ts` 数出全库 `"unbounded"` 的个数并和冻结值比对；
  谁新增一处无上限读取，测试红；谁把一处改成数字，必须同步把冻结值调低（只能往下改）。
- 0070 的 `read-cost-baseline.json` 里 `notes.list` 的字节数下降，JSON 随之往下改——这是第一次
  用 0070 的尺子验收一次真实优化。
- 传 `limit: 3` 的查询在 Postgres 与内存两个实现里都恰好返回 3 行，且是按既有排序取前 3。

## 怎么验收

全部本机：两端 typecheck；orbits 全量（本 Sprint 改共享存储基座，H 档）；0070 三层拓扑与账本测试
全绿且 `notes.list` 数字下降；Simulator + phoneweb 各跑一次笔记列表与联系人列表确认无回归。
不改任何调用点的业务逻辑；不给任何现有调用挑数字上限（那是后续 Sprint 按链逐条做的事）。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
