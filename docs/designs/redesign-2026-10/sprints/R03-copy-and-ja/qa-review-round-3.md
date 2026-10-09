# R03 关卡 2 · 第 3 轮独立审校（界面文案 100% 逐条）

- **审校日期：** 2026-10-10
- **审校人：** 独立 AI 审校（日语母语产品文案角色）
- **依据：** `glossary.md` v4、`style-guide.md` v4；第 2 轮审校 `qa-review-round-2.md` 及其处理记录
- **范围（100%，不抽样）：** 共 161 个键，日、中、英各审一遍：
  - `repos/orbits/shared/copy/{ja,zh,en}.ts`：118 个键；
  - `repos/orbit-app/src/i18n/{ja,zh,en}/shell.ts`：22 个键；
  - `repos/orbit-app/src/i18n/{ja,zh,en}/session.ts`：21 个键。

  我把三种语言的全部值重新导出、逐条看过：除了处理记录里列出的改动，其余的值和第 2 轮相同。
- **打分：** 准确 / 自然 / 术语 / 适合界面，每项 1–5 分。

## ① 结论

**达标。** 没有严重问题，也没有中等问题，三种语言四个维度的平均分都在 4.97 以上。
- 第 2 轮的 M1 和 L1–L4 都已改到位。
- 本轮新发现 1 个轻微问题（L1），以及第 1 轮同意保留的 2 条（L2、L3）。按 PLANNER F 节，轻微问题要么改掉，要么逐条写明保留理由，下面都给出了保留理由的建议，作者确认即可。

## ② 平均分

| 语言 | 准确 | 自然 | 术语 | 适合界面 |
| --- | --- | --- | --- | --- |
| 日 | 5.00 | 4.99 | 5.00 | 4.98 |
| 中 | 5.00 | 4.99 | 5.00 | 4.99 |
| 英 | 5.00 | 4.97 | 5.00 | 4.98 |

（共 161 个键；没有问题的条目记 5 分，扣分的条目见 ⑤。）

## ③ 问题清单

### 严重（0）/ 中等（0）

无。

### 轻微（3）

**L1　`session.ts` `session.pendingChangesBody`（中文）：「可继续」少了宾语（新发现，第 2 轮 L4 的残留）**
- 问题：「之后用同一账号登录可继续；也可以直接放弃。」里「可继续」没说继续做什么，日文和英文都写了「继续同步」。
- 建议文案：「退出登录前可以把这些修改加密保存在本机，之后用同一账号登录可继续同步；也可以直接放弃。」
- 如果不改，保留理由可写：「上下文是同步确认框，意思不会误解」。不过这里只需加两个字，建议直接改。

**L2　`nav.backTo`（日文）：标签是拉丁字母时少了空格（第 1 轮 L1，保留）**
- 保留，理由：占位符模板没法按标签内容决定加不加空格；只有「iOrbit / Task」两个标签受影响，可读性影响小；R05 重做返回栏时改为按标签类型选模板。我同意保留。

**L3　`error.viewCached`（日文）：「端末に保存済みを見る」略显紧缩（第 1 轮 L12，保留）**
- 保留，理由：这是设计稿原文（优先级 ①），意思清楚。我同意保留。

## ④ 第 2 轮逐条核对

| 编号 | 结果 | 说明 |
| --- | --- | --- |
| M1 quota.left | 已解决 | 「This month: {count} left」：保留了「本月」，不涉及单复数，长度合规 |
| L1 daysLeft | 已解决 | 「{count}d left」，紧凑自然 |
| L2 session 英文 | 已解决 | 「This device holds encrypted changes from another account ({count}). …」读起来自然；括号计数略显生硬，只在自然度上扣 1 分，不算问题 |
| L3 showWhy | 已解决 | 「Why this?」 |
| L4 session 中文 | 已解决（残留 1 处） | 继续使用此账号、无法验证登录身份、无法安全丢弃、上一个账号、直接放弃都已改；「可继续」少宾语，见本轮 L1 |

## ⑤ 评分明细

格式：键 | 日 | 中 | 英；每格四个分数依次是 准确 自然 术语 适合界面。

