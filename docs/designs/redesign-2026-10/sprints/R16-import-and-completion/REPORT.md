# Sprint R16 — REPORT（加人：导入与每天一问）——服务端部分

**执行人：** 小雨（甲）的执行会话，2026-10-11 ～ 12。**分支：** 直接在 `redesign` 上提交。
**依据：** [PLANNER](PLANNER.md)（rev 3）、[add-and-invite/DESIGN.md](../add-and-invite/DESIGN.md)。
**范围说明：** 2026-10-11 主会话转达用户决定：逐像素还原标准（README 规则 11）定下来之前，**新的 Web / App 界面暂停**。本 Sprint 只做了契约、纯函数、服务端与测试；导入的两端界面、`CompletionQuestionCard`、删除旧 `network-import*`、`expo-contacts` / `fflate` 依赖都**没做**，等导航壳返工和用户拍板后按逐像素标准一次写。
**没有做的事：** 没连 Neon、没部署、没有迁移、没有付费 AI。

## 做了什么

- **契约（`1b2be48a`，App 副本同提交）**：`shared/contract/contact-import.ts`——用真实 handler 逐个 kind / format 跑出的响应如实描述现有导入 HTTP 形状（批次、行、问题、统计、映射、提交结果、上传头常量），请求严格、响应宽进，parity 测试 6/6；契约 3 只加 `contactName / contactSubtitle / sourceChip / kind` 与 `densityAfter`，`askedOn` 注释改东京日；快照、parity、演示世界更新。
- **服务端（`d3a7dfc6`）**：纯函数 `work-contact-likelihood`（通讯录「像工作关系」预选）、`vcard-build`（与服务端解析器往返测试）、`completion-question-rules`；`features/contacts/completion` 每天一问 live（每人每东京日 ≤1 题、并发只出一题、同天重放、两种题型、选项只来自真实数据或固定项、回答写 `metEventId` / 备注「出会い：…」/ `organization`（`applyContactFieldValues`，旧值进历史）、`densityAfter`、跳过 3 次停止、他人隔离、示例模式拦写）；`contact-completion` capability 加 live。
- **复核修复（`141a599b`）**：见 [REVIEW 处理记录](REVIEW.md#处理记录执行人2026-10-12)。

## 测试

导入 parity 6/6、纯函数（修复后预选 45 条等）、每天一问服务（内存 + 本机 Postgres）、路由（mock 与 live 同一组断言）全部通过；修复后相关 138 条 0 失败；两端类型检查、lint、`copy:qa` 0。两端全量未在本轮重跑（工作区有另一个会话未提交的导航壳改动，会混入无关结果），界面开工时一起跑。

## GitNexus

`applyContactFieldValues` HIGH：不改，只新增调用方；导入 handler MEDIUM：行为未动；其余 LOW / UNKNOWN（grep 确认）。detect-changes 记录在证据目录（混有另一会话的未提交文件，已在日志里区分）。

## 自定决定（实现细节）

| # | 事项 | 决定 |
| --- | --- | --- |
| 1 | 当天没有可问的人 | 记一条，当天不再读人脈；之后有新导入时仍可出一题（一天最多一题） |
| 2 | 跳过次数 | 跨天累计 |
| 3 | 题目与固定选项 | 存模板键，三语按界面显示（注释写明） |
| 4 | 浓度「计划已关联」 | 暂不计入（注释写明），R11 接管 `contact-density` 时补 |
| 5 | 演示世界 | 不加导入批次 fixture（导入接口没有 mock 模式） |

## 请用户拍板（规则 11：偏离不自定）

1. **活动选项的来源**：现在用「联系人记录里的 `metEventId` + 最早录入时间」代替「我的参加记录 + 活动开始时间」（R26 的参加记录接口还没有）。推荐：等 R26 后改用参加记录。
2. **LinkedIn 导入的人用 `connectedOn` 还是导入时间作「加入时间」**（影响 30 天与 ±14 天窗口）。推荐 `connectedOn`（有值时）。
3. **当天导入后是否当天就能出题**。现在：可以（仍一天一题）。

## 交接 / 下一步

- 界面（SC-R16-01～06 与像素 SC-P01～P11）等导航壳返工与用户拍板后再做；届时加 `expo-contacts`（App）与 `fflate`（Web），删旧 `network-import*`。
- R20 / R11 / R10：每天一问接口已 live，卡片组件随界面一起做。
