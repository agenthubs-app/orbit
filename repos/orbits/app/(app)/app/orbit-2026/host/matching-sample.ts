// R17 マッチング空态「生成されるとこう見えます」的样例桌（b6 #3，淡显 + サンプル角标；不是数据）。
// 人名（英文用罗马字）、公司 / 职位 / 立場 / 主题都按三语写（R03：Web 文案一律 { ja, zh, en }）。
import type { HostMatchingMember, HostMatchingTable } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";

type Tri = { ja: string; zh: string; en: string };
// 职称缩写与公司名是专有名词，三语同写。
const CFO = "CFO";
const COO = "COO";
const KANATA = "Kanata Health";
type SamplePerson = { name: Tri; org: Tri; role: Tri; standing: Tri };

const S = {
  biz: { ja: "事業会社", zh: "企业", en: "Corporate" },
  inv: { ja: "投資家", zh: "投资人", en: "Investor" },
  cfo: { ja: CFO, zh: CFO, en: CFO },
  pro: { ja: "士業", zh: "专业人士", en: "Advisor" },
  ceo: { ja: "経営者", zh: "经营者", en: "Founder" },
  fin: { ja: "金融", zh: "金融", en: "Finance" },
} satisfies Record<string, Tri>;

const p = (name: Tri, org: Tri, role: Tri, standing: Tri): SamplePerson => ({ name, org, role, standing });

