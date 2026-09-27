# Codex Review — Sprint 0101

审阅日期：2026-09-27。结论：**SQL 汇总与新 App 接线未发现可证实的新增逻辑错误；旧 App 兼容性需要解决。**

## 审阅版本与范围

- 基线：`6491665de`；实现：`1cd605835`；结束报告：`af39bf984`。
- 阅读 PLANNER、REPORT、SQL 总数/短列表/分布、分数门槛、来源去重、联系人编号读取、roleCounts、App 视图模型与登录跳转差异；检查 SQL 和保留 JS 计算的对照测试设计。
- 审阅 HEAD：`ec308129ab85f2db981b5116e145b1a33c860dc3`。本意见区分 0101 的变化与 0102 后续快照实现。

## 发现

### [P2] 同一接口改为部分联系人后，旧 App 会显示错误的决策层比例

位置：[contacts-dashboard-service.ts:213](/Users/xzhao/Projects/orbit/repos/orbits/features/mobile/contacts-dashboard-service.ts:213)（按页面引用编号加载联系人），以及本 Sprint 新增的 `roleCounts` 契约。

服务端对既有 `/api/mobile/contacts-dashboard` 的所有客户端返回页面引用的部分联系人；旧 App 忽略新增的可选 roleCounts，仍用 contacts 计算全局角色比例。联系人总计 100 人、其中 50 人为决策层，但页面恰好引用 5 位决策层联系人时，旧 App 会显示 100% 而实际是 50%。接口仍能解析，用户不会得到版本不兼容提示。

这项风险已在 REPORT 披露，属于**仍开放的兼容性缺陷**，不是新发现的未知风险。仅“建议尽快发新版 App”不能保证旧安装消失。

**建议：** 对新旧消费者使用明确的接口版本或能力标识；新客户端走部分联系人+聚合统计，旧客户端保持其契约或提示必须更新。补不认识 roleCounts 的旧消费者测试，使用“页面样本比例不同于全量比例”的数据。

## 其余审阅意见

- SQL 的 69.5 门槛与 JS Math.round 后的 70 门槛对应；重复联系人查找、不同账号、删除、来源证据与特殊排序有针对性的对照测试。没有将已知排序决胜键差异误报为逻辑回归。
- 缺口、机会当时仍读整图是 Planner 明确留给 0102 的范围，不计作本 Sprint 缺陷。
- ICU 缺失时的显式回退保留了正确性，但生产读取成本目标依赖数据库能力；应保留 REPORT 中的上线检查。

## 验证与影响

- 独立执行 App `account-auth-view-model.test.ts`、`contacts-analysis-view-model.test.ts`：**11/11 通过，无跳过**，覆盖 /home 默认跳转、显式 next 和新 roleCounts 计算。
- 未独立运行真库 SQL 对照、全量、phoneweb 或 Simulator；不能据这些单元测试认定跨端业务验收完成。
- GitNexus 对 `createMobileContactsDashboardService` 返回 LOW/0 callers，但共享索引过期，零调用方不代表接口无人消费。提交源码确认其 App/API 消费者；0101 REPORT 的 provider CRITICAL 和分布 HIGH 风险应保留，不能以本次零映射覆盖。
