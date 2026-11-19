/**
 * outboundGate (设计稿 §3.4 出站把关, the seven rules; agent-design AG09-2/3/4/5). Search queries and fetch URLs are
 * the only things that leave Orbit for the search provider. Each rule is one named function here; the first gate is
 * all of code. A query that passes goes on to the second gate (the judgment model's `outbound.extra`, web/service.ts).
 *
 * A query that fails any rule is not sent and not rewritten (rule 6): the part is answered from what Orbit already
 * has and says it did not look it up, or asks the user for a public name or URL. Only the rule numbers of a blocked
 * query are kept, never its text.
 */
import { isVocabularyWord } from "./vocabulary";
import type { QueryCandidate } from "./query";

export type GateRule = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface RuleResult {
  rule: GateRule;
  ok: boolean;
  /** A short code of what failed (traced; never the query's words). */
  why?: string;
  /** Rule 4: not refused, but the user must see and click the query first. */
  confirm?: boolean;
}

export interface GateContext {
  /** This turn's message (the user's own words). */
  message: string;
  /** The part's own words in it. */
  partQuote: string;
  /** Bodies of the user's records read in this request (rule 3: no long overlap with them). */
  privateTexts: readonly string[];
  /** The query text the user clicked to send (rule 4); the click makes the query a clicked public clue. */
  confirmedText?: string | null;
  /** Parts whose query was blocked earlier in this request (rule 6). */
  blockedParts: ReadonlySet<string>;
  switches: { global: boolean; user: boolean };
  /** Calls left in this request's budget (rule 7). */
  budget: { search: number; fetch: number };
}

export interface FetchUrls {
  /** URLs the user wrote in this turn's message. */
  messageUrls: readonly string[];
  /** URLs this request's searches returned. */
  searchUrls: readonly string[];
}

const ok = (rule: GateRule): RuleResult => ({ ok: true, rule });
const no = (rule: GateRule, why: string, confirm = false): RuleResult => ({ ok: false, rule, why, ...(confirm ? { confirm } : {}) });

/** Rule 1: the query was built by code (buildQuery), and its text is exactly its traced tokens. */
export function rule1CodeBuilt(candidate: unknown): RuleResult {
  const value = candidate as Partial<QueryCandidate> | null;
  if (!value || typeof value !== "object" || value.builtBy !== "code" || !Array.isArray(value.tokens) || !value.tokens.length) return no(1, "not_built_by_code");
  if (value.tokens.map((token) => token.text).join(" ") !== value.text) return no(1, "text_is_not_its_tokens");
  return ok(1);
}

