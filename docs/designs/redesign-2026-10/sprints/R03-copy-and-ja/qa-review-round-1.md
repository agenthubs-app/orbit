# R03 关卡 2 · 第 1 轮独立审校（界面文案 100% 逐条）

- **审校日期：** 2026-10-10
- **审校人：** 独立 AI 审校（日语母语产品文案角色）
- **依据：** `glossary.md` v4、`style-guide.md` v4
- **范围（100%，不抽样）：** 共 167 个键，日、中、英各审一遍：
  - `repos/orbits/shared/copy/{ja,zh,en}.ts`：122 个键，组件类型以 `scripts/copy-qa/kinds.mjs` 为准；
  - `repos/orbit-app/src/i18n/{ja,zh,en}/shell.ts`：26 个键；
  - `repos/orbit-app/src/i18n/{ja,zh,en}/session.ts`：19 个键。session 的中文是旧文案，原样保留，照审。
- **打分：** 准确 / 自然 / 术语 / 适合界面，每项 1–5 分。

## ① 结论

**不达标。** 四个维度的平均分都在 4.5 以上，但有 **7 个中等问题**（M1–M7），所以这一轮不达标。没有严重问题。
- 日文质量很高，基本可以直接定稿。
- 中文的问题集中在三类：数字前后多了空格；shell 里的旧文案（「IORBIT」大写、根错误页措辞和标准用词不一致）；session 里「注销」一词有歧义。
- 英文主要缺单复数分开写，另有一处术语撞名。

`copy-qa` 当前报 0 问题，但它**没有检查出 M1（中文数字空格）、M2（英文单复数）和 L5（英文长度）**。建议下一轮给 `copy-qa` 补上这三项检查，再跑一遍。

## ② 平均分

| 语言 | 准确 | 自然 | 术语 | 适合界面 |
| --- | --- | --- | --- | --- |
| 日 | 4.99 | 4.98 | 4.96 | 4.95 |
| 中 | 4.92 | 4.89 | 4.71 | 4.95 |
| 英 | 4.96 | 4.92 | 4.95 | 4.95 |

（共 167 个键；没有问题的条目记 5 分，扣分的条目见 ④。）

## ③ 问题清单

### 严重（0）

无。

### 中等（7）

**M1　中文：数字或占位符和中文之间加了空格，违反写作规范 §2**
- 涉及的键：
  - `shared/copy` `chip.daysLeft`「还剩 {count} 天」、`filter.showItems`「显示 {count} 项」、`filter.showPeople`「显示 {count} 人」、`quota.left`「本月还剩 {count} 次」、`offline.pending`「等待中 {count}」、`push.remindInHour`「1 小时后再提醒」；
  - `session.ts` `session.otherAccountBody`「有 {count} 项修改」。
- 问题：规范写明「中文与数字之间不加空格」，术语表第 3 轮也已经统一成「{count}项」。现在同一个产品里两种写法并存。
- 建议文案：
  - 还剩{count}天
  - 显示{count}项
  - 显示{count}人
  - 本月还剩{count}次
  - 待同步{count}（同时见 M3）
  - 1小时后再提醒
  - 有{count}项修改已加密保存在本机。

**M2　英文：数量句没有分单复数，违反写作规范 §5**
- 涉及的键：
  - `shared/copy` `chip.daysLeft`「{count} days left」、`filter.showItems`「Show {count} items」、`filter.showPeople`「Show {count} people」；
  - `session.ts` `session.otherAccountBody`「{count} changes are saved…」。
- 问题：count 为 1 时会显示「1 days left」「Show 1 items」「1 changes are saved」。「1 day left」这种情况很常见。
- 建议文案：拆成 `…One` / `…Other` 两个键：
  - 1 day left / {count} days left
  - Show 1 item / Show {count} items
  - Show 1 person / Show {count} people
  - 1 change is saved encrypted on this device. / {count} changes are saved encrypted on this device.

  日文和中文没有复数变化，`…One` 的值与 `…Other` 相同即可。

**M3　`shared/copy` `offline.pending`：用词不符合术语表（三种语言都是）**
- 问题：
  - 日文「待機中 {count}」不在术语表里，读起来像设备待机；术语表和设计稿里，待同步一律写「同期待ち」（同一份字典里 `chip.waitingSync` 就是「同期待ち」）。
  - 中文「等待中」、英文「Pending」也没说清在等什么。
