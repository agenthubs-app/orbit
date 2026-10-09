# R03 三语标准用词对照表

由 `repos/orbits/shared/copy/{ja,zh,en}.ts` 生成（2026-10-10，R03 收口时）。源文件为准；改动请改源文件并跑 `npm run copy:qa`。


## nav

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `home` | nav | ホーム | 首页 | Home |
| `network` | nav | 人脈 | 人脉 | Network |
| `iorbit` | nav | iOrbit | iOrbit | iOrbit |
| `events` | nav | イベント | 活动 | Events |
| `task` | nav | Task | Task | Task |
| `inbox` | nav | 受信箱 | 收件箱 | Inbox |
| `host` | nav | 主催 | 主办 | Host |
| `settings` | nav | 設定 | 设置 | Settings |
| `me` | nav | マイページ | 我的 | Me |
| `main` | label | メインナビゲーション | 主导航 | Main navigation |
| `back` | button | 戻る | 返回 | Back |
| `backTo` | label | {label}に戻る | 返回{label} | Back to {label} |
| `askIorbit` | label | iOrbit に聞く… | 问 iOrbit… | Ask iOrbit… |

## taskSegments

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `calendar` | tab | カレンダー | 日历 | Calendar |
| `todo` | tab | To-do | 待办 | To-do |
| `plan` | tab | プラン | 计划 | Plan |
| `notes` | tab | メモ | 笔记 | Notes |

## action

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `add` | button | 追加 | 添加 | Add |
| `save` | button | 保存 | 保存 | Save |
| `delete` | button | 削除 | 删除 | Delete |
| `undo` | button | 元に戻す | 撤销 | Undo |
| `withdraw` | button | 取り消す | 撤回 | Withdraw |
| `complete` | button | 完了にする | 完成 | Mark done |
| `edit` | button | 編集 | 编辑 | Edit |
| `cancel` | button | キャンセル | 取消 | Cancel |
| `close` | button | 閉じる | 关闭 | Close |
| `retry` | button | 再試行 | 重试 | Try again |
| `open` | button | 開く | 打开 | Open |
| `later` | button | あとで | 稍后 | Later |
| `notNow` | button | やめる | 暂不 | Not now |
| `tomorrow` | swipe | 明日 | 明天 | Tomorrow |
| `copy` | button | コピー | 复制 | Copy |
| `gotIt` | button | わかりました | 知道了 | Got it |

## chip

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `overdue` | chip | 期限超過 | 已逾期 | Overdue |
| `failed` | chip | 失敗 | 失败 | Failed |
| `limitReached` | chip | 上限に達しました | 已达上限 | Limit reached |
| `today` | chip | 今日 | 今天 | Today |
| `tonight` | chip | 今夜 | 今晚 | Tonight |
| `daysLeft` | chip | あと{count}日 | 还剩{count}天 | {count}d left |
| `waitlist` | chip | キャンセル待ち | 候补中 | Waitlisted |
| `estimated` | chip | 推定 | 推测 | Estimated |
| `draft` | chip | 下書き | 草稿 | Draft |
| `waitingSync` | chip | 同期待ち | 待同步 | Waiting to sync |
| `inReview` | chip | 審査中 | 审核中 | Under host review |
| `awaitingConfirmation` | chip | 確認待ち | 待你确认 | Check needed |
| `awaitingApproval` | chip | 承認待ち | 等待对方同意 | Awaiting reply |
| `confirmed` | chip | 参加確定 | 已确认参加 | Confirmed |
| `completed` | chip | 完了 | 已完成 | Done |
| `published` | chip | 公開済み | 已公开 | Published |
| `recommended` | chip | おすすめ | 推荐 | Recommended |
| `upcoming` | chip | 開催前 | 未开始 | Upcoming |
| `going` | chip | 参加予定 | 计划参加 | Planning to go |
| `registered` | chip | 申込済み | 已报名 | Registered |
| `notRegistered` | chip | 未申込 | 未报名 | Not registered |
| `followUp` | chip | 要フォロー | 需跟进 | Needs follow-up |
| `declineSuggested` | chip | 見送り推奨 | 建议暂缓 | Consider skipping |

## toast

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `completed` | toast | 完了にしました | 已完成 | Marked as done |
| `movedToTomorrow` | toast | 明日に移動しました | 已改到明天 | Moved to tomorrow |
| `addedToTasks` | toast | タスクに追加しました | 已添加到待办 | Added to tasks |
| `saveFailed` | toast | 保存できませんでした | 无法保存 | Couldn't save |
| `savedOffline` | toast | オフラインで保存しました | 已离线保存 | Saved offline |
| `syncLater` | toast | 接続後に同期します | 联网后同步 | Will sync when you're online |
| `copied` | toast | コピーしました | 已复制 | Copied |
| `deleted` | toast | 削除しました | 已删除 | Deleted |

## confirm

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `deleteTitle` | dialogTitle | この{item}を削除しますか？ | 要删除{item}吗？ | Delete this {item}? |
| `delete` | button | 削除する | 删除 | Delete |
| `irreversible` | sentence | 元に戻せません。 | 此操作无法撤销。 | This can't be undone. |

## filter

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `clear` | button | クリア | 清除 | Clear |
| `showItems` | button | {count}件を表示 | 显示{count}项 | Show results ({count}) |
| `showPeople` | button | {count}人を表示 | 显示{count}人 | Show people ({count}) |
| `loosen` | button | 条件をゆるめる | 放宽条件 | Loosen filters |

