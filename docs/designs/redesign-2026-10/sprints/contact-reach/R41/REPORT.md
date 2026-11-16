# Sprint R41 — REPORT（2026-11-17）

## 结果

SC-R41-01～05 全部实现并有测试。协调者复跑 `tests/ui/contact-reach.test.tsx` 10/10。

## 提交

| SHA | 内容 |
| --- | --- |
| `6246219f9` | SC-04 选时段插入模式（`calendar/MeetingSlotPicker.tsx`，`MeetingProposalModal mode="insert"`）、`scheduling-availability-client.ts`、`meeting-slot-text.ts`、`meeting-availability` 可选 `firstDay` 与返回 `external`/`orbitOnly`、三语文案、UI harness `"process.env": "{}"` |
| `e7587a062` | SC-01/02/03 抽屉入口、`network/ContactReachModal.tsx`、`contact-reach-draft.ts`、`network-api` 加 `eligibility/startConversation/sendMessage`、`orbit-2026/inbox/AppointmentProposalCard.tsx` 及 client |
| `c776fdbae` | SC-05 `ScheduleSettings.tsx` + `settings/schedule/page.tsx`、设置菜单「日程」、收件箱恢复发送并挂提议卡、`tests/ui/contact-reach.test.tsx`（10 个浏览器测试）、两份收件箱测试改为断言发送 |
| 协调者 | 本机草稿改 sessionStorage（见裁决） |

## SC 表

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 抽屉 | 通过 | 读取中按钮禁用、路径行骨架，读完按钮 boundingBox 不变；两种路径说明；📅 在头部 = 原添加日程；旧按钮全无；eligibility 失败走邮件。dev 实测截图。 |
| 02 站内信 | 通过 | 只有 canStart 先 start 再一个 `POST messages{body,qualificationVersion,proposal}`；503 后正文保留、同一幂等键重试；成功关闭 + Toast + 清草稿；无单独 initial-proposal；`canProposeMeeting:false` 无入口；409 → 现有会面 +「日程を変更」；`activeAppointmentId` 打开即显示；草稿恢复不串。dev 拦截写请求验证形状。 |
| 03 邮件 | 通过 | 段落插在结尾敬语前、重选只换该段；mailto 编码 + CRLF；无邮箱禁用；0 个站内请求。 |
| 04 选时段 | 通过 | 规则行 +「変更 ›」到 `/app/settings/schedule`；busy 斜纹、午休 off；预选 3 个；一步插入无写请求；不完整不预选、unknown 可手选；站内信 ≥3、面谈必填地点。改期回归（meeting-proposal-modal ja/zh/en、first、flow、calendar-workspace、meeting-availability）全绿。 |
| 05 设置 + 收件箱 | 通过 | 选「土」→ PUT 全 9 键 + Toast；结束下拉无 ≤ 开始项；失败回滚；接受发 `accept{candidateId,expectedVersion}` + 幂等键，卡片收成「確定」；409 重读；自己发的「返事待ち」；全过期灰显只剩「別の時間を提案」；收件箱「送信」恢复、失败保留、同 requestId 重试。 |

## 基线对照

- 定向 22 文件：改前 168/失败 9 → 改后 178/失败 5（剩余 5 改前即有：contact-log-model 硬编码 ×3、按钮棘轮 107>80 未增、network-screen 招待更新超时；收件箱 4 个因 harness 修复转绿）。
- 全量 `npm test`：基线 `e83e360a9` 干净导出 8336/fail 33；R41 树 8348/fail 22；按测试名对比**新增失败 0**。
- `tsc -p tsconfig.build.json` 0 错。

## GitNexus

`ContactDrawer` CRITICAL（13）：props 不变。`MeetingProposalModal` HIGH（12）：不带 `mode` 走原组件，改期不变。`AccountLayout` HIGH（20）：菜单加一项。其余 LOW；`networkApi` UNKNOWN（只加方法）。detect-changes medium（1 流程 NetworkInner）。

## 与设计稿的偏离（协调者裁决：全部接受）

1. `canProposeMeeting:false` 不显示「插入候选时间」（DESIGN 已定）。
2. 已有会面时只有**已确定**的给「改期」（现有改期只接受 confirmed）；待确认只显示状态。
3. 站内信插入时间不往正文加句子（时间已在提议卡）。
4. 站内信面谈必填地点（appointment 要求）；视频链接须 https。
5. 选时段多「未確認」格与图例。
6. 设置菜单「日程」在「连接」后、「通知」前。
7. 收件箱右栏与空状态「只到草稿」说明改写（U1 已推翻）。
8. copy:qa 的「Orbit 不代发」规则把「送信/发送/Send」报 forbidden——规则早于 U1，**交 R42 顺带更新规则**。

## 假设与裁决

- 幂等键：每次打开生成 composeId；同内容重试复用、内容改了换新 key（`reach:<composeId>:<n>`）。
- 邮件草稿「用邮件 App 打开」后不清除。
- **本机草稿**：Generator 用 localStorage、退出不清；**协调者不接受**，改为 sessionStorage（同 `orbit-ask-draft.ts`），测试同步改。
- Google 日历未连接或 `connection:"off"` 按 Orbit-only 视为读全并预选。
- 时间按查看者设备时区显示；提议 timezone 用可约时间有效时区。
- 周视图从本周一起，只显示可约星期，最远今天 +14 天。

## 未完成 / 待收口

- **no-flash 生产构建逐帧测量未做**（只做了组件 boundingBox + dev 截图）→ 大目标收口时补。
- 收件箱发送与提议卡只在浏览器测试验证（本地 dev 库无会话）；`commands accept` 与接收方 `GET /api/appointments/{id}` 未在真实库验证。
- 旧文案键 `detailDraft*` / `detailNoSend` 未删。

## 交接（R42）

- 路径：`canSend || canStart` → 站内信，否则邮件；读失败按邮件。
- 发送：一个 `POST …/messages`，Idempotency-Key `reach:<composeId>:<n>`；`proposal = {candidateTimes:[{startsAtUtc}], durationMinutes, medium, note:"", timezone}`；只有 canStart 先 `POST conversations/start {contactId}`。
- 409 `MEETING_ALREADY_ACTIVE` → 显示 `context.appointmentId` 那条会面。
- 选时段：`availabilityGrid` + `seedMeetingSlots`；`not_connected`/`off` 按 Orbit-only 视为读全；站内信 3–5 个，邮件 ≥1。
- 邮件：`formatMeetingSlotsText` 段落，可加一行「場所 / 会議リンク / 電話：…」；重选 `replaceMeetingSlotsText(body, block, {previous})`。
- 提议卡：待处理 = `pendingProposalRevision` 对应 proposal；对方提议才有「これにする」→ `accept{candidateId, expectedVersion}`；全部过期 → `counter{proposal}`；409 重读。
- 文案键：Web `networkCopy.reach*`；`taskCopy.pick*/slot*/wd*/notice*/medium*/card*/schedule*/avail*/row*/calendarC*`；`accountCopy.schedule`（App 用自己的 i18n，参照措辞）。
- 服务端缺口：未发现。