const TABLES: ReadonlyArray<{ table: string; theme: Tri; topic: Tri; people: readonly SamplePerson[] }> = [
  {
    table: "A", theme: { ja: "資本政策 × 投資家", zh: "资本政策 × 投资人", en: "Cap table × investors" }, topic: { ja: "資本政策", zh: "资本政策", en: "cap tables" },
    people: [
      p({ ja: "森田 拓也", zh: "森田 拓也", en: "Takuya Morita" }, { ja: "東邦テクノロジーズ", zh: "东邦科技", en: "Toho Technologies" }, { ja: "事業開発部 部長", zh: "业务开发部部长", en: "Head of BizDev" }, S.biz),
      p({ ja: "木村 洋平", zh: "木村 洋平", en: "Yohei Kimura" }, { ja: "みずほ台ベンチャーズ", zh: "瑞穗台创投", en: "Mizuhodai Ventures" }, { ja: "パートナー", zh: "合伙人", en: "Partner" }, S.inv),
      p({ ja: "斎藤 亮", zh: "斎藤 亮", en: "Ryo Saito" }, { ja: "Fintory株式会社", zh: "Fintory 株式会社", en: "Fintory Inc." }, { ja: "取締役CFO", zh: "董事 CFO", en: "Director & CFO" }, S.cfo),
      p({ ja: "後藤 久美", zh: "後藤 久美", en: "Kumi Goto" }, { ja: "後藤・水野法律事務所", zh: "后藤・水野律师事务所", en: "Goto & Mizuno Law" }, { ja: "弁護士", zh: "律师", en: "Lawyer" }, S.pro),
      p({ ja: "村上 祐介", zh: "村上 祐介", en: "Yusuke Murakami" }, { ja: "オリオン・グロース・パートナーズ", zh: "猎户座成长合伙", en: "Orion Growth Partners" }, { ja: "アソシエイト", zh: "投资经理", en: "Associate" }, S.inv),
    ],
  },
  {
    table: "B", theme: { ja: "製造業DX × 資金調達", zh: "制造业 DX × 融资", en: "Factory DX × fundraising" }, topic: { ja: "製造業DX", zh: "制造业 DX", en: "factory DX" },
    people: [
      p({ ja: "井上 さやか", zh: "井上 さやか", en: "Sayaka Inoue" }, { ja: "クラウドレジ株式会社", zh: "云收银株式会社", en: "CloudRegi Inc." }, { ja: CFO, zh: CFO, en: CFO }, S.cfo),
      p({ ja: "山口 恵", zh: "山口 恵", en: "Megumi Yamaguchi" }, { ja: "山口会計事務所", zh: "山口会计事务所", en: "Yamaguchi Accounting" }, { ja: "公認会計士", zh: "注册会计师", en: "CPA" }, S.pro),
      p({ ja: "藤井 誠一", zh: "藤井 誠一", en: "Seiichi Fujii" }, { ja: "中京電装株式会社", zh: "中京电装株式会社", en: "Chukyo Denso" }, { ja: "経営企画室 室長", zh: "经营企划室室长", en: "Head of Planning" }, S.biz),
      p({ ja: "近藤 大地", zh: "近藤 大地", en: "Daichi Kondo" }, { ja: KANATA, zh: KANATA, en: KANATA }, { ja: COO, zh: COO, en: COO }, S.ceo),
      p({ ja: "原田 ひとみ", zh: "原田 ひとみ", en: "Hitomi Harada" }, { ja: "ミライ証券", zh: "未来证券", en: "Mirai Securities" }, { ja: "IPO支援部", zh: "IPO 支援部", en: "IPO Advisory" }, S.fin),
    ],
  },
  {
    table: "C", theme: { ja: "財務チームづくり", zh: "组建财务团队", en: "Building a finance team" }, topic: { ja: "財務チームづくり", zh: "组建财务团队", en: "finance teams" },
    people: [
      p({ ja: "清水 健", zh: "清水 健", en: "Ken Shimizu" }, { ja: "東海プレス工業", zh: "东海冲压工业", en: "Tokai Press" }, { ja: "DX推進課 課長", zh: "DX 推进课课长", en: "DX Manager" }, S.biz),
      p({ ja: "前田 悠", zh: "前田 悠", en: "Yu Maeda" }, { ja: "ロジレス・テック", zh: "Logiless Tech", en: "Logiless Tech" }, { ja: "代表取締役CEO", zh: "董事长 CEO", en: "CEO" }, S.ceo),
      p({ ja: "石川 洋子", zh: "石川 洋子", en: "Yoko Ishikawa" }, { ja: "あおば信用金庫", zh: "青叶信用金库", en: "Aoba Shinkin Bank" }, { ja: "法人営業部 次長", zh: "法人营业部副部长", en: "Deputy GM, Corporate" }, S.fin),
      p({ ja: "遠藤 修", zh: "遠藤 修", en: "Osamu Endo" }, { ja: "遠藤化成工業", zh: "远藤化成工业", en: "Endo Kasei" }, { ja: "専務取締役", zh: "专务董事", en: "Senior MD" }, S.biz),
      p({ ja: "松本 隆", zh: "松本 隆", en: "Takashi Matsumoto" }, { ja: "松本精機株式会社", zh: "松本精机株式会社", en: "Matsumoto Seiki" }, { ja: "代表取締役", zh: "董事长", en: "President" }, S.ceo),
    ],
  },
];

const WHY: Tri = {
  ja: "申込回答で 5名中 4名が「{topic}」を選択。投資家 1名・CFO 2名・事業会社 1名で立場が偏らない構成です。第1ラウンドで同席した組み合わせはありません。",
  zh: "报名回答中5人里有4人选了「{topic}」。投资人1名、CFO 2名、企业1名，立场不偏。没有第1轮同桌过的组合。",
  en: "4 of 5 chose “{topic}” in their answers. One investor, two CFOs and one corporate keep the table balanced. No pair sat together in round 1.",
};

/** 样例桌（按语言取文案）。 */
export function matchingSampleTables(language: OrbitLanguage): HostMatchingTable[] {
  return TABLES.map((item) => ({
    absent: 0,
    members: item.people.map((person, index): HostMatchingMember => ({
      initial: [...person.name[language]][0] ?? "?",
      name: person.name[language],
      org: person.org[language],
      participantId: `sample-${item.table}-${index}`,
      placedByHost: false,
      role: person.role[language],
      standing: person.standing[language],
    })),
    round: 1,
    table: item.table,
    theme: item.theme[language],
    why: WHY[language].replace("{topic}", item.topic[language]),
  }));
}
