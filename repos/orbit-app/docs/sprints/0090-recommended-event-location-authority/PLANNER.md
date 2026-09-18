# Sprint 0090 — 首页推荐活动的地点也要中文

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO.md「2026-09-19 全量功能与 UI 复核」第 4 条（0082 的同源遗留）。
**单一目标:** 推荐活动的 `location`／`venue` 与标题一样收口到权威来源并回填。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `ededaa6ac`（0082 功能 `898538d68` 已在其中）。未启动，run_count = 0。
**进入条件:** 本地库可连（`ORBIT_EVENT_DATABASE_URL`）；0082 的回填脚本可复用。

## 已查明的事实

| 事实 | 位置 |
| --- | --- |
| 推荐接口直读种子英文 | `repos/orbits/features/recommendations/storage/event-value-live-record-provider.ts:203-206`：`location = payload.location ?? payload.venue ?? sourceLabel ?? "Live event source"` |
| 同文件标题已按 0082 收口 | 同文件 `:192-195` 注释明确 `payload.title` 是 event-core 回填写回的权威显示标题，`payload.name` 只是导入原文兜底 |
| `venue` 同样受影响 | 同文件 `:242` `venue: payload.venue ?? location` |
| 已有回填脚本 | `repos/orbits/scripts/backfill-event-display-fields.ts`（0082 产出，dry-run → apply → 复跑收敛，receipt mode 600） |
| 种子写入点 | `repos/orbits/scripts/seed-live-events.ts`（0082 已在此写 `coverPath`） |
| App 侧原样渲染 | `src/view-models/home-dashboard.ts:161` `locationLabel` 由 `item.location` + `item.venue` 去重拼接，不做语言处理 |

**判断 1：这是 0082 的同一条路，不是新问题。** 权威来源与回填机制都已建好，本 Sprint 只把 `location`／`venue` 接上去，不重新设计权威来源。
**判断 2：修在数据与服务端，不在 App。** App 侧 `locationLabel` 的拼接是对的；再在前端挑中文段就是把 0082 明确拒绝的补丁再复制一份（`ZH:` 挑段逻辑已有 10 处副本）。
**判断 3：兜底文案 `"Live event source"` 也要改。** 它是英文且不是地点；地点缺失时应走 `home.locationPending`（App 侧已有）或返回空，由消费端决定。

## 范围与文件

- orbits：`features/recommendations/storage/event-value-live-record-provider.ts`、`scripts/backfill-event-display-fields.ts`（扩展到 location/venue）、`scripts/seed-live-events.ts`。
- 契约与测试：`event-value-contract.ts`（若需）、推荐 provider 与 handler 的定向测试。
- App：仅当 `locationLabel` 的兜底需要配合时改 `src/view-models/home-dashboard.ts`。
- 排除：改活动页与详情页的地点来源（已正确）；改时区／地址结构化。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0090-01 | 推荐 provider 的 `location`／`venue` 取自权威来源，英文兜底串被移除 | provider 单测 |
| SC-0090-02 | 回填脚本覆盖 location/venue：dry-run → apply → 复跑 planned=0（事务内收敛断言） | 脚本输出 + receipt |
| SC-0090-03 | 种子今后写入权威地点 | 种子 diff + 重建后抽查 |
| SC-0090-04 | 首页与活动页同一活动的地点逐条一致（16 个活动） | 对照表 + 截图 |
| SC-0090-05 | 无回归：推荐与首页定向集通过；两端 typecheck 0 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0090-event-location-authority`。2. 确认权威地点字段在 canonical 头表的落点。3. RED：provider 单测。4. provider + 脚本 + 种子。5. dry-run → apply → 复跑 → 首页截图 → 收口。

## 最小测试与检查

- 档位：orbits L（边界清楚、与 0082 同路）。定向集：推荐 provider／handler 测试 + 首页 view-model 测试。

## 失败与交接

若 canonical 头表没有地点字段，本 Sprint 先在 REPORT 写明缺口并只做"移除英文兜底 + 种子写中文"，把 canonical 字段新增拆出去，不自造一个新的权威表。
