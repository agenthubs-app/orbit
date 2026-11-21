/**
 * agent-design AG13: code's sentences for private events, «我去过», schedule items and to-do links when no card is made
 * (zh / ja / en). No model writes any of these.
 */
import type { ReplyLanguage } from "../route/handoff-copy";

const pick = (language: ReplyLanguage, zh: string, ja: string, en: string) => (language === "zh" ? zh : language === "ja" ? ja : en);

export const EVENT_WORDS = {
  checkIn: (language: ReplyLanguage, event: string | null) => pick(language,
    `签到是主办方那边的记录${event ? `（「${event}」）` : ""}，Orbit 替你改不了，也不会替你补签。如果想留个记录，可以说「记一条我去过」，我会出一张卡，记成你自己记的「我去过」，不算签到。`,
    `チェックインは主催者側の記録${event ? `（「${event}」）` : ""}なので、Orbit では変更も代わりの登録もできません。記録を残したい場合は「行ったことを記録して」と言ってください。ご自身の記録として確認カードを出します（チェックインにはなりません）。`,
    `Check-ins are the organizer's record${event ? ` ("${event}")` : ""}; Orbit cannot change or add one for you. If you want a record, say "log that I went" and I will make a card for your own "I went" note (it is not a check-in).`),
  platformLocked: (language: ReplyLanguage, title: string) => pick(language,
    `「${title}」是平台上的活动，时间、地点和报名都由主办方管理，普通用户改不了，所以这次没有改。`,
    `「${title}」はプラットフォームのイベントで、日時・場所・申込は主催者が管理しています。一般のユーザーは変更できないため、今回は変更していません。`,
    `"${title}" is a platform event; its time, place and registration are managed by the organizer and cannot be changed by users, so nothing was changed.`),
  eventNotFound: (language: ReplyLanguage, words: string) => pick(language,
    `没找到「${words}」这场活动，所以这次没有记。可以说一下它的名称，或者让我先把它建成一场私人活动。`,
    `「${words}」というイベントが見つからなかったため、今回は記録していません。名前を教えていただくか、先にプライベートイベントとして作成することもできます。`,
    `I could not find the event "${words}", so nothing was recorded. Tell me its name, or I can create it as a private event first.`),
  alreadyAttended: (language: ReplyLanguage, title: string, day: string) => pick(language,
    `「${title}」你已经记过去过了（${day}），同一场只记一次，所以这次没有再记。`,
    `「${title}」はすでに「行った」と記録されています（${day}）。同じイベントは一度だけなので、今回は記録していません。`,
    `You already noted that you went to "${title}" (${day}); one note per event, so nothing new was added.`),
  needTime: (language: ReplyLanguage, quote: string) => pick(language,
    `「${quote}」没看出是几点，所以这次没有改。说一下开始（和结束）的时间就行。`,
    `「${quote}」の時間が分からなかったため、今回は変更していません。開始（と終了）の時刻を教えてください。`,
    `"${quote}": I could not tell the time, so nothing was changed. Tell me the start (and end) time.`),
  needDay: (language: ReplyLanguage, quote: string) => pick(language,
    `「${quote}」没看出是哪一天，所以这次没有记。说一下日期就行。`,
    `「${quote}」の日付が分からなかったため、今回は記録していません。日付を教えてください。`,
    `"${quote}": I could not tell the day, so nothing was recorded. Tell me the date.`),
  needTitle: (language: ReplyLanguage, quote: string) => pick(language,
    `「${quote}」没看出叫什么名字，所以这次没有建。说一下名称就行。`,
    `「${quote}」の名前が分からなかったため、今回は作成していません。名前を教えてください。`,
    `"${quote}": I could not tell what to call it, so nothing was created. Tell me its name.`),
  scheduleNotFound: (language: ReplyLanguage, words: string) => pick(language,
    `你的日程里没找到「${words}」，所以这次没有改。`,
    `予定に「${words}」が見つからなかったため、今回は変更していません。`,
    `I could not find "${words}" in your schedule, so nothing was changed.`),
  noOccurrence: (language: ReplyLanguage, title: string, day: string) => pick(language,
    `「${title}」在${day}没有安排，所以这次没有改。`,
    `「${title}」は${day}には予定がないため、今回は変更していません。`,
    `"${title}" does not take place on ${day}, so nothing was changed.`),
  repeatUnsupported: (language: ReplyLanguage, said: string, dates: string[]) => pick(language,
    `「${said}」这种重复方式现在还不支持（只能每天、每周或每月重复，可以设截止日）。可以改成几条单次日程，比如${dates.join("、")}这几天，要的话告诉我，我再出卡。这次没有建，也没有改。`,
    `「${said}」という繰り返しにはまだ対応していません（毎日・毎週・毎月と終了日のみ）。代わりに単発の予定を数件（たとえば${dates.join("、")}）入れることはできます。よければ教えてください。今回は作成も変更もしていません。`,
    `Repeating "${said}" is not supported yet (only daily, weekly or monthly, with an end date). I can add a few one-off items instead, for example ${dates.join(", ")} — tell me if you want that. Nothing was created or changed this time.`),
  repeatCreateLater: (language: ReplyLanguage) => pick(language,
    "在对话里还不能建重复日程，这次没有建。可以先建一条单次的，或者在日程页里设重复。",
    "会話からはまだ繰り返しの予定を作れません。今回は作成していません。単発の予定を作るか、予定の画面で繰り返しを設定してください。",
    "Repeating schedule items cannot be created from the chat yet, so nothing was created. I can add a single one, or you can set the repetition on the schedule page."),
  todoNotFound: (language: ReplyLanguage, words: string) => pick(language,
    `没找到「${words}」这条待办，所以这次没有改。`,
    `「${words}」というタスクが見つからなかったため、今回は変更していません。`,
    `I could not find the to-do "${words}", so nothing was changed.`),
  todoAlready: (language: ReplyLanguage, title: string, state: "completed" | "open") => pick(language,
    `「${title}」现在已经是${state === "completed" ? "已完成" : "未完成"}，不用再改。`,
    `「${title}」はすでに${state === "completed" ? "完了" : "未完了"}になっています。`,
    `"${title}" is already ${state === "completed" ? "done" : "open"}; nothing to change.`),
  linksAlready: (language: ReplyLanguage, title: string) => pick(language,
    `「${title}」已经关联了这些，不用再加。`,
    `「${title}」にはすでに紐づいています。`,
    `"${title}" is already linked to those.`),
  privateNotFound: (language: ReplyLanguage, words: string) => pick(language,
    `你的私人活动里没找到「${words}」，所以这次没有删。`,
    `プライベートイベントに「${words}」が見つからなかったため、今回は削除していません。`,
    `I could not find "${words}" among your private events, so nothing was deleted.`),
  deleteKeep: (language: ReplyLanguage) => pick(language, "好的，先不删，活动和它的关联都保持原样。", "承知しました。削除せず、イベントと紐づけはそのままにします。", "Okay — nothing is deleted; the event and its links stay as they are."),
  moveWhere: (language: ReplyLanguage) => pick(language, "要把「我去过」转到哪一场？说一下那场活动的名称，我再出卡。这次没有改。", "「行った」の記録をどのイベントに移しますか？イベント名を教えてください。今回は変更していません。", "Which event should the \"I went\" note move to? Tell me its name and I will make the card. Nothing was changed."),
  // AG21c (R54): only the kinds that are actually linked are offered to unlink (no 「日程」 when no schedule item uses it).
  askDeletePlan: (language: ReplyLanguage, title: string, lines: string[], hasAttendance: boolean, kinds: readonly ("memo" | "todo" | "schedule")[] = ["memo", "todo", "schedule"]) => {
    const names = { en: { memo: "notes", schedule: "schedule items", todo: "to-dos" }, ja: { memo: "メモ", schedule: "予定", todo: "タスク" }, zh: { memo: "笔记", schedule: "日程", todo: "待办" } } as const;
    const listed = (["memo", "todo", "schedule"] as const).filter((kind) => kinds.includes(kind));
    const zhKinds = listed.map((kind) => names.zh[kind]);
    const enKinds = listed.map((kind) => names.en[kind]);
    const zh = zhKinds.length > 1 ? `${zhKinds.slice(0, -1).join("、")}和${zhKinds.at(-1)}` : zhKinds[0] ?? "";
    const en = enKinds.length > 1 ? `${enKinds.slice(0, -1).join(", ")} and ${enKinds.at(-1)}` : enKinds[0] ?? "";
    const enCap = en ? en[0].toUpperCase() + en.slice(1) : "";
    const kept = { en: listed.length === 1 && listed[0] === "todo" ? "the to-do stays" : "their text stays", zh: listed.includes("todo") ? (listed.length > 1 ? "原文和待办都留着" : "待办留着") : "原文留着" };
    return pick(language,
      `「${title}」还被 ${lines.length} 条记录用着：\n${lines.map((line) => `· ${line}`).join("\n")}\n${zh ? `${zh}可以只解除和这场活动的关联，${kept.zh}。` : ""}${hasAttendance ? "「我去过」要么一起删，要么转到另一场。" : ""}怎么处理？`,
      `「${title}」はまだ ${lines.length} 件の記録で使われています：\n${lines.map((line) => `· ${line}`).join("\n")}\n${listed.length ? `${listed.map((kind) => names.ja[kind]).join("・")}はこのイベントとの紐づけだけを外せます（本文やタスクは残ります）。` : ""}${hasAttendance ? "「行った」の記録は一緒に削除するか、別のイベントに移せます。" : ""}どうしますか？`,
      `"${title}" is still used by ${lines.length} record(s):\n${lines.map((line) => `· ${line}`).join("\n")}\n${enCap ? `${enCap} can just be unlinked from it (${kept.en}).` : ""}${hasAttendance ? `${enCap ? " " : ""}The "I went" note can be deleted with it or moved to another event.` : ""} What would you like to do?`);
  },
  planOptions: (language: ReplyLanguage, hasAttendance: boolean) => hasAttendance
    ? [
      { id: "delete_attendance", label: pick(language, "「我去过」一起删，其余只解除关联", "「行った」は一緒に削除、ほかは紐づけを外す", "Delete the \"I went\" note too; unlink the rest") },
      { id: "move_attendance", label: pick(language, "「我去过」转到另一场", "「行った」を別のイベントに移す", "Move the \"I went\" note to another event") },
      { id: "keep", label: pick(language, "先不删了", "やめておく", "Don't delete it") },
    ]
    : [
      { id: "unlink", label: pick(language, "只解除关联，然后删活动", "紐づけを外してから削除", "Unlink them, then delete the event") },
      { id: "keep", label: pick(language, "先不删了", "やめておく", "Don't delete it") },
    ],
  refLine: (language: ReplyLanguage, kind: "attendance" | "memo" | "todo" | "schedule", label: string, day?: string) => {
    if (kind === "attendance") return pick(language, `我去过（自己记的）· ${day ?? label}`, `行った（自分で記録）· ${day ?? label}`, `"I went" (your own note) · ${day ?? label}`);
    if (kind === "memo") return pick(language, `笔记「${label}」`, `メモ「${label}」`, `note "${label}"`);
    if (kind === "todo") return pick(language, `待办「${label}」`, `タスク「${label}」`, `to-do "${label}"`);
    return pick(language, `日程「${label}」`, `予定「${label}」`, `schedule item "${label}"`);
  },
  whichEvent: (language: ReplyLanguage, quote: string, labels: string[]) => pick(language,
    `「${quote}」说的是哪一场？${labels.map((label) => `「${label}」`).join("、")}`,
    `「${quote}」はどのイベントですか？${labels.map((label) => `「${label}」`).join("、")}`,
    `Which event does "${quote}" mean? ${labels.map((label) => `"${label}"`).join(", ")}`),
};
