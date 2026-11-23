/**
 * agent-design AG12-5 (设计稿附录 B「三处边界」, §5.1; PLANNER 易错边界 8): contact methods — e-mail, phone, WeChat,
 * address — are separately granted fields. With no grant (the first version has no setting for one) none of them goes
 * into any model input.
 *
 * Two layers, one rule:
 * - Records: `withoutContactMethods()` drops the fields from anything code hands to a model (read results, duplicate
 *   candidates, card previews). The read adapters never select them (domains/contact/read.ts).
 * - The exit: `scrubModelInput()` runs on every request to the main model (models/main.ts) and to the judgment model
 *   (judgment/ask.ts). Any e-mail address or phone number in the text that the user did not type in this request's
 *   message is replaced by a placeholder — so a contact method that slipped through some other path still stops here.
 *   The user's own words are not limited (`allowContactMethodsFrom()` at the start of the request). Cards are rendered
 *   by code and may show them.
 */

/** The payload keys of a contact that hold contact methods (ContactDTO and the field-write names). */
export const CONTACT_METHOD_KEYS = ["primaryEmail", "primaryPhone", "email", "phone", "emails", "phones", "wechat", "weChat", "line", "handles", "address", "postalAddress"] as const;

const KEYS = new Set<string>(CONTACT_METHOD_KEYS);

/** A copy without the contact-method fields, at any depth. */
export function withoutContactMethods<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutContactMethods(item)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (KEYS.has(key)) continue;
    out[key] = withoutContactMethods(item);
  }
  return out as T;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/gu;
/**
 * Phone numbers: "+81-90-0000-0017", "090-1234-5678", "(03) 1234-5678", "13812345678". Dates ("2026-11-15") and times
 * are not matched: the groups are 2–4, 3–4 and 4 digits, or a Chinese mobile of 11 digits on its own.
 */
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{1,4}\)\s?|\d{2,4}[\s-])\d{3,4}[\s-]\d{4}(?!\d)|(?<![\d.])1[3-9]\d{9}(?![\d.])/gu;

export const CONTACT_METHOD_PLACEHOLDER = "[contact detail withheld]";

/** E-mail addresses and phone numbers in a text. */
export function contactMethodsIn(text: string): string[] {
  return [...new Set([...(text.match(EMAIL) ?? []), ...(text.match(PHONE) ?? [])].map((item) => item.trim()))];
}

const allowed = new Map<string, Set<string>>();
const ALLOW_LIMIT = 500;

/** The contact methods the user typed in this request's message may go to the model (the user's own words). */
export function allowContactMethodsFrom(requestId: string, message: string): void {
  const found = contactMethodsIn(message);
  if (!found.length) return;
  if (allowed.size >= ALLOW_LIMIT) allowed.delete(allowed.keys().next().value as string);
  allowed.set(requestId, new Set([...(allowed.get(requestId) ?? []), ...found]));
}

/** Replaces every e-mail address and phone number the user did not type in this request. Returns the text and how many were withheld. */
export function scrubModelInput(text: string, requestId?: string | null): { text: string; withheld: number } {
  const keep = (requestId && allowed.get(requestId)) || new Set<string>();
  let withheld = 0;
  const replace = (match: string) => {
    if (keep.has(match.trim())) return match;
    withheld += 1;
    return CONTACT_METHOD_PLACEHOLDER;
  };
  const out = text.replace(EMAIL, replace).replace(PHONE, replace);
  return { text: out, withheld };
}
