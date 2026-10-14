/**
 * R16 像素门禁只读演示的示例数据（设计稿画板 b9 A3 ② ③ ④、b12 W-R16-11a～c 上的文件名、人名与公司；交接表 G08 / 决定表 Q4）。
 * 只给 `app/(app)/app/contacts/new/_add/import-design-demo.tsx` 用；本机 `ORBIT_REDESIGN_MOCK=add-scan|add-import` 时才渲染。
 */
export const IMPORT_DESIGN_SAMPLE = {
  linkedinFile: { name: "Connections.csv", count: 341, size: "48 KB" },
  vcardFile: { name: "contacts.vcf", count: 412, size: "96 KB" },
  /** b9 A3 ③: the columns, row 1 and the next two people; 12 of 341 have an email. */
  linkedin: {
    headers: ["First Name", "Last Name", "Company", "Position", "Connected On", "Email Address", "URL"],
    rows: 341,
    emails: 12,
    first: { connectedOn: "12 Mar 2024", url: "linkedin.com/in/…" },
    people: [
      { name: "森 恭平", organization: "東雲キャピタル", role: "プリンシパル" },
      { name: "青木 里奈", organization: "Kanade AI", role: "CTO" },
      { name: "岡田 紗希", organization: "Sakura Growth Partners", role: "ヴァイスプレジデント" },
    ],
  },
  /** b12 W-R16-11b: eight_export.csv, 128 rows. */
  csv: {
    fileName: "eight_export.csv",
    headers: ["氏名", "フリガナ", "会社名", "役職", "E-mail", "電話番号", "名刺交換日"],
    rows: 128,
    first: { email: "ryo.takayama@…", phone: "06-5555-0182" },
    people: [
      { name: "高山 亮", organization: "ミライ精機株式会社", role: "経営企画部 部長" },
      { name: "松本 千尋", organization: "関西テクノ電機", role: "営業部" },
      { name: "伊達 修平", organization: "北辰製作所", role: "経営企画" },
    ],
  },
  /** b9 A3 ④ (Web 统一): 重複 9 (5 auto) / 要確認 23 / そのまま追加 309 → 336人. */
  review: {
    autoMerged: 5,
    asIs: 309,
    add: 336,
    reviewSub: "会社名・氏名の区切りが不確か",
    duplicates: [
      { id: "suzuki", existing: "鈴木 大輔 · 北辰製作所", incoming: "鈴木 大輔 · Hokushin Mfg.", difference: "会社名の表記", warn: false, selected: true },
      { id: "yamamoto", existing: "山本 彩 · 東都キャピタル", incoming: "山本 彩 · Sakura Growth Partners", difference: "会社が違う（転職？）", warn: true, selected: false },
      { id: "watanabe", existing: "渡辺 翔 · Nexa Robotics", incoming: "Sho Watanabe · Nexa Robotics", difference: "ローマ字表記", warn: false, selected: true },
      { id: "ito", existing: "伊藤 直子 · ハルモニア", incoming: "伊藤 直子 · Harmonia Inc.", difference: "会社名の表記", warn: false, selected: true },
    ],
    groups: [
      { key: "name", label: "氏名の区切り", example: "Kyohei Mori → 森 恭平", count: 11 },
      { key: "self", label: "会社名", example: "Self-employed → 会社なし", count: 7 },
      { key: "na", label: "会社名", example: "「—」「N/A」を空欄に", count: 5 },
    ],
  },
  /** b12 W-R16-11c. */
  event: {
    events: [
      { eventId: "cfo", title: "CFO Night Tokyo", meta: "10月7日（火）· 渋谷", cards: 4 },
      { eventId: "dx", title: "製造業DX カンファレンス 大阪", meta: "9月26日（金）· グランフロント大阪", cards: 9 },
      { eventId: "saas", title: "SaaS Summit 2026", meta: "9月12日（金）· 東京国際フォーラム", cards: 6 },
    ],
    people: [
      { name: "高山 亮", sub: "ミライ精機 · 経営企画部 部長", inNetwork: false },
      { name: "伊達 修平", sub: "北辰製作所 · 経営企画", inNetwork: false },
      { name: "松本 千尋", sub: "関西テクノ電機 · 営業部", inNetwork: false },
      { name: "高橋 美咲", sub: "青葉ベンチャーズ · パートナー", inNetwork: true },
    ],
  },
} as const;
