// R08 統一デモ世界 (RD-22): the one source every redesign fixture is assembled from,
// so a person has the same name and company on the home, network, event and plan
// fixtures. People and companies follow the design boards (app.html, web.html,
// b9 / b10); all are fictional. Japanese first (R03 glossary / style guide).
// Every record carries `sample: true`: the UI shows the sample tag, and sample
// data is never written to the database, counted, searched or used as AI evidence
// (01-system.html:484-488).

export const DEMO_TODAY = "2026-10-07";
export const DEMO_TIME_ZONE = "Asia/Tokyo";

export type DemoPerson = {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly role: string;
  readonly density: 1 | 2 | 3;
  readonly source: "meishi" | "linkedin" | "phone" | "manual";
  readonly sample: true;
};

export const DEMO_PEOPLE = [
  { id: "demo-person-watanabe", name: "渡辺 翔", company: "Nexa Robotics", role: "代表取締役", density: 3, source: "meishi", sample: true },
  { id: "demo-person-takahashi", name: "高橋 美咲", company: "青葉ベンチャーズ", role: "パートナー", density: 3, source: "meishi", sample: true },
  { id: "demo-person-yamamoto", name: "山本 彩", company: "東都キャピタル", role: "シニアアソシエイト", density: 2, source: "linkedin", sample: true },
  { id: "demo-person-aoki", name: "青木 里奈", company: "Kanade AI", role: "CTO", density: 2, source: "meishi", sample: true },
  { id: "demo-person-kobayashi", name: "小林 誠", company: "丸の内イノベーションラボ", role: "主宰", density: 2, source: "meishi", sample: true },
  { id: "demo-person-ito", name: "伊藤 直子", company: "株式会社ハルモニア", role: "事業開発部長", density: 1, source: "phone", sample: true },
  { id: "demo-person-sasaki", name: "佐々木 遼", company: "湾岸グロース・パートナーズ", role: "マネージャー", density: 1, source: "linkedin", sample: true },
  { id: "demo-person-suzuki", name: "鈴木 大輔", company: "北辰製作所", role: "製造部長", density: 1, source: "meishi", sample: true },
  { id: "demo-person-matsui", name: "松井 遥", company: "株式会社ソラノテ", role: "プロダクトマネージャー", density: 2, source: "manual", sample: true },
  { id: "demo-person-okada", name: "岡田 紗希", company: "Sakura Growth Partners", role: "アナリスト", density: 1, source: "linkedin", sample: true },
] as const satisfies readonly DemoPerson[];

export type DemoPersonId = (typeof DEMO_PEOPLE)[number]["id"];

export type DemoEvent = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly venue: string;
  readonly organizer: string;
  readonly attendeeIds: readonly DemoPersonId[];
  readonly sample: true;
};

export const DEMO_EVENTS = [
  { id: "demo-event-cfo-night", title: "CFO Night Tokyo vol.18", startsAt: "2026-10-09T19:00:00+09:00", venue: "東京・丸の内", organizer: "丸の内イノベーションラボ", attendeeIds: ["demo-person-kobayashi", "demo-person-yamamoto"], sample: true },
  { id: "demo-event-saas-summit", title: "SaaS Summit 2026", startsAt: "2026-10-22T10:00:00+09:00", venue: "東京・虎ノ門", organizer: "SaaS Summit 実行委員会", attendeeIds: ["demo-person-aoki", "demo-person-matsui", "demo-person-watanabe"], sample: true },
  { id: "demo-event-robotics-meetup", title: "ロボティクス起業家ミートアップ", startsAt: "2026-11-05T19:00:00+09:00", venue: "東京・渋谷", organizer: "Nexa Robotics", attendeeIds: ["demo-person-watanabe", "demo-person-suzuki"], sample: true },
] as const satisfies readonly DemoEvent[];