/** Rule 2: every word comes from this turn's message, the fixed vocabulary or a public clue the user clicked; ≤ 100 characters. */
export function rule2EveryWordTraced(candidate: QueryCandidate, context: GateContext): RuleResult {
  if (!candidate.text.trim() || candidate.text.length > 100) return no(2, "length");
  for (const token of candidate.tokens) {
    if (token.origin === "message" && context.message.includes(token.text)) continue;
    if (token.origin === "vocabulary" && isVocabularyWord(token.text)) continue;
    if (token.origin === "selection" && context.confirmedText === candidate.text) continue;
    // A name from a contact record is rule 4's: shown first, then sent only as clicked.
    if (token.origin === "contact_record") continue;
    return no(2, `untraced_${String(token.origin)}`);
  }
  return ok(2);
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
const PHONE = /(?:\+?\d{1,4}[\s-]?)?(?:\(\d{1,4}\)[\s-]?)?\d{2,4}[\s-]\d{2,4}[\s-]\d{3,4}/u;
const LONG_DIGITS = /\d{6,}/u;
const CARD_OR_ID = /(?:\d[ -]?){12,19}|\b[A-Z]{1,2}\d{6,9}\b/u;
const AMOUNT = /[¥￥$€£]\s?\d|\d[\d,.]*\s?(?:元|円|日元|美元|万|千|块)|\d[\d,.]*\s?(?:yen|jpy|usd|cny|rmb|dollars?)\b|\b(?:jpy|usd|cny|rmb)\s?\d/iu;
const ADDRESS = /\d+\s*(?:丁目|番地|番|号室?|栋|楼|室)|\d+-\d+-\d+|[\p{Script=Han}]{1,8}(?:路|街|道|巷)\s*\d+|\b\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln)\b/iu;
const URL_LIKE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|jp|cn|io|co|test|dev|app)\b/iu;
const LONG_CODE = /(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{12,}/u;

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** A piece of the query, at least 6 CJK or 12 other characters long, found in a private text but not in the message. */
export function privateOverlap(query: string, privateTexts: readonly string[], message: string): boolean {
  if (!privateTexts.length) return false;
  const chars = [...query];
  for (let start = 0; start < chars.length; start += 1) {
    for (let end = start + 1; end <= chars.length; end += 1) {
      const piece = chars.slice(start, end).join("");
      const cjk = [...piece].filter((char) => CJK.test(char)).length;
      const long = cjk >= 6 || (cjk === 0 && piece.length >= 12);
      if (!long) continue;
      if (message.includes(piece)) continue;
      if (privateTexts.some((text) => text.includes(piece))) return true;
    }
  }
  return false;
}

/** Rule 3: shapes that are always blocked — contact details, amounts, long numbers, ids, addresses, URLs, codes, private overlaps. */
export function rule3ForbiddenShapes(candidate: QueryCandidate, context: GateContext): RuleResult {
  const text = candidate.text.normalize("NFKC");
  const shapes: [RegExp, string][] = [[EMAIL, "email"], [URL_LIKE, "url"], [PHONE, "phone"], [CARD_OR_ID, "card_or_id"], [LONG_DIGITS, "digits"], [AMOUNT, "amount"], [ADDRESS, "address"], [LONG_CODE, "code"]];
  for (const [shape, why] of shapes) if (shape.test(text)) return no(3, why);
  if (privateOverlap(candidate.text, context.privateTexts, context.message)) return no(3, "private_overlap");
  return ok(3);
}

/**
 * Rule 4: a name the user typed may be used, but not when the user's words for this part carry contact details with
 * it; a name taken from a contact record is shown in the full query and sent only when the user clicked exactly it.
 */
export function rule4PersonNames(candidate: QueryCandidate, context: GateContext): RuleResult {
  const own = context.partQuote.normalize("NFKC");
  if (EMAIL.test(own) || PHONE.test(own)) return no(4, "name_with_contact_details");
  if (candidate.tokens.some((token) => token.origin === "contact_record") && context.confirmedText !== candidate.text) return no(4, "record_name_not_confirmed", true);
  return ok(4);
}

const PRIVATE_HOST = /^(?:localhost|.*\.(?:local|localhost|internal|intranet|lan|corp|home|private))$/iu;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
export const MAX_URL_LENGTH = 250;

/** Rule 5: a fetch URL is one the user gave this turn or this request's search returned, used verbatim; public http(s) only. */
export function rule5FetchUrl(url: string, urls: FetchUrls): RuleResult {
  if (url.length > MAX_URL_LENGTH) return no(5, "too_long");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return no(5, "not_a_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return no(5, "scheme");
  if (parsed.username || parsed.password) return no(5, "credentials");
  const host = parsed.hostname.replace(/^\[|\]$/gu, "");
  if (IPV4.test(host) || host.includes(":")) return no(5, "ip_address");
  if (!host.includes(".") || PRIVATE_HOST.test(host)) return no(5, "internal_host");
  if (!urls.messageUrls.includes(url) && !urls.searchUrls.includes(url)) return no(5, "not_given_or_found");
  return ok(5);
}

/** Rule 6: once a part's query was blocked, nothing else is sent for that part in this request (no quiet rewrite). */
export function rule6NoRewrite(candidate: QueryCandidate, context: GateContext): RuleResult {
  return context.blockedParts.has(candidate.partId) ? no(6, "blocked_before") : ok(6);
}

/** Rule 7: the deployment's switch, the user's own switch and the request's budget, enforced by code. */
export function rule7Limits(kind: "search" | "fetch", context: GateContext): RuleResult {
  if (!context.switches.global) return no(7, "web_off_global");
  if (!context.switches.user) return no(7, "web_off_user");
  if (context.budget[kind] <= 0) return no(7, "budget");
  return ok(7);
}

export type SearchVerdict = "send" | "confirm" | "block" | "off" | "budget";

/** The first gate for a search query: switches and budget first, then rules 1–6; any failure blocks the whole query. */
export function outboundGate(candidate: QueryCandidate, context: GateContext): { verdict: SearchVerdict; rules: GateRule[]; why: string[] } {
  const limits = rule7Limits("search", context);
  if (!limits.ok) return { rules: [7], verdict: limits.why === "budget" ? "budget" : "off", why: [limits.why ?? ""] };
  const first = rule1CodeBuilt(candidate);
  if (!first.ok) return { rules: [1], verdict: "block", why: [first.why ?? ""] };
  const results = [rule6NoRewrite(candidate, context), rule2EveryWordTraced(candidate, context), rule3ForbiddenShapes(candidate, context), rule4PersonNames(candidate, context)];
  const failed = results.filter((result) => !result.ok);
  if (!failed.length) return { rules: [], verdict: "send", why: [] };
  if (failed.every((result) => result.confirm)) return { rules: failed.map((result) => result.rule), verdict: "confirm", why: failed.map((result) => result.why ?? "") };
  return { rules: failed.filter((result) => !result.confirm).map((result) => result.rule), verdict: "block", why: failed.map((result) => result.why ?? "") };
}

/** The gate for a fetch: switches and budget, then rule 5. */
export function fetchGate(url: string, context: GateContext & FetchUrls): { verdict: "send" | "block" | "off" | "budget"; rules: GateRule[]; why: string[] } {
  const limits = rule7Limits("fetch", context);
  if (!limits.ok) return { rules: [7], verdict: limits.why === "budget" ? "budget" : "off", why: [limits.why ?? ""] };
  const result = rule5FetchUrl(url, context);
  return result.ok ? { rules: [], verdict: "send", why: [] } : { rules: [5], verdict: "block", why: [result.why ?? ""] };
}

/** The URLs the user wrote in a text, as written (trailing punctuation off). */
export function urlsIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'「」『』（）()，。、；！？]+/giu) ?? [];
  return [...new Set(found.map((url) => url.replace(/[.,;:!?。，、]+$/u, "")))];
}
