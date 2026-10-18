# R11a REVIEW（`315dc2182..cb866e48f`）

**结论：需修正后复核。** 代码与测试支持主要数据层和界面接线，但 SC-04、SC-10、SC-11 有缺口；SC-12/13 尚未验收。本次只读检查指定快照，未重跑全量测试。

## S

1. **旧镜像兜底读错层级。** 实际同步详情为 `{state, contact}`（`repos/orbits/features/contacts/live-detail-service.ts:757–760`），`withLegacyNetworkFields` 却从 `detail` 顶层取电话、备注、来源和往来（`repos/orbit-app/src/view-models/contacts-local.ts:81–96`）。旧行会算错浓度及来源；SC-04 的测试使用了顶层字段。改为读取 `detail.contact`，用真实旧同步行补回归测试。

2. **像素验收未完成。** REPORT 明记 SC-12/13 未跑、设计 fixture 未接入（`docs/designs/redesign-2026-10/sprints/R11a-network-list-detail/REPORT.md:37–38,53–58`）；提交中只有画面清单，没有 R11a 归因文件。按 README 规则 11 完成 fixture、两端门禁及「待 R11」重比后再标收口。

## M

1. **离线删除撤回存在竞态。** 队列发送期间，撤回可先把条目出队并跳过恢复；随后 DELETE 仍可能在服务端成功（`repos/orbit-app/src/screens/network/contact-delete-queue.ts:41–63`；`src/screens/network/NetworkScreen.tsx:134–155`）。补发也未以联网状态为触发条件，401 等拒绝会直接丢队列。串行化发送与撤回，发送中撤回须待结果后恢复；认证失败保留条目并提示。

2. **500 个目标 ID 的上限影响内部计数。** `wrapContactCardReader` 将计划 ID 截为 500 后交给列表和汇总（`repos/orbits/features/contacts/card-service.ts:74–78`），SQL 据此计算 `goal_related`（`features/contacts/storage/contact-list-postgres-reader.ts:201–203`）。超过上限时 Web 页签、浓度和筛选漏人。保留公开接口的 500 上限，内部读取改用完整集合或数据库关联。

3. **pipeline 审计仍指向已删路由。** 生成器仍登记 App、Web 两个 pipeline surface（`repos/orbits/scripts/generate-full-product-functional-audit.mjs:442–447,830–844`），App 导航测试也继续使用旧地址（`repos/orbit-app/tests/mobile-route-access.test.ts:156–162`）。清理运行中清单和失效测试，再生成审计；这与 REPORT 的 SC-11“链接全部删除”不符。

## m

- **SC-05 总数口径写反。** REPORT 称 `total` 不随筛选变化（`REPORT.md:30`），PG 测试却明确断言筛选后 `total=1`、浓度计数仍为全量（`repos/orbits/tests/services/contact-network-list-postgres.test.ts:187–209`）。明确区分匹配数与全量人数，修正契约表述或字段。

## 核实通过

来源六类、`metKind`、计划浓度合并及 SQL `$18–$26` 参数有实现和 PG 测试；软删与恢复有归属校验、30 天窗口和严格提交顺序锁测试；新枚举宽进、旧 App 多余字段兼容及 `BREAKING.md` 有证据。按 REPORT 的 R11a 提交归因，未见 B 线修改组件库、token、导航壳或其他线的受禁文件；新增日志只记错误名，未见 PII。