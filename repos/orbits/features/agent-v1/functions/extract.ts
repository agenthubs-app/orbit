/**
 * The shared step of extractInteractions() and extractFollowUps() (设计稿 §3.5, 附录 C `InteractionCandidate`,
 * `FollowUpCandidate`; agent-design AG10, PLANNER 易错边界 4/5): one main-model call reads one memo, by id and version, as
 * numbered sentences, and returns candidates of the kinds asked for — both kinds in one call when both are wanted.
 *
 * The model only proposes. Code checks every candidate here: the sentence numbers exist, the enums are known, the person
 * is one of the memo's linked contacts (or the one the user named), and the words a date is copied from are in the
 * cited sentence. Dates are worked out by code from the memo's own date (functions/dates.ts). Anything else is dropped
 * and traced; nothing a model says decides a write (the judgment review and the card decide that).
 *
 * One addition to 附录 C (登记 in the AG10 REPORT): an interaction candidate carries `kind` — happened, mentioned_only,
 * planned, between_others — so that what is *not* an interaction can be said back to the user with its reason.
 */
import { splitSentences, type Sentence } from "../text/sentences";
import { parseModelJson } from "../understand/validate";

export const EXTRACT_PROMPT_VERSION = "extract@ag10.1";

export const INTERACTION_KINDS = ["happened", "mentioned_only", "planned", "between_others"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
export const CHANNELS = ["phone", "meeting", "message", "email", "other"] as const;
export const DIRECTIONS = ["incoming", "outgoing", "mutual"] as const;
export const OWNERS = ["me", "other", "suggestion"] as const;
export type Owner = (typeof OWNERS)[number];

/** 附录 C InteractionCandidate (+ kind). */
export interface InteractionCandidate {
  contactClue: string;
  kind: InteractionKind;
  channel: (typeof CHANNELS)[number];
  direction: (typeof DIRECTIONS)[number];
  dateText?: string;
  precision: "day" | "instant" | "unknown";
  sentenceIds: number[];
}

/** 附录 C FollowUpCandidate. */
export interface FollowUpCandidate {
  owner: Owner;
  action: string;
  aboutClue?: string;
  plannedDateText?: string;
  dueDateText?: string;
  sentenceIds: number[];
}

export interface MemoForExtraction {
  id: string;
  ref: string;
  version: number;
  title: string;
  body: string;
  createdAt: string;
  /** The memo's own day with its weekday, as the prompt says it ("2026-11-14 (Sat)"). */
  day?: string;
  contactIds: string[];
  /** The interaction the memo records now (AG06 field), if any. */
  interaction: { actualContactIds: string[]; channel: string; direction: string; occurredOn?: string; occurredAt?: string; precision: string } | null;
}

export interface LinkedContact {
  id: string;
  name: string;
}

export function sentencesOf(memo: Pick<MemoForExtraction, "body">): Sentence[] {
  return splitSentences(memo.body);
}

const LANGUAGE_NAME = { en: "English", ja: "Japanese", zh: "Chinese" } as const;

export function extractSystemPrompt(): string {
  return [
    "You read ONE memo the user wrote about their own work contacts and list, as JSON, what it says. The author of the memo is the user (\"我\", \"私\", \"I\").",
    "Output a JSON object: {\"interactions\": [...], \"followUps\": [...]}. Give only the keys you are asked for; an empty list when there is nothing.",
    "",
    "interactions — every person the memo says the author was, or will be, or was not, in contact with, one entry per person and occasion:",
    "  {\"contactClue\": the person's name as the memo writes it (resolve 他/她/彼/she/he to the name), \"kind\": one of",
    "   \"happened\" (the author and this person actually talked, called, met or wrote to each other, already),",
    "   \"mentioned_only\" (the person is only talked about), \"planned\" (the author intends to contact them later; not happened yet),",
    "   \"between_others\" (a contact between OTHER people, or one the author only heard about from someone else),",
    "   \"channel\": phone | meeting | message | email | other, \"direction\": incoming (they contacted the author) | outgoing (the author contacted them) | mutual,",
    "   \"dateText\": the date words exactly as the memo writes them for that contact (omit when none), \"precision\": day | instant | unknown,",
    "   \"sentenceIds\": the numbers of the sentences that say it}",
    "",
    "followUps — every action someone said they would do, and every suggestion to consider:",
    "  {\"owner\": \"me\" (the author committed to do it: 我答应, 約束した, I promised, I'll send …) | \"other\" (another person said they would do it) |",
    "   \"suggestion\" (only something to consider or an intention without a commitment: 打算, 想, 考虑, 思う, should think about, maybe),",
    "   \"action\": what is to be done, short, in the memo's language, naming the person (e.g. \"把合同草稿发给王强\", \"原稿を山本さんに送る\", \"Send the dashboard spec\"),",
    "   \"aboutClue\": the name of the person it is for or about (resolve pronouns; omit when none),",
    "   \"plannedDateText\": date words exactly as written for a day to DO it (\"11 月 20 日\"), \"dueDateText\": date words exactly as written for a DEADLINE",
    "   (\"最迟 11 月 25 日\", \"12月5日までに\", \"by Friday\", \"11 月 19 日前\"), omit both when the memo gives no date,",
    "   \"sentenceIds\": the numbers of the sentences that say it}",
    "",
    "Copy names and date words from the memo; never work out a date and never add a fact the memo does not state.",
  ].join("\n");
}

export function extractUserText(input: { memo: MemoForExtraction; sentences: readonly Sentence[]; contacts: readonly LinkedContact[]; want: { interactions: boolean; followUps: boolean }; language: "zh" | "ja" | "en"; focus?: string | null; memoDay: string }): string {
  const keys = [input.want.interactions ? "interactions" : null, input.want.followUps ? "followUps" : null].filter(Boolean).join(" and ");
  return [
    `Give: ${keys}.`,
    `Memo${input.memo.title ? ` "${input.memo.title}"` : ""}, written ${input.memo.day ?? input.memoDay}${input.contacts.length ? `; linked to: ${input.contacts.map((contact) => contact.name).join(", ")}` : ""}.`,
    input.focus ? `The user asks about: ${input.focus}` : null,
    `Write "action" in ${LANGUAGE_NAME[input.language]} when the memo is; otherwise in the memo's own language.`,
    "",
    "Sentences:",
    ...input.sentences.map((sentence) => `[${sentence.id}] ${sentence.text}`),
  ].filter((line) => line !== null).join("\n");
}

export interface ExtractOutput {
  interactions: InteractionCandidate[];
  followUps: FollowUpCandidate[];
  /** What code dropped, with why (traced). */
  dropped: { what: "interaction" | "followUp"; why: string; value: unknown }[];
}

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);
const words = (value: unknown, max = 120): string | undefined => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

