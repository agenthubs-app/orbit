# Codex Review — Sprint 0100

审阅日期：2026-09-27。结论：**建议修正 Neon 对账与失败恢复，再将对账链路视为完成。**

## 审阅版本与范围

- 基线：`e8bb75767`；实现：`8320dc031`、`fa8be1d8e`、`de6e0749a`；结束报告：`6491665de`。
- 阅读 PLANNER、REPORT、汇总/保留期 SQL、维护任务、Neon 读取器、报警、管理员访问控制与跨端通知契约。
- 以下问题所在实现与审阅 HEAD `ec308129ab85f2db981b5116e145b1a33c860dc3` 相同。

## 发现

### [P1] Neon 读取器调用的接口不提供它要解析的传输量

位置：[neon-usage.ts:13](/Users/xzhao/Projects/orbit/repos/orbits/features/operations/read-cost/neon-usage.ts:13)、同文件第 28、45～64 行。

代码调用 legacy `/consumption_history/projects`，没有传 `metrics`，随后只接受 `data_transfer_bytes`。Neon 官方说明该接口默认返回 active/compute/written 数据，支持的指标中没有这个字段。即使配置了有效密钥并得到 HTTP 200，正常响应也无法满足当前解析器，结果会是 `failed/unexpected_response`，无法得到覆盖率或触发低覆盖率报警。Free 套餐本身不支持该用量接口是另一项限制，不能解释支持套餐下的字段错配。

证据：[Neon legacy project consumption API](https://api-docs.neon.tech/reference/getconsumptionhistoryperproject)。用量套餐的传输指标由 [consumption v2 文档](https://neon.com/docs/guides/consumption-metrics) 定义，接口和字段应按目标套餐选择。

**建议：** 使用目标套餐实际支持的接口、显式请求传输指标，并按官方响应结构解析。无支持能力时保持 unavailable。现有测试自行构造了 `data_transfer_bytes` 响应，只证明桩可解析，不能证明真实接口兼容；补官方结构的正例与套餐不支持反例。

### [P2] 暂时失败或先未配置的对账日被永久当作已完成

位置：[rollup.ts:39](/Users/xzhao/Projects/orbit/repos/orbits/features/operations/read-cost/rollup.ts:39)，以及 `maintenance-task.ts` 中仅遍历 pending days 的循环。

`pendingReadCostDays()` 只看 `computed_at` 是否超过日末 15 分钟，不检查 `neon_status`。每日任务在该时间后写入一次 `failed` 或 `unavailable`，以后就会跳过该日。网络故障恢复、Neon 延迟提供指标，或之后才配置密钥，都不会补取仍在保留期内的历史数据，覆盖率与相关报警一直缺失。REPORT 已披露 failed 不重试，但同样的问题还影响先未配置的日期。

**建议：** 分开“本地汇总已完成”和“Neon 对账已完成”，对未取得/暂时失败的日期执行有上限、带退避的补取；不必为重试重复重算所有小票。补失败→成功及未配置→配置的两次维护测试。

### [P2] 额外阈值静默抑制契约要求的读取量翻倍报警

位置：[config.ts:19](/Users/xzhao/Projects/orbit/repos/orbits/features/operations/read-cost/config.ts:19)、[alerts.ts:53](/Users/xzhao/Projects/orbit/repos/orbits/features/operations/read-cost/alerts.ts:53)。

实现额外要求至少 3 天历史、当天均值至少 100,000 字节。原契约是超过过去 7 天中位数的两倍；例如接口由 20KB 增至 80KB，仍不会报警。有 1～2 天有效历史的接口也完全不检查。REPORT 明确说这些门槛待用户确认，故目前属于尚未获确认的行为差异，不能把默认规则完全符合设计写成已通过。

**建议：** 在用户决定前按既定规则实现，或将批准后的门槛写入契约和测试。补“小接口大倍数增长”和“短历史但存在中位数”的反例。

## 验证与边界

- 独立执行 `tests/operations/read-cost.test.ts`：**4/4 通过**；官方 API 文档核对已完成，没有使用真实 Neon 密钥或调用其业务接口。
- 未运行真库、管理员浏览器、全量或原生验收；历史 REPORT 结果不冒充本次独立检查。
- 旧 App 遇新通知类型整页失败已由 0104 的已提交代码着手修正，但在旧构建仍使用时仍需遵守发布顺序，不能据源码修复认定旧安装已安全。
- GitNexus 共享索引不包含本批新增模块；先执行图谱查询/比较，再以源码核对维护与通知接线。无法给出完整的新流程覆盖结论。
