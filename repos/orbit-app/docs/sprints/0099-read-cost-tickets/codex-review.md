# Codex Review — Sprint 0099

审阅日期：2026-09-27。结论：**建议修正后台读取的抽样接线；服务端部署证据仍有边界。**

## 审阅版本与范围

- 基线：`3c18fb4de`；实现：`0680ee41f`、`bd127bcf8`；结束报告：`e8bb75767`。
- 阅读 PLANNER、REPORT、读取账本、Next 请求归属适配器、小票输出、连接池计量与迁移相关差异和测试。
- 审阅工作区 HEAD：`ec308129ab85f2db981b5116e145b1a33c860dc3`；以下问题所在文件与 Sprint 提交相同。

## 发现

### [P2] 后台任务与 unattributed 账本忽略抽样比例

位置：[read-receipts.ts:250](/Users/xzhao/Projects/orbit/repos/orbits/shared/observability/read-receipts.ts:250)，同文件 `unattributedLedger()`。

Next 请求会将 `readReceiptsSampleRate(env)` 传入账本，但后台任务和 unattributed 路径只传 `source`，于是 `createReadLedger()` 始终使用默认 `sampleRate=1`。例如将 `ORBIT_READ_RECEIPTS_SAMPLE_RATE=0` 后执行维护任务，任务仍会写小票、日志及已配置的 Axiom；设成 0.1 也仍全量记录后台任务。读取多、运行频繁的 worker 不受用户设置的抽样比例控制。

**独立复现：** 使用捕获 sink 和一条内存读指标，无数据库或外部请求；抽样比例为 0，`runWithReadReceiptSource()` 仍产生 1 张小票，记录的 sampleRate 为 1。这也说明汇总并没有错误地按 0.1 放大这些任务，问题在抽样开关覆盖不完整。

**建议：** 将统一的抽样策略接入任务及 unattributed 账本，或显式定义并提供独立的后台抽样设置。补 0 与非零比例的实际任务入口测试；现有 sampling 测试直接构造账本，未覆盖此接线。

## 验收与部署边界

- 没读数据库的请求不生成小票、部分直接 `auth()` 路径没有账号，REPORT 已披露。管理页不能把小票数量直接称为所有 HTTP 请求数量。
- Vercel 的 Node HTTP 诊断事件、状态码与响应字节归属仍未验证。本地 `next start` 证据不能替代部署平台证据；上线抽查应覆盖 App 请求、proxy 拒绝、API 和网页。
- `ec308129a` 后续修复了 Edge instrumentation 引入 pg 的构建问题；这是已提交的后续修复，不列为当前仍开放的 0099 问题。

## 验证与影响

- 独立执行 `tests/observability/read-receipts.test.ts`：**10/10 通过，无跳过**。另执行上述抽样入口复现。
- 没有运行真库测试、全量、服务构建或生产验收；没有调用 Axiom 或业务 API。
- GitNexus 对新增符号无可靠覆盖：共享索引比本 Sprint 旧。已先执行图谱查询与累计比较分析，再用提交源码核对；不把无映射视为 LOW。影响入口主要是 maintenance、worker、未归属读取及小票输出。
