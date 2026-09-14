# 同步队列

2026-09-10 保存与集成更新见 [集成交接](2026-09-10-chat-agent-integration.md)。BR-004/005/008 的源码与验证进度已有变化，但未完成的跨端运行时和原生验收仍未关闭；以下初始盘点保留追溯。

初始盘点：2026-09-07。下方责任方是建议接手角色，不表示已联系开发者、已领取或已批准实现。当前任务只建立基线与管理目录；业务修复尚未启动。

流程状态：`identified` 已发现 → `specified` 差异与验收明确 → `source_ready` 提供方完成 → `consumer_ready` 消费方适配 → `verified` 两端验收完成。阻塞用 `blocked` 并记录原因，恢复后回到原阶段。明确接受的平台差异用 `accepted_difference`，保留决策来源。

每条同时记录 `web_status`、`app_status`、`verification_status`；总状态不能掩盖其中一端未完成。多阶段交接完整内容使用 [模板](templates/handoff.md)。

| ID | 优先级 | 事项 | 当前状态 | 下一责任方 | 关闭条件 |
| --- | --- | --- | --- | --- | --- |
| BR-001 | P1 | Today 同名但数据与动作集合不同 | identified | Bridge 梳理，Web/App 接口负责人协作 | 逐项映射账本/安排/任务；实现或有依据接受差异；双向验证 |
| BR-002 | P1 | Agent 高级设置移动缺口 | identified | Bridge + App，Web 提供 HTTP 边界 | memory/feedback/automations/preferences 覆盖方案及逐操作验收 |
| BR-003 | P1 | 会话历史操作与持久化确认 | consumer_ready | Bridge 验收 | 真实同账号两端完成组织、续聊、删除和失败恢复往返 |
| BR-004 | P1 | 未共享响应 DTO / Schema 覆盖 | identified | Web 契约负责人 + App | AI sessions 已共享；其余消费者按模块继续迁移与同步 |
| BR-005 | P1 | 缺少当前版本双向状态验收 | specified | Bridge | 账号/联系人/任务/报名/运营/会话的双向读写与刷新证据 |
| BR-006 | P1 | Web 发布门槛与 App 公网依赖 | blocked | Web 发布负责人 | 记录解除 1C 的证据及部署版本，完成同环境 iOS 访问验证 |
| BR-007 | P2 | 文档描述落后于代码 | identified | Bridge + 各端文档负责人 | README/契约迁移表与实际已发布能力一致；保留历史记录 |
| BR-008 | P2 | App 未提交界面工作交接 | identified | App 负责人 | 提供最终文件/版本/验收范围，刷新 bridge 基线 |
| BR-009 | P1 | 事项与个人日程编辑跨端一致 | verified | 已完成；0022 可消费 | 同一合成 actor/记录完成 Web↔App 创建、编辑、清空、冲突与提醒回读 |
| BR-010 | P1 | 身份邀请、绑定与共享聊天 | verified | 已完成；0012 可消费 | 隔离双 actor 与 PostgreSQL 证明资格、幂等投递、撤销和双方回读 |
| BR-011 | P1 | 消息前台刷新、已读、角标与推送 | blocked | 运行环境负责人 | 提供 Expo project、push server key、双用户原生账号及实体推送环境后补真实验收 |
| BR-012 | P1 | 双面名片按卡复核并一次创建联系人 | blocked | Bridge／共同环境负责人 | 实体 iPhone 在共同 API/OCR 环境完成双面创建，Web/App 重开同一联系人和字段来源 |
| BR-013 | P1 | 统一待办与人脉筛选跨端一致 | verified | 已完成；0011/0013/0015/0018 可消费 | 同一任务在 App 全部／人脉视图、旧链接及 Web 完成／恢复回读一致 |
| BR-014 | P1 | 首页与可信人脉分析 | blocked | Bridge／共同环境负责人 | 登录态 Simulator 核对首页/Pipeline；真实分析及目标在同账号 Web/App 双向回读 |

## BR-014 — 首页与可信人脉分析

