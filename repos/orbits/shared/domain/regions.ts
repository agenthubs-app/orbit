/**
 * W0045（W45-4）：规范地区 = ISO 3166-1 两位国家码 + 规范英文城市名；不做省／州一级。
 * 国家显示名用 Intl.DisplayNames 按语言生成，不手抄表；这里只放城市别名，供识别清洗、
 * 回填（地址直接命中 → `card`）与 W0049 分布统计复用。只用标准 JS／Intl，不引入 Node 专属 API。
 */
import type { OrbitLanguage } from "../contract/language";
import type { ContactRegionDTO } from "./contracts";

export const REGION_CITY_MAX_LENGTH = 64;

export interface RegionCityAlias {
  /** 规范英文城市名，存进 `region.city`。 */
  city: string;
  countryCode: string;
  labels: Record<OrbitLanguage, string>;
  /** 小写比较；非 ASCII 别名按子串命中，ASCII 别名按整词命中。 */
  aliases: readonly string[];
}

// 顺序有意义：地址文字里「東京都」含「京都」，所以东京排在京都前面，且按最长别名优先匹配。
export const REGION_CITY_ALIASES: readonly RegionCityAlias[] = [
  { city: "Tokyo", countryCode: "JP", labels: { zh: "东京", en: "Tokyo", ja: "東京" }, aliases: ["tokyo", "東京都", "東京", "东京都", "东京"] },
  { city: "Osaka", countryCode: "JP", labels: { zh: "大阪", en: "Osaka", ja: "大阪" }, aliases: ["osaka", "大阪府", "大阪市", "大阪"] },
  { city: "Kyoto", countryCode: "JP", labels: { zh: "京都", en: "Kyoto", ja: "京都" }, aliases: ["kyoto", "京都府", "京都市", "京都"] },
  { city: "Kobe", countryCode: "JP", labels: { zh: "神户", en: "Kobe", ja: "神戸" }, aliases: ["kobe", "神戸市", "神戸", "神户"] },
  { city: "Yokohama", countryCode: "JP", labels: { zh: "横滨", en: "Yokohama", ja: "横浜" }, aliases: ["yokohama", "横浜市", "横浜", "横滨"] },
  { city: "Nagoya", countryCode: "JP", labels: { zh: "名古屋", en: "Nagoya", ja: "名古屋" }, aliases: ["nagoya", "名古屋市", "名古屋"] },
  { city: "Fukuoka", countryCode: "JP", labels: { zh: "福冈", en: "Fukuoka", ja: "福岡" }, aliases: ["fukuoka", "福岡市", "福岡", "福冈"] },
  { city: "Sapporo", countryCode: "JP", labels: { zh: "札幌", en: "Sapporo", ja: "札幌" }, aliases: ["sapporo", "札幌市", "札幌"] },
  { city: "Shanghai", countryCode: "CN", labels: { zh: "上海", en: "Shanghai", ja: "上海" }, aliases: ["shanghai", "上海市", "上海"] },
  { city: "Beijing", countryCode: "CN", labels: { zh: "北京", en: "Beijing", ja: "北京" }, aliases: ["beijing", "peking", "北京市", "北京"] },
  { city: "Shenzhen", countryCode: "CN", labels: { zh: "深圳", en: "Shenzhen", ja: "深セン" }, aliases: ["shenzhen", "深圳市", "深圳", "深セン"] },
  { city: "Singapore", countryCode: "SG", labels: { zh: "新加坡", en: "Singapore", ja: "シンガポール" }, aliases: ["singapore", "新加坡", "シンガポール"] },
];

// Intl 认识、但不是国家／地区的保留码。
const NON_COUNTRY_CODES = new Set(["ZZ", "EU", "EZ", "UN", "QO", "XA", "XB"]);

let englishRegionNames: Intl.DisplayNames | null | undefined;

function englishNames(): Intl.DisplayNames | null {
  if (englishRegionNames === undefined) {
    try {
      englishRegionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      englishRegionNames = null;
    }
  }
  return englishRegionNames;
}