| 键 | 日 | 中 | 英 |
| --- | --- | --- | --- |
| `nav.home` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.network` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.iorbit` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.events` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.task` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.inbox` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.host` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.settings` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.me` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.main` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.back` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `nav.backTo` | 5 5 5 4 | 5 5 5 5 | 5 5 5 5 |
| `nav.askIorbit` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `taskSegments.calendar` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `taskSegments.todo` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `taskSegments.plan` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `taskSegments.notes` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.add` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.save` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.delete` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.undo` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.withdraw` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.complete` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.edit` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.cancel` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.close` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.retry` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.open` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.later` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.notNow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.tomorrow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.copy` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.gotIt` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.overdue` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.failed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.limitReached` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.today` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.tonight` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.daysLeft` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.waitlist` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.estimated` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.draft` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.waitingSync` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.inReview` | 5 5 5 5 | 5 5 5 5 | 5 4 5 4 |
| `chip.awaitingConfirmation` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.awaitingApproval` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.confirmed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.completed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.published` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.recommended` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.upcoming` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.going` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.registered` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.notRegistered` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.followUp` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.declineSuggested` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.completed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.movedToTomorrow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.addedToTasks` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.saveFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.savedOffline` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.syncLater` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.copied` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.deleted` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `confirm.deleteTitle` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `confirm.delete` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `confirm.irreversible` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `filter.clear` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `filter.showItems` | 5 5 5 5 | 5 5 5 5 | 5 4 5 5 |
| `filter.showPeople` | 5 5 5 5 | 5 5 5 5 | 5 4 5 5 |
| `filter.loosen` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.why` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.showWhy` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.add` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.decline` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.added` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.addFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.nothingWritten` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.reconnect` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `offline.banner` | 5 5 5 5 | 5 5 5 5 | 5 5 5 4 |
| `offline.pending` | 5 5 5 5 | 5 5 5 5 | 5 4 5 5 |
| `offline.synced` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.loadFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.checkConnection` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.inputKept` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.viewCached` | 5 4 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.screenFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.screenFailedBody` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.needsNetwork` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.needsNetworkBody` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.signInRequired` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `error.noAccess` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `degraded.iorbitUnavailable` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `degraded.iorbitStopped` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `loading.loading` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `loading.slow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `sample.banner` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `sample.tag` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `quota.left` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `quota.reached` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.openTarget` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.remindInHour` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.markRead` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.fewerLikeThis` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.openedFromPush` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.allowCamera` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.allowNotifications` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.notNow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.openSettings` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `homeEdit.edit` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `homeEdit.done` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `homeEdit.comingSoon` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.create` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.open` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.copy` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.openInMail` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.notice` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.noMessage` | 5 5 5 5 | 5 5 5 5 | 5 5 5 4 |
| `shell.parent.settings` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.me` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.importCenter` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.networkAnalysis` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.network` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.eventOperations` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.eventDetail` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.events` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.tasks` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.inbox` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.schedule` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.iorbit` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.relationshipChat` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.signIn` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.account` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.admin` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.live` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.home` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.checkingSignInLabel` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.checkingSignIn` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.errorDetails` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.noErrorDetails` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.serverChanged` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.pendingChangesTitle` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.pendingChangesBody` | 5 5 5 4 | 5 4 5 4 | 5 5 5 5 |
| `session.keepAndSignOut` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.discardAndSignOut` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.otherAccountTitle` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.otherAccountBody` | 5 5 5 5 | 5 5 5 5 | 5 4 5 5 |
| `session.backToSignIn` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.continueWithAccount` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.identityCheckFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.accountUnconfirmed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.otherAccountUnknown` | 5 4 5 4 | 5 5 5 5 | 5 5 5 5 |
| `session.switchCancelled` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.clearPreviousFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.saveSignInFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.googleIncomplete` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.pendingUnknown` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.signOutCancelled` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.discardFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.clearDeviceFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.clearSignInFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |

## 放回界面检查（2026-10-10）

- **审校人：** 独立 AI 审校（日语母语产品文案角色）
- **截图：** `/Users/li/orbit-sprint-evidence/redesign/R03/run-01/screens/`，18 张全部看过：
  - App：`app-shell-*` 6 张、`app-copy-*` 6 张（320pt，1 倍和 2 倍字号）；长图切片逐段看完。
  - Web：`web-copy-*` 375 和 1440 各 3 张。
- **看什么：** 有没有被截断、难看的换行、上下文不通、夹杂其他语言。
- **按说明不算问题：**
  - 左上「‹」和 1 倍图里显示成文字「chevron-back」的图标占位；
  - 2 倍图里错误页按钮被底栏遮住（演示排版）；
  - 底栏标签不随字号放大（iOS 惯例）；
  - Web 截图左侧的黑色圆形「N」是开发环境指示器，不是页面内容。

### 结论

**不通过：有 2 个中等问题。** 没有严重问题。
- 标准用词展示页：三种语言、App 和 Web 都没有截断，也没有上下文不通的地方。
- 问题集中在导航壳截图：一处截断（M1），一处夹杂英文（M2）。
- 2 倍字号下日文、中文的断行有不少难看的地方，属于排版层的轻微问题，不需要改文案。

### 问题清单

#### 严重（0）

无。

#### 中等（2）

**M1　英文 2 倍字号：返回栏标签被截断成「Sett…」**
- 截图：`app-shell-en-320-2x.png` 左上。
- 问题：返回标签「Settings」被截成「Sett…」，看不出要返回哪里。日文「設定」、中文「设置」在 2 倍下都能完整显示，只有英文出问题。
- 建议：按 iOS 返回按钮的惯例，标签放不下时退回到 `nav.back`「Back」（日「戻る」/ 中「返回」），不要截断。这是导航壳组件的行为，不用改文案。

**M2　日文和中文界面里，页面标题夹着英文「Language」**
- 截图：`app-shell-ja-320*.png`、`app-shell-zh-320*.png` 顶部标题。
- 问题：日文界面显示「‹設定　Language」，中文界面显示「‹设置　Language」。标题没有本地化，日文、中文用户看到的是夹杂英文的导航栏。
- 建议：
  - 标题走字典：日「言語」/ 中「语言」/ 英「Language」。
  - 如果是有意保留英文，方便误切语言的用户找回设置（一些 App 的做法），应写成双语「言語（Language）」/「语言（Language）」，并在术语表里登记这条例外。
  - 如果这只是测试替身里写死的标题、真实画面不会出现，请作者说明后降为轻微问题。

#### 轻微（4）

**L1　日文、中文在 2 倍字号下断行难看：单字孤行、词中断开（排版层，不用改文案）**
- 截图和例子：
  - `app-shell-ja-320-2x`：标题断成「この画面を表／示できません／でした」，「表示」被拆开；「詳しい情報はありませ／ん。」。
  - `app-copy-ja-320-2x`：
    - 「タスクに追加しまし／た」
    - 「保存できませんでし／た」
    - 「端末に保存済みを見／る」
    - 「接続後に同期されま／す」
    - 「インターネット接続が必要で／す」
    - 「送信はしません · 送／信はあなたが行います」（「送信」被拆开）
  - `app-copy-ja-320`（1 倍）也有「〜必要で／す」「〜くださ／い。」「取り消／せます」。
  - `app-shell-zh-320-2x`：「无法显示此页／面」「请重／试。」；`app-copy-zh-320-2x`：「…的内／容」。
- 建议：
  - 在共用的 Text 组件统一按词组断行：Web 用 `word-break: auto-phrase`（或 BudouX），App 对日文和中文用 BudouX 预处理插入断行点。
  - 中文根错误页标题可以顺便改短为「无法显示页面」（6 个字，2 倍字号下一行放得下），意思不变。
  - 其余文案不用改。

**L2　分隔符「 · 」被单独放到行首，或者把前后断开**
- 截图：
  - `app-copy-en-320-2x`：「Showing sample data／· Numbers and people…」「No message included／· You can withdraw it later」；
  - `app-copy-ja-320-2x`：「サンプルを表示中 ·／数字や…」「送信はしません · 送／信…」。
- 建议：「·」前面用不换行空格（U+00A0），让分隔符跟着前一段走。草稿边界标准句（`draftBoundary.notice`）本来就是两句，窄屏下更适合拆成两行显示。

**L3　中文 Web：「 · 」在中文字体里显示得太宽**
- 截图：`web-copy-zh-1440`、`web-copy-zh-375`：「离线 ・ 修改会…」「不会替你发送 ・ 由你自己发送」。
- 问题：U+00B7 在中文字体里按全角渲染，再加两侧空格，间距明显比日文、英文大。
- 建议：中文的分隔符字体回退到西文字体（给「·」包一层 span，指定拉丁字体）；或者中文版去掉两侧空格。

**L4　英文 2 倍字号：「This month: {count} left」在展示页里折成两行**
- 截图：`app-copy-en-320-2x`。
- 问题：展示页是「键 + 值」两栏布局，比真实的 chip 窄，所以折行了。真实 chip 是否能完整显示，要等 R05 / 功能 Sprint 用真实组件截图确认。
- 建议：暂不改。登记为「真实 chip 截图时复核」。

### 无问题的项（逐项看过）

- 导航壳：日文、中文、英文在 1 倍和 2 倍字号下的根错误页标题、正文、「错误详情」、重试按钮、底栏（ホーム / 人脈 / iOrbit / イベント / マイページ 等）都完整显示，没有夹杂其他语言（M2 的标题除外）。
- 标准用词展示页：App 1 倍 / 2 倍和 Web 375 / 1440 下，三种语言 118 个键都没有被截断；占位符 `{count}` `{item}` `{label}` `{reason}` `{target}` 都按原样显示；日文「iOrbit に聞く…」、中文「问 iOrbit…」的空格和省略号都正确。

## 处理记录（作者，2026-10-10）

| 问题 | 处理 |
| --- | --- |
| 文案 L1 | `session.pendingChangesBody` 中文改「之后用同一账号登录可继续同步」 |
| 文案 L2、L3 | 保留（审校同意的理由） |
| 截图 M1 英文返回栏截断 | 按 iOS 惯例：系统字号 ≥1.5 倍或目标名超过 12 字符时，返回按钮只显示「戻る / 返回 / Back」，读屏标签仍带目标名（`AppScreen`）。2 倍截图改为在字号 2 倍下渲染，规则生效 |
| 截图 M2 标题「Language」 | 不是产品文案：是截图夹具里写死的演示页标题（真实页面标题由各屏自己传）。夹具已改为按语言显示「言語 / 语言 / Language」 |
| 截图 L1 断行 | 中文错误页标题改短为「无法显示页面」。日文、中文按词组断行（iOS `lineBreakStrategyIOS`）放进 R04 的共用文字组件，那是组件层的统一做法 |
| 截图 L2 分隔符 | 标准用词里所有「 · 」改为「不换行空格 + · + 空格」，「·」不会被挤到行首 |
| 截图 L3 中文 Web「·」偏宽 | 保留：字体渲染（中文字体里 U+00B7 是全角宽），R06 定 Web 字体栈时一起看 |
| 截图 L4 英文配额折行 | 保留：展示页两栏布局比真实 chip 窄；真实 chip 在 R04 组件截图里复核 |

## 放回界面复查（2026-10-10）

- **审校人：** 独立 AI 审校（日语母语产品文案角色）
- **截图：** 同一目录下重拍的 18 张（02:44），全部看过：
  - `app-shell-*` 6 张逐张看；
  - `app-copy-*` 和 `web-copy-*-375` 切片后逐段看；
  - `web-copy-*-1440` 看整图。
  - 另外：日文、英文的 Web 截图与上一轮逐字节相同，中文的变了（错误页标题改短了），与这次的改动相符。

### 结论

**通过。** 没有严重问题，也没有中等问题，没有发现新问题。
- 两个中等问题都已解决。
- 轻微问题：L2 已解决；L1 部分解决，剩下的随 R04 处理；L3、L4 保留。保留理由都成立，我同意。

### 逐条核对

| 编号 | 结果 | 说明 |
| --- | --- | --- |
| M1 英文返回栏截断 | 已解决 | `app-shell-en-320-2x` 返回栏显示完整的「‹Back」；日文、中文 2 倍分别是「‹戻る」「‹返回」；1 倍仍显示目标名（Settings / 設定 / 设置），符合 iOS 惯例 |
| M2 标题夹杂英文 | 已解决 | 标题按语言显示：日「言語」/ 中「语言」/ 英「Language」，1 倍和 2 倍都一样；这是截图夹具里的演示标题，不是产品文案，说明成立 |
| L1 断行 | 部分解决（剩余部分随 R04 处理，同意） | 中文错误页标题改为「无法显示页面」，2 倍下一行显示。日文 2 倍仍有单字孤行、词中断开（例如错误页标题「表／示」，草稿边界句「送／信」），处理记录写明在 R04 共用文字组件里统一按词组断行。这是组件层的问题，文案不用再改 |
| L2 分隔符 | 已解决 | 英文 2 倍「Showing sample data · Numbers…」「No message included · You can…」里，「·」都跟着前一个词，不再出现在行首；日文「·」在行尾，也正确 |
| L3 中文 Web「·」偏宽 | 保留（同意） | 字体渲染问题，R06 定字体栈时处理 |
| L4 英文配额折行 | 保留（同意） | 展示页两栏布局比真实 chip 窄，R04 用真实组件截图时复核 |

### 新问题

无。

### 交给后续 Sprint 的事项

- R04：
  - 共用文字组件对日文、中文按词组断行（L1 剩余部分），完成后复查日文 2 倍下的错误页标题和草稿边界句；
  - 真实 chip 截图复核「This month: {count} left」（L4）。
- R05：返回栏按标签类型选模板，处理「iOrbitに戻る」的空格问题（文案第 1 轮 L1）。
- R06：Web 字体栈里中文「·」的宽度（L3）。
