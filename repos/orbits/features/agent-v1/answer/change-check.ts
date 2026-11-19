import { localizeAnswerDates } from "./dates";
import type { Material } from "./schema";

/**
 * agent-design AG07 repair 2 (AE-SCL-006 R2): when an answer reports that a newer record replaces what an older one
 * said ("之前说的 12 月 1 日作废"), the reason the newer record gives ("项目交接延后") is stated too. Whether a record
 * replaces another is a reading of the words, so the model names it — as structured entries (`changes` in its
 * segment), never as free text. Code checks each entry against this turn's materials (both are records read now,
 * the source is the newer one, the reason is copied from the source) and writes the sentence itself (zh/ja/en).
 * Asked only for an item where two dated records were read and one of them speaks of a change.
 */
export interface ChangeReason {
  source: Material;
  older: Material;
  /** The newer record's own words for why; "" when it gives none. */
  reason: string;
  /** AG07 run-02: the newer record's own words for the value it replaces ("12 月 1 日"); "" when it does not name it. */
  before: string;
}

/** Words a record uses when it changes or cancels what was said before (zh, ja, en). */
const CHANGE_WORDS = /作废|取消|不算了|改为|改成|改到|延后|推迟|延期|提前到|不再|無効|取り消|中止|変更|前倒し|cancel|postpone|delay|no longer|instead|moved to|changed to|\bvoid\b/iu;

/** Words that cancel or void a value: they say what changed, never why (AE-SCL-006 on 7ab2350). */
const VOID_WORDS = /作废|作廃|無効|取り消|不算|不作数|\bcancel(?:l?ed)?\b|\bvoid\b|no longer (?:valid|holds|stands)/iu;

/** Words before an earlier value that say it is the earlier one (zh, ja, en). */
const LEAD_IN = /^(?:之前说的是?|之前说|之前的?|原先说的|原先的?|原来说的|原来的?|以前说的|以前的?|先前的?|前に言っていた|以前は|当初の?|previously(?: said)?|earlier|the earlier|originally|before)\s*[:：]?\s*/iu;
/** Words after it that cancel it ("作废", "无效"). */
const TRAIL_OFF = /\s*(?:已?作废|无效|取消了?|は無効|は取り消し|was cancelled|is void)$/iu;

const squash = (text: string) => text.replace(/\s+/gu, "").toLowerCase();
const textOf = (material: Material) => material.sentences.map((sentence) => sentence.text).join("");
const dated = (material: Material) => material.kind !== "contact" && Boolean(material.at);

export function changeCheckOf(materials: readonly Material[]): boolean {
  const records = materials.filter(dated);
  return records.length >= 2 && records.some((material) => CHANGE_WORDS.test(textOf(material)));
}

export function changeCheckNote(): string {
  return 'Change check — answer it in "changes", not in text: does your answer say that a newer material replaces, cancels or moves what an older one said? If not, give "changes": []. Otherwise one entry per change: {"source": the newer material\'s handle, "older": the older material\'s handle, "before": the words of the newer material that name the earlier value it replaces (e.g. a date), copied exactly, or "" if it does not name it, "reason": the words of the newer material that say why it changed — the cause, not the words that say the old value is cancelled or replaced — copied exactly, or "" if it gives no cause}. Code writes the sentence with the earlier value and the reason; do not add it yourself.';
}

export function verifyChangeReasons(raw: unknown, materials: readonly Material[]): { changes: ChangeReason[]; problems: string[] } {
  const byHandle = new Map(materials.map((material) => [material.handle, material]));
  const changes: ChangeReason[] = [];
  const problems: string[] = [];
  for (const entry of Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []) {
    const name = JSON.stringify(entry).slice(0, 80);
    const source = typeof entry?.source === "string" ? byHandle.get(entry.source.trim()) : undefined;
    const older = typeof entry?.older === "string" ? byHandle.get(entry.older.trim()) : undefined;
    const reason = typeof entry?.reason === "string" ? entry.reason.trim().replace(/[。.，,、;；]+$/u, "") : "";
    // Only the value: the words around it ("之前说的", "previously") are code's to say (run-02 gate, 663fa96).
    const before = typeof entry?.before === "string" ? entry.before.trim().replace(/[。.，,、;；]+$/u, "").replace(LEAD_IN, "").replace(TRAIL_OFF, "").trim() : "";
    if (!source || !older || !dated(source) || !dated(older) || source === older) {
      problems.push(`changes entry ${name}: "source" and "older" must be two dated records of these materials`);
      continue;
    }
    if (!(Date.parse(source.at!) > Date.parse(older.at!))) {
      problems.push(`changes entry ${name}: "source" must be the newer of the two`);
      continue;
    }
    if (reason && VOID_WORDS.test(reason)) {
      problems.push(`changes entry ${name}: "reason" must say why it changed (the cause), not the words that cancel the old value; give "" if ${source.handle} gives no cause`);
      continue;
    }
    if (reason && (reason.length > 60 || !squash(textOf(source)).includes(squash(reason)))) {
      problems.push(`changes entry ${name}: "reason" must be words copied from ${source.handle}, or ""`);
      continue;
    }
    if (before && (before.length > 40 || !squash(textOf(source)).includes(squash(before)))) {
      problems.push(`changes entry ${name}: "before" must be words copied from ${source.handle} that name the earlier value, or ""`);
      continue;
    }
    if (changes.some((item) => item.source === source && item.older === older)) continue;
    changes.push({ before, older, reason, source });
  }
  return { changes, problems };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayOf(value: string, timeZone: string): { month: number; day: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "numeric", timeZone }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), month: Number(parts.month) };
}

