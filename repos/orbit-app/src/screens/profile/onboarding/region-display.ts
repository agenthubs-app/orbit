import type { OrbitLanguage } from "../../../api/contract/language";
import { messageKeys, type MessageKey, type OrbitTranslator } from "../../../i18n/messages";
import { cityName, regionName } from "../../network-analysis/analysis-labels";

const KNOWN: ReadonlySet<string> = new Set(messageKeys);

/** 「日本 · 東京」: country · city in the interface language; only the part that can be named (a bare code says nothing). */
export function regionDisplay(region: { countryCode: string; city: string }, t: OrbitTranslator, language: OrbitLanguage): string {
  const key = `onboarding.v3.country.${region.countryCode}` as MessageKey;
  const device = regionName(region.countryCode, t, language);
  const country = KNOWN.has(key) ? t(key) : device === region.countryCode ? "" : device;
  const city = region.city ? cityName(region.city, t) : "";
  // A city state (Singapore) is not said twice.
  return [country, city === country ? "" : city].filter(Boolean).join(" · ");
}
