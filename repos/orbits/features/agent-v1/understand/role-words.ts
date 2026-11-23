/**
 * Words for a profession or role ("摄影师", "カメラマン", "photographers"). In a pick among the user's contacts ("帮我挑两位最值得
 * 联系的摄影师") such words name the set to pick from — a ranking over contacts — never one person to look up, and never the
 * standard the pick goes by (integration after AG21a/AG21b, coordinator 2026-11-21).
 */

/** One role per row, in the forms a contact's role, tags or notes may carry it (zh, ja, en). */
const ROLES: readonly (readonly string[])[] = [
  ["摄影师", "摄影家", "カメラマン", "写真家", "フォトグラファー", "photographer"],
  ["设计师", "デザイナー", "designer"],
  ["插画师", "イラストレーター", "illustrator"],
  ["工程师", "エンジニア", "engineer"],
  ["开发者", "程序员", "開発者", "プログラマー", "developer", "programmer"],
  ["律师", "弁護士", "lawyer", "attorney"],
  ["会计师", "会计", "会計士", "accountant"],
  ["记者", "記者", "journalist", "reporter"],
  ["编辑", "編集者", "editor"],
  ["作家", "作者", "ライター", "writer", "author"],
  ["翻译", "翻訳者", "translator"],
  ["顾问", "コンサルタント", "consultant", "advisor"],
  ["猎头", "ヘッドハンター", "recruiter", "headhunter"],
  ["销售", "営業", "salesperson"],
  ["采购", "バイヤー", "buyer"],
  ["策展人", "キュレーター", "curator"],
  ["投资人", "投資家", "investor"],
  ["创始人", "創業者", "founder"],
  ["产品经理", "プロダクトマネージャー", "product manager"],
  ["研究员", "研究者", "researcher"],
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const formOf = (form: string) => (/^[a-z ]+$/u.test(form) ? `\\b${escape(form)}s?\\b` : escape(form));

/** The role rows the words name (each row's forms), longest form first. */
export function rolesIn(text: string): string[][] {
  const out: string[][] = [];
  for (const row of ROLES) if (row.some((form) => new RegExp(formOf(form), "iu").test(text))) out.push([...row]);
  return out;
}

/** The role words as written in the text (to take them out of a topic). */
export function roleWordsIn(text: string): string[] {
  const found: string[] = [];
  for (const row of ROLES) for (const form of row) {
    const match = new RegExp(formOf(form), "iu").exec(text);
    if (match) found.push(match[0]);
  }
  return found.sort((left, right) => right.length - left.length);
}

/** Whether a record's own words (role, tags, notes) hold one of the forms of these roles. */
export function holdsRole(fields: readonly (string | null | undefined)[], roles: readonly (readonly string[])[]): boolean {
  const text = fields.filter(Boolean).join(" ");
  return roles.some((row) => row.some((form) => new RegExp(formOf(form), "iu").test(text)));
}

/**
 * A contact clue that only describes people by their role: "摄影师", "两位最值得联系的摄影师", "摄影师们", "カメラマン2人",
 * "the two photographers" — what is left once descriptions before 的/の, counts and plural marks are taken off is a role.
 */
export function roleGroupClue(text: string): boolean {
  let words = text.trim().replace(/[。.?？!！、，,]+$/u, "");
  const lastOf = Math.max(words.lastIndexOf("的"), words.lastIndexOf("の"));
  if (lastOf >= 0) words = words.slice(lastOf + 1);
  words = words
    .replace(/^(?:这|那)?(?:[两二三四五六七八九十几\d]+|一些|几)?(?:位|个|名|人)?/u, "")
    .replace(/(?:们|たち|達|[\d一二三四五六七八九十]+人)$/u, "")
    .replace(/^(?:(?:the|my|some|a few|two|three|four|five|\d+)\s+)+/iu, "")
    .replace(/^(?:most|best)\s+[\w\s-]*?\s(?=\w+$)/iu, "")
    .trim();
  if (!words) return false;
  return ROLES.some((row) => row.some((form) => new RegExp(`^${formOf(form)}$`, "iu").test(words)));
}