/** Checks the model's output: lists, enums, sentence numbers that exist; a date copy that is not in the cited sentences is dropped. */
export function checkExtractOutput(text: string, sentences: readonly Sentence[], want: { interactions: boolean; followUps: boolean }): { ok: true; value: ExtractOutput } | { ok: false; error: string } {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { error: parsed.error, ok: false };
  const value = parsed.value as { interactions?: unknown; followUps?: unknown } | null;
  if (!value || typeof value !== "object") return { error: "the output must be a JSON object", ok: false };
  const ids = new Set(sentences.map((sentence) => sentence.id));
  const textOf = (list: number[]) => list.map((id) => sentences.find((sentence) => sentence.id === id)?.text ?? "").join(" ");
  const dropped: ExtractOutput["dropped"] = [];
  const sentenceIdsOf = (raw: unknown) => (Array.isArray(raw) ? [...new Set(raw.map(Number).filter((id) => Number.isInteger(id)))] : []);
  const interactions: InteractionCandidate[] = [];
  if (want.interactions) {
    if (value.interactions !== undefined && !Array.isArray(value.interactions)) return { error: "interactions must be a list", ok: false };
    for (const raw of (value.interactions ?? []) as Record<string, unknown>[]) {
      const sentenceIds = sentenceIdsOf(raw?.sentenceIds);
      const contactClue = words(raw?.contactClue, 40);
      if (!contactClue || !sentenceIds.length || sentenceIds.some((id) => !ids.has(id))) {
        dropped.push({ value: raw, what: "interaction", why: !contactClue ? "no person" : "sentence numbers that do not exist" });
        continue;
      }
      const dateText = words(raw?.dateText, 40);
      const inSentences = !dateText || textOf(sentenceIds).includes(dateText);
      if (!inSentences) dropped.push({ value: dateText, what: "interaction", why: "date words not in the cited sentences (the date is left empty)" });
      interactions.push({ channel: pick(raw?.channel, CHANNELS, "other"), contactClue, direction: pick(raw?.direction, DIRECTIONS, "mutual"), kind: pick(raw?.kind, INTERACTION_KINDS, "mentioned_only"), precision: pick(raw?.precision, ["day", "instant", "unknown"] as const, "unknown"), sentenceIds, ...(dateText && inSentences ? { dateText } : {}) });
    }
  }
  const followUps: FollowUpCandidate[] = [];
  if (want.followUps) {
    if (value.followUps !== undefined && !Array.isArray(value.followUps)) return { error: "followUps must be a list", ok: false };
    for (const raw of (value.followUps ?? []) as Record<string, unknown>[]) {
      const sentenceIds = sentenceIdsOf(raw?.sentenceIds);
      const action = words(raw?.action, 80);
      if (!action || !sentenceIds.length || sentenceIds.some((id) => !ids.has(id))) {
        dropped.push({ value: raw, what: "followUp", why: !action ? "no action" : "sentence numbers that do not exist" });
        continue;
      }
      const source = textOf(sentenceIds);
      const date = (key: "plannedDateText" | "dueDateText") => {
        const copy = words(raw?.[key], 40);
        if (!copy) return undefined;
        if (source.includes(copy)) return copy;
        dropped.push({ value: copy, what: "followUp", why: `${key} not in the cited sentences (left empty)` });
        return undefined;
      };
      const plannedDateText = date("plannedDateText");
      const dueDateText = date("dueDateText");
      const aboutClue = words(raw?.aboutClue, 40);
      followUps.push({ action, owner: pick(raw?.owner, OWNERS, "suggestion"), sentenceIds, ...(aboutClue ? { aboutClue } : {}), ...(plannedDateText ? { plannedDateText } : {}), ...(dueDateText ? { dueDateText } : {}) });
    }
  }
  return { ok: true, value: { dropped, followUps, interactions } };
}