- 建议文案：日「同期待ち {count}」/ 中「待同步{count}」/ 英「{count} waiting to sync」（chip 放不下时用「Unsynced {count}」）。

**M4　`shared/copy` `degraded.iorbitStopped`（英文）：「events」和「イベント」撞名**
- 问题：「Tasks, events and notes still work as usual」里的 events 指的是「予定」。术语表第 1 轮 M11 已定：予定的英文是「Calendar event」，「Events」专指活动（イベント）。降级的时候活动功能是否可用并没有说，这句话会让人误会。
- 建议文案：「Suggestions and drafts are paused. Tasks, calendar and notes still work as usual.」

**M5　`shell.ts` `shell.parent.iorbit`（中文）：产品名写成了「IORBIT」**
- 问题：产品名必须写「iOrbit」（日文和英文都对）。返回栏会显示「返回IORBIT」。
- 建议文案：「iOrbit」。

**M6　`shell.ts` `shell.errorTitle` / `shell.errorBody`（中文）：根错误页措辞笼统，和标准用词不一致**
- 问题：
  - 标题「这个页面出了点问题」属于规范禁止的笼统说法（§2：「失败用『无法……』，不用『出错了』」），日文和英文都写「无法显示」。
  - 正文「重试一下通常就好了」偏口语，而且等于给用户一个保证。
  - 同样内容在 `shared/copy` 里已经有标准写法（`error.screenFailed`、`error.screenFailedBody`），两处中文不一样。
- 建议文案：标题「无法显示此页面」；正文「数据没有丢失，请重试。」，直接复用 `error.screenFailed*`。

**M7　`session.ts`（中文）：「注销」一词有歧义**
- 涉及的键：`session.pendingChangesBody`、`keepAndSignOut`、`discardAndSignOut`、`pendingUnknown`、`signOutCancelled`。
- 问题：在大陆的主流 App 里，「注销」通常指「注销账号」（删除账号），「退出登录」才是 sign out。确认框里「放弃修改并注销」会让一部分用户以为账号会被删，不敢点；或者反过来，把真正的删号操作误当成退出登录。
- 建议文案：
  - 加密保存并退出登录
  - 放弃修改并退出登录
  - 已取消退出登录。
  - 无法确认待同步修改，请稍后再退出登录。
  - 退出登录前，可以把这些修改加密保存在本机，之后用同一账号登录可继续同步；也可以不保存，直接放弃。

### 轻微（12）

**L1　`nav.backTo` / `shell.backTo`（日文）：标签是拉丁字母时少了空格**
- 问题：「{label}に戻る」里的 label 是「iOrbit」「Task」时，会显示「iOrbitに戻る」「Taskに戻る」，不符合写作规范 §1.3「拉丁字母单词与日文之间加空格」。
- 建议：调用方在 label 以拉丁字母结尾时插入半角空格；或者给这两个 label 单独存一份带空格的写法。

**L2　`shared/copy` `action.delete`（日文）：键名没说清用在哪里**
- 问题：值是「削除する」，按规范只用于确认框的主按钮；页面入口按钮应该是「削除」。一个通用的 `action.delete` 很容易被拿去当入口按钮用。
- 建议：拆成 `action.delete`「削除」（入口）和 `confirm.delete`「削除する」（确认框）。

**L3　`shared/copy` `confirm.keepGoing`：用占位符拼动作，容易出错**
- 问题：日文要传入「参加」，英文要传入动名词（「attending」），中文要传入动词。三种语言要传不同形态的片段，这是写作规范 §5 不提倡的拼句子做法。
- 建议：按场景写整句键，例如 `confirm.keepAttending`：参加を続ける / 继续参加 / Keep my spot。

**L4　`shared/copy` `confirm.deleteTitle` / `confirm.irreversible`（中文）：量词和适用范围**
- 问题：
  - 「这个{item}」碰到名片、日程时，会出现「这个名片」，量词不对（应为「这张名片」）。
  - 「删除后无法恢复」写死了「删除」，这个通用键如果用在撤回场景就不对了。
