// 「关于我」(bio) 的长度规则，服务端校验、AI 起草提示词、网页与 App 的计数器共用这一份。
// 由 npm run sync:contract 原样复制到 App 的 src/api/schema/，所以不 import 任何东西。
//
// 规则（2026-09-27 用户决定）：文本里只要出现中日韩文字（汉字、假名、谚文），上限 80；
// 否则上限 200。长度按可见字符（字素簇）计，emoji 组合、带变音符的字母都算 1 个。

export const PROFILE_BIO_CJK_LIMIT = 80;
export const PROFILE_BIO_NON_CJK_LIMIT = 200;

const CJK_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function profileVisibleLength(text: string): number {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<unknown> };
  }).Segmenter;
  return Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length
    : Array.from(text).length;
}

export function profileBioContainsCjk(text: string): boolean {
  return CJK_SCRIPT.test(text);
}

export function profileBioLimit(text: string): number {
  return profileBioContainsCjk(text) ? PROFILE_BIO_CJK_LIMIT : PROFILE_BIO_NON_CJK_LIMIT;
}

export function profileBioWithinLimit(text: string): boolean {
  return profileVisibleLength(text) <= profileBioLimit(text);
}