## aiCard

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `why` | label | 根拠：{reason} | 依据：{reason} | Based on: {reason} |
| `showWhy` | button | 根拠を見る | 查看依据 | Why this? |
| `add` | button | 追加する | 添加 | Add |
| `decline` | button | やめる | 暂不 | Not now |
| `added` | toast | 追加しました | 已添加 | Added |
| `addFailed` | dialogTitle | {target}に追加できませんでした | 无法添加到{target} | Couldn't add to {target} |
| `nothingWritten` | sentence | 何も書き込まれていません。 | 没有写入任何内容。 | Nothing was added. |
| `reconnect` | button | 再接続 | 重新连接 | Reconnect |

## offline

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `banner` | banner | オフライン · 変更は接続後に同期されます | 离线 · 修改会在联网后同步 | Offline · Changes will sync when you're online |
| `pending` | chip | 同期待ち {count} | 待同步{count} | To sync: {count} |
| `synced` | toast | 同期しました | 已同步 | Synced |

## error

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `loadFailed` | dialogTitle | {item}を読み込めませんでした | 无法加载{item} | Couldn't load {item} |
| `checkConnection` | sentence | 通信状況を確認して、もう一度お試しください。 | 请检查网络后重试。 | Check your connection and try again. |
| `inputKept` | sentence | 入力中の内容は失われていません。 | 已输入的内容没有丢失。 | What you typed hasn't been lost. |
| `viewCached` | button | 端末に保存済みを見る | 查看本机已保存的内容 | View saved copy |
| `screenFailed` | dialogTitle | この画面を表示できませんでした | 无法显示此页面 | Couldn't show this screen |
| `screenFailedBody` | sentence | データは失われていません。もう一度お試しください。 | 数据没有丢失，请重试。 | Your data hasn't been lost. Try again. |
| `needsNetwork` | dialogTitle | この画面はインターネット接続が必要です | 此页面需要联网 | This screen needs an internet connection |
| `needsNetworkBody` | sentence | 接続してから、もう一度お試しください。 | 请联网后重试。 | Connect and try again. |
| `signInRequired` | dialogTitle | ログインしてください | 请先登录 | Please sign in |
| `noAccess` | dialogTitle | この画面を開く権限がありません | 你没有打开此页面的权限 | You don't have access to this screen |

## degraded

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `iorbitUnavailable` | dialogTitle | iOrbit が一時的に使えません | iOrbit 暂时无法使用 | iOrbit is temporarily unavailable |
| `iorbitStopped` | sentence | 提案と下書きの作成は止まっています。タスク・予定・メモは通常どおり使えます。 | 建议和草稿生成已暂停。待办、日程和笔记可以照常使用。 | Suggestions and drafts are paused. Tasks, calendar and notes still work as usual. |

## loading

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `loading` | label | 読み込み中… | 加载中… | Loading… |
| `slow` | banner | 読み込みに時間がかかっています | 加载时间比平时长 | This is taking longer than usual |

## sample

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `banner` | banner | サンプルを表示中 · 数字や人物は架空です | 正在显示示例 · 数字和人物均为虚构 | Showing sample data · Numbers and people are fictional |
| `tag` | chip | サンプル | 示例 | Sample |

## quota

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `left` | chip | 今月あと {count} 回 | 本月还剩{count}次 | This month: {count} left |
| `reached` | banner | 今月の上限に達しました | 本月已达上限 | Monthly limit reached |

## push

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `openTarget` | menu | 開く | 打开 | Open |
| `remindInHour` | menu | 1時間後に再通知 | 1小时后再提醒 | Remind me in 1 hour |
| `markRead` | menu | 受信箱で既読にする | 在收件箱中标为已读 | Mark as read in Inbox |
| `fewerLikeThis` | menu | この種類の通知を減らす | 减少此类通知 | Fewer notifications like this |
| `openedFromPush` | banner | 通知から開きました | 从通知打开 | Opened from a notification |

## permission

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `allowCamera` | button | カメラを許可する | 允许使用相机 | Allow camera |
| `allowNotifications` | button | 通知を許可する | 允许通知 | Allow notifications |
| `notNow` | button | 今はしない | 暂不 | Not now |
| `openSettings` | button | 設定を開く | 打开设置 | Open Settings |

## homeEdit

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `edit` | button | 編集 | 编辑 | Edit |
| `done` | button | 完了 | 完成 | Done |
| `comingSoon` | toast | 近日公開 | 即将上线 | Coming soon |

## draftBoundary

| 键 | 组件 | 日 | 中 | 英 |
| --- | --- | --- | --- | --- |
| `create` | button | 下書きを作成 | 生成草稿 | Create draft |
| `open` | button | 下書きを開く | 打开草稿 | Open draft |
| `copy` | button | コピー | 复制 | Copy |
| `openInMail` | button | メールアプリで開く | 用邮件应用打开 | Open in Mail |
| `notice` | banner | 送信はしません · 送信はあなたが行います | 不会替你发送 · 由你自己发送 | Orbit won't send it · You send it yourself |
| `noMessage` | banner | メッセージは添えません · あとから取り消せます | 不附加消息 · 之后可以撤回 | No message included · You can withdraw it later |