// R22: the plan is a v2.2 plan (DESIGN §3, b4 / app.html の「シリーズA 資金調達」). `personIds` are the people
// already talked to under each type; `attendedEventIds` the events attended for the event block.
export const DEMO_PLAN = {
  id: "demo-plan-series-a",
  goal: "シリーズA 資金調達（3億円）",
  goalKind: "fundraising",
  purposeText: "製造業 DX の SaaS を、次の2年で伸ばせる体制にする",
  startsOn: "2026-09-15",
  steps: [
    { key: "demo-step-1", title: "数字と資料を固める", doneCriteria: "ピッチ資料と事業計画を CFO 経験者 1 人に見てもらう", personTypeKeys: ["cfo"] },
    { key: "demo-step-2", title: "先輩起業家に紹介を頼む", doneCriteria: "調達経験のある起業家 3 人から、VC の紹介を 2 件もらう", personTypeKeys: ["funded_founder", "angel"] },
    { key: "demo-step-3", title: "VC と並行して話す", doneCriteria: "VC パートナー 3 人と面談し、1 社と DD に進む", personTypeKeys: ["vc_partner"] },
    { key: "demo-step-4", title: "CVC を後から加える", doneCriteria: "CVC 担当者 3 人に事業の相性を聞く", personTypeKeys: ["cvc"] },
    { key: "demo-step-5", title: "契約をまとめる", doneCriteria: "投資契約を弁護士に確認してもらう", personTypeKeys: ["lawyer"] },
  ],
  personTypes: [
    { key: "cfo", slot: "cfo", shortLabelId: "cfo", label: "CFO 経験者", emoji: "📊", roleSituation: "シリーズ A 前後の資金調達を、CFO として 1 回以上まとめた人", allocation: 10, target: 1, personIds: [], skipped: false },
    { key: "funded_founder", slot: "funded_founder", shortLabelId: "funded_founder", label: "調達経験のある起業家", emoji: "🧗", roleSituation: "3年以内にシリーズ A を調達した、技術系スタートアップの創業者", allocation: 15, target: 3, personIds: ["demo-person-watanabe", "demo-person-aoki"], skipped: false },
    { key: "angel", slot: "angel", shortLabelId: "angel", label: "エンジェル投資家", emoji: "👼", roleSituation: "製造業や SaaS に個人で投資している、元起業家のエンジェル", allocation: 10, target: 2, personIds: [], skipped: false },
    { key: "vc_partner", slot: "vc_partner", shortLabelId: "vc_partner", label: "VC パートナー", emoji: "🏦", roleSituation: "シリーズ A のリードを取れる VC のパートナー", allocation: 30, target: 3, personIds: ["demo-person-takahashi", "demo-person-yamamoto"], skipped: false },
    { key: "cvc", slot: "cvc", shortLabelId: "cvc", label: "CVC 担当者", emoji: "🏢", roleSituation: "製造業 DX に出資している、事業会社 CVC の投資担当", allocation: 15, target: 3, personIds: [], skipped: false },
    { key: "lawyer", slot: "lawyer", shortLabelId: "lawyer", label: "弁護士（投資契約）", emoji: "⚖️", roleSituation: "スタートアップの投資契約を多く見てきた弁護士", allocation: 10, target: 1, personIds: [], skipped: true },
  ],
  event: { allocation: 10, targetCount: 2, attendedEventIds: ["demo-event-cfo-night"] },
  sample: true,
} as const;

export const DEMO_NOTES = [
  { id: "demo-note-watanabe", title: "渡辺さんと 30 分", body: "最初の2年は「作れるが売れない」。営業とデザインの仲間を入れて越えた。", personIds: ["demo-person-watanabe"], eventId: null, noteKind: "meeting", sample: true },
  { id: "demo-note-cfo-night", title: "CFO Night のメモ", body: "山本さん：シリーズ A の資料は 12 枚まで。", personIds: ["demo-person-yamamoto"], eventId: "demo-event-cfo-night", noteKind: "free", sample: true },
] as const;

export const DEMO_TODOS = [
  { id: "demo-todo-thanks", title: "渡辺さんにお礼のメールを書く", personId: "demo-person-watanabe", dueDate: DEMO_TODAY, deferralCount: 0, sample: true },
  { id: "demo-todo-deck", title: "高橋さんに資料を送る", personId: "demo-person-takahashi", dueDate: "2026-10-08", deferralCount: 1, sample: true },
  { id: "demo-todo-saas", title: "SaaS Summit の参加を決める", personId: null, dueDate: "2026-10-10", deferralCount: 0, sample: true },
] as const;

export function demoPerson(id: DemoPersonId): DemoPerson {
  return DEMO_PEOPLE.find((person) => person.id === id)!;
}

export function demoEvent(id: (typeof DEMO_EVENTS)[number]["id"]): DemoEvent {
  return DEMO_EVENTS.find((event) => event.id === id)!;
}
