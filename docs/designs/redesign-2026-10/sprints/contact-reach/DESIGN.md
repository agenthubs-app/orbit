# 联系 TA（contact-reach）· 总设计（2026-11-16 定稿）

设计稿：[`docs/designs/contact-reach-2026-11/index.html`](../../../contact-reach-2026-11/index.html)（①–⑦，用户 2026-11-16「定稿，开始做」）。
用户决定（同日）：
- **U1** 推翻 10-27「站内消息止于草稿」：对 Orbit 联系人，站内信**真正发送**。给名片联系人的邮件仍止于草稿，Orbit 不代发邮件。
- **U2** 人脉里「起草」+「提议时间」合并为一个主按钮「联系 TA」；写消息时可「插入候选时间」。
- **U3** 新增「可约时间」设置；选时段与自动预选都按它。不做公开预约页。

## 摸底事实（2026-11-16，只读调查）

- 站内信服务端完整可用：`POST /api/relationship-communication/conversations/{id}/messages`（幂等、`qualificationVersion` 校验、测试齐）。8316390c0 只删了两端 UI；App 的 outbox（`useRelationshipMessageOutbox`、`message-outbox-upload.ts`）仍在。
- **两套资格互不相通**：站内信 = `invite_connections`（`canStart`）或已接受的邮件邀请（`canSend`）；提议 = 活动上已接受的名片互换（`event_ops_contact_requests` accepted + `event_ops_relationship_sides`，`features/appointments/contact-authority.ts`）。
- **消息与预约没有任何关联**（`relationship_messages` 无 appointment 字段）。
- **接受提议**：只有 Web 旧联系人页 `OrbitAppointmentNegotiation` 能 accept；**App 完全没有接受入口**。
- **没有任何可约时间存储**；规则写死在 Web `meeting-availability.ts` / `MeetingProposalModal.tsx` 与 App `meeting-proposal-flow.ts`。最接近的偏好存储是 LiveRecordStore（`agentPreferences` 集合，含 `quietHours`、`timeZone`）。
- 契约同步：orbits `shared/{contract,api-schema,compute}` → App `npm run sync:contract`，`contract-sync` 测试逐字节比对。

## 实现决定（协调者按设计稿与成熟做法定，均可逆；revision 2 已吸收 Codex 方案 review 2026-11-16 的 13 条意见，见文末）

- **D1 Orbit 联系人与两种能力**（资格接口一次返回，两端据此决定路径）：
  - **能发站内信** = 邀请码互连（未解除）／已接受的邮件邀请会话／活动上已接受的双向名片互换（**新增**：这条返回 `canStart:true`，`startConversation` 接受它建会话）。
  - **能收提议**（新字段 `canProposeMeeting`）= 活动互换（现状，`contact-authority.ts`）**或未解除的邀请码连接**（新增：`invite_connections` 本身带双方 contactId，满足 appointment 的 `contactIdsByActor`；每次读取/创建都实时复核，解除后立即失效）。**只有邮件邀请会话的人能发消息、不能插入时间**（无双边联系人记录）；此时「插入候选时间」不显示——与设计稿 ② 的差异，REPORT 注明。
  - **会话唯一性**：活动互换建会话时按「两位账号（排序后）」加事务锁查重：同一对账号只有一个活跃会话；联系人合并不影响（按账号对找）。双方同时 start 只得一条。
