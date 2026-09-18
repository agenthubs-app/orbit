# Sprint 0071 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256
`b25f78a12594e8b70c2d1ac96e52dcb4ac1e581bd9d0c2d8e8782985ae29300f`。

## 先用人话说

以前 `listRecords` 不写上限就是没上限，全库 176 处调用没有一处写过。现在 `limit` 必填：要么一个正整数
（Postgres 侧真正下推成 `LIMIT $n`），要么明确写 `"unbounded"`。176 处全部机械补了 `"unbounded"`——
今天的行为一字未变，但"无上限读取"从此是写在代码里、能数出来的事实：**76 个文件 / 174 处**，冻进
`tests/audits/unbounded-list-reads.baseline.json`，以后只能往下改，新写一处无上限读取测试就红。

顺手用 0070 的尺子验收了第一条真实优化：笔记列表不再把每条笔记的操作日志（`operations`）从库里拉出来，
`notes.list` 12 条笔记 14 134 B → **12 116 B**，基线 JSON 随之下调。降幅不大（−14%），因为测试里每条笔记
只有 1 条操作回执；生产里被反复编辑过的笔记回执更多，收益按比例更大。

## 一处必须让用户知道的判断

设计案写"不传 limit 编译失败"。若做成纯数字必填，就要替 77 个文件各挑一个数——挑小即静默截断，
是行为变化不是护栏。本 Sprint 定为 `limit: number | "unbounded"`，四条设计 SC 同时满足且零行为变化；
给具体调用挑数字是后续 Sprint 按链逐条做的事，本 Sprint 一处都没挑。

GitNexus 对 `listRecords` 的 impact 报 LOW/0（接口分发无边），而 staged `detect_changes` 报
**CRITICAL：335 符号 / 157 文件 / 61 流程**。两者都不是真实风险度量：前者盲区，后者按触碰符号数计。
真实风险由三件事界定——(1) diff 形状核对：新增行去掉 `limit: "unbounded"` 后为空（基座 2 + 笔记 2 + 新测试 4 + 基线 JSON 2 + 测试基建 1 除外）；
(2) `"unbounded"` 在类型上不改变 SQL；(3) 全量前后对照零新增失败（见下）。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `4507b3e66`；登记后 `9cc2e6c91` |
| 功能提交 | `ed9d3bb26` feat(sprint-0071) |
| 合并 | `deda00f89` merge(sprint-0071)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0071-01 类型护栏与下推 | pass | `live-record-list-limit.test.ts` 3/3：`@ts-expect-error` 固定"不传 limit 即红"（落 `limit` 前该文件 typecheck 报 5 处 TS2353，落后 0）；Postgres `limit: 3` SQL 含 `limit $n` 绑定参数、对 10 行恰返回既有排序前 3；内存实现同；`0/−1/1.5/NaN/∞` 抛 RangeError；`"unbounded"` 不生成 LIMIT |
| SC-0071-02 棘轮 | pass | `unbounded-list-reads.test.ts` 2/2：空基线首跑 RED，冻结 76 文件 / 174 处后 GREEN；按文件与总数只降不升；未登记文件即红；基线条目消失也红（防止棘轮松动）；"少 1 必红"用 `assert.throws` 固定 |
| SC-0071-03 零行为变化 | pass | 机械改动 149 文件 / 374 处（含测试）；核对脚本：新增行去掉标记后为 0 行；两处 `listRecords(query)` 非字面量调用原样透传。全量对照见"全量前后对照" |
| SC-0071-04 笔记投影 | pass | `note-list-projection-postgres.test.ts` 1/1：列表路径出库行 payload 无 `operations` 键；同 idempotencyKey 重放返回同一笔记且列表仍 3 条；`getRecord` 仍读到 1 条回执。`read-cost-baseline.json` notes.list 14 134 → 12 116（`history` 记录原因）；账本测试 2/2；笔记相关 12 文件 37/37 |
| SC-0071-05 运行时无回归 | pass | Simulator：首页 → 我的笔记，1 篇、"2 人 / 1 活动"关联标签仍在（投影后 DTO 未丢字段）；phoneweb `/notes` 同，`/contacts` 78 位联系人；两端 typecheck 0 |

## 全量前后对照（H 档）

| 运行 | tests | pass | fail | skipped | 说明 |
| --- | ---: | ---: | ---: | ---: | --- |
| before（未改动树） | 4206 | 3966 | 85 | 155 | 85 项为主线既有失败（路由文档审计等），失败集合存档 |
| after #1、#2 | 4212 | 3966 | 91 | 155 | **+6 新增失败，两次可复现**：`tests/pages/app-register-*` 两文件，PG `40001 could not serialize access` |
| after #3（修测试基建后） | 4212 | 3971 | 86 | 155 | 6 项清零；+1 `orbit-agent-gemini-live` 波动（见下） |

**+6 的根因（0067 遗留，本 Sprint 暴露并修复）**：`tests/support/isolated-registration-runtime.ts` 靠覆盖
`ORBIT_EVENT_DATABASE_URL` 把注册测试隔离到随机 schema，但 `.env.local` 的 `ORBIT_DATABASE_TARGET=local` 让配置只认
`ORBIT_LOCAL_DATABASE_URL`，覆盖失效——两个测试文件都直接写进 **dev 库 `orbit_events` 的 public 表**（查到 9 张
`event_ops_*` 表共 243 条 `test:registration_route_*` 泄漏行），serializable 事务互撞。两文件并发单跑 3/3 必现。
以前全量能过只是调度上没撞车；0071 多 4 个测试文件挤动了顺序。处置：support 文件同步覆盖 `ORBIT_LOCAL_*` 两键，
并加 `current_schema()` 断言（绑错 schema 直接抛）；修后并发 3/3 通过、0 次 40001。dev 库泄漏行已在一个事务内清除。
这是测试基建修复，不在原允许清单，按 0068 先例如实记录。

**+1 波动**：`live Gemini Orbit Agent maps network search into contact recommendations` 在 before／after #1／#2 均通过，
仅 after #3 失败；该文件不触及任何 store（`listRecords` 0 处，mock fetch），单跑时失败的是另一条
（`fails closed without an API key`，依赖本机 env 是否有 key，2.2 s）。判定为环境依赖波动，不归因本 Sprint，也未改断言。

## 顺带发现（不在本 Sprint 修）

1. `tests/capabilities/orbit-agent-gemini-live.test.ts` 读真实 env 决定分支，本机有 key 时 `fails closed` 用例必红——应改为显式清空 env。
2. `scripts/run-node-tests.mjs` 仍不跑 `tests/**/*.test.mjs`（0070 已记）。
3. `tasks.list` 读 92 行只展示 12 条的旧格式行问题（0070 已记），本 Sprint 未动 tasks 读路径。

## 未提交、影响与下一步

- 未提交：`AGENT.md`、`AGENTS.md`、`CLAUDE.md`、`repos/orbits/next-env.d.ts` 等用户既有改动，全程未暂存。
- 其他端影响：App 零改动，typecheck 0。
- 回退方式：`git revert -m 1 deda00f89`。
- 运行环境：本机 Postgres `orbit_sprint0067_test`（随机 schema）；dev 库 `orbit_events` 仅做泄漏行清理与 0070 遗留 6 个空 `profile_repair_operator_cli_*` schema 清理；Web/API 3000；phoneweb 32111；Simulator `DA432E9E`。未连云端、未部署。
- 预算：无 AI/OCR 调用。
- 下一步：**0072 域水位线与条件请求**（`(workspace, collection, epoch)` 廉价水位线 + 304）。