/** 两位大写字母，且 Intl 能给出不同于代码本身的名称（排除 ZZ／EU 等保留码）。 */
export function isValidCountryCode(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value) || NON_COUNTRY_CODES.has(value)) return false;
  const names = englishNames();
  if (!names) return false;
  try {
    const name = names.of(value);
    return typeof name === "string" && name !== value;
  } catch {
    return false;
  }
}

function aliasForCityName(value: string): RegionCityAlias | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return REGION_CITY_ALIASES.find((entry) => entry.city.toLowerCase() === key || entry.aliases.includes(key)) ?? null;
}

/**
 * 把模型或用户给出的一对值清洗成规范地区：国家码不合法 → 整对丢弃为 null；
 * 城市按别名表归一，不认识时保留去空白后的原值（≤64 字，超长丢弃城市）。不改大小写外的任何内容。
 */
export function normalizeRegion(countryCode: unknown, city: unknown): ContactRegionDTO | null {
  const code = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : countryCode;
  if (!isValidCountryCode(code)) return null;
  if (typeof city !== "string" || !city.trim()) return { countryCode: code, city: null };
  const alias = aliasForCityName(city);
  if (alias) return { countryCode: code, city: alias.city };
  const trimmed = city.trim().replace(/\s+/g, " ");
  return { countryCode: code, city: trimmed.length <= REGION_CITY_MAX_LENGTH ? trimmed : null };
}

/** 读取已存的 region（payload 里的任意值）：结构与国家码都合法才返回。 */
export function readStoredRegion(value: unknown): ContactRegionDTO | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isValidCountryCode(record.countryCode)) return null;
  const city = typeof record.city === "string" && record.city.trim() && record.city.length <= REGION_CITY_MAX_LENGTH ? record.city : null;
  return { countryCode: record.countryCode, city };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 原始地址／location 文字经别名表直接命中（不经模型）：返回规范地区，否则 null。
 * 用于回填把命中的地区记为 `card`；多个城市同时出现时取别名最长的那个（「東京都」胜过「京都」）。
 */
export function regionFromLocationText(text: unknown): ContactRegionDTO | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const haystack = text.toLowerCase();
  let best: { alias: RegionCityAlias; length: number } | null = null;
  for (const entry of REGION_CITY_ALIASES) {
    for (const alias of entry.aliases) {
      const hit = /^[\x00-\x7f]+$/.test(alias)
        ? new RegExp(`(^|[^a-z])${escapeRegExp(alias)}($|[^a-z])`).test(haystack)
        : haystack.includes(alias);
      if (hit && (!best || alias.length > best.length)) best = { alias: entry, length: alias.length };
    }
  }
  return best ? { countryCode: best.alias.countryCode, city: best.alias.city } : null;
}

function displayNamesFor(language: OrbitLanguage): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([language === "zh" ? "zh-Hans" : language], { type: "region" });
  } catch {
    return null;
  }
}

export function countryDisplayName(countryCode: string, language: OrbitLanguage): string {
  try {
    return displayNamesFor(language)?.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

export function cityDisplayName(city: string, language: OrbitLanguage): string {
  return aliasForCityName(city)?.labels[language] ?? city;
}

/** 「日本 · 东京」／「Japan · Tokyo」；没有城市时只有国家。 */
export function regionDisplayName(region: ContactRegionDTO, language: OrbitLanguage): string {
  const country = countryDisplayName(region.countryCode, language);
  const city = region.city ? cityDisplayName(region.city, language) : "";
  // 城市国家（新加坡）不重复显示。
  return city && city !== country ? `${country} · ${city}` : country;
}

/** 审阅页／编辑控件的国家选项：别名表涉及的国家在前，其余按 Intl 能识别的常用码。 */
export const REGION_COMMON_COUNTRY_CODES: readonly string[] = [
  "JP", "CN", "SG", "HK", "TW", "KR", "US", "GB", "DE", "FR", "AU", "CA", "IN", "TH", "VN", "MY", "ID", "PH", "AE", "CH", "NL",
];
