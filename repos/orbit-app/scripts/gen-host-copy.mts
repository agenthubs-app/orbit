// R17 主催（App）文案生成：从 Web `orbits/app/(app)/app/orbit-2026/copy/host.ts` 取同键同文（键前加 `host.`），
// 再加 App 独有的词条（`app*`，画板 b6 #21–#24、b12 #416–#430、b7 #36–#38 与「PC が便利です」画面）。
// 写 src/i18n/{ja,zh,en}/host.ts 与 src/i18n/host-kinds.ts。Web 加键后重跑：`npx tsx scripts/gen-host-copy.mts`。
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Entry = { ja: string; zh: string; en: string; kind: string };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = (await import(join(root, "../orbits/app/(app)/app/orbit-2026/copy/host.ts"))).hostCopy as Record<string, Entry>;

const APP: Record<string, Entry> = {
  appBack: { ja: "戻る", zh: "返回", en: "Back", kind: "label" },
  appCrumb: { ja: "マイ › 主催", zh: "我的 › 主办", en: "Me › Hosting", kind: "label" },
  appEmptyTitle: { ja: "最初のイベントを\n主催しましょう", zh: "来主办你的\n第一场活动吧", en: "Host your\nfirst event", kind: "title" },
  appEmptySub: { ja: "申込・審査・テーブル編成・当日受付まで。作成と申込フォームの編集は PC が便利です。", zh: "报名、审核、分桌、当天签到都在这里。创建活动和编辑报名表用电脑更方便。", en: "Sign-ups, reviews, tables and check-in. Creating events and editing the form is easier on a computer.", kind: "body" },
  appSendPc: { ja: "PC で開くリンクを自分に送る", zh: "把电脑打开的链接发给自己", en: "Get the link for PC", kind: "fullButton" },
  appPcSent: { ja: "受信箱にリンクを届けました", zh: "链接已放进收件箱", en: "The link is in your inbox", kind: "toast" },
  appTileTemplate: { ja: "テンプレート", zh: "模板", en: "Templates", kind: "label" },
  appTileCheckIn: { ja: "受付だけ担当", zh: "只负责签到", en: "Check-in only", kind: "label" },
  appSample: { ja: "サンプル", zh: "示例", en: "Sample", kind: "chip" },
  appPcCreate: { ja: "作成と申込フォームの編集は PC が便利です", zh: "创建活动和编辑报名表用电脑更方便", en: "Creating events and editing the form is easier on a computer", kind: "label" },
  appLoadError: { ja: "読み込めませんでした。少し待ってからもう一度開いてください。", zh: "没能读取。请稍后再打开。", en: "Couldn't load this. Try again in a moment.", kind: "sentence" },
  appCodeSub: { ja: "主催者から届いた 8文字のコード", zh: "主办方发来的8位代码", en: "The 8-character code from the host", kind: "label" },
  appCodeInvalid: { ja: "このコードは使えません", zh: "这个代码不能用", en: "This code can't be used", kind: "toast" },
  appTplTitle: { ja: "テンプレートから作成", zh: "从模板创建", en: "Start from a template", kind: "title" },
  appTplSub: { ja: "形式と質問が入った状態で始められます", zh: "带着形式和问题开始", en: "Starts with a format and questions filled in", kind: "label" },
  appTplMixerSub: { ja: "質問 3問 · テーブル 3ラウンド", zh: "3个问题 · 3轮分桌", en: "3 questions · 3 table rounds", kind: "label" },
  appTplStudySub: { ja: "質問 2問 · 座席なし", zh: "2个问题 · 不排座", en: "2 questions · No seating", kind: "label" },
  appTplRoundSub: { ja: "質問 4問 · 審査制", zh: "4个问题 · 审核制", en: "4 questions · Reviewed", kind: "label" },
  appTplPc: { ja: "細かい編集は PC で続けられます", zh: "细节可以在电脑上继续编辑", en: "Fine-tune the details on a computer", kind: "label" },
  appArrival: { ja: "到着 {a} / {n} · {r}%", zh: "已到{a} / {n} · {r}%", en: "Arrived {a} / {n} · {r}%", kind: "label" },
  appRoundsTables: { ja: "{r}ラウンド · {n}テーブル", zh: "{r}轮 · {n}桌", en: "{r} rounds · {n} tables", kind: "label" },
  appPublished: { ja: "公開済み", zh: "已公开", en: "Published", kind: "chip" },
  appGenerating: { ja: "生成中", zh: "正在生成", en: "Generating", kind: "chip" },
  appNotGenerated: { ja: "未生成", zh: "尚未生成", en: "Not generated", kind: "chip" },
  appSeeResults: { ja: "結果を見る", zh: "查看结果", en: "See results", kind: "button" },
  appTodo: { ja: "要対応", zh: "待处理", en: "To do", kind: "title" },
  appWalkInSlots: { ja: "当日枠 {n}名分", zh: "当天名额{n}人", en: "{n} walk-in slots", kind: "label" },
  appPcSetup: { ja: "申込設定とレポートの詳細は PC で編集できます", zh: "报名设置和报告详情可在电脑上编辑", en: "Edit sign-up settings and the full report on a computer", kind: "label" },
  appReportLine: { ja: "到着 {a} / {n}名 · 名刺交換 {x}件 · {at} 時点", zh: "已到{a} / {n}人 · 交换名片{x}次 · 截至{at}", en: "Arrived {a} / {n} · {x} card exchanges · as of {at}", kind: "label" },
  appReportBefore: { ja: "開催後に受付率・交換率・会後フォローが出ます", zh: "活动结束后显示签到率、交换率和会后跟进", en: "Check-in, exchange and follow-up rates appear after the event", kind: "label" },
  appReportPcTitle: { ja: "詳しいレポートは PC で", zh: "详细报告请在电脑上看", en: "Full report on a computer", kind: "label" },
  appReportPcSub: { ja: "申込推移・テーブル別・会後フォローの内訳", zh: "报名趋势、各桌情况、会后跟进明细", en: "Sign-up trend, tables and follow-up breakdown", kind: "label" },
  appPcDetail: { ja: "PC で詳細", zh: "电脑上看详情", en: "Details on PC", kind: "button" },
  appMatchTitle: { ja: "マッチング結果", zh: "分桌结果", en: "Table results", kind: "title" },
  appMatchReadOnly: { ja: "見るだけです。テーブルの入れ替えは PC で行えます", zh: "这里只能查看。调整分桌请在电脑上操作", en: "View only. Swap tables on a computer", kind: "label" },
  appMatchNone: { ja: "マッチングはまだ生成されていません", zh: "还没有生成分桌", en: "Tables haven't been generated yet", kind: "label" },
  appTableName: { ja: "テーブル {t}", zh: "{t}桌", en: "Table {t}", kind: "label" },
  appPeopleN: { ja: "{n}名", zh: "{n}人", en: "{n} people", kind: "label" },
  appBPending: { ja: "審査待ち {n}", zh: "待审核{n}", en: "To review {n}", kind: "label" },
  appBApproved: { ja: "承認済み {n}", zh: "已批准{n}", en: "Approved {n}", kind: "label" },
  appBWaitlisted: { ja: "キャンセル待ち {n}", zh: "候补{n}", en: "Waitlist {n}", kind: "label" },
  appBRejected: { ja: "見送り {n}", zh: "未通过{n}", en: "Declined {n}", kind: "label" },
  appPeoplePc: { ja: "まとめて審査・見送りの理由メモは PC で", zh: "批量审核和未通过理由备注请在电脑上操作", en: "Bulk review and decline notes on a computer", kind: "label" },
  appSampleReadOnly: { ja: "サンプルのため保存されません", zh: "示例数据不会保存", en: "Sample data isn't saved", kind: "toast" },
  appNotifySend: { ja: "通知する", zh: "通知", en: "Notify", kind: "button" },
  appNotified: { ja: "{n}名にお知らせしました", zh: "已通知{n}人", en: "Notified {n} people", kind: "toast" },
  appConflict: { ja: "先に更新されています", zh: "已被别人先更新", en: "Updated by someone else", kind: "toast" },
  appApproved: { ja: "{name}を承認しました", zh: "已批准{name}", en: "Approved {name}", kind: "toast" },
  appArrive: { ja: "到着", zh: "到场", en: "Check in", kind: "button" },
  appCheckedAt: { ja: "{time} 受付", zh: "{time}签到", en: "Checked in {time}", kind: "label" },
  appSendFailed: { ja: "送信できませんでした", zh: "没能提交", en: "Couldn't save to the server", kind: "label" },
  appDevices: { ja: "{n}台で受付中", zh: "{n}台设备签到中", en: "{n} devices checking in", kind: "label" },
  appNoCheckIn: { ja: "この端末では受付を開けません。主催者に受付の担当を頼んでください。", zh: "这台设备打不开签到。请让主办方把你设为签到负责人。", en: "Check-in isn't available here. Ask the host to add you as check-in staff.", kind: "sentence" },
  appWalkInTitle: { ja: "{name}さんを当日枠で受付しますか？", zh: "用当天名额为{name}签到吗？", en: "Admit {name} on the day?", kind: "title" },
  appQrReading: { ja: "読み取り中…", zh: "正在读取…", en: "Reading…", kind: "label" },
  appQrDenied: { ja: "カメラを使えません。設定アプリでカメラを許可してください", zh: "无法使用相机。请在设置里允许相机", en: "Camera unavailable. Allow camera access in Settings", kind: "label" },
  appEditTitle: { ja: "基本情報を編集", zh: "编辑基本信息", en: "Edit details", kind: "title" },
  appProfilesTitle: { ja: "主催者ページ", zh: "主办方页面", en: "Host pages", kind: "title" },
  appPcOnlyTitle: { ja: "この画面は PC が便利です", zh: "这个画面用电脑更方便", en: "This is easier on a computer", kind: "title" },
  appPcOnlySub: { ja: "作成と編集は PC の Orbit で行えます。リンクを受信箱に届けられます。", zh: "创建和编辑可以在电脑上的 Orbit 里完成。可以把链接放进收件箱。", en: "Create and edit in Orbit on a computer. Orbit can put the link in your inbox.", kind: "body" },
  appRowTitle: { ja: "主催したイベント", zh: "主办的活动", en: "Events I host", kind: "label" },
  appRowEmpty: { ja: "イベントを主催する", zh: "主办活动", en: "Host an event", kind: "label" },
  appRowCount: { ja: "{n}件", zh: "{n}场", en: "{n} events", kind: "label" },
  appRowCountActive: { ja: "{n}件 · 運営中 {a}", zh: "{n}场 · 运营中{a}", en: "{n} events · {a} active", kind: "label" },
  appSampleVenue: { ja: "渋谷ストリーム", zh: "涩谷 Stream", en: "Shibuya Stream", kind: "label" },
  appShortLinkTitle: { ja: "イベント", zh: "活动", en: "Event", kind: "title" },
};

