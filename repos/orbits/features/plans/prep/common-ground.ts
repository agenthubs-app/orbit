/**
 * 准备卡「共同点」（字段表：系统规则，不让 AI 猜）：你的资料（来自、语言、行业）对比对方的名片与事实。
 * 算不出就返回 null（界面不显示、不提示）。
 */
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { PlanPrepContactCard, PlanPrepFact, PlanPrepProfile } from "./types";

/** 「来自」的市场 → 事实 / 名片里能认出的地名（小写比较）。键接受代码或名字。 */
const MARKET_PLACES: ReadonlyArray<{ keys: readonly string[]; label: Record<PlanCopyLanguage, string>; places: readonly string[] }> = [
  { keys: ["cn", "china", "中国", "中國"], label: { en: "China", ja: "中国", zh: "中国" }, places: ["中国", "中國", "上海", "北京", "深圳", "广州", "廣州", "杭州", "成都", "china", "shanghai", "beijing", "shenzhen", "guangzhou"] },
  { keys: ["tw", "taiwan", "台湾", "台灣"], label: { en: "Taiwan", ja: "台湾", zh: "台湾" }, places: ["台湾", "台灣", "台北", "taiwan", "taipei"] },
  { keys: ["hk", "hong kong", "香港"], label: { en: "Hong Kong", ja: "香港", zh: "香港" }, places: ["香港", "hong kong"] },
  { keys: ["kr", "korea", "韓国", "韩国"], label: { en: "Korea", ja: "韓国", zh: "韩国" }, places: ["韓国", "韩国", "ソウル", "首尔", "korea", "seoul"] },
  { keys: ["vn", "vietnam", "ベトナム", "越南"], label: { en: "Vietnam", ja: "ベトナム", zh: "越南" }, places: ["ベトナム", "越南", "ハノイ", "ホーチミン", "vietnam", "hanoi", "ho chi minh"] },
  { keys: ["us", "usa", "united states", "アメリカ", "美国"], label: { en: "the US", ja: "アメリカ", zh: "美国" }, places: ["アメリカ", "美国", "シリコンバレー", "硅谷", "ニューヨーク", "纽约", "usa", "silicon valley", "new york", "san francisco"] },
  { keys: ["sg", "singapore", "シンガポール", "新加坡"], label: { en: "Singapore", ja: "シンガポール", zh: "新加坡" }, places: ["シンガポール", "新加坡", "singapore"] },
];

const COPY: Record<PlanCopyLanguage, { market: (place: string, fact: string) => string; language: (lang: string) => string; industry: (industry: string) => string }> = {
  en: { industry: (industry) => `You both work in ${industry}`, language: (lang) => `You both speak ${lang}`, market: (place, fact) => `You're from ${place}; ${fact}` },
  ja: { industry: (industry) => `どちらも${industry}の業界`, language: (lang) => `どちらも${lang}を話す`, market: (place, fact) => `あなたは${place}出身、相手は「${fact}」` },
  zh: { industry: (industry) => `都在${industry}行业`, language: (lang) => `都用${lang}`, market: (place, fact) => `你来自${place}，对方${fact}` },
};

function marketOf(homeMarket: string | null) {
  const value = homeMarket?.trim().toLowerCase();
  if (!value) return null;
  return MARKET_PLACES.find((market) => market.keys.some((key) => value === key || value.includes(key))) ?? null;
}

export interface CommonGround {
  text: string;
  /** 出处标签（「你的资料 + 你的备注」等），由调用方翻译。 */
  basis: "profile_fact" | "profile_card";
}

/**
 * 依次试：来自 × 对方事实 / 公司里的地名 → 共同语言（对方事实里写了语言）→ 同一行业。第一条成立的就是共同点。
 */
export function commonGround(input: { language: PlanCopyLanguage; profile: PlanPrepProfile; contact: PlanPrepContactCard; facts: readonly PlanPrepFact[] }): CommonGround | null {
  const copy = COPY[input.language];
  const market = marketOf(input.profile.homeMarket);
  if (market) {
    const fact = input.facts.find((item) => market.places.some((place) => item.text.toLowerCase().includes(place)));
    if (fact) return { basis: "profile_fact", text: copy.market(market.label[input.language], fact.text) };
    if (input.contact.organization && market.places.some((place) => input.contact.organization!.toLowerCase().includes(place))) {
      return { basis: "profile_card", text: copy.market(market.label[input.language], input.contact.organization) };
    }
  }
  for (const lang of input.profile.spokenLanguages) {
    const needle = lang.trim().toLowerCase();
    if (needle && input.facts.some((item) => item.text.toLowerCase().includes(needle))) return { basis: "profile_fact", text: copy.language(lang.trim()) };
  }
  if (input.profile.industry && input.contact.industry && input.profile.industry === input.contact.industry) {
    return { basis: "profile_card", text: copy.industry(input.profile.industry) };
  }
  return null;
}
