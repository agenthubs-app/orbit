/**
 * agent-design AG13 repair round 7 (AE-UND-003, AG12 rerun at AG13 run-07): "Tell me what Emily said she'd send me
 * after our call, but don't add anything to my to-dos." — the first layer listed todo.create anyway and the part went
 * to an answer instead of a read. A create the user refuses in the same clause (不要/别/不用/先不 … 加 … 待办; "don't
 * add … to my to-dos"; 〜に追加しないで) is dropped by code before routing; a refused part never proposes a write.
 */

/** Words between the refusal and the record word stay inside one clause (no clause mark in between). */
const GAP = String.raw`[^，。,.;；!！?？\n]{0,24}`;

const RECORD_WORDS: Record<"todo.create" | "memo.create" | "schedule.create", { zh: string; en: string; ja: string }> = {
  "memo.create": { en: String.raw`(?:notes?|memos?)`, ja: String.raw`(?:メモ|ノート)`, zh: String.raw`(?:笔记|备忘|记录)` },
  "schedule.create": { en: String.raw`(?:calendar|schedule)`, ja: String.raw`(?:予定|カレンダー|スケジュール)`, zh: String.raw`(?:日程|日历|行程)` },
  "todo.create": { en: String.raw`(?:to-?dos?|tasks?|to-?do list)`, ja: String.raw`(?:ToDo|TODO|タスク|やること)`, zh: String.raw`(?:待办|代办|任务|to-?do)` },
};

function refusals(record: { zh: string; en: string; ja: string }): RegExp[] {
  return [
    // 不要/别/不用/先不/不必/无需/不需要 … 加/记/建/存/放/写/排 … 待办 — and 待办 … 不要/别 加
    new RegExp(String.raw`(?:不要|别|不用|先不|不必|无需|不需要|没必要)${GAP}(?:加|添|记|建|新建|存|放|写|排|列)${GAP}${record.zh}`, "iu"),
    new RegExp(String.raw`${record.zh}${GAP}(?:先)?(?:不要|别|不用|不必|无需|不需要)(?:再)?(?:加|添|记|建|存|放|写|排|动)`, "iu"),
    // don't / do not / no need to / without … add/put/create/log/save … to-dos
    new RegExp(String.raw`\b(?:don'?t|do not|no need to|never|without|not to)\b${GAP}\b(?:add|adding|put|putting|create|creating|make|making|log|logging|save|saving|record|recording|schedule|scheduling)\b${GAP}\b${record.en}\b`, "iu"),
    // 〜に追加しないで / 追加しなくていい / 入れないで / 作らないで … (record word before the verb)
    new RegExp(String.raw`${record.ja}${GAP}(?:に|へ|は|には)?${GAP}(?:追加|登録|作成|記録)?(?:し|入れ|作ら|残さ|足さ)(?:ないで|なくていい|なくて大丈夫|ないでください|なくても)`, "iu"),
  ];
}

/**
 * AG20a R16 (设计稿 §3.1; TP-UND-005): "……改到周五——算了不改了" — a change taken back later in the same sentence. Words of
 * taking it back that come after the change ("算了不改了", "还是别改了", "never mind", "やっぱりいい") drop the part's writes
 * before routing, so nothing is sent to the write step. A retraction before the change it keeps ("算了不改周四了，改到周五吧")
 * is not one: something is still asked after it.
 */
const RETRACT = /(算了[，,、\s]*(?:还是)?(?:不|别|不用)(?:改|加|建|记|删|动|弄)?了?|还是(?:不|别)(?:改|加|建|记|删|动)了|(?:不|别)(?:改|加|建|记|删)了(?:吧)?$|就当我没说|当我没说|\bnever ?mind\b|\bforget (?:it|that)\b|\bscratch that\b|\bactually,? (?:don'?t|no)\b|やっぱり(?:いい|いいや|やめ|変えない|変更しない|なし)|やめておく|なしで)/iu;
const ASK_AFTER = /(改到|改成|换成|加上|建一|记上|删掉|\bmove\b|\bchange\b|\badd\b|に変更|にして|追加して)/iu;

export function retractedWrites(quote: string, capabilities: readonly string[]): string[] {
  const writes = capabilities.filter((capability) => /\.(create|update|delete|complete|reopen|restore|import)$/u.test(capability));
  if (!writes.length) return [];
  const match = RETRACT.exec(quote);
  if (!match) return [];
  // Something asked after the retraction ("算了不改周四了，改到周五吧") keeps the write.
  if (ASK_AFTER.test(quote.slice(match.index + match[0].length))) return [];
  return writes;
}

/** The create capabilities this part's own words refuse. */
export function refusedCreates(quote: string, capabilities: readonly string[]): string[] {
  return (Object.keys(RECORD_WORDS) as (keyof typeof RECORD_WORDS)[])
    .filter((capability) => capabilities.includes(capability))
    .filter((capability) => refusals(RECORD_WORDS[capability]).some((pattern) => pattern.test(quote)));
}
