/**
 * agent-design AG15 (approved visual draft 15-3, 15-4): the fixed words of 「定时任务」 on the web. Everything about a
 * task itself (its facts, next and last run, history lines) is written by the server in the reader's language.
 */
import type { OrbitLanguage } from "../../../../../shared/contract/language";

const copy = {
  title: { zh: "定时任务", en: "Scheduled tasks", ja: "定期タスク" },
  subtitle: { zh: "到点后 Orbit 自己运行，结果放进收件箱。关掉网页和手机也照常。", en: "At the set time Orbit runs it on its own and puts the result in your inbox, even with the web and the app closed.", ja: "時間になると Orbit が自分で実行し、結果を受信箱に届けます。Web やアプリを閉じていても動きます。" },
  count: { zh: "{n} 条 · {m} 条在运行", en: "{n} tasks · {m} running", ja: "{n}件 · 実行中 {m}件" },
  newTask: { zh: "新建", en: "New", ja: "新規" },
  running: { zh: "运行中", en: "Running", ja: "実行中" },
  attention: { zh: "需要处理", en: "Needs you", ja: "対応が必要" },
  paused: { zh: "已暂停", en: "Paused", ja: "停止中" },
  ended: { zh: "已结束", en: "Ended", ja: "終了" },
  on: { zh: "开着", en: "On", ja: "オン" },
  off: { zh: "关着", en: "Off", ja: "オフ" },
  toggle: { zh: "运行或暂停「{title}」", en: "Run or pause \"{title}\"", ja: "「{title}」を実行または停止" },
  emptyTitle: { zh: "还没有定时任务", en: "No scheduled tasks yet", ja: "定期タスクはまだありません" },
  emptyBody: { zh: "在 iOrbit 里说一句就行，比如「每周五上午九点，给我挑三场周末活动」。", en: "Just tell iOrbit, for example: \"Every Friday at 9am, pick three weekend events for me.\"", ja: "iOrbit にひと言どうぞ。たとえば「毎週金曜の朝9時に、週末のイベントを3つ選んで」。" },
  goIorbit: { zh: "去 iOrbit 说一句", en: "Tell iOrbit", ja: "iOrbit に話す" },
  useForm: { zh: "用表单新建", en: "Use the form", ja: "フォームで作る" },
  back: { zh: "定时任务", en: "Scheduled tasks", ja: "定期タスク" },
  nextRun: { zh: "下次运行", en: "Next run", ja: "次回の実行" },
  noNext: { zh: "不会再运行", en: "Will not run", ja: "実行しません" },
  lastResult: { zh: "上次结果", en: "Last result", ja: "前回の結果" },
  noLast: { zh: "还没有运行过", en: "Has not run yet", ja: "まだ実行していません" },
  inInbox: { zh: "在收件箱里看", en: "See it in the inbox", ja: "受信箱で見る" },
  howItRuns: { zh: "这条任务怎么跑", en: "How this task runs", ja: "このタスクの動き方" },
  edit: { zh: "改", en: "Edit", ja: "変更" },
  history: { zh: "历史", en: "History", ja: "履歴" },
  perRun: { zh: "每期一行", en: "One line per run", ja: "1回ごとに1行" },
  seeResult: { zh: "看结果", en: "See result", ja: "結果を見る" },
  seeCard: { zh: "去确认", en: "Confirm it", ja: "確認する" },
  earlier: { zh: "更早的", en: "Earlier", ja: "それ以前" },
  noHistory: { zh: "还没有运行过。", en: "It has not run yet.", ja: "まだ実行していません。" },
  pause: { zh: "暂停", en: "Pause", ja: "停止" },
  resume: { zh: "继续", en: "Resume", ja: "再開" },
  delete: { zh: "删除这条任务", en: "Delete this task", ja: "このタスクを削除" },
  deleteTitle: { zh: "删除这条任务？", en: "Delete this task?", ja: "このタスクを削除しますか？" },
  deleteBody: { zh: "删掉后不再运行，历史也一起没有了。已经放进收件箱的结果不受影响。", en: "It will not run again and its history goes too. Results already in your inbox stay.", ja: "今後は実行されず、履歴も消えます。受信箱に届いた結果は残ります。" },
  deleteConfirm: { zh: "删除", en: "Delete", ja: "削除" },
  cancel: { zh: "取消", en: "Cancel", ja: "キャンセル" },
  failed: { zh: "暂时没办成，请再试一次。", en: "That did not go through. Try again.", ja: "うまくいきませんでした。もう一度お試しください。" },
  loadFailed: { zh: "定时任务读不出来，请重试。", en: "Could not load scheduled tasks. Retry.", ja: "定期タスクを読み込めません。再試行してください。" },
  retry: { zh: "重试", en: "Retry", ja: "再試行" },
  notFound: { zh: "这条任务已经不在了。", en: "This task is no longer here.", ja: "このタスクはもうありません。" },
  saved: { zh: "已保存", en: "Saved", ja: "保存しました" },
  // The form (15-4 「点「改」之后」; 「用表单新建」 is the same form, empty).
  formEdit: { zh: "改这条任务", en: "Edit this task", ja: "このタスクを変更" },
  formNew: { zh: "新建定时任务", en: "New scheduled task", ja: "定期タスクを作る" },
  what: { zh: "做什么", en: "What it does", ja: "何をするか" },
  whatHint: { zh: "不填就按下面几项自动起名", en: "Leave empty to name it from the choices below", ja: "空欄なら下の内容から名前を付けます" },
  when: { zh: "什么时候查", en: "When it checks", ja: "いつ確認するか" },
  weekly: { zh: "每周", en: "Weekly", ja: "毎週" },
  daily: { zh: "每天", en: "Daily", ja: "毎日" },
  whenNote: { zh: "到点后约 10 分钟内运行。", en: "Runs within about 10 minutes after the time.", ja: "時刻のあと約10分以内に実行します。" },
  from: { zh: "从哪里挑", en: "Picks from", ja: "どこから選ぶか" },
  by: { zh: "按什么挑", en: "Picks by", ja: "何で選ぶか" },
  count2: { zh: "挑几条", en: "How many", ja: "何件" },
  until: { zh: "跑到哪天", en: "Runs until", ja: "いつまで" },
  forever: { zh: "一直跑", en: "No end", ja: "ずっと" },
  untilDay: { zh: "到这一天", en: "Until a day", ja: "この日まで" },
  saveNote: { zh: "保存后，下一次按新的时间算；旧时间还没跑的那一期作废。", en: "After saving, the next run follows the new time; a run still due at the old time is dropped.", ja: "保存すると次回から新しい時刻で動きます。古い時刻でまだ実行していない回は取り消します。" },
  save: { zh: "保存", en: "Save", ja: "保存" },
  windowWeekend: { zh: "那个周末的公开活动", en: "Public events that weekend", ja: "その週末の公開イベント" },
  windowWeek: { zh: "之后 7 天的公开活动", en: "Public events in the next 7 days", ja: "その後7日間の公開イベント" },
  windowMonth: { zh: "当月剩下的公开活动", en: "Public events in the rest of the month", ja: "その月の残りの公開イベント" },
  windowUpcoming: { zh: "之后 30 天的公开活动", en: "Public events in the next 30 days", ja: "その後30日間の公開イベント" },
  contacts: { zh: "很久没联系的联系人", en: "Contacts you have not been in touch with for a while", ja: "しばらく連絡していない連絡先" },
  todos: { zh: "过了计划日还没完成的待办（改到当天）", en: "Open to-dos past their planned day (moved to that day)", ja: "予定日を過ぎた未完了のタスク（当日に変更）" },
  byNote: { zh: "笔记", en: "Note", ja: "メモ" },
  byStart: { zh: "开始早的在前", en: "Earliest start first", ja: "開始が早い順" },
  byQuiet: { zh: "最久没联系的在前", en: "Longest without contact first", ja: "連絡していない期間が長い順" },
  byPlanned: { zh: "按计划日，早的在前", en: "By planned day, earliest first", ja: "予定日の早い順" },
  byWords: { zh: "和这些话相关", en: "Related to these words", ja: "この言葉に関連" },
  wordsPlaceholder: { zh: "比如：摄影、独立出版", en: "For example: photography, zines", ja: "例：写真、ZINE" },
  notePlaceholder: { zh: "找一篇笔记", en: "Find a note", ja: "メモを探す" },
  removeNote: { zh: "不按这篇笔记挑", en: "Don't pick by this note", ja: "このメモで選ばない" },
  noteUnreadable: { zh: "这篇笔记打不开了，换一篇。", en: "That note cannot be opened. Choose another.", ja: "このメモは開けません。別のメモを選んでください。" },
  formIncomplete: { zh: "还有没填好的地方。", en: "Something is not filled in yet.", ja: "まだ入力されていない項目があります。" },
  upTo: { zh: "最多", en: "Up to", ja: "最大" },
  // AG16 (approved draft 16-1 to 16-4): the reminder of one task, and whether this browser will show it.
  reminderTitle: { zh: "有新结果时提醒我", en: "Remind me when there's something new", ja: "新しい結果があったら知らせる" },
  reminderOnSub: { zh: "在手机和浏览器上弹一条「有新结果」，不写活动名称、时间和地点。", en: "Your phone and browser show one line, \"New results\" — no event names, times or places.", ja: "スマホとブラウザに「新しい結果があります」とだけ出します。イベント名・日時・場所は出しません。" },
  reminderOffSub: { zh: "现在只放进收件箱。", en: "Right now results only go to your inbox.", ja: "今は受信箱に届けるだけです。" },
  reminderToggle: { zh: "「{title}」有新结果时提醒我", en: "Remind me when \"{title}\" has something new", ja: "「{title}」に新しい結果があったら知らせる" },
  reminderMarker: { zh: "🔔 有新结果时提醒", en: "🔔 Reminds you of new results", ja: "🔔 新しい結果をお知らせ" },
  resultAt: { zh: "结果已生成", en: "Result ready", ja: "結果が出ました" },
  twoThings: { zh: "两件事分开记：结果什么时候生成，提醒有没有送到", en: "Kept apart: when the result was ready, and whether the reminder arrived", ja: "結果が出た時刻と、お知らせが届いたかを分けて記録" },
  browserNotAsked: { zh: "这个浏览器还没允许 Orbit 发通知", en: "This browser doesn't let Orbit notify you yet", ja: "このブラウザはまだ Orbit の通知を許可していません" },
  browserNotAskedBody: { zh: "允许之后，这里才会弹提醒。不允许也没关系，结果照常在收件箱。", en: "Once you allow it, reminders show up here. If you don't, results still arrive in your inbox.", ja: "許可すると、ここにお知らせが出ます。許可しなくても、結果は受信箱に届きます。" },
  browserAllow: { zh: "允许这个浏览器通知", en: "Allow notifications in this browser", ja: "このブラウザで通知を許可" },
  browserOn: { zh: "这个浏览器会收到提醒", en: "This browser will get reminders", ja: "このブラウザにお知らせが届きます" },
  browserStopLead: { zh: "不想在这里收：", en: "Don't want them here? ", ja: "ここで受け取らない場合：" },
  browserStop: { zh: "不在这个浏览器上提醒", en: "Stop reminders in this browser", ja: "このブラウザでは知らせない" },
  browserBlocked: { zh: "这个浏览器不让 Orbit 发通知", en: "This browser blocks notifications from Orbit", ja: "このブラウザは Orbit の通知をブロックしています" },
  browserBlockedBody: { zh: "所以这里不会弹提醒。结果照常在收件箱，任务照常运行。", en: "So no reminders show here. Results still arrive in your inbox and the task keeps running.", ja: "そのため、ここにはお知らせが出ません。結果は受信箱に届き、タスクも動き続けます。" },
  browserHowTo: { zh: "怎么重新打开", en: "How to turn it back on", ja: "もう一度オンにするには" },
  browserHowToStep1: { zh: "点地址栏左边的图标，找到「通知」，改成「允许」。", en: "Click the icon at the left end of the address bar, find Notifications, and set it to Allow.", ja: "アドレスバー左端のアイコンを押し、「通知」を「許可」に変えます。" },
  browserHowToStep2: { zh: "改好之后回到这一页。", en: "Then come back to this page.", ja: "変えたら、このページに戻ってください。" },
  browserStopped: { zh: "上一次提醒没送到：这个浏览器的通知被关掉了", en: "The last reminder didn't arrive: notifications are turned off in this browser", ja: "前回のお知らせは届きませんでした：このブラウザの通知がオフになっています" },
  browserStoppedBody: { zh: "{day}那期的结果在收件箱里。任务照常运行，之后不再往这个浏览器发。", en: "The result from {day} is in your inbox. The task keeps running; reminders no longer go to this browser.", ja: "{day}の結果は受信箱にあります。タスクは動き続け、今後このブラウザには送りません。" },
  browserStoppedBodyPlain: { zh: "结果照常在收件箱里。任务照常运行，之后不再往这个浏览器发。", en: "Results are in your inbox as usual. The task keeps running; reminders no longer go to this browser.", ja: "結果はいつもどおり受信箱にあります。タスクは動き続け、今後このブラウザには送りません。" },
  browserAllowAgain: { zh: "重新允许", en: "Allow again", ja: "もう一度許可" },
  browserOff: { zh: "这个浏览器现在不弹提醒", en: "This browser isn't set to show reminders", ja: "このブラウザではお知らせを出さない設定です" },
  browserOffBody: { zh: "你在这里关掉过。结果照常在收件箱。", en: "You turned them off here. Results still arrive in your inbox.", ja: "ここでオフにしました。結果は受信箱に届きます。" },
  browserTurnOn: { zh: "在这个浏览器上提醒", en: "Remind me in this browser", ja: "このブラウザで知らせる" },
  browserUnsupported: { zh: "这个浏览器弹不了提醒。结果照常在收件箱。", en: "This browser can't show reminders. Results still arrive in your inbox.", ja: "このブラウザはお知らせを出せません。結果は受信箱に届きます。" },
  browserUnavailable: { zh: "网页上的提醒还没开通，这个浏览器暂时收不到。结果照常在收件箱。", en: "Reminders on the web aren't set up yet, so this browser gets none for now. Results still arrive in your inbox.", ja: "Web のお知らせはまだ使えないため、このブラウザには届きません。結果は受信箱に届きます。" },
  // 16-2: under a confirmed card that turned a reminder on, when this browser will not ring yet.
  turnedOn: { zh: "已打开。", en: "Turned on. ", ja: "オンにしました。" },
  turnedOnNotAsked: { zh: "这个浏览器还没允许通知", en: "This browser doesn't allow notifications yet", ja: "このブラウザはまだ通知を許可していません" },
  turnedOnStopped: { zh: "这个浏览器的通知被关掉了", en: "Notifications are turned off in this browser", ja: "このブラウザの通知がオフになっています" },
} as const;

