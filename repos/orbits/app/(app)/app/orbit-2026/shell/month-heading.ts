import type { OrbitLanguage } from "../../../../../shared/contract/language";

const LOCALE: Record<OrbitLanguage, string> = { ja: "ja-JP", zh: "zh-CN", en: "en-US" };

// The main header's date line (web.html D.today: 「10月」 over 「10月1日–10月31日」):
// the current month, and its first to last day, in the platform's own date words.
// Pure, so it is tested on its own.
export function monthHeading(language: OrbitLanguage, now: Date = new Date()): { month: string; range: string } {
  const locale = LOCALE[language] ?? LOCALE.ja;
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const en = language === "en";
  const day = (date: Date) => date.toLocaleDateString(locale, { month: en ? "short" : "long", day: "numeric" });
  return { month: now.toLocaleDateString(locale, { month: en ? "long" : "numeric" }), range: `${day(first)}${en ? " – " : "–"}${day(last)}` };
}