- 创建/更新日期：2026-09-15。
- 总状态：`blocked`；web_status：`source_ready`；app_status：`consumer_ready`；verification_status：本地通过、真实运行时 blocked。
- 用户可见变化：首页原联系跟进区块改为真实推荐活动，未完成待办最多五条且成功完成后补位；人脉页展示已存报告、真实生成时间/版本和 stale 提示。点击分析只打开可编辑 IORBIT 草稿，发送前无生成；关系目标只保存自身字段。
- Web/API：`GET /api/mobile/contacts-dashboard` 可选返回 analysis current/report/stale；可靠发送对 `contacts.analysis@1` 在执行前重算 actor-scoped source hash，并在首轮 assistant 成功持久化后写 server-only verification。普通 session 写入不能伪造。
- App：同步共享 contract/schema；dashboard、目标保存与机会重算绑定 actor+baseUrl。StrictMode/失焦保留一次性草稿，切号清除；旧 ACK 不覆盖新编辑，409 刷新版本后使用新 mutation 重试。
- 版本：目标保存 `a1d7d7665`、首页 `727aeeae2`、服务端可信报告 `7a2e9f767`、Web 入口 `3038e8ea7`、App 消费 `9a10522b1`。
- 本地验证：App 全量 2715/2715；App 0011 三组 72/72、28/28、5/5，生命周期组合 128/128；Web 0011 组合 99/99；两端 typecheck exit0。provider keys 全部清空，未执行模型或外部写入。
- 兼容与失败：旧 App 缺 analysis 时显示 unavailable；部分消息持久化而 verification 未完成时不会冒充报告，重放可补 marker 而不重新生成；旧跟进业务与 Pipeline 未删除。
- 未检查：真实 provider 生成、真实业务数据库、共同登录账号、登录态原生首页/分析/Pipeline、Web 写→App 回读与 App 写→Web 回读、部署版本。
- 关闭条件：在同一已配置环境和授权账号中，登录 Simulator 对照首页活动/五待办/Pipeline；显式发送一次分析并在 Web/App 重开同一持久报告；两端各保存一次 relationshipGoal 并核对相同 profile/version 及其他资料字段未变。

## BR-013 — 统一待办与人脉筛选

- 创建/更新日期：2026-09-15。
- 总状态：`verified`；web_status：`source_ready`；app_status：`consumer_ready`；verification_status：`verified`。
- Web/API：复用 BR-009 的 canonical task、版本与幂等动作；本轮未新增 Web 筛选 UI 或 API 字段。
- App：`/tasks` 提供全部／人脉与未完成／已完成正交视图；旧 `/followups` 保持私有并归一化到 `/tasks?scope=relationship`。Pipeline、AI、消息、日历分别按语义进入筛选页或真实任务详情。
- 工具与历史：联系人／事项必须显式选择后才启用 IORBIT 起草；URL 不携带正文，用户发送前零生成。候选、提醒和 canonical task 分开计数，既有会话历史仍可回读。
- 版本：主线功能 `ef5d0b02d`；[Sprint 0022 报告](../repos/orbit-app/docs/sprints/0022-unified-tasks/REPORT.md)。
- 验证：主线相关集65/65、任务集83/83、导航消费者208/208、App typecheck通过；隔离 PostgreSQL 与 iOS Simulator 中同一任务完成／恢复完成 App→Web→App 回读，联系人 payload 未变。
- 风险记录：实施前 `initial-route` 链为 HIGH，已覆盖登录回跳、旧链接和导航消费者；主线 GitNexus 索引陈旧返回0，不作为低风险证据。原全量44项旧夹具失败及后续65项复验分别保留。
- 下游稳定地址：全部待办 `/tasks`，人脉待办 `/tasks?scope=relationship`，完成维度 `view=completed`，详情 `/tasks/<encoded-id>`。候选不得伪造 task ID；完成人脉待办不得自动推进联系人 lifecycle。

## BR-012 — 双面名片卡片级确认