/* ── people ──────────────────────────────────────────────────────────── */

const HONORIFICS = /(さん|様|さま|氏|先生|くん|君|ちゃん|总|经理|老师|先生|女士|小姐|\b(?:mr|mrs|ms|dr)\.?\s*)/giu;

/** The names a contact may be called by in a memo: full name, family name, given name, "小X"/"老X". */
function namesOf(name: string): string[] {
  const clean = name.trim();
  const out = new Set<string>([clean]);
  const latin = clean.split(/\s+/u).filter(Boolean);
  if (latin.length > 1 && /^[\x20-\x7e]+$/u.test(clean)) latin.forEach((piece) => out.add(piece));
  if (/^[一-鿿]{2,4}$/u.test(clean)) {
    out.add(`小${clean[0]}`);
    out.add(`老${clean[0]}`);
    // Japanese family names of two characters (中村理沙 → 中村) and Chinese ones of one (小林健 → 小林 is two).
    out.add(clean.slice(0, 2));
    // AG20a R11 (TP-FN-004): the given name a note uses ("兰青" for 贺兰青, "晓雯" for 欧阳晓雯, "理沙" for 中村理沙).
    if (clean.length >= 3) out.add(clean.slice(clean.length - 2));
  }
  return [...out].filter((item) => item.length >= 2 || /[a-z]{3,}/iu.test(item));
}

/**
 * The linked contact a clue names, by the exact characters of a name (张薇, 张玮 and 张伟 are three different people);
 * null when none, or more than one, matches.
 */
export function contactOfClue(clue: string, contacts: readonly LinkedContact[]): LinkedContact | null {
  const said = clue.replace(HONORIFICS, "").trim().toLowerCase();
  if (!said) return null;
  const full = contacts.filter((contact) => contact.name.toLowerCase() === said);
  if (full.length === 1) return full[0];
  const matches = contacts.filter((contact) => namesOf(contact.name).some((name) => name.toLowerCase() === said) || (said.length >= 2 && contact.name.toLowerCase().startsWith(said) && !contacts.some((other) => other !== contact && other.name.toLowerCase().startsWith(said))));
  if (matches.length === 1) return matches[0];
  // AG21c (R46): a surname of one character ("林さん", "关老师", "Mr. Lin" against 林美咲 / 关雨): CJK names have no space,
  // so it names the contact whose name starts with it — only when exactly one of these contacts does.
  if (!matches.length && /^[\p{Script=Han}\p{Script=Hangul}]$/u.test(said)) {
    const starting = contacts.filter((contact) => contact.name.trim().startsWith(said));
    if (starting.length === 1) return starting[0];
  }
  return null;
}