- 建议：标题改「要删除{item}吗？」（去掉量词）；`irreversible` 改「此操作无法撤销。」。

**L5　`shared/copy` `aiCard.showWhy`（英文）：超长**
- 问题：「See what this is based on」共 25 个字符，超过英文按钮上限 24，而 `copy-qa` 没有报。
- 建议文案：「Why this?」或「See basis」。

**L6　英文的小问题**
- `chip.awaitingConfirmation`「To check」：作为 chip 语义不清，建议「Check AI result」或「Needs check」。
- `chip.declineSuggested`「Suggest skipping」：读起来像按钮，建议「Skip suggested」。
- `aiCard.nothingWritten`「Nothing was written.」：说法含糊，建议「No changes were made.」。
- `action.complete`「Complete」：和 Toast「Marked as done」不呼应，建议「Mark as done」。
- `draftBoundary.noMessage`：前半句建议改「No message attached」，更简洁。

**L7　`shared/copy` `homeEdit.comingSoon`（日文）：不符合 Toast 主句规则**
- 问题：「まもなく使えるようになります」是现在时句子，规范要求 Toast 主句用过去式或体言止め。
- 建议文案：「準備中」或「近日公開」（体言止め）；如果要保留这句，就把它定成副句。

**L8　`shell.ts` `shell.parent.tasks` / `shell.parent.schedule`：返回目标的名字三种语言不一致**
- 问题：
  - 如果返回目标是 Task 标签页，名字应与导航一致：日「Task」/ 中「Task」/ 英「Task」；现在写的是タスク / 待办 / Tasks。
  - `schedule` 日文是「予定」，英文却是「Calendar」，指向不一致。
- 建议：先确认返回目标是哪个画面。若是 Task 标签页，三种语言都写「Task」；若是タスク一覧，保留日文。`schedule` 统一为「カレンダー / 日历 / Calendar」（分段名）。

**L9　`shell.ts` 其他中文**
- 问题：
  - `importCenter`「导入中心」比日文「取り込み」、英文「Import」多了「中心」。
  - `relationshipChat`「关系对话」与术语表「往来记录」不一致。
  - `errorDetails`「错误信息」，日文和英文都是「详情」。
- 建议文案：导入 / 往来记录 / 错误详情。

**L10　`session.ts` 其他中文（旧文案）**
- 问题和建议文案：
  - `continueWithAccount`「继续此账号」不通顺，改「继续使用此账号」。
  - `identityCheckFailed`「登录身份校验失败」不符合「无法……」句式，改「无法验证登录信息，请重新登录。」。
  - `discardFailed`「无法安全放弃」搭配别扭，改「无法安全删除待同步的修改，请稍后再试。」。
  - `clearPreviousFailed`「上个账号」偏口语，改「上一个账号」。
  - 同一组文案里「请稍后重试」和「请稍后再试」混用，统一为「请稍后再试」。

**L11　`shared/copy` `chip.upcoming`「開催前 / 未开始 / Upcoming」：术语表没有这一条**
- 问题：用词本身自然、准确，但术语表没有收录。
- 建议：在术语表 §8.1 补一行。

**L12　`shared/copy` `error.viewCached`（日文）：设计稿原文，只记录**
- 问题：「端末に保存済みを見る」把「保存済み」直接当名词用，略显紧缩。更自然的说法是「端末に保存済みの内容を見る」。这是设计稿原文，按优先级 ① 可以保留。
- 建议：如果不超长，改成「端末に保存済みの内容を見る」。