- 创建/更新日期：2026-09-15。
- 总状态：`blocked`；web_status：`source_ready`；app_status：`consumer_ready`；verification_status：本地通过、真实跨端 blocked。
- 发起角色：Bridge；下一责任方：共同环境／实体设备验收负责人，尚无可用对象。
- 授权来源：用户明确启动 D 线并授予持续实现权限；真实环境迁移、具体联系人和样本仍以实际对象记录验收。
- 用户可见变化：App 可为一张名片选择正面和可选反面，复核两面图片及字段来源，冲突需明确处理；一次确认只返回一个联系人。
- Web/API：`POST /api/contact-drafts/business-card/batches/v2` manifest 新增 `cardId`、`side`；现有 item confirm 路径以整卡确认，接收 `confirmationIntentId`、`expectedCardItems`、`fieldSources`。
- App：`BusinessCardIngestStartScreen` 负责显式配对；`BusinessCardIngestScreen` 和 `BusinessCardBatchReviewForm` 负责双面切换、来源选择、重拍失效和卡片级动作。
- 版本：D 线原功能 `0a1ca09a4`、主线集成 `011b575bb`；共享契约与 App 副本已同步。
- 数据与幂等：每卡恰有一个 front、至多一个 back；确认事务锁定 actor/batch/card，校验两面版本和摘要，同一意图重放返回同一联系人。证据 ID 保留两面 item；联系人 draft identity 包含 batch，避免不同批次的 client `cardId` 碰撞。
- 旧 App：缺少 `cardId`／`side` 的 manifest 每图独立成为单面卡，并保留旧 manifest fingerprint；只允许这类真实 legacy 单面请求省略新确认元数据。
- 刷新／失败：重拍或重 OCR 改变 side 版本后旧来源选择失效，手工字段保留；失败的反面可独立重试；确认、跳过和清理均按整卡收口。
- 本地证据：App 全量 2603/2603；两端 typecheck exit 0；隔离 PostgreSQL 名片 API／repository 28/28；Web 全量中的 D 线相关断言无新增失败。详见 `repos/orbit-app/docs/sprints/0007-two-sided-cards/REPORT.md`。
- 未检查：真实迁移、真实 OCR、实体相机拒权／重拍、真实联系人写入、Web→App／App→Web 同记录回读、部署版本和实际新增费用。
- 关闭条件：实体 iPhone 在线，并在同一已配置环境用授权双面样本完成拍摄→OCR→来源复核→一次创建；记录 App/API 版本、脱敏 card/contact ID、两端重开、图片过期及累计费用。

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

- web_status：功能 HEAD `3de117902`。Web 能分页读取全部会话，改名、置顶、移动、确认删除，并创建／改名／删除分组；写入走 revisioned PATCH，focus 时刷新。
- app_status：同一 HEAD 的 App 支持同一组操作，长按和“整理会话”共用操作面板；组内新会话在首次可靠发送成功后以 organization revision 0 落组。
- verification_status：Web 0021 定向 39/39、App 定向 95/95，两端 typecheck 通过；冲突、失败保稿、删除 tombstone 和分页已有本地证据。未完成真实同账号双端断网／重开往返和当前 iOS 构建交互。
- 下一步：按 0021 REPORT 的固定次序使用测试记录完成 App→Web→App 写读；两端各删一个测试会话并核对 410／不可恢复。完成前保持 `consumer_ready`。

## BR-004 — 契约覆盖

- web_status：AI sessions 新增 `shared/contract/ai-sessions.ts` 和 `shared/api-schema/ai-sessions.ts`；发送 protocol v2，起源 schemaVersion 1，消息 revision 与 organization revision 分离。其余模块沿用既有迁移状态。
- app_status：AI sessions 副本通过 `npm run sync:contract` 生成并由运行时 schema 解码；App mutation 客户端只发送窄 patch。Ledger 与活动运营等既有未共享 DTO 不因本次自动关闭。
- verification_status：两端类型检查、同步副本、origin／organization handler 和客户端定向测试通过；GitNexus 索引陈旧，提交范围另按真实 diff 审查。全接口字段覆盖仍未验收。
- 下一步：0006 使用已登记的四个 contact 模板入口和稳定引用，不复制契约；必须补当前 actor 联系人读取授权。其他 DTO 继续按消费者逐模块迁移。

## BR-005 — 双向读写与刷新

