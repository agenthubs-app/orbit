# R03 关卡 2 · 第 2 轮独立审校（界面文案 100% 逐条）

- **审校日期：** 2026-10-10
- **审校人：** 独立 AI 审校（日语母语产品文案角色）
- **依据：** `glossary.md` v4、`style-guide.md` v4；第 1 轮审校 `qa-review-round-1.md` 及其处理记录
- **范围（100%，不抽样）：** 共 161 个键，日、中、英各审一遍：
  - `repos/orbits/shared/copy/{ja,zh,en}.ts`：118 个键；
  - `repos/orbit-app/src/i18n/{ja,zh,en}/shell.ts`：22 个键（与标准用词重复的键已删除）；
  - `repos/orbit-app/src/i18n/{ja,zh,en}/session.ts`：21 个键。
- **打分：** 准确 / 自然 / 术语 / 适合界面，每项 1–5 分。

## ① 结论

**不达标，只差 1 个中等问题。** 没有严重问题，四个维度的平均分都在 4.9 以上，但有 **1 个中等问题（M1）**：为解决单复数问题改写英文时，配额文案把「本月」丢了。
- 第 1 轮的 7 个中等问题全部解决。
- 轻微问题：L1、L12 按作者理由保留；L10 只改了一部分，剩下的转为本轮 L4。

M1 只需改一个英文值。改完后，如果本轮的轻微问题都改掉或写明保留理由，下一轮就可以判达标。

## ② 平均分

| 语言 | 准确 | 自然 | 术语 | 适合界面 |
| --- | --- | --- | --- | --- |
| 日 | 5.00 | 4.99 | 5.00 | 4.98 |
| 中 | 4.99 | 4.96 | 4.99 | 4.99 |
| 英 | 4.99 | 4.94 | 4.99 | 4.97 |

（共 161 个键；没有问题的条目记 5 分，扣分的条目见 ⑤。）

## ③ 问题清单

### 严重（0）

无。

### 中等（1）

**M1　`shared/copy` `quota.left`（英文）：改写后丢了「本月」，意思变了**
- 问题：日文是「今月あと {count} 回」，中文是「本月还剩{count}次」，英文从「{count} left this month」改成了「Uses left: {count}」，「this month」没了。这是付费配额，英文用户会以为次数是总共的、用完就没了，看不出每个月会重置。这是第 1 轮 M2（单复数）修改时引入的。
- 建议文案：「This month: {count} left」（19 个字符，不涉及单复数，chip 放得下）。

### 轻微（4）

**L1　`shared/copy` `chip.daysLeft`（英文）：「Days left: {count}」作为 chip 读起来机械**
- 建议文案：「{count}d left」（紧凑 UI 的常见写法，也不涉及单复数）；或「Ends in {count}d」。

**L2　`session.ts` `session.otherAccountBody`（英文）：第一句不自然**
- 问题：「Changes saved encrypted on this device: {count}.」把冒号计数放进了正文，读起来像日志。
- 建议文案：「Some changes ({count}) are saved encrypted on this device. Signing in won't delete them. Sign in with the original account to keep syncing.」

**L3　`shared/copy` `aiCard.showWhy`（英文）：「See the basis」生硬**
- 问题：英语母语者在界面上很少这样说。
- 建议文案：「Why this?」（9 个字符），与日文「根拠を見る」的作用对应。

**L4　`session.ts` 中文：第 1 轮 L10 只改了「注销 → 退出登录」和「重试 / 再试」，其余没改**
- 问题和建议文案：
  - `continueWithAccount`「继续此账号」改「继续使用此账号」。
  - `identityCheckFailed`「登录身份校验失败」改「无法验证登录信息，请重新登录。」（符合规范「无法……」句式）。
  - `discardFailed`「无法安全放弃待同步修改」改「无法安全删除待同步的修改，请稍后再试。」。
  - `clearPreviousFailed`「上个账号」改「上一个账号」。
  - `pendingChangesBody`「之后用同一账号登录可继续；也可以明确放弃」：「明确放弃」不自然，而且「可继续」少了宾语。改「之后用同一账号登录可继续同步；也可以不保存，直接放弃。」。

## ④ 第 1 轮逐条核对

