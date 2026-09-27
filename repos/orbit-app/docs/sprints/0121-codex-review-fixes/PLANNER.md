# Sprint 0121 — Codex 审阅修复（0099–0103）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** `0099-read-cost-tickets/codex-review.md`、`0100-read-cost-rollup-alerts/codex-review.md`、`0101-dashboard-sql-reads/codex-review.md`、`0102-dashboard-snapshots/codex-review.md`、`0103-ai-trace-stop-duplicates/codex-review.md`（2026-09-27，审阅 HEAD `ec308129a`）。0098 的审阅没有新缺陷。
**单一目标:** 修复审阅确认的缺陷，恢复各 Sprint 原验收契约的承诺。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` @ 本 Sprint 登记时的 HEAD（开工时追加提交号）。执行顺序排在 0105 之前。
**进入条件:** 无。**用户 2026-09-27 决定：第 5 项按设计案原规则实现，删除两个额外门槛。**

## 要修的问题（按严重程度）

1. **[0103，P2] 账本先截断后筛选**：`repos/orbits/features/agent/storage/agent-runtime-live-record-provider.ts:304` `listActions()` 先取最多 500 条（所有状态），再在内存里按状态、workflow、日期筛选；消费者是 `features/agent/ledger/runtime-adapter.ts:220`。有 500 条更新的已完成动作时，较早的待确认动作查不到，账本显示「共 0 条」。修法：筛选条件下推到 SQL 后再分页，账本显式翻页（nextCursor 或 hasMore）。同时核对每个运行的子记录读取（合计上限 500）与回执查找（上限 500），用于完整性判断的读取不得用截断的结果：改为分页或按精确幂等键查询。
2. **[0100，P1] Neon 对账调用了错误的接口和字段**：`features/operations/read-cost/neon-usage.ts:13,28,45-64` 调用的是旧版 `/consumption_history/projects`，没有传 metrics，却只接受 `data_transfer_bytes`。按官方文档（v2 用量指标）选择目标套餐支持的接口，显式请求传输量指标，按官方响应结构解析；不支持时仍记 `unavailable`。测试用官方结构的正例和套餐不支持的反例，不再用自造字段。
3. **[0100，P2] 失败或未配置的对账日永不补取**：`rollup.ts:39` `pendingReadCostDays()` 只看 `computed_at`，不看 `neon_status`。把「本地汇总已完成」和「Neon 对账已完成」分开；对 `failed`/`unavailable` 的日期在保留期内有上限、带退避地补取，不重算小票。需要两轮维护测试：失败 → 成功；未配置 → 配置。
4. **[0102，P2] AI 报告版本没有绑定实际输入**：`features/mobile/contacts-analysis-report-provider.ts:97`。有 graphVersion 时，`sourceDataVersion` 只哈希关系图版本，而交给模型的输入还包括 profile（关系目标等）。关系图版本继续驱动缺口和机会的快照；AI 报告另用一个复合版本，绑定模型用到的资料字段（有限字段集，生日、头像等不计入），预检也改用这个复合版本。测试：改关系目标后报告变为 stale，旧版本号的预检被拒。
5. **[0100，P2] 额外门槛压掉了契约要求的报警**：`config.ts:19`、`alerts.ts:53` 额外要求至少 3 天历史、当天均值至少 100KB，用户没有批准。在用户决定前按原规则实现（当天均值 > 过去 7 天中位数 × 2；只要中位数存在就检查）。反例测试：小接口从 20KB 涨到 80KB 要报警；只有 1–2 天历史但中位数存在时也要检查。
6. **[0101，P2] 旧 App 显示错误的决策层比例**：`features/mobile/contacts-dashboard-service.ts:213` 对所有客户端都只返回页面引用的部分联系人，旧 App 会忽略 `roleCounts`，拿这部分联系人算全局比例。修法：新客户端显式声明能力（请求头或参数），服务器只对声明了能力的客户端返回「部分联系人 + 聚合统计」；没声明的旧客户端保持原契约（完整联系人列表），或返回明确的「需要更新」。新版 App 发送这个声明。测试：一个不认识 roleCounts 的旧消费者，数据里页面样本的比例和全量比例不同。
7. **[0099，P2] 后台任务与未归属读取不受抽样比例控制**：`shared/observability/read-receipts.ts:250` 与 `unattributedLedger()` 没有传入抽样比例。统一接入抽样策略，并测真实任务入口在比例为 0 和非零时的行为。

## 同时更正的文档

- `PRODUCTION_ROLLOUT.md`：按审阅意见，0103 的回填应在切换到精确读取的代码**之前**执行（旧代码不依赖回填字段，先回填不会有副作用），避免旧运行在一段时间内看不到自己的动作和回执。
- 0098/0099 报告里说「读取上限审计转 0109」，实际安排在 0112，在登记表的路线说明中注明。

## 范围与文件

上面各项列出的文件及其测试；App 的 `ContactsDashboardScreen` 与请求构造（第 6 项的能力声明）；`PRODUCTION_ROLLOUT.md`、`README.md`。
- 排除：审阅中列为「边界」而非缺陷的事项（Vercel 诊断事件验证、没读数据库的请求没有小票、Simulator 证据补齐），由上线抽查和后续 Sprint 处理。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0121-01 | 账本：501 条动作中最后一条是待确认的（或匹配某个 workflow 或日期），能查到并能翻页；读取量仍有上限 | 真库测试（先 RED，用 Codex 的复现） |
| SC-0121-02 | Neon：官方结构的正例能解析出传输量并算出覆盖率；套餐不支持时记 unavailable；失败 → 成功、未配置 → 配置两种情况在后续维护轮次里补取成功 | 测试（先 RED） |
| SC-0121-03 | 改关系目标后 AI 报告显示 stale，旧版本号的预检被拒；只改关系图时快照照常失效 | 测试（先 RED） |
| SC-0121-04 | 报警按原规则（小接口大倍数、短历史各一例）；旧 App 的决策层比例正确或提示更新；后台任务在抽样比例为 0 时不写小票 | 测试（先 RED） |
| SC-0121-05 | 两端全量、typecheck 通过；棘轮不增加；需要真实数据库的测试显式运行 | 摘要 |

## 测试

- 档位 H（账本、AI 版本、对账为共享路径）。开发集：各项的 Postgres 或单元测试；收口：两端全量。

## 失败与交接

报告逐条对照 Codex 意见写明处理结果；无法修复的，写明原因和证据，不关闭对应意见。