/* ── code's guards on what a sentence says ───────────────────────────── */

/** Someone else reported it (听说, 据说, そうだ, I heard …): not the author's own contact. */
export const HEARSAY = /(听[^，。,]{0,6}说|据说|据[^，。]{0,4}讲|转述|そうだ|らしい|とのこと|によると|から聞いた|聞いたところ|\bI heard\b|\bapparently\b|\breportedly\b|\bmentioned that\b|\bsaid that\b.*\bhad\b)/iu;
/** An intention to contact later (打算, 下周再联系, つもり, しよう, plan to, will contact …). */
export const LATER = /(打算|准备|想要?(?:再)?联系|下周再|回头再|改天|以后再|つもり|しようと|する予定|予定です|来週あたり|\bplan(?:s|ning)? to\b|\bgoing to\b|\bwill (?:call|contact|email|reach|meet)\b|\bnext week\b)/iu;
/** A contact that took place (来电, 打了电话, 通了电话, 见了, 電話があ, called, met …). */
export const TOOK_PLACE = /(来电|打电话|打了|通了|通过电话|聊了|谈了|见了|见过|碰到|碰见|拜访了|电话里|から電話|に電話|電話があ|電話した|会った|話した|打ち合わせ|面談|\bcalled\b|\bcall with\b|\bmet\b|\btalked\b|\bspoke\b|\bemailed\b|\blunch with\b)/iu;
/** Words of the author (我, 私, I) in a sentence. */
export const FIRST_PERSON = /(我|私|自分|\bI\b|\bme\b|\bmy\b)/u;
/** Words of a commitment (答应, 承诺, 約束, promised, I'll …). */
export const COMMITMENT = /(答应|承诺|保证|说好|约好|一定会|会把|会给|約束|お約束|送ります|送る|します|しておく|\bpromised?\b|\bI'?ll\b|\bI will\b|\bcommitted\b|\bagreed to\b)/iu;
/** Words of only considering (考虑, 想想, 打算, 思う, should think about …). */
export const CONSIDER = /(考虑|想想|也许|可能|不妨|打算|思う|かもしれない|検討|\bshould think\b|\bconsider\b|\bmaybe\b|\bmight\b|\bthinking about\b|\bwhether to\b)/iu;

/**
 * Code's own reading of an interaction the model said happened: hearsay without the author in it, or an intention
 * without any contact having taken place, is not an interaction (the model's "happened" is overruled).
 */
export function guardInteraction(candidate: InteractionCandidate, cited: string | readonly string[]): InteractionKind {
  if (candidate.kind !== "happened") return candidate.kind;
  const sentences = typeof cited === "string" ? [cited] : cited;
  const sentence = sentences.join(" ");
  // AG13 run-04 (AE-SCL-018): "11月12日、中村さんから電話。…松本彩さんの隣になるとのこと。" — the hearsay is what was said on
  // the call; one cited sentence that records the contact itself, with no hearsay in it, makes it the author's own.
  const ownContact = sentences.some((one) => TOOK_PLACE.test(one) && !HEARSAY.test(one));
  if (!ownContact && HEARSAY.test(sentence) && !FIRST_PERSON.test(sentence.replace(HEARSAY, ""))) return "between_others";
  if (LATER.test(sentence) && !TOOK_PLACE.test(sentence)) return "planned";
  return "happened";
}

/**
 * Code's own reading of a follow-up the model said the author committed to: with no word of a commitment or of the
 * author, it stays doubtful; with only words of considering, it is a suggestion.
 */
export function guardOwner(candidate: FollowUpCandidate, sentence: string): Owner | "doubtful" {
  if (candidate.owner !== "me") return candidate.owner;
  if (CONSIDER.test(sentence) && !COMMITMENT.test(sentence)) return "suggestion";
  if (!COMMITMENT.test(sentence) && !FIRST_PERSON.test(sentence)) return "doubtful";
  return "me";
}

export { splitSentences };
