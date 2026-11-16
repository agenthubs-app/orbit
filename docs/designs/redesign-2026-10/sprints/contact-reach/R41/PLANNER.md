# Sprint R41 — Web：联系 TA、选时段、设置 › 日程、收件箱发送与接受

**Plan revision:** 2（吸收 Codex review 4、8、11、12）。**模式:** existing-codebase / single-generator。**档位:** H（多屏改动、真实发送、跨模块）。
**依据:** [DESIGN.md](../DESIGN.md) D1–D7；设计稿 ①②③④⑤⑥（**界面以设计稿为准，偏离必须先在 REPORT 写明理由**）。
**单一目标:** 在 Web 上，从人脉抽屉点「联系 TA」：Orbit 联系人能写站内信、插入候选时间并真正发送，对方在收件箱里一点就能接受；名片联系人得到带候选时间文字的邮件草稿，可复制或用邮件 App 打开；用户能在设置里改可约时间。
**进入条件:** R39、R40 已提交（读它们的 REPORT「交接」一节即可：新增字段名、接口路径、纯函数签名）。

## 上下文包

必读文件：
- `repos/orbits/app/(app)/app/orbit-2026/network/ContactDrawer.tsx` — 现状：「为什么是 TA」卡里有「起草」（抽屉内模板草稿，d59ae01f6）和「添加日程」链接（6433bb0d8，`scheduleWithContactHref` / `stashScheduleContact`）。两者都要被「联系 TA」+ 头部 📅 取代。
- `repos/orbits/app/(app)/app/orbit-2026/network/network-api.ts` — `reconnectDraft`；在这里加 eligibility / start 调用（`/api/relationship-communication/eligibility?contactId=`、`POST /conversations/start`）。
- `repos/orbits/app/(app)/app/orbit-2026/calendar/MeetingProposalModal.tsx`、`meeting-proposal-client.ts`（`create` = POST initial-proposal、`prepareMeetingProposal`）、`meeting-availability.ts` — 选时段网格；改为「插入模式」一步完成，网格按 R40 的 `availabilityGrid`，预选按 `seedMeetingSlots`；**改期（CalendarWorkspace 里带 appointmentId 的用法）行为不变**。
- `repos/orbits/app/(app)/app/orbit-2026/calendar/CalendarWorkspace.tsx` :109 — 现在唯一挂 `MeetingProposalModal` 的地方（改期），回归要保住。
- `repos/orbits/app/(app)/app/inbox/bounded-contact-messages-tab.tsx`（composer 约 :209–219，现在只有「保存草稿」和「Orbit 不会替你发出」）、`bounded-contact-messages-view-model.ts`（`readReplyDraft`/`saveReplyDraft`；8316390c0 删掉的 `sendWindowMessage` 要恢复，可 `git show 8316390c0 -- <文件>` 取回原实现再改）、`relationship-inbox-panel.tsx`（约 :1269 挂载点）。
- `repos/orbits/app/(app)/app/events/[id]/orbit-appointment-negotiation.tsx` 约 :219 — 现有「每个候选一个接受按钮 → `command("accept", {candidateId})`」的逻辑，提议卡复用其命令调用（不复用旧样式）。
- `repos/orbits/app/(app)/app/orbit-2026/account/AccountLayout.tsx` :19–28（设置菜单）、`app/(app)/app/settings/[section]/page.tsx`（未知 section 走准备中页）、`orbit-2026/account/IntegrationsSettings.tsx`（日历连接卡，⑤ 页下方引用其状态）。
- `repos/orbits/app/(app)/app/orbit-2026/copy/{network,task}.ts`（三语文案表）、`orbit-2026/ui/index.ts`（Modal、Button、Segmented、TextField、Toggle、useToast…，只用组件库与 token）。
- 页面规则：`repos/orbits/docs/development/web-no-flash-and-cache-rules.md`（必须写进验收）。
- R39/R40 REPORT 的交接节。