const all: Record<string, Entry> = { ...web };
for (const [key, value] of Object.entries(APP)) {
  if (all[key]) throw new Error(`App key ${key} collides with the Web host copy`);
  all[key] = value;
}
const header = "// R17 主催（運営センター / イベント運営 / 受付 / 共同運営に参加 / 公開主催者ページ）。Web と同じ言い方：orbits app/(app)/app/orbit-2026/copy/host.ts から生成（同じキー・同じ文）＋ App 独有の `app*`（scripts/gen-host-copy.mts）。kind は src/i18n/host-kinds.ts。\n";
for (const locale of ["ja", "zh", "en"] as const) {
  const lines = Object.entries(all).map(([key, value]) => `  ${JSON.stringify(`host.${key}`)}: ${JSON.stringify(value[locale])},`);
  writeFileSync(join(root, `src/i18n/${locale}/host.ts`), `${header}export const host = {\n${lines.join("\n")}\n} as const;\n`);
}
const kinds = Object.entries(all).map(([key, value]) => `  [${JSON.stringify(`host.${key}`)}, ${JSON.stringify(value.kind)}],`);
writeFileSync(join(root, "src/i18n/host-kinds.ts"), `// R17 主催：host 字典每个键的组件 kind（与 Web copy/host.ts 同 kind；scripts/gen-host-copy.mts 生成）。\nexport const hostCopyKinds: readonly (readonly [pattern: string, kind: string])[] = [\n${kinds.join("\n")}\n];\n`);
console.log(`host: ${Object.keys(all).length} keys (${Object.keys(APP).length} App-only)`);
