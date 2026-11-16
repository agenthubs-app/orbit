# Sprint R42 — App：联系 TA、写消息页、选时段、设置、收件箱发送与接受

**Plan revision:** 2（吸收 Codex review 4、8、11、12、13）。**模式:** existing-codebase / single-generator。**档位:** H。
**依据:** [DESIGN.md](../DESIGN.md) D1–D7；设计稿 ⑦（App 画板）及 ②③④⑤⑥ 的同一行为（**界面以设计稿为准，偏离先在 REPORT 写明**）。
**单一目标:** App 上与 Web 同样的联系闭环：联系人页「联系 TA」→ 全屏写消息（站内信可插入候选时间并发送 / 名片联系人得到邮件草稿）；对方在 App 收件箱也能一点接受提议；设置里能改可约时间。
**进入条件:** R39、R40 已提交并同步契约；R41 已提交（参照它的组件拆分与文案，不共享代码）。

## 上下文包

必读文件：
- `repos/orbit-app/src/screens/network/NetworkContactScreen.tsx` — 「次の一手」卡的「下書きを作成」（页内草稿，7f2292f58）要换成「联系 TA」+ 路径说明；现有 eligibility 调用只在有邀请码连接时发（约 :134–158，`relationshipCommunicationEligibilityPath`、`relationshipCommunicationStartPath`），要改为**总是**读一次（读失败 → 邮件路径）；📅（`/schedule/personal/new?contactId=`）**现在在资料操作行、且邀请码联系人（`self` 分支）没有**——要挪进头部 `headerActions`，所有非本人联系人都有。
- `repos/orbit-app/src/screens/calendar/meeting-proposal-flow.ts`（:16 `seedMeetingCandidates`、`validateMeetingCandidates`、initial-proposal 客户端约 :101/:122）、`MeetingProposalSheet`（`src/screens/schedule/MeetingDetailScreen.tsx` :291 用于改期）— 选时段改用 R40 的 `src/api/compute/meeting-slots.ts`，手机上按天列表；改期路径不变。
- `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx` — `ReplyComposer`（约 :1204）、`buttonRow`（约 :1352，「推敲」「保存草稿」）、约 :1368 的「10-27: relationship messages stop at drafts」注释处恢复「发送」；`useRelationshipMessageOutbox`（:370/:661 仍在用）与 `src/api/contact-communication.ts` 的 `buildRelationshipMessageDeliveryRequest` / `relationshipDeliveryReceiptMatches` 是现成发送通道；8316390c0 删掉的 App 发送代码可用 `git show 8316390c0 -- repos/orbit-app` 参考。
- `repos/orbit-app/src/screens/inbox/NotificationDetailScreen.tsx` :72 与 `app/contacts/[id].tsx`（现在忽略 `?appointmentId=`）— 提议通知要能落到提议卡（会话里或独立页均可，选与 Web ⑥ 一致的会话内卡片，通知点开定位到对应会话）。
- `repos/orbit-app/app/settings*.tsx`、`src/screens/me/AccountSettingsContent.tsx`、`src/screens/me/settings-api.ts` — 新增「日程 › 可约时间」入口与页面（星期圆点 + 时间选择 + 三个选项）。
- `repos/orbit-app/src/i18n/{ja,zh,en}/*.ts`（文案）、`src/components/ui/*`（Button、TextField、BottomSheet、Toast…）、`src/design/theme.ts`（token）。
- `repos/orbit-app/src/hooks/useOrbitApiClient.ts`、`src/api/endpoints.ts`（R40 已加路径函数）。
- R39/R40/R41 REPORT 交接节。

易错边界（都有 SC）：
1. 路径判定同 Web：`canSend`/`canStart` → 站内信，否则邮件；只有 `canStart` 时先 start。
2. 发送同 Web：带时间 = 一个 `POST messages{body,proposal}`（R39 原子命令，一个幂等键）；**带提议的消息需在线**（离线时「发送」禁用并提示，内容保留）；纯文字沿用 outbox，可离线排队，回执校验沿用 `relationshipDeliveryReceiptMatches`（R39 已加 appointmentId 核对）。`canProposeMeeting:false` 不显示插入入口；409 / 已有进行中会面 → 显示那条会面 +「改期」（现有 `MeetingProposalSheet`）。
2b. 本机草稿按「账号 + 联系人 + 路径」存 AsyncStorage，重开恢复、发送成功清除、不串人。
2c. 选时段按天列表沿用 unknown 语义：日历读取不完整时不自动预选。
3. 邮件路径：复制（expo-clipboard）、「用邮件 App 打开」（`Linking.openURL(mailto:…)`，失败 Toast）；无邮箱禁用；0 个站内请求。
4. 提议卡：与 Web 同状态机（待接受 / 已确定 / 已过期 / 自己发的不显示「选这个」/ 版本冲突刷新）。
5. 改期（`MeetingProposalSheet` 在 `MeetingDetailScreen`）行为不变。
6. 删除「止于草稿」相关提示文案；不碰 AI 推敲行为。

## 范围与文件

- 修改：上列文件；`app/` 下新增写消息路由（如 `app/contacts/[id]/reach.tsx`）与设置路由（如 `app/settings/schedule.tsx`）。
- 新建：`src/screens/network/ContactReachScreen.tsx`、`src/screens/inbox/AppointmentProposalCard.tsx`、`src/screens/settings/ScheduleAvailabilityScreen.tsx`、对应测试。
- 排除：Web；推送通知文案；TestFlight 打包。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R42-01 | 联系人页：两种联系人（含邀请码联系人）分别显示「联系 TA」+ 正确路径说明；不再有「下書きを作成」；📅 在头部、路由带正确 contactId。 | `tests/network-screen.test.tsx` 改写 + 新用例 |
| SC-R42-02 | 写消息（站内信）：插入时间（按天列表、按可约时间、预选 3 个、不完整时不预选）→ 发送 = 一个 messages{body,proposal}；离线时带提议的发送禁用；纯文字走 outbox；409 显示改期；本机草稿恢复/清除/不串。 | 组件测试（请求序列） |
| SC-R42-03 | 写消息（邮件）：正文插入格式化段落、重选替换、复制、mailto；无邮箱禁用；0 站内请求。 | 组件测试 |
| SC-R42-04 | 收件箱：「发送」恢复；会话里提议卡可接受并显示已确定；通知详情的提议能打开对应会话卡片；过期/自己发的状态正确。 | 组件测试 |
| SC-R42-05 | 设置 › 日程：读写可约时间，非法组合阻止；改期回归测试全绿；`npx tsc --noEmit` 无错。 | 组件测试 + 命令输出；模拟器实测截图（iOS 27 模拟器，PingFang 问题见记忆，不用 iOS 26） |

## 执行顺序

1. 基线（列出的测试 + `no-hardcoded-copy`、`copy-sync`、`i18n-domain-split`、`app-locale-*`）。
2. SC-02/03 选时段与写消息 → SC-01 入口 → SC-04 收件箱 → SC-05 设置。
3. 模拟器实测（能连本地 orbits dev server 时实测发送与接受；写请求只打到本地/测试库）。
4. 路径限定提交；写 `R42/REPORT.md`；H 档收口跑一次 App 全量与 orbits 全量（对照基线）。

## 最小测试与检查

定向：新增测试、上列现有测试、`relationship-*`、`meeting-*`、`network-screen`。收口：两端全量各一次。
