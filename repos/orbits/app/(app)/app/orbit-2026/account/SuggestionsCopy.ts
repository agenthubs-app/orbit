import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { SuggestionField, SuggestionSource } from "./SuggestionsModel";

const copy = {
  title: { zh: "资料更新建议", en: "Profile suggestions", ja: "更新の提案" },
  intro: { zh: "确认后才会修改你的个人资料。", en: "Your profile changes only after you confirm.", ja: "あなたが確認するまで、プロフィールは変わりません。" },
  empty: { zh: "目前没有待确认的建议", en: "No suggestions to review", ja: "いま確認する提案はありません" },
  emptyDetail: { zh: "有新信息时会显示在这里。你也可以从文本提取自己的资料草稿。", en: "New suggestions will appear here. You can also extract a draft from your own text.", ja: "新しい提案はここに届きます。手元のテキストから下書きを作ることもできます。" },
  extractTitle: { zh: "从文本整理资料", en: "Extract from text", ja: "テキストから下書きを作る" },
  extractHint: { zh: "粘贴带字段名的名片或履历文本，例如“职位：…”。这里不支持图片或 PDF 扫描。", en: "Paste labelled business-card or résumé text, such as “Role: …”. Image and PDF scanning are not available here.", ja: "「役職：…」のように項目名のある名刺・職務経歴書のテキストを貼り付けてください。画像や PDF の読み取りには対応していません。" },
  textLabel: { zh: "资料文本", en: "Profile text", ja: "資料のテキスト" },
  textPlaceholder: { zh: "姓名：…\n公司：…\n职位：…", en: "Name: …\nCompany: …\nRole: …", ja: "名前：…\n会社：…\n役職：…" },
  chooseType: { zh: "资料类型", en: "Document type", ja: "資料の種類" },
  extract: { zh: "生成待确认字段", en: "Extract fields to review", ja: "確認する項目を抽出" },
  noFields: { zh: "没有找到可用字段。请加入明确的字段名后再试。", en: "No supported fields found. Add explicit field labels and try again.", ja: "対応する項目が見つかりませんでした。項目名を付けてもう一度お試しください。" },
  scanContact: { zh: "扫描联系人的名片", en: "Scan a contact's card", ja: "連絡先の名刺をスキャン" },
  talkIorbit: { zh: "和 iOrbit 聊近况", en: "Tell iOrbit what's new", ja: "iOrbit に近況を話す" },
  all: { zh: "全部", en: "All", ja: "すべて" },
  selectAllCard: { zh: "采纳这张卡的全部项目", en: "Accept all in this card", ja: "このカードをすべて採用" },
  accept: { zh: "采纳", en: "Accept", ja: "採用" },
  skip: { zh: "跳过", en: "Skip", ja: "見送る" },
  apply: { zh: "确认所选修改", en: "Confirm selected changes", ja: "選んだ項目を反映" },
  applying: { zh: "正在保存", en: "Saving", ja: "保存中" },
  saved: { zh: "个人资料已更新", en: "Profile updated", ja: "プロフィールを更新しました" },
  dismissed: { zh: "已处理建议", en: "Suggestions reviewed", ja: "提案を確認しました" },
  partial: { zh: "资料已保存，但部分建议状态未更新。请刷新后核对。", en: "Profile saved, but some suggestion statuses did not update. Refresh and review them.", ja: "プロフィールは保存されましたが、一部の提案の状態を更新できませんでした。更新して確認してください。" },
  failed: { zh: "暂时无法完成，请重试。", en: "Could not complete this. Please retry.", ja: "完了できませんでした。もう一度お試しください。" },
  conflict: { zh: "这些建议中有同一字段的不同内容。请只选择其中一个。", en: "Different suggestions change the same field. Choose one of them.", ja: "同じ項目に異なる提案があります。どちらか一方を選んでください。" },
  retry: { zh: "重试", en: "Retry", ja: "再試行" },
  loading: { zh: "正在读取建议…", en: "Loading suggestions…", ja: "提案を読み込み中…" },
  sources: { zh: "建议来源", en: "Suggestion sources", ja: "提案の出どころ" },
  ruleTitle: { zh: "修改规则", en: "How changes work", ja: "反映のルール" },
  ruleBody: { zh: "只保存你采纳的项目；不会通知其他人。", en: "Only accepted fields are saved. No one else is notified.", ja: "採用した項目だけを書き換えます。ほかの人には通知されません。" },
  current: { zh: "当前", en: "Current", ja: "現在" },
  proposed: { zh: "建议", en: "Suggested", ja: "提案" },
  evidence: { zh: "依据", en: "Why this was suggested", ja: "根拠" },
  sample: { zh: "示例", en: "Sample", ja: "サンプル" },
  sampleNote: { zh: "这是一张示例卡，不会修改任何资料。", en: "This is a sample card. It cannot change any profile.", ja: "これはサンプルです。プロフィールは変更されません。" },
  skipAll: { zh: "全部跳过", en: "Skip all", ja: "すべて見送る" },
  applyCount: { zh: "反映所选 {n} 项", en: "Apply {n} selected", ja: "選んだ {n}項目を反映" },
  headCount: { zh: "{cards} 条 · {rows} 项", en: "{cards} cards · {rows} items", ja: "{cards}件 · {rows}項目" },
  tally: { zh: "✓ {yes} · ✕ {no} · 未确认 {pending}", en: "✓ {yes} · ✕ {no} · {pending} to review", ja: "✓ {yes} · ✕ {no} · 未確認 {pending}" },
  acceptAll: { zh: "全部采纳", en: "Accept all", ja: "すべて採用" },
  scanned: { zh: "{date} 扫描", en: "Scanned {date}", ja: "{date} スキャン" },
  uploaded: { zh: "{date} 上传", en: "Uploaded {date}", ja: "{date} アップロード" },
  talked: { zh: "{date} 的对话", en: "Conversation on {date}", ja: "{date}の会話" },
  noted: { zh: "{date}", en: "On {date}", ja: "{date}" },
  ruleLine1: { zh: "・只改写你 ✓ 的项目", en: "・Only items you ✓ are changed", ja: "・✓ した項目だけ書き換えます" },
  ruleLine2: { zh: "・不会通知对方", en: "・No one is notified", ja: "・相手に通知されることはありません" },
  chatNote: { zh: "来自「与 iOrbit 的对话」的建议只使用你说过的内容，不会用外部信息改写人物。", en: "Suggestions from iOrbit conversations use only what you said. Outside information never rewrites a person.", ja: "「iOrbit との会話」からの提案は、あなたが話した内容だけを使います。外部の情報で人物を書き換えることはありません。" },
  back: { zh: "返回", en: "Back", ja: "戻る" },
  self: { zh: "你的个人资料", en: "Your profile", ja: "あなたのプロフィール" },
  unknown: { zh: "未填写", en: "Not set", ja: "未設定" },
} as const;