/**
 * Code's sentence: what the newer record replaced and why, in its own words (AG07 run-02: the earlier value too, so
 * the model need not remember it). Nothing when the answer already says both, or the record names neither.
 */
export function changeReasonLine(language: "zh" | "ja" | "en", changes: readonly ChangeReason[], answer: string, timeZone: string): string | null {
  const said = squash(answer);
  const lines: string[] = [];
  for (const change of changes) {
    const before = language === "en" ? localizeAnswerDates(change.before, "en") : change.before.replace(/\s+/gu, "");
    const reasonSaid = !change.reason || said.includes(squash(change.reason));
    const beforeSaid = !before || said.includes(squash(before));
    if (reasonSaid && beforeSaid) continue;
    const { day, month } = dayOf(change.source.at!, timeZone);
    if (language === "zh") {
      const was = before ? `之前说的是${before}` : "";
      lines.push(change.reason ? `（${was ? `${was}；` : ""}改动的原因，${month}月${day}日的记录里写的是：${change.reason}。）` : `（${was}，${month}月${day}日的记录把它改了。）`);
    } else if (language === "ja") {
      const was = before ? `以前は「${before}」でした。` : "";
      lines.push(change.reason ? `（${was}変更の理由は、${month}月${day}日の記録によると「${change.reason}」です。）` : `（${was}${month}月${day}日の記録で変更されています。）`);
    } else {
      const was = before ? `Earlier it was ${before}. ` : "";
      lines.push(change.reason ? `(${was}Why it changed, per the record of ${MONTHS[month - 1]} ${day}: ${change.reason}.)` : `(${was}The record of ${MONTHS[month - 1]} ${day} changed it.)`);
    }
  }
  return lines.length ? [...new Set(lines)].join("\n") : null;
}

/**
 * AG12 run-02 (AE-SCL-016 R2): a record the answer cites that itself says an earlier value has expired or no longer holds
 * ("The September quote of JPY 1,900 has expired.") — the answer uses the newer value; code says the record's own sentence
 * when the answer does not, copied as the record has it (zh/ja/en). Deterministic: the sentence is the record's, the
 * record is one the answer cites.
 */
const EXPIRY_WORDS = /\bhas expired\b|\bhave expired\b|\bis expired\b|\bexpired\b|\bno longer (?:valid|stands|applies|holds)\b|\bis void\b|已经?过期|已失效|失效了|已作废|作废了|不再有效|期限切れ|有効期限が切れ|失効|無効になり/iu;

export function expiryLine(language: "zh" | "ja" | "en", cited: readonly Material[], answer: string, timeZone: string): string | null {
  if (EXPIRY_WORDS.test(answer)) return null;
  const said = squash(answer);
  const lines: string[] = [];
  for (const material of cited) {
    if (material.kind === "web" || material.kind === "contact" || !material.at) continue;
    for (const sentence of material.sentences) {
      if (!EXPIRY_WORDS.test(sentence.text) || said.includes(squash(sentence.text))) continue;
      const { day, month } = dayOf(material.at, timeZone);
      const text = sentence.text.trim();
      lines.push(language === "zh" ? `（${month}月${day}日的记录里还写着：「${text}」）` : language === "ja" ? `（${month}月${day}日の記録には「${text}」とも書かれています。）` : `(The record of ${MONTHS[month - 1]} ${day} also says: "${text}")`);
    }
  }
  return lines.length ? [...new Set(lines)].join("\n") : null;
}