## ④ 评分明细

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
| `action.delete` | 5 5 4 5 | 5 5 5 5 | 5 5 5 5 |
| `action.undo` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.withdraw` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `action.complete` | 5 5 5 5 | 5 5 5 5 | 5 5 4 5 |
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
| `chip.limitReached` | 5 5 5 4 | 5 5 5 5 | 5 5 5 5 |
| `chip.today` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.tonight` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.daysLeft` | 5 5 5 5 | 5 5 3 5 | 4 4 5 5 |
| `chip.waitlist` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.estimated` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.draft` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.waitingSync` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `chip.inReview` | 5 5 5 5 | 5 5 5 5 | 5 4 5 4 |
| `chip.awaitingConfirmation` | 5 5 5 5 | 5 5 5 5 | 5 3 5 4 |
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
| `chip.declineSuggested` | 5 5 5 5 | 5 5 5 5 | 5 4 5 4 |
| `toast.completed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.movedToTomorrow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.addedToTasks` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.saveFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.savedOffline` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.syncLater` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.copied` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `toast.deleted` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `confirm.deleteTitle` | 5 5 5 5 | 5 4 5 5 | 5 5 5 5 |
| `confirm.irreversible` | 5 5 5 5 | 4 5 5 5 | 5 5 5 5 |
| `confirm.keepGoing` | 5 5 5 4 | 5 5 5 5 | 4 4 5 4 |
| `filter.clear` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `filter.showItems` | 5 5 5 5 | 5 5 3 5 | 4 4 5 5 |
| `filter.showPeople` | 5 5 5 5 | 5 5 3 5 | 4 4 5 5 |
| `filter.loosen` | 5 5 5 5 | 5 5 5 5 | 5 4 5 5 |
| `aiCard.why` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.showWhy` | 5 5 5 5 | 5 5 5 5 | 5 4 5 3 |
| `aiCard.add` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.decline` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.added` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.addFailed` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `aiCard.nothingWritten` | 5 5 5 5 | 5 5 5 5 | 4 4 5 5 |
| `aiCard.reconnect` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `offline.banner` | 5 5 5 5 | 5 5 5 5 | 5 5 5 4 |
| `offline.pending` | 4 4 2 4 | 5 4 2 4 | 5 5 3 5 |
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
| `degraded.iorbitStopped` | 5 5 5 5 | 5 5 5 5 | 5 5 3 5 |
| `loading.loading` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `loading.slow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `sample.banner` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `sample.tag` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `quota.left` | 5 5 5 5 | 5 5 3 5 | 5 5 5 5 |
| `quota.reached` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.openTarget` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.remindInHour` | 5 5 5 5 | 5 5 3 5 | 5 5 5 5 |
| `push.markRead` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.fewerLikeThis` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `push.openedFromPush` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.allowCamera` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.allowNotifications` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.notNow` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `permission.openSettings` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `homeEdit.edit` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `homeEdit.done` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `homeEdit.comingSoon` | 5 5 5 4 | 5 5 5 5 | 5 5 4 5 |
| `draftBoundary.create` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.open` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.copy` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.openInMail` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.notice` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `draftBoundary.noMessage` | 5 5 5 5 | 5 5 5 5 | 5 4 5 4 |
| `shell.parent.settings` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.me` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.importCenter` | 5 5 5 5 | 4 5 4 5 | 5 5 5 5 |
| `shell.parent.networkAnalysis` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.network` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.eventOperations` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.eventDetail` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.events` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.tasks` | 5 5 4 5 | 5 5 3 5 | 5 5 4 5 |
| `shell.parent.inbox` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.schedule` | 5 5 4 5 | 5 5 5 5 | 4 5 4 5 |
| `shell.parent.iorbit` | 5 5 5 5 | 2 3 1 3 | 5 5 5 5 |
| `shell.parent.relationshipChat` | 5 5 5 5 | 4 4 3 5 | 5 5 5 5 |
| `shell.parent.signIn` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.account` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.admin` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.live` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.parent.home` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.checkingSignInLabel` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.checkingSignIn` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.errorTitle` | 5 5 5 5 | 3 3 3 4 | 5 5 5 5 |
| `shell.errorBody` | 5 5 5 5 | 4 3 3 3 | 5 5 5 5 |
| `shell.errorDetails` | 5 5 5 5 | 5 5 4 5 | 5 5 5 5 |
| `shell.noErrorDetails` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.retry` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.back` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `shell.backTo` | 5 5 5 4 | 5 5 5 5 | 5 5 5 5 |
| `session.serverChanged` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.pendingChangesTitle` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.pendingChangesBody` | 5 5 5 4 | 4 3 2 4 | 5 5 5 5 |
| `session.cancel` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.keepAndSignOut` | 5 5 5 5 | 4 5 2 5 | 5 5 5 5 |
| `session.discardAndSignOut` | 5 5 5 5 | 4 5 2 5 | 5 5 5 5 |
| `session.otherAccountTitle` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.otherAccountBody` | 5 5 5 5 | 5 5 3 5 | 4 4 5 5 |
| `session.backToSignIn` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.continueWithAccount` | 5 5 5 5 | 5 3 5 4 | 5 5 5 5 |
| `session.identityCheckFailed` | 5 5 5 5 | 5 4 4 5 | 5 5 5 5 |
| `session.accountUnconfirmed` | 5 5 5 5 | 5 5 4 5 | 5 5 5 5 |
| `session.otherAccountUnknown` | 5 4 5 4 | 5 5 5 5 | 5 5 5 5 |
| `session.switchCancelled` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.clearPreviousFailed` | 5 5 5 5 | 5 4 5 5 | 5 5 5 5 |
| `session.saveSignInFailed` | 5 5 5 5 | 5 5 4 5 | 5 5 5 5 |
| `session.googleIncomplete` | 5 5 5 5 | 5 5 5 5 | 5 5 5 5 |
| `session.pendingUnknown` | 5 5 5 5 | 4 4 2 4 | 5 5 5 5 |
| `session.signOutCancelled` | 5 5 5 5 | 4 5 2 5 | 5 5 5 5 |
| `session.discardFailed` | 5 5 5 5 | 5 3 5 5 | 5 5 5 5 |
| `session.clearDeviceFailed` | 5 5 5 5 | 5 5 4 5 | 5 5 5 5 |
| `session.clearSignInFailed` | 5 5 5 5 | 5 5 4 5 | 5 5 5 5 |

## 处理记录（作者，2026-10-10）

| 问题 | 处理 |
| --- | --- |
| M1 中文数字空格 | 7 个键去掉空格；`copy-qa` 新增「中文与数字、占位符之间不加空格」检查 |
| M2 英文单复数 | 改写为不依赖单复数的句式：「Days left: {count}」「Show results ({count})」「Show people ({count})」「Uses left: {count}」「Changes saved encrypted on this device: {count}.」；`copy-qa` 新增「{count} 后接复数名词」检查 |
| M3 offline.pending | 日「同期待ち {count}」、中「待同步{count}」、英「To sync: {count}」 |
| M4 降级英文 | 「Tasks, calendar and notes still work as usual.」 |
| M5 返回 IORBIT | `shell.parent.iorbit` 中文改「iOrbit」 |
| M6 根错误页 | 根错误页改读标准用词 `error.screenFailed` / `screenFailedBody` / `action.retry`（中文「无法显示此页面」「数据没有丢失，请重试。」）；shell 里重复的 errorTitle / errorBody / retry / back / backTo 删除，导航壳的返回文字也改读标准用词 `nav.back` / `nav.backTo` |
| M7 注销 | session 中文全部改「退出登录」；「请稍后重试 / 再试」统一为「请稍后再试」 |
| L1 {label}に戻る 空格 | **保留**：占位符模板无法按标签内容决定是否加空格；目前只有 iOrbit / Task 两个拉丁字母标签会出现「iOrbitに戻る」，可读性影响小，R05 重做返回栏时改为按标签类型选模板 |
| L2 action.delete | `action.delete` 改「削除」（入口）；新增 `confirm.delete`「削除する」（确认框主按钮） |
| L3 keepGoing | 删除该键；需要「〜を続ける」时整句写进各自文案 |
| L4 这个{item} | 中文改「要删除{item}吗？」；「删除后无法恢复」改「此操作无法撤销。」 |
| L5 showWhy 英文超长 | 「See the basis」 |
| L6 英文小处 | To check → Check needed；Suggest skipping → Consider skipping；Nothing was written → Nothing was added；Complete → Mark done；No message is attached → No message included |
| L7 近日公開 | homeEdit.comingSoon 日文改「近日公開」 |
| L8 返回目标名不一致 | tasks：日「To-do」/ 中「待办」/ 英「To-do」；schedule：日「カレンダー」/ 中「日历」/ 英「Calendar」 |
| L9 shell 中文 | 导入中心 → 导入；关系对话 → 往来记录；错误信息 → 错误详情 |
| L10 session 中文 | 见 M7 |
| L11 開催前 | 补进术语表 §8.1 |
| L12 端末に保存済みを見る | **保留**：设计稿原文 |