const sources: Record<SuggestionSource, { zh: string; en: string; ja: string }> = {
  chat: { zh: "iOrbit 对话", en: "iOrbit conversation", ja: "iOrbit との会話" },
  activity: { zh: "活动", en: "Activity", ja: "アクティビティ" },
  contact: { zh: "联系人信息", en: "Contact information", ja: "連絡先の情報" },
  "business-card": { zh: "新名片", en: "New business card", ja: "新しい名刺" },
  resume: { zh: "履历", en: "Résumé", ja: "職務経歴書" },
};

const fields: Record<SuggestionField, { zh: string; en: string; ja: string }> = {
  displayName: { zh: "姓名", en: "Name", ja: "名前" },
  organization: { zh: "公司", en: "Company", ja: "会社" },
  role: { zh: "职位", en: "Role", ja: "役職" },
  headline: { zh: "一句话介绍", en: "Headline", ja: "一言紹介" },
  bio: { zh: "关于我", en: "About me", ja: "自己紹介" },
  offering: { zh: "能提供", en: "Can offer", ja: "力になれること" },
  seeking: { zh: "想寻找", en: "Seeking", ja: "求めていること" },
  homeMarket: { zh: "所在地", en: "Location", ja: "所在地" },
  relationshipGoal: { zh: "关系目标", en: "Relationship goal", ja: "現在の目標" },
  targetRelationshipTypes: { zh: "目标人脉", en: "People to meet", ja: "会いたい人" },
  preferredFollowUpWindow: { zh: "跟进时间", en: "Follow-up timing", ja: "フォローの時期" },
  preferredIntroChannels: { zh: "联系渠道", en: "Introduction channels", ja: "連絡方法" },
};

export function suggestionsCopy(language: OrbitLanguage) {
  return (key: keyof typeof copy) => copy[key][language];
}
export function suggestionSourceLabel(source: SuggestionSource, language: OrbitLanguage): string { return sources[source][language]; }
export function suggestionFieldLabel(field: SuggestionField, language: OrbitLanguage): string { return fields[field][language]; }