export type ScheduledTaskCopyKey = keyof typeof copy;

export function scheduledTaskCopy(language: OrbitLanguage) {
  return (key: ScheduledTaskCopyKey, values: Record<string, string | number> = {}) => (copy[key][language] as string).replace(/\{(\w+)\}/gu, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** 周日…周六 as the form's day buttons show them (Monday first). */
export const WEEKDAYS: Record<OrbitLanguage, readonly { day: number; label: string }[]> = {
  en: [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]! })),
  ja: [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, label: ["日", "月", "火", "水", "木", "金", "土"][day]! })),
  zh: [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, label: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day]! })),
};

export const UNIT_OF: Record<"event" | "contact" | "todo", Record<OrbitLanguage, string>> = {
  contact: { en: "", ja: "人", zh: "位" },
  event: { en: "", ja: "件", zh: "场" },
  todo: { en: "", ja: "件", zh: "条" },
};

/** The emoji tile of a task in the list (15-3). */
export const TASK_TILE: Record<"event" | "contact" | "todo", { emoji: string; tone: "pink" | "apricot" | "blue" }> = {
  contact: { emoji: "🤝", tone: "apricot" },
  event: { emoji: "🎟️", tone: "pink" },
  todo: { emoji: "🗓️", tone: "blue" },
};