- web_status：会话组织写入由 actor-scoped API／事务存储完成；页面 focus 刷新，未新增 WebSocket。
- app_status：会话列表／分组经 HTTP 和 actor／服务器范围读取；进入页面、focus 或显式操作后刷新，失败不把本地状态冒充持久化成功。
- verification_status：双 actor、旧客户端、CAS、回滚、61 条删组与 tombstone 已在内存和一次隔离 PostgreSQL 中验证；没有同版本真实账号 E2E，状态为 `specified`。
- 下一步：按 [数据交接验收](contracts.md) 使用同一环境和测试会话完成双向操作；记录 Web focus、App 重开／focus 的刷新时间与最终 revision。其他业务模块仍逐项验收。

## BR-006 — 发布

- web_status：2026-09-06 发布记录仍有 21 个全量测试失败、1 个跳过；远程部署未完成。
- app_status：源码默认 localhost，可配置 API 地址；本轮未核实设备运行地址或公网构建。
- verification_status：本轮两端类型检查通过，但 Web 全量/生产构建/远程未重跑。
- 阻塞：发布记录 1C 未通过、无本轮可验证的共同公网版本。此阻塞只限制发布验收，不阻止其他本地 bridge 工作。

## BR-007 / BR-008 — 文档与进行中工作

- BR-007：App README 的部分运营写操作描述和 Web 契约迁移清单落后；本次在 bridge 标出差异，尚未修改各开发者原有文档。
- BR-008：App 74 个 tracked 文件及额外未跟踪内容已记录在基线快照；不能把当前 SHA 单独作为它们的可复现版本。最终交接由 App 负责人提供适用 commit/diff 与 UI 验收。
- 两项 verification_status 均为未完成；没有将任何任务擅自标记为另一位开发者已接单。

## BR-009 — 事项与个人日程编辑

- web_status：`d005c2b79` 已提供任务地点／日期清空、乐观版本与幂等写入，以及 actor-owned 个人日程集合／详情路由和 Web 编辑页面。
- app_status：同一提交同步契约并接入任务详情、首页、Today、日历和个人日程列表／编辑入口。
- verification_status：verified。独立 PostgreSQL 中同一任务和个人日程完成 Web→App、App→Web 回读；冲突保稿、重复请求、纯日期不造午夜截止、提醒 DTO 保持不变。鉴权为注入的合成 actor，未宣称生产登录或实体推送。
- 交接：0022 使用同一 task ID、`expectedUpdatedAt` 和 idempotency key；不得重新实现编辑器或把个人日程混成联系人任务。证据见 `repos/orbit-app/docs/sprints/0010-task-schedule-editing/REPORT.md`。

## BR-010 — 身份邀请与共享聊天

- web_status：E 线原功能 `6d8173b78`、主线集成 `64629369d` 提供邀请、接受、绑定、会话、消息和已读路由及共享 DTO。
- app_status：联系人资格、显式分享、邀请接受和真实会话收发已接入；失败保留输入，回执核对 actor／conversation／message／eligibility version。
- verification_status：verified。定向 service/route/App、PostgreSQL 双 actor 回读和 Simulator 构建通过；没有自动对外发送邀请，也未把合成 actor 当真实个人身份。
- 交接：0012 只在该权威会话与绑定上做消息状态，不得退回本地草稿会话。详情见 `repos/orbit-app/docs/sprints/0008-identity-chat/REPORT.md`。

## BR-011 — 消息状态与推送

- web_status：复用 BR-010 的持久已读接口；服务端 live-store 回读通过。
- app_status：E 线原功能 `218fb3d4b`、主线集成 `8c9bf60cc` 已实现15秒前台刷新、已读回执、角标失效和合法通知跳转。
- verification_status：blocked。App全量2589/2589、E定向411/411、主线组合260/260、两端typecheck及PostgreSQL 通过，但没有 Expo project ID、`ORBIT_PUSH_TOKEN_KEY`、可登录双用户原生账号和实体推送环境。
- 恢复条件：提供上述环境后验证持续前台到达、真实已读角标同步、无权限目标及实体推送；完成前不把0012标为completed。详情见 `repos/orbit-app/docs/sprints/0012-message-state/REPORT.md`。
