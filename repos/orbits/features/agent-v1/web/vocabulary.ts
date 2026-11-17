/**
 * The fixed qualifier vocabulary of a search query (设计稿 §3.4 出站把关 rule 1; agent-design AG09-2).
 *
 * The first layer picks qualifier codes only (附录 C `webTarget.qualifiers`); code turns each code into its
 * words in the language of the message. Any other word the model writes is dropped. These words are the only
 * words of a query that do not come from the user's own message or a public clue the user clicked.
 */
export type WebLanguage = "zh" | "ja" | "en";

export const QUALIFIERS = {
  official: { en: "official site", ja: "公式サイト", zh: "官网" },
  price: { en: "pricing", ja: "料金", zh: "价格" },
  // AG09: zh "最新" rather than "现任" (incumbent), which read as a person's word next to a price ("Acme Cloud 官网 价格 现任").
  current: { en: "current", ja: "現在", zh: "最新" },
  role: { en: "role", ja: "役職", zh: "职务" },
  works: { en: "works", ja: "代表作", zh: "代表作" },
  profile: { en: "profile", ja: "プロフィール", zh: "简介" },
  company: { en: "company", ja: "会社", zh: "公司" },
  product: { en: "product", ja: "製品", zh: "产品" },
  news: { en: "news", ja: "ニュース", zh: "新闻" },
} as const satisfies Record<string, Record<WebLanguage, string>>;

export type QualifierCode = keyof typeof QUALIFIERS;
export const QUALIFIER_CODES = Object.keys(QUALIFIERS) as QualifierCode[];

export function isQualifierCode(value: unknown): value is QualifierCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(QUALIFIERS, value);
}

export function qualifierWords(code: QualifierCode, language: WebLanguage): string {
  return QUALIFIERS[code][language];
}

/** Every word of the vocabulary, in every language (the eval's outbound_traceable check reads it too). */
export const VOCABULARY_WORDS: ReadonlySet<string> = new Set(QUALIFIER_CODES.flatMap((code) => Object.values(QUALIFIERS[code]) as string[]));

export function isVocabularyWord(word: string): boolean {
  return VOCABULARY_WORDS.has(word);
}
