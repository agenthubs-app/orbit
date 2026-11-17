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
}

/** Words a record uses when it changes or cancels what was said before (zh, ja, en). */
const CHANGE_WORDS = /作废|取消|不算了|改为|改成|改到|延后|推迟|延期|提前到|不再|無効|取り消|中止|変更|前倒し|cancel|postpone|delay|no longer|instead|moved to|changed to|\bvoid\b/iu;

/** Words that cancel or void a value: they say what changed, never why (AE-SCL-006 on 7ab2350). */
const VOID_WORDS = /作废|作廃|無効|取り消|不算|不作数|\bcancel(?:l?ed)?\b|\bvoid\b|no longer (?:valid|holds|stands)/iu;

const squash = (text: string) => text.replace(/\s+/gu, "").toLowerCase();
const textOf = (material: Material) => material.sentences.map((sentence) => sentence.text).join("");
const dated = (material: Material) => material.kind !== "contact" && Boolean(material.at);

export function changeCheckOf(materials: readonly Material[]): boolean {
  const records = materials.filter(dated);
  return records.length >= 2 && records.some((material) => CHANGE_WORDS.test(textOf(material)));
}

export function changeCheckNote(): string {
  return 'Change check — answer it in "changes", not in text: does your answer say that a newer material replaces, cancels or moves what an older one said? If not, give "changes": []. Otherwise one entry per change: {"source": the newer material\'s handle, "older": the older material\'s handle, "reason": the words of the newer material that say why it changed — the cause, not the words that say the old value is cancelled or replaced — copied exactly, or "" if it gives no cause}. Code writes the sentence with the reason; do not add it yourself.';
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
    if (changes.some((item) => item.source === source && item.older === older)) continue;
    changes.push({ older, reason, source });
  }
  return { changes, problems };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayOf(value: string, timeZone: string): { month: number; day: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "numeric", timeZone }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), month: Number(parts.month) };
}

/** Code's sentence: why the newer record changed it, in its own words. Nothing when the answer already says it or no reason is given. */
export function changeReasonLine(language: "zh" | "ja" | "en", changes: readonly ChangeReason[], answer: string, timeZone: string): string | null {
  const said = squash(answer);
  const lines: string[] = [];
  for (const change of changes) {
    if (!change.reason || said.includes(squash(change.reason))) continue;
    const { day, month } = dayOf(change.source.at!, timeZone);
    if (language === "zh") lines.push(`（改动的原因，${month}月${day}日的记录里写的是：${change.reason}。）`);
    else if (language === "ja") lines.push(`（変更の理由は、${month}月${day}日の記録によると「${change.reason}」です。）`);
    else lines.push(`(Why it changed, per the record of ${MONTHS[month - 1]} ${day}: ${change.reason}.)`);
  }
  return lines.length ? [...new Set(lines)].join("\n") : null;
}
