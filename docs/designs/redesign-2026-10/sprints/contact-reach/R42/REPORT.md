# Sprint R42 — REPORT（2026-11-17）

## 结果

SC-R42-01～04 通过；SC-R42-05 设置页、改期回归、`tsc` 对照通过，**模拟器实测未做**（会话的模拟器访问请求两次无人应答，未绕过授权）。R41 偏离 8（copy-qa 旧「不代发」规则）已按 U1 收窄。协调者复跑 `contact-reach-screen` + `network-screen` + `relationship-inbox-lifecycle` 39/39；App `tsc` 只剩既有 `tests/ios-scene-lifecycle-config.test.ts(47,16)`。

## 提交

| SHA | 内容 |
| --- | --- |
| `3c7c8bbab` | orbits copy-qa：`USER_SENDS_IN_APP`（「連絡する」与收件箱回复的「送信/送信中/送信しました」键豁免旧禁令）；`BEHALF`（「代わりに送信/代发/替你发/sent by Orbit」肯定式对所有键禁止）；「日程」进日中同形白名单；测试与 README。 |
| `3a1824702` | App 主体：联系人页入口；写消息页 `/contacts/reach/[id]`（`ContactReachScreen`、`contact-reach-model`）；`MeetingSlotPickerSheet`（按天列表）+ `scheduling-availability-client`、`meeting-slot-text`；`AppointmentProposalCard` 及 client；收件箱恢复发送、会话内提议卡、通知定位；设置 › 日程（`/settings/schedule`、`ScheduleAvailabilityScreen`）；三语文案、copy-kinds、路由与离线清单、测试。 |
| `cb3d28e19` | 设置 › 日程挂 online-only 边界；离线清单 sprint 类型加 R42。 |

## SC 表

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 入口 | 通过 | `network-screen` 25/25：两种路径说明；邀请码联系人头卡「メッセージ」去掉；📅 在头部带 contactId；读取中禁用 + 骨架；每人都读 eligibility；无「下書きを作成」。 |
| 02 站内信 | 通过 | `contact-reach-screen`（14 例）：预选 3 个后只发一个 `POST messages{body,qualificationVersion,proposal}`，`Idempotency-Key reach:<id>:0`，无 initial-proposal；canStart 先 start；503 保留、同 key 重试；409 显示现有会面 +「日程を変更」；`activeAppointmentId` 打开即显示；`canProposeMeeting:false` 无入口；离线带时间禁用、纯文字进 outbox 0 POST；草稿恢复不串、发送清除；不完整不预选、未確認可手选；busy 禁用、面谈必填地点。 |
| 03 邮件 | 通过 | 收件人、主题；段落插在结尾敬语前、重选只换该段；复制、mailto（编码 + CRLF）；无邮箱提示并禁用、打不开邮件 App 提示复制；0 站内写请求。 |
| 04 收件箱 | 通过 | `relationship-inbox-lifecycle`：发送恢复、失败保留、同 requestId 重试、回执匹配清空；提议卡「选这个」→ `accept{candidateId,expectedVersion}` → 已确定。`relationship-offline-send-ui`：离线进本机队列。自己发的「返事待ち」、全过期「期限切れ」+「別の時間を提案」、409 重读。`/contacts/{id}?appointmentId=` 有会话跳 `/inbox/conv?appointmentId=`，无会话卡片显示在联系人页。 |
| 05 设置 | 部分 | 点「土」PUT 全 9 字段 + Toast；结束选项从开始 +30 分；去掉最后一个星期被阻止；失败回滚；午休默认 12–13；「変更 ›」跳设置；改期回归 `meeting-*` 全绿。模拟器截图未做（只有 react-native-web 390pt 测试截图，在 scratchpad/shots/）。 |

## 基线对照

- 定向 114 文件：812 例、失败 5，全在基线失败集。
- App 全量：基线 `31ea0a1d6` 干净导出 3544/fail 6 → 最终 3562/fail 6，按名对比**新增 0**（中途暴露 4 个问题均已修）。
- App `tsc`：改前改后错误列表逐行相同。
- orbits 全量：8349/fail 22（R41 8348/22），对 R42 前干净导出按名对比**新增 0**。
- copy:qa forbidden 回到基线 3 条（既有英文 "we"）。

## GitNexus

LOW：`NetworkContactScreen`、`ThreadDetail`、`relationshipMessagePageView`、`AccountSettingsContent`、`ScopedRelationshipInboxThreadScreen`、`checkCopy`。MEDIUM：`RelationshipMessageView`（24，只加可选字段）。UNKNOWN：`ReplyComposer`、`NotificationDetail`（文本搜索确认只在本文件）、`ContactDetailRoute`（未改）。detect-changes high（i18n 字典扇出），以两端全量零新增为对策。索引落后 21 提交未重建。

## 与设计稿的偏离（协调者裁决：全部接受）

1. 写消息页左上 ✕ 图标（AppScreen 顶栏只放图标）。
2. 邮件「メールアプリで開く」在正文下与「コピー」同排（右上会把标题挤成 4 行）。
3. 选时段「N 件を挿入」在弹层右上（iOS sheet 惯例）；按天列表不画不可约格；今天剩余时段也列。
4. 无下一步的联系人也显示卡片（按钮 + 路径行，同 Web）。
5. 去掉邀请码联系人头卡「メッセージ」（与「連絡する」重复）。
6. 设置：半点选项底部弹层而非滚轮；提前/留出用 ActionSheet；时区只显示跟随设备；入口在「連携」后「通知」前。
7. 收件箱「发送」用新 ui `Button`，旁边仍是旧 Ionicons `ActionButton`；输入框标签「返信下書き」未改（R03 快照键）。
8. R41 偏离 1–7 同样适用。

## 假设

- 发送成功回联系人页 + Toast，不跳会话。
- 离线 = `auth.offline` 或本机消息镜像离线；纯文字离线只在已有会话时进 outbox，只有 canStart 时离线不能发。
- 草稿 AsyncStorage `orbit.contactReach.draft:<account>:<contact>:<path>`（个人设备）。
- 幂等键：写消息 `reach:<每次打开 UUID>:<n>`；提议卡命令按（会面, version, 命令, 载荷）。
- 提议时区 = 可约时间有效时区；卡片按设备时区显示。
- eligibility 内存缓存，写消息页先缓存再重读，重读失败保留原答案。
- 通知 `?appointmentId=`：有会话进会话并描边该卡，不在已载入页则置顶。
- 设置 › 日程 online-only。copy-qa 例外按键 id 列出。

## 未完成 / 受阻

- **模拟器四屏截图**（联系人页、写消息、选时段、设置；只开屏不发送）：需用户在模拟器面板授权后补。
- 真库发送 / accept 端到端未验证（同 R41）。
- 收件箱整屏 Ionicons → Icon 未做。
- push、部署、TestFlight 未做（按规则）。
