/**
 * R11b 设计稿示例 fixture（人脈分析，像素门禁用；只被 app/api/dev/network-design-fixture/route.dev.ts 引用，生产包不收录）。
 * `empty` (0), `locked5` (b5 #32 / #38), `few14` (#33 / #39), `many286` (#34–#37, #40, #41, #67). Rows are built so that every
 * number the boards show is a real count of these rows (industries 105 / 83 / 63 / 35, regions 188 / 41 / 33 / 24,
 * met 142 / 61 / 52 / 31, 再会すべき人 12, 止まっている関係 18 averaging 46 days, …); names come from the boards.
 * Only data, never layout (HOW-TO §8). The same people can feed the R11a list fixture (R11-16): `designNetworkPeople`.
 */
import type { NetworkAnalysisNeed, NetworkAnalysisRow } from "../analysis-model";
import { NETWORK_FIXTURE_NOW, type NetworkDesignVariant, type NetworkFixtureWorld } from "../analysis-fixtures";

const DAY = 86_400_000;
const ago = (days: number) => new Date(NETWORK_FIXTURE_NOW.getTime() - days * DAY).toISOString();

/** Board people (b5 #37, #39–#41): name, company, role, in the order the lists show them. */
const BOARD_PEOPLE: readonly [string, string, string][] = [
  ["高橋 美咲", "青葉ベンチャーズ", "パートナー"],
  ["山本 彩", "東都キャピタル", "シニアアソシエイト"],
  ["伊藤 直子", "株式会社ハルモニア", "CFO"],
  ["森 隆之", "みらい創業キャピタル", "代表パートナー"],
  ["石井 恵", "日東銀行 成長企業支援部", "調査役"],
  ["藤田 亮介", "セントラル重工 CVC", "投資担当"],
  ["小林 誠", "丸の内イノベーションラボ", "主宰"],
  ["渡辺 翔", "Nexa Robotics", "代表取締役"],
  ["鈴木 大輔", "北辰製作所", "製造部長"],
  ["中村 健", "中央物産", "部長"],
  ["高田 由紀", "東邦商事", "課長"],
];

function rangeOf<T extends string>(index: number, ranges: readonly [number, T][]): T {
  for (const [end, value] of ranges) if (index < end) return value;
  return ranges.at(-1)![1];
}

function many286(): NetworkAnalysisRow[] {
  const rows: NetworkAnalysisRow[] = [];
  for (let i = 0; i < 286; i += 1) {
    const industry = rangeOf(i, [[105, "finance_investment"], [188, "retail_consumer"], [251, "education_research"], [286, "trade_logistics"]] as const);
    const p = (i * 97) % 286;
    const q = (i * 151) % 286;
    const seniority = rangeOf(p, [[74, "c_level"], [170, "manager"], [286, "individual_contributor"]] as const);
    const city = rangeOf(q, [[188, "Tokyo"], [229, "Osaka"], [262, "Nagoya"], [274, "Fukuoka"], [286, "Sapporo"]] as const);
    const met = i < 105
      ? rangeOf(i, [[71, "event"], [90, "referral"], [100, "visit"], [105, "other"]] as const)
      : rangeOf(i - 105, [[71, "event"], [113, "referral"], [155, "visit"], [181, "other"]] as const);
    // 関係構築: 7 of the 71 finance event people, 4 of the 19 finance referrals, finance visit / other, and 30 others.
    const nurture = [0, 2, 4, 7, 8, 10, 12].includes(i) || (i >= 71 && i < 75) || (i >= 90 && i < 105) || (i >= 120 && i < 150);
    // 止まっている関係: 18 of the nurture people untouched for 30–62 days (average 46).
    const stalledIndex = i >= 120 && i < 138 ? i - 120 : -1;
    // 再会すべき人: 12 plan-related people untouched for 90+ days; 30 plan-related in all.
    const goalRelated = i < 31;
    const reconnect = [1, 3, 5, 6, 9, 11, 13, 15, 17, 19, 21, 23].includes(i);
    const lastTouch = reconnect ? 95 + (i % 40) : stalledIndex >= 0 ? 30 + ((stalledIndex * 7) % 33) : 1 + (i % 25);
    // Joiners: 9 manufacturing people this month (伸び), the rest spread over the past months.
    const added = i >= 105 && i < 114 ? 2 + (i % 5) : 40 + ((i * 13) % 300);
    // Board names: the finance list (#37 / #40) and the stalled card's 鈴木 / 中村 / 高田 (#35 / #41).
    const named = i <= 6 ? BOARD_PEOPLE[i] : i === 31 ? ["松井 遥", "株式会社ソラノテ", "取締役 COO"] as const
      : i === 120 ? BOARD_PEOPLE[8] : i === 125 ? BOARD_PEOPLE[9] : i === 130 ? BOARD_PEOPLE[10]
      : i === 150 ? ["森 恭平", "東雲キャピタル", "プリンシパル"] as const
      : i === 151 ? ["岡田 紗希", "Sakura Growth Partners", "ヴァイスプレジデント"] as const
      : i === 152 ? ["青木 里奈", "Kanade AI", "CTO"] as const
      : i === 190 ? ["大野 真司", "大野商店", "店主"] as const
      : i === 220 ? ["前田 隼人", "", ""] as const
      : i === 260 ? ["石川 陽介", "石川デザイン事務所", "代表"] as const : undefined;
    const [name, organization, role] = named ?? [`名前 ${i + 1}`, `会社 ${(i % 40) + 1}`, "担当"];
    // R11a and R11b share the same joined-at fact. The R11a board has 24 October joiners;
    // the 12 added outside retail keep retail's nine joiners the largest R11b growth group.
    const boardMonthJoiner = [2, 50, 51, 52, 53, 190, 200, 201, 202, 203, 260, 270, 271, 272, 273].includes(i);
    rows.push({
      id: `design-person-${String(i + 1).padStart(3, "0")}`, name, organization, role,
      status: nurture ? "nurture" : "active", primaryIndustryId: industry, city, metKind: met, seniorityLevel: seniority,
      addedAt: ago(boardMonthJoiner ? 6 - (i % 5) : added), lastInteractionAt: ago(boardMonthJoiner ? Math.min(lastTouch, 1 + (i % 3)) : lastTouch), goalRelated, needsFollowUp: i === 0 || i === 1 || (i >= 40 && i < 52),
      nextActionPreview: i === 0 ? "💼 シリーズAのリード投資家候補。SaaS領域に年8社出資" : i === 1 ? "💼 前回の面談で資料の再送を依頼されたまま" : i === 2 ? "📊 資本政策の相談相手。VC 4社と面識あり" : i === 3 ? "💼 シード〜シリーズA の製造業テックに出資" : i === 4 ? "🏦 ベンチャーデットの相談窓口" : i === 5 ? "🏭 事業会社の投資担当。製造業 SaaS に関心" : "",
    });
  }
  return rows;
}