易错边界（都有 SC）：
1. **路径判定**：抽屉读一次 eligibility：`canSend` 或 `canStart` → 站内信路径；否则（含读取失败）→ 邮件路径。站内信路径首次发送前若只有 `canStart`，先 `POST conversations/start` 再发。`canProposeMeeting:false` 时不显示「插入候选时间」。读取未完成时按钮先显示骨架/禁用，不得闪变文案（no-flash）。
2. **发送是一个请求**：带时间 = `POST messages {body, proposal}`（R39 原子命令），一个 Idempotency-Key（每次打开弹窗生成一个 composeId，重试复用）；失败保留内容可重试；409（已有进行中的会面，响应带 appointmentId）→ 提议卡位置改为显示那条会面 +「改期」（打开现有改期弹窗）。成功后关闭、Toast「已发送」、清除本机草稿。
2b. **本机草稿**：按「账号 + 联系人 + 路径」存 localStorage（try/catch），关闭重开恢复、换联系人不串、发送成功清除。
2c. **打开「插入候选时间」前**若该联系人已有待确认/已确定未结束的会面（可从 409 或 appointments 列表得知），直接显示那条会面 +「改期」，不让再选新时间。
3. **不改坏改期**：`MeetingProposalModal` 带 `appointmentId` 的改期路径 UI 与请求不变。
4. **邮件路径不发任何站内请求**、不记往来；名片无邮箱时「用邮件 App 打开」禁用；`mailto:` 主题正文正确编码。
5. **提议卡状态**：待接受（每个候选「选这个」）→ 接受后收成「已确定 …」；过期（候选都过了）灰显只留「提议其他时间」；自己发的卡不显示「选这个」；`expectedVersion` 冲突时刷新再试并提示。
6. 收件箱恢复「发送」；删除「Orbit 不会替你发出」；离线/失败保留草稿。

## 范围与文件

- 修改：上列 ContactDrawer、network-api、MeetingProposalModal（加插入模式与可约网格）、inbox 三个文件、AccountLayout、copy 表；`app/(app)/app/settings/` 新增 `schedule` section 路由。
- 新建：`orbit-2026/network/ContactReachModal.tsx`（设计稿 ②③）、`orbit-2026/inbox/AppointmentProposalCard.tsx`（⑥，会话里与发送方都用）、`orbit-2026/account/ScheduleSettings.tsx`（⑤）、对应测试。
- 排除：App（R42）；通知投影改造；公开预约页。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R41-01 | 抽屉：Orbit 联系人显示「联系 TA」+「站内信 · 对方在 Orbit 上」，名片联系人显示「写邮件草稿 · 由你自己发送」；头部 📅 = 原添加日程（带联系人）；不再有「起草」「添加日程」按钮；读取中无文案跳变。 | 组件测试 + 本地生产构建截图/逐帧位置（no-flash 规则） |
| SC-R41-02 | 站内信：预填模板 → 插入 3 个候选 → 发送 = 一个 `POST messages{body,proposal}`（重试同一幂等键）；只有 canStart 时先 start；`canProposeMeeting:false` 无插入入口；409 显示现有会面 + 改期；本机草稿恢复/清除/不串。 | 组件测试（请求序列断言）+ 本地浏览器实测（拦截写请求或用测试库） |
| SC-R41-03 | 邮件：模板正文 + 插入时间后出现格式化段落（R40 函数），重选只替换该段；复制、mailto 链接内容正确；无邮箱禁用；0 个站内请求。 | 组件测试 |
| SC-R41-04 | 选时段：网格按可约时间（off 格不可点、busy 斜纹、unknown 可选带提示、已选编号；日历读取不完整时不自动预选）；打开预选 3 个；右栏「按你的可约时间 · 修改 ›」跳设置；「插入 N 个时间」一步完成；改期路径回归测试全绿。 | 组件测试（含现有 MeetingProposalModal 测试） |
| SC-R41-05 | 设置 › 日程：读写可约时间（R40 接口），即改即存 + Toast；非法组合在界面上阻止；收件箱：「发送」恢复，会话里提议卡可「选这个」接受（`command accept`）后显示已确定，过期/自己发的状态正确。 | 组件测试 + 浏览器实测截图 |

## 执行顺序

1. 基线（列出的组件测试 + `tests/ui/no-hardcoded-copy.test.ts`、`t-requires-ja`、`orbit-2026-css-tokens`、`calendar-workspace`、inbox 相关测试）。
2. 依次实现 SC-04（选时段插入模式，后面两个弹窗都依赖）→ SC-02/03（联系弹窗）→ SC-01（抽屉）→ SC-05（设置与收件箱）。
3. 本地 `orbits` dev server 实测：抽屉两种联系人、发送（写请求拦截或指向测试库，不写共享开发库）、设置页、收件箱接受。
4. `tsc -p tsconfig.build.json`；路径限定提交（按 SC 分几笔）；写 `R41/REPORT.md`。

## 最小测试与检查

定向：新增组件测试、上列现有测试、`tests/ui/network-screen.test.tsx`、`tests/pages/calendar-workspace.test.tsx`、inbox 测试（`grep -l bounded-contact-messages tests`）。H 档：本 Sprint 收口跑一次 orbits 全量（对照基线）。