- **D2 一个会面一个对象 + 原子发送**：提议仍是现有 appointment。消息加可空 `appointmentId`。**带提议的发送是一个服务端命令**（`POST conversations/{id}/messages` 的请求体可带 `proposal`，与 initial-proposal 的 proposal 结构相同）：同一事务内建 appointment、写消息、写 outbox；任一步失败全部回滚，绝不出现「有提议没消息」。若两张表不在同一数据库/连接，退回「先建不可见 draft appointment → 写消息 → 同事务把 draft 发布为 proposed」，并为遗留 draft 定清理规则。幂等：同一 Idempotency-Key 重放返回原消息与原 appointment。
- **D2b 一对关系只有一个进行中的会面**（现有唯一约束）：已有待确认/已确定且未结束的会面时，「插入候选时间」改为显示那条会面（时间、状态）+「改期」（走现有改期流程）；已确定且已结束的会面，服务端在新建前先执行 `complete`。
- **D3 对方接受**：会话里按 `appointmentId` 渲染提议卡（`GET /api/appointments/{id}` + `commands accept|counter`），两端都做；读取链要带上 `appointmentId`：消息存储、Web 分页读取（`bounded-reader.ts`）、App 离线镜像（`sync/relationship-message-domain-reader.ts` 及本地表）、发送回执校验。App 通知详情的 `?appointmentId=` 定位到对应会话里的卡。
- **D4 可约时间**：新契约 `scheduling-availability`（星期集合、起止时刻、可选午休一段、默认时长 30/60/90、至少提前 15m/1h/4h/1d/2d、前后留出 0/15/30、`timeZoneMode: "device" | "fixed"` + 固定时区）；LiveRecordStore 新集合按 actor 存；`GET/PUT /api/scheduling/availability`。**默认值 = 现状**（周一至五 9:00–18:00、无午休、60 分、提前 15 分钟、无缓冲、跟随设备时区）。纯函数放 `shared/compute/meeting-slots.ts`，**计算函数总是接收客户端解析好的有效时区**；保留现有忙闲「unknown / complete」语义：日历读取不完整时格子为 unknown，自动预选只用确认空闲的格子。
- **D5 邮件路径**：沿用 `reconnect-draft` 模板；插入时间 = 客户端用 `meeting-slots` 的格式化函数插入一段文字（重选只替换这一段）；「复制」+「用邮件 App 打开」（`mailto:`；名片无邮箱时禁用）。不记录发送、不自动记往来。
- **D6 发送**：站内信不弹二次确认；Web 需在线；App 纯文字沿用 outbox，带提议的需在线。去掉两端「Orbit 不会替你发出」类文案。**写了没发的内容按「账号 + 联系人 + 路径」存在本机**（Web sessionStorage——关标签页即清，同 `orbit-ask-draft.ts` 的共用电脑考虑，R41 收口时协调者改定；App AsyncStorage，try/catch），重开恢复，发送成功后清除；换联系人不串。
- **D7 入口**：Web 抽屉「为什么是 TA」只留「联系 TA」+ 路径说明；「添加日程」挪到抽屉头部 📅。App「次の一手」整宽按钮改「联系 TA」；**App 的 📅 统一挪进头部 `headerActions`**（现在在资料操作行、且邀请码联系人没有）。读 eligibility 失败按邮件路径，不阻断。
- **部署提醒**：消息表加列需要生产迁移，部署时按记忆里的「构建内迁移」做法，另等用户授权。

## Sprint 拆分（依次执行：无外接盘，不能并行工作树）

| Sprint | 内容 | 档位 | 依赖 |
| --- | --- | --- | --- |
| [R39](R39/PLANNER.md) | 后端：资格与 `canProposeMeeting`（D1）、原子「消息 + 提议」（D2/D2b）、读取链（D3）、迁移、契约 + App 同步 | H | — |
| [R40](R40/PLANNER.md) | 可约时间：契约、存储、接口、`shared/compute/meeting-slots.ts`、App 同步 | L | — |
| [R41](R41/PLANNER.md) | Web：抽屉入口、联系 TA 弹窗（两条路径）、选时段改造、设置 › 日程、收件箱发送 + 提议卡接受 | H | R39、R40 |
| [R42](R42/PLANNER.md) | App：联系人页入口、写消息页、选时段（按天列表）、设置、收件箱发送 + 提议卡接受 | H | R39、R40 |

全部完成后：两端全量测试各跑一次（对照基线零新增），推送与部署另等用户授权。

## 通用规则（每个 PLANNER 都适用）

- 直接在 `chat-agent` 提交，`git commit -- <路径>` 限定路径，提交前 `git diff --cached` 只有自己的文件；工作区里别人的未提交文件（`.claude/launch.json`、`repos/orbits/tsconfig.json` 等）不碰。
- 测试基线：改之前先在同一批测试上跑一次记下失败集，收口对照零新增。**本机 shell 是 zsh**：测试列表用 bash 数组或逐个写，`$T` 不会按空格拆。
- orbits 只跑几个文件：`cd repos/orbits && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node scripts/run-node-tests.mjs <文件…>` 或 `npx tsx --test <文件…>`；App：`cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs <文件…>`。
- 改 `shared/**` 后 App 跑 `npm run sync:contract`，副本与源同一提交。
- 生产部署前要真跑 `npx tsc --noEmit -p tsconfig.build.json`（orbits）；Icon 尺寸只能 12/13/15/16/20/21/24。
- 不调用付费 AI；不写生产库；不部署；不 push。
- 文案三语（ja/zh/en），去 AI 感（标签说过的词值里不重复，按钮不配说明句）。

## Codex 方案 review（2026-11-16）裁决

13 条全部接受：1/2/3/7 → D1 改为「提议依据 = 活动互换或未解除邀请码连接」+ 账号对查重；4 → D2 原子命令；5/6 → R39 迁移写法与读取链；8 → D2b；9 → R39 Postgres 为完成条件；10/11 → D4；12 → D6 本机草稿；13 → D7 App 📅 进头部。
