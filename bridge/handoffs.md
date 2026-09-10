# 同步队列

2026-09-10 保存与集成更新见 [集成交接](2026-09-10-chat-agent-integration.md)。BR-004/005/008 的源码与验证进度已有变化，但未完成的跨端运行时和原生验收仍未关闭；以下初始盘点保留追溯。

初始盘点：2026-09-07。下方责任方是建议接手角色，不表示已联系开发者、已领取或已批准实现。当前任务只建立基线与管理目录；业务修复尚未启动。

流程状态：`identified` 已发现 → `specified` 差异与验收明确 → `source_ready` 提供方完成 → `consumer_ready` 消费方适配 → `verified` 两端验收完成。阻塞用 `blocked` 并记录原因，恢复后回到原阶段。明确接受的平台差异用 `accepted_difference`，保留决策来源。

每条同时记录 `web_status`、`app_status`、`verification_status`；总状态不能掩盖其中一端未完成。多阶段交接完整内容使用 [模板](templates/handoff.md)。

| ID | 优先级 | 事项 | 当前状态 | 下一责任方 | 关闭条件 |
| --- | --- | --- | --- | --- | --- |
| BR-001 | P1 | Today 同名但数据与动作集合不同 | identified | Bridge 梳理，Web/App 接口负责人协作 | 逐项映射账本/安排/任务；实现或有依据接受差异；双向验证 |
| BR-002 | P1 | Agent 高级设置移动缺口 | identified | Bridge + App，Web 提供 HTTP 边界 | memory/feedback/automations/preferences 覆盖方案及逐操作验收 |
| BR-003 | P1 | 会话历史操作与持久化确认 | identified | Bridge + App，Web sessions 负责人协作 | 改名/置顶范围明确；跨端续聊、失败恢复不丢历史的实测证据 |
| BR-004 | P1 | 未共享响应 DTO / Schema 覆盖 | identified | Web 契约负责人 + App | 按消费者列清单，逐模块迁移与同步；已有 whitelist 不扩张 |
| BR-005 | P1 | 缺少当前版本双向状态验收 | identified | Bridge | 账号/联系人/任务/报名/运营/会话的双向读写与刷新证据 |
| BR-006 | P1 | Web 发布门槛与 App 公网依赖 | blocked | Web 发布负责人 | 记录解除 1C 的证据及部署版本，完成同环境 iOS 访问验证 |
| BR-007 | P2 | 文档描述落后于代码 | identified | Bridge + 各端文档负责人 | README/契约迁移表与实际已发布能力一致；保留历史记录 |
| BR-008 | P2 | App 未提交界面工作交接 | identified | App 负责人 | 提供最终文件/版本/验收范围，刷新 bridge 基线 |

## BR-001 — Today

- web_status：已实现三来源组合；证据 `repos/orbits/app/(app)/app/today/today-page-content.tsx` 与 `compose-app-today-from-agent-ledger/today-merged-view-model.ts`。
- app_status：已实现 `/api/today` 任务工作台；证据 `repos/orbit-app/src/screens/today/TodayScreen.tsx`；账本另在 `AgentLedgerScreen.tsx`。
- verification_status：两端源码已核对；同账号业务结果未联验。
- 已知差异：Web 用 ledger/schedule/followups loaders；App API handler 用 `features/tasks/today-service-factory`。因此页面标题相同不能推出“待处理”集合/计数相同。
- 下一步交付：列出每类 item 的 source、ID、状态、时间口径、动作入口及 App 映射；区分手机合理拆页与真实缺失，确定是否需要 HTTP 聚合扩展。未选定新布局，不开始 UI 改造。

## BR-002 — Agent 高级设置

- web_status：`settings/orbit-settings-content.tsx` 已装配 automation/memory/feedback/execution 组件，对接相应 `/api/agent/**`。
- app_status：`SettingsScreen.tsx` 仅提供账号、权限、服务器；`AgentActionsScreen.tsx` 的基础 Agent settings 不能覆盖全部高级能力。
- verification_status：源码确认缺少对应移动消费入口，未实际测试 Web 写行为。
- 下一步：先定义移动端需查看/修改/暂不支持的操作及理由；只读与可写分别交接。

## BR-003 — AI 会话

- web_status：`agent/orbit-real-agent.tsx` 有 renameHistorySession/togglePinnedHistorySession/deleteHistorySession。
- app_status：`AiScreen.tsx` 可读历史、显示 pinned、删除 session，未发现改名/置顶写入口；`AiConversationScreen.tsx` 对部分 session 更新使用不等待结果的 POST。
- verification_status：历史映射/续聊 wiring 测试包含在本轮 752 项中，但未跨端断网/重开验证。
- 下一步：确认改名/置顶是否要移动对齐；验证 Web 创建 → App 续聊 → Web 重开以及反方向。故意使保存失败，检查是否可恢复和是否向用户正确表达保存状态；未复现前不要把风险记为确定 bug。

## BR-004 — 契约覆盖

- web_status：12 个共享类型文件 + 1 个运行时 Schema + 2 个允许同步的字典。
- app_status：副本一致；`src/api/agent-ledger-contract.ts` 明确注明 Ledger 类型未升入 shared，活动运营等页面仍有 unknown 解码。
- verification_status：副本、目录边界与 dashboard 定向检查通过；全接口字段覆盖未验收。
- 下一步：按现有 HTTP 消费者先列 DTO 差异，优先账本/运营/审核/角色等写操作。字段修订要附旧 App 兼容策略、请求版本条件和缺失字段行为，不直接批量复制 feature 目录。

## BR-005 — 双向读写与刷新

- web_status：服务端页面直接服务调用与 HTTP 并存。
- app_status：HTTP + 本地 GET 快照；显式 refresh，长任务另有轮询。
- verification_status：本轮未进行同账号 E2E；不能套用 2026-08-31 图表视觉截图。
- 下一步：按 [数据交接验收](contracts.md) 用相同环境验证。普通用户与活动管理角色分别使用正确夹具；记录允许的刷新方式和异步等待边界。

## BR-006 — 发布

- web_status：2026-09-06 发布记录仍有 21 个全量测试失败、1 个跳过；远程部署未完成。
- app_status：源码默认 localhost，可配置 API 地址；本轮未核实设备运行地址或公网构建。
- verification_status：本轮两端类型检查通过，但 Web 全量/生产构建/远程未重跑。
- 阻塞：发布记录 1C 未通过、无本轮可验证的共同公网版本。此阻塞只限制发布验收，不阻止其他本地 bridge 工作。

## BR-007 / BR-008 — 文档与进行中工作

- BR-007：App README 的部分运营写操作描述和 Web 契约迁移清单落后；本次在 bridge 标出差异，尚未修改各开发者原有文档。
- BR-008：App 74 个 tracked 文件及额外未跟踪内容已记录在基线快照；不能把当前 SHA 单独作为它们的可复现版本。最终交接由 App 负责人提供适用 commit/diff 与 UI 验收。
- 两项 verification_status 均为未完成；没有将任何任务擅自标记为另一位开发者已接单。