function few14(): NetworkAnalysisRow[] {
  return Array.from({ length: 14 }, (_, i) => {
    const [name, organization, role] = BOARD_PEOPLE[i] ?? [`名前 ${i + 1}`, `会社 ${i + 1}`, "担当"];
    return {
      id: `design-person-${String(i + 1).padStart(3, "0")}`, name, organization, role,
      status: i === 0 || i === 2 ? "nurture" : "active",
      primaryIndustryId: rangeOf(i, [[5, "finance_investment"], [9, "retail_consumer"], [12, "education_research"], [14, "trade_logistics"]] as const),
      seniorityLevel: rangeOf((i * 5) % 14, [[4, "c_level"], [10, "manager"], [14, "individual_contributor"]] as const),
      city: i === 13 ? null : rangeOf((i * 3) % 13, [[9, "Tokyo"], [11, "Osaka"], [13, "Nagoya"]] as const),
      metKind: rangeOf((i * 9) % 14, [[7, "event"], [10, "referral"], [13, "visit"], [14, "other"]] as const),
      addedAt: ago(10 + i * 3), lastInteractionAt: ago(2 + i), goalRelated: i < 3, needsFollowUp: i === 1,
      nextActionPreview: i === 0 ? "💼 シリーズAのリード投資家候補。SaaS領域に年8社出資" : i === 1 ? "💼 前回の面談で資料の再送を依頼されたまま" : i === 2 ? "📊 資本政策の相談相手。VC 4社と面識あり" : "",
    } satisfies NetworkAnalysisRow;
  });
}


/** The people of a design variant. */
export function designNetworkPeople(variant: NetworkDesignVariant): NetworkAnalysisRow[] {
  switch (variant) {
    case "empty": return [];
    // The locked board is the R11a five-person list: 伊藤・高橋・鈴木・大野・石川.
    // R11b only renders the 5/10 lock at this size, so these same people can be
    // projected by R11a without a second contact-only person table.
    case "locked5": return [2, 0, 120, 190, 260].map((index) => many286()[index]!);
    case "few14": return few14();
    case "many286": return many286();
    default: return [];
  }
}

const CVC_NEED = (linkedCount: number): NetworkAnalysisNeed => ({ planId: "design-plan", needId: "design-need-cvc", title: "CVC・事業会社の投資担当", primaryIndustryId: "finance_investment", targetCount: 4, linkedCount, skipped: false });
const GROWTH_NEED: NetworkAnalysisNeed = { planId: "design-plan", needId: "design-need-mfg", title: "小売の新規顧客開拓", primaryIndustryId: "retail_consumer", targetCount: 3, linkedCount: 3, skipped: false };

export function designNetworkNeeds(variant: NetworkDesignVariant): NetworkAnalysisNeed[] {
  switch (variant) {
    case "empty": case "locked5": return [];
    case "few14": return [CVC_NEED(0)];
    case "many286": return [CVC_NEED(1), GROWTH_NEED];
    default: return [];
  }
}


export function designNetworkWorld(variant: NetworkDesignVariant): NetworkFixtureWorld {
  return { variant, rows: designNetworkPeople(variant), needs: designNetworkNeeds(variant) };
}
