/**
 * AG11 (设计稿 §3.6; 验收 AG11-2): a marker the user picked in the composer ("@客户访谈" at [start, end)) is that record.
 * Code binds it, never the first layer: two markers with the same words are two records, told apart by where they sit,
 * and a marker is never taken for a record named the same in earlier messages (AE-SCL-021: the model bound the marker
 * to the note answered last turn).
 *
 * For one part: each object clue whose words are a marker inside the part takes that marker (in the order the
 * markers appear, one marker per clue); a marker no clue took becomes a clue of its own. Words the user typed
 * as "@名字" without picking anything have no marker and are left to the first layer as before.
 */

export interface MarkedReference {
  id: string;
  type: string;
  marks?: readonly (readonly [number, number])[] | undefined;
}

export interface MarkableRef {
  entity: string;
  recordId: string | null;
  quote?: [number, number] | null;
}

/**
 * AG11 (AE-SCL-021): a message that is only a picked record and "what about it" — 「那 @选品方向 这一篇呢？」, 「@X は？」,
 * "what about @X?" — asks the previous question again, about this record. True when, with every marker taken out, nothing
 * is left but those words.
 */
export function asksAgainAbout(message: string, marks: readonly (readonly [number, number])[]): boolean {
  if (!marks.length) return false;
  let shell = "";
  let at = 0;
  for (const [start, end] of [...marks].sort((left, right) => left[0] - right[0])) {
    shell += `${message.slice(at, start)}\u0001`;
    at = end;
  }
  shell = `${shell}${message.slice(at)}`.trim();
  const zh = /^(?:那|那么|还有|再看看?)?\s*(?:\u0001\s*(?:和|跟|、)?\s*)+(?:这一?篇|这一?个|这一?条|这一?位|这一?场|这一?次|那一?篇|那一?个)?\s*呢\s*[？?]?$/u;
  const ja = /^(?:じゃあ|では|それでは|なら)?\s*(?:\u0001\s*(?:と|、)?\s*)+(?:の方|のほう)?\s*は\s*[？?]?$/u;
  const en = /^(?:and|then|so|ok,?)?\s*(?:what|how)\s+about\s+(?:\u0001\s*(?:and|,)?\s*)+[?？]?$/iu;
  return zh.test(shell) || ja.test(shell) || en.test(shell);
}

/** The clue entity of a reference type ("note" is a memo; «我去过» is attendance). */
export function entityOfReferenceType(type: string): string {
  if (type === "note") return "memo";
  if (type === "task") return "todo";
  return type;
}

const bare = (words: string) => words.replace(/^@/u, "").trim();

/** Whether the clue's words point at this marker's words ("@客户访谈", "客户访谈", "@客户访谈这篇"). */
function cluePointsAtMarker(clueWords: string, markerWords: string): boolean {
  const clue = bare(clueWords);
  const marker = bare(markerWords);
  return Boolean(clue && marker) && (clue.includes(marker) || marker.includes(clue));
}

/**
 * Binds the markers inside [partStart, partEnd) to the part's clues. Returns the part's refs (new objects) and which
 * markers were bound, for the trace.
 */
export function bindMarkedReferences<T extends MarkableRef>(input: {
  message: string;
  part: [number, number];
  refs: readonly T[];
  references: readonly MarkedReference[];
  make: (entity: string, recordId: string, quote: [number, number]) => T;
}): { refs: T[]; bound: { recordId: string; mark: [number, number]; added: boolean }[] } {
  const [partStart, partEnd] = input.part;
  const marks = input.references
    .flatMap((reference) => (reference.marks ?? []).map((mark) => ({ entity: entityOfReferenceType(reference.type), id: reference.id, mark: [mark[0], mark[1]] as [number, number] })))
    .filter(({ mark }) => partStart >= 0 && mark[0] >= partStart && mark[1] <= partEnd)
    .sort((left, right) => left.mark[0] - right.mark[0]);
  if (!marks.length) return { bound: [], refs: [...input.refs] };
  const used = new Set<number>();
  const bound: { recordId: string; mark: [number, number]; added: boolean }[] = [];
  const refs = input.refs.map((ref) => {
    const words = ref.quote ? input.message.slice(ref.quote[0], ref.quote[1]) : "";
    if (!words) return { ...ref };
    const index = marks.findIndex((item, at) => !used.has(at) && cluePointsAtMarker(words, input.message.slice(item.mark[0], item.mark[1])));
    if (index < 0) return { ...ref };
    used.add(index);
    const { entity, id, mark } = marks[index];
    bound.push({ added: false, mark, recordId: id });
    return { ...ref, entity, quote: mark, recordId: id };
  });
  for (const [at, { entity, id, mark }] of marks.entries()) {
    if (used.has(at)) continue;
    // The same record marked again in this part needs no second clue.
    if (refs.some((ref) => ref.recordId === id)) continue;
    refs.push(input.make(entity, id, mark));
    bound.push({ added: true, mark, recordId: id });
  }
  return { bound, refs };
}
