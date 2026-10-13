/**
 * R12 像素门禁只读演示的示例数据（设计稿画板上的人名与公司；交接表 G08 / 决定表 Q4）。
 * 只给 `app/(app)/app/contacts/new/_add/scan-design-fixtures.tsx` 用；本机 `ORBIT_REDESIGN_MOCK=add-scan` 时才渲染。
 */
export const SCAN_DESIGN_SAMPLE = {
  /** b11 A1 Web 読み取り中. */
  reading: {
    added: { name: "高山 亮", organization: "ミライ精機", title: "経営企画部 部長" },
    guess: { name: "松本 千尋", organization: "関西テクノ電機" },
    failedFile: "IMG_2041.HEIC",
  },
  /** b9 ④ Web 统一（名刺版）. */
  review: {
    duplicates: [
      { id: "suzuki", incoming: ["鈴木 大輔", "Hokushin Mfg."], existing: ["鈴木 大輔", "北辰製作所"] },
      { id: "yamamoto", incoming: ["山本 彩", "Sakura Growth Partners"], existing: ["山本 彩", "東都キャピタル"] },
      { id: "watanabe", incoming: ["Sho Watanabe", "Nexa Robotics"], existing: ["渡辺 翔", "Nexa Robotics"] },
      { id: "ito", incoming: ["伊藤 直子", "Harmonia Inc."], existing: ["伊藤 直子", "ハルモニア"] },
    ],
    noName: { organization: "東雲キャピタル" },
    orgSuffix: { name: "青木 里奈", organization: "Kanade AI" },
    added: { name: "岡田 紗希", organization: "Sakura Growth Partners", title: "VP" },
  },
  /** b12 W-R12-11 完成. */
  done: { event: "CFO Night Tokyo vol.18" },
} as const;
