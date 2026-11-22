/**
 * buildQuery (设计稿 §3.4 出站把关 rules 1, 2 and 4; agent-design AG09-2): code, never the model, writes the search
 * query. It joins two things only — the words of this turn's message that name what to look up (the first layer's
 * `webTarget.quote`, checked to be a substring of the message) and qualifier words from the fixed vocabulary — and
 * records where every word came from. An @ reference inside the quote is replaced by the contact's name from the
 * record (origin `contact_record`): such a query is shown to the user in full before it may be sent.
 *
 * A model-written query is never taken (there is no input for one). Record bodies, notes, memories, contact
 * details, search snippets and fetched pages are never a source of a query word.
 */
import { isQualifierCode, qualifierWords, type QualifierCode, type WebLanguage } from "./vocabulary";

export type TokenOrigin = "message" | "vocabulary" | "selection" | "contact_record";

export interface QueryToken {
  text: string;
  origin: TokenOrigin;
}

export interface QueryCandidate {
  builtBy: "code";
  partId: string;
  text: string;
  tokens: QueryToken[];
  /** A word came from a contact record: the full query is shown to the user and sent only after a click (rule 4). */
  needsConfirmation: boolean;
}

export interface WebTarget {
  quote: string;
  qualifiers: QualifierCode[];
}

/** Longest query code builds (§3.4 rule 2 suggests 100 characters; the provider takes 1–128). */
export const MAX_QUERY_LENGTH = 100;

/** Honorifics typed after a name: not part of what is looked up ("是枝真紀さん" → "是枝真紀"). */
/** Qualifier words a query carries at most (AG09 run-02 repair 2). */
export const MAX_QUALIFIERS = 2;

const HONORIFIC =/(さん|様|さま|氏|先生|老师|女士|先生们)$/u;

/**
 * Words that point at the user's own records or at something only the context names: a target made of them names
 * no public object, so nothing is built (§3.4: "如需要私有笔记…才能定位，改请用户给出可公开使用的名称或网址").
 */
const PRIVATE_POINTER = /(笔记|备忘|记录|联系人|待办|代办|日程|那家|这家|那个|这个|那位|这位|该公司|他|她|它|我的|メモ|ノート|記録|連絡先|予定|あの|その|この|彼|\bnotes?\b|\bmemos?\b|\brecords?\b|\bcontacts?\b|\bmy\b|\bthat (?:company|one|person)\b|\bthis (?:company|one|person)\b|\bthey\b|\bhe\b|\bshe\b)/iu;

export function namesPrivatePointer(quote: string): boolean {
  return PRIVATE_POINTER.test(quote);
}

export type BuiltQuery = { ok: true; candidate: QueryCandidate } | { ok: false; reason: "no_target" | "not_in_message" | "private_pointer" | "too_long" };

export function buildQuery(input: {
  partId: string;
  message: string;
  target: WebTarget | null | undefined;
  language: WebLanguage;
  /** This turn's @ references whose words appear in the message ("@小林") and the name their record gives. */
  references?: readonly { quote: string; name: string }[];
}): BuiltQuery {
  const target = input.target;
  const quote = target?.quote.trim() ?? "";
  if (!target || !quote) return { ok: false, reason: "no_target" };
  if (!input.message.includes(quote)) return { ok: false, reason: "not_in_message" };
  const tokens: QueryToken[] = [];
  let rest = quote;
  for (const reference of input.references ?? []) {
    if (!reference.quote || !reference.name || !rest.includes(reference.quote)) continue;
    const [before, ...after] = rest.split(reference.quote);
    pushWords(tokens, before);
    tokens.push({ origin: "contact_record", text: reference.name });
    rest = after.join(reference.quote);
  }
  pushWords(tokens, rest);
  const own = tokens.filter((token) => token.origin === "message").map((token) => token.text).join(" ");
  if (own && namesPrivatePointer(own)) return { ok: false, reason: "private_pointer" };
  if (!tokens.length) return { ok: false, reason: "no_target" };
  // AG09 run-02 repair 2 (AE-SCL-015; 设计稿 §3.4 "只发几个词"): at most two qualifier words, the first two given.
  for (const code of [...new Set(target.qualifiers.filter(isQualifierCode))].slice(0, MAX_QUALIFIERS)) {
    const words = qualifierWords(code, input.language);
    if (!tokens.some((token) => token.text === words)) tokens.push({ origin: "vocabulary", text: words });
  }
  const text = tokens.map((token) => token.text).join(" ");
  if (text.length > MAX_QUERY_LENGTH) return { ok: false, reason: "too_long" };
  return { candidate: { builtBy: "code", needsConfirmation: tokens.some((token) => token.origin === "contact_record"), partId: input.partId, text, tokens }, ok: true };
}

/** The message's own words as one token (a name like "Acme Cloud" stays whole), honorific and @ removed. */
function pushWords(tokens: QueryToken[], words: string): void {
  const text = words.replace(/^@/u, "").trim().replace(HONORIFIC, "").trim();
  if (text) tokens.push({ origin: "message", text });
}