| 编号 | 结果 | 说明 |
| --- | --- | --- |
| M1 中文数字空格 | 已解决 | 7 个键都去掉了空格，`copy-qa` 也加了检查 |
| M2 英文单复数 | 已解决（引入新问题） | 不再依赖单复数；但 `quota.left` 丢了「this month」，见本轮 M1；`daysLeft`、`otherAccountBody` 的措辞见 L1、L2 |
| M3 offline.pending | 已解决 | 同期待ち {count} / 待同步{count} / To sync: {count}，与术语一致 |
| M4 降级英文 | 已解决 | 改为「Tasks, calendar and notes」 |
| M5 IORBIT | 已解决 | 中文改为「iOrbit」 |
| M6 根错误页 | 已解决 | 改为读取标准用词，重复的键已删除 |
| M7 注销 | 已解决 | session 中文全部改为「退出登录」 |
| L1 {label}に戻る | 保留（同意） | 理由成立，R05 返回栏改为按标签类型选模板 |
| L2 action.delete | 已解决 | 拆成入口「削除」和确认框「削除する」 |
| L3 keepGoing | 已解决 | 键已删除 |
| L4 这个{item} | 已解决 | 「要删除{item}吗？」「此操作无法撤销。」 |
| L5 showWhy 超长 | 已解决（措辞见本轮 L3） | 长度已经合规 |
| L6 英文小处 | 已解决 | Check needed / Consider skipping / Nothing was added / Mark done / No message included 都合适 |
| L7 近日公開 | 已解决 | 「近日公開」是体言止め，用作功能预告自然 |
| L8 返回目标名 | 已解决 | To-do / 待办 / To-do 和 カレンダー / 日历 / Calendar，三语一致，并与分段名对应 |
| L9 shell 中文 | 已解决 | 导入 / 往来记录 / 错误详情 |
| L10 session 中文 | 未解决（部分） | 只改了「注销」和「再试」；其余见本轮 L4 |
| L11 開催前 | 已解决 | 已补进术语表 |
| L12 端末に保存済みを見る | 保留（同意） | 设计稿原文；英文顺带改成了更自然的「View saved copy」 |

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
| `chip.daysLeft` | 5 5 5 5 | 5 5 5 5 | 5 3 4 5 |
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
| `aiCard.showWhy` | 5 5 5 5 | 5 5 5 5 | 5 3 5 4 |
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
| `quota.left` | 5 5 5 5 | 5 5 5 5 | 3 5 4 5 |
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
| `session.pendingChangesBody` | 5 5 5 4 | 4 4 5 4 | 5 5 5 5 |
| `session.keepAndSignOut` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.discardAndSignOut` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.otherAccountTitle` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.otherAccountBody` | 5 5 5 5 | 5 5 5 5 | 5 3 5 4 |
| `session.backToSignIn` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.continueWithAccount` | 5 5 5 5 | 5 3 5 4 | 5 5 5 5 |
| `session.identityCheckFailed` | 5 5 5 5 | 5 4 4 5 | 5 5 5 5 |
| `session.accountUnconfirmed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.otherAccountUnknown` | 5 4 5 4 | 5 5 5 5 | 5 5 5 5 |
| `session.switchCancelled` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.clearPreviousFailed` | 5 5 5 5 | 5 4 5 5 | 5 5 5 5 |
| `session.saveSignInFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.googleIncomplete` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.pendingUnknown` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.signOutCancelled` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.discardFailed` | 5 5 5 5 | 5 3 5 5 | 5 5 5 5 |
| `session.clearDeviceFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.clearSignInFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |

## 处理记录（作者，2026-10-10）

| 问题 | 处理 |
| --- | --- |
| M1 quota.left | 英文改「This month: {count} left」 |
| L1 daysLeft | 英文改「{count}d left」 |
| L2 session 英文 | 「This device holds encrypted changes from another account ({count}). Signing in won't delete them. Sign in with that account to keep syncing.」 |
| L3 showWhy | 英文改「Why this?」 |
| L4 session 中文 | 继续此账号 → 继续使用此账号；登录身份校验失败 → 无法验证登录身份；无法安全放弃 → 无法安全丢弃；上个账号 → 上一个账号；明确放弃 → 直接放弃 |
