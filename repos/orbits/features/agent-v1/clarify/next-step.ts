/**
 * The next step of a part, by code, from the six rows of 设计稿 §3.11 (agent-design AG04).
 *
 *   1. nothing to act on can be read out of it             → say so, offer directions; read nothing
 *   2. a statement or a hypothesis, not a request          → answer as usual, no card; at most one entry
 *   3. clear direction, every reading only reads           → do the most likely one, say how it was read
 *   4. clear direction, a write that misses one item       → ask for that one item
 *   5. readings that differ and at least one writes        → do not guess: ask, listing the readings
 *   6. clear and unclear parts in one message              → each part on its own (the caller's loop)
 *
 * Only a part with intentBasis instruction or selection, clarity clear or missing_one, no negation or
 * hypothesis and a write capability may become a write. A write tag next to a statement tag (what the
 * first layer gets wrong, and what fault mistag_write produces) is taken conservatively until the
 * judgment model checks it in AG08: answered as a statement, with at most one entry.
 *
 * A part is asked at most once: asked already and still unclear, it is delivered as far as it goes
 * and marked unfinished, saying what is missing — no second question.
 */
import { capabilityKind, type Capability } from "../route/capabilities";
import type { Clarity, IntentBasis } from "../understand/schema";
import { isPickingReading, isReadOnlyReading, mostLikelyReading, sameReading, type Reading, type RecordKind } from "./default-readings";

export const MAX_OTHER_READINGS = 2;

export interface StepInput {
  clarity: Clarity;
  capabilities: readonly Capability[];
  intentBasis: IntentBasis;
  /** "先别改", "don't add" … in the part's constraints. */
  negation: boolean;
  /** "如果", "もし", "if …". */
  hypothesis: boolean;
  /** The model's readings (registered capabilities only; the label is never used). */
  readings: readonly Reading[];
  /** The kind of record the part is about (a bound reference, else the clue's entity). */
  objectKind: RecordKind | null;
  /** The part names a person (a contact clue): a statement about them may offer "记到往来里". */
  hasContactClue: boolean;
  /**
   * run-02 (§3.10, §3.11 row 4): the part points at its object only with a pronoun or demonstrative
   * that nothing could resolve (no conversation to read, nothing else named in the message, nothing bound).
   */
  unboundPronoun?: boolean;
  /**
   * AG07 gate (AE-XL-005): a write that names its object in its own words ("报价待办") and says the new date ("周五"):
   * nothing is missing for code to look the record up (several that fit are asked about with candidates there).
   */
  namedObjectWithDate?: boolean;
  /** AG07 run-03 (AE-AMB-007): a change verb with a new date ("改到周五") and no bound object: a reschedule of an unknown item. */
  reschedule?: boolean;
}

export interface StepContext {
  /** Questions already asked for this part (a part continuing a question inherits its count). */
  asked: number;
  pageKind?: RecordKind | null;
  topicKind?: RecordKind | null;
  selected?: Reading | null;
}

export type NextStep =
  | { kind: "not_understood" }
  | { kind: "respond"; entry: Capability | null; conservative: boolean; /** AG08: the write-intent review made it a statement; the entry's words (route node). */ reviewed?: { kind: "interaction" } | { kind: "reschedule"; date: string; object?: string } }
  | { kind: "most_likely"; reading: Reading; basis: "selection" | "page" | "topic" | "default"; others: Reading[] }
  | { kind: "ask_missing" }
  | { kind: "ask_readings"; readings: Reading[] }
  | { kind: "still_unclear"; missing: "intent" | "object" | "reading" }
  | { kind: "proceed" };

export const MAX_QUESTIONS_PER_PART = 1;

const writesOf = (capabilities: readonly Capability[]) => capabilities.filter((capability) => capabilityKind(capability) === "write");

export function decideNextStep(part: StepInput, context: StepContext): NextStep {
  const writes = writesOf(part.capabilities);
  const asked = context.asked >= MAX_QUESTIONS_PER_PART;
  // Row 2, conservative: a write that reads as a statement, a hypothesis, a negation or old context.
  if (writes.length && (part.clarity === "statement" || part.hypothesis || part.negation || part.intentBasis === "accepted_context")) {
    return { conservative: true, entry: part.negation || part.intentBasis === "accepted_context" ? null : writes[0], kind: "respond" };
  }
  if (part.clarity === "statement") return { conservative: false, entry: part.hasContactClue ? "memo.create" : null, kind: "respond" };
  // run-02: the object is missing whatever clarity the model gave (§3.10 系统不猜, §3.11 row 4); reads ask too.
  const needsObject = part.capabilities.some((capability) => ["read", "write"].includes(capabilityKind(capability)));
  if (part.unboundPronoun && needsObject && part.clarity !== "none") return asked ? { kind: "still_unclear", missing: "object" } : { kind: "ask_missing" };
  // AG07 run-03 (AE-AMB-007): the action is known (a reschedule); what is missing is which item, not what to do.
  if (part.reschedule && part.clarity === "none") return asked ? { kind: "still_unclear", missing: "object" } : { kind: "ask_missing" };
  if (part.clarity === "none") return asked ? { kind: "still_unclear", missing: "intent" } : { kind: "not_understood" };
  if (part.clarity === "missing_one") {
    if (!writes.length || part.namedObjectWithDate) return { kind: "proceed" };
    return asked ? { kind: "still_unclear", missing: "object" } : { kind: "ask_missing" };
  }
  if (part.clarity === "multiple_readings") {
    const readings = part.readings.length ? [...part.readings] : part.capabilities.length ? [{ capabilities: [...part.capabilities], deliverable: "answer" as const }] : [];
    const anyWrite = writes.length > 0 || readings.some((reading) => writesOf(reading.capabilities).length > 0);
    if (!anyWrite && readings.every(isReadOnlyReading)) {
      const picked = mostLikelyReading({ objectKind: part.objectKind, pageKind: context.pageKind, readings, selected: context.selected, topicKind: context.topicKind });
      if (picked && !(picked.basis === "topic" && isPickingReading(picked.reading))) {
        const chosen = picked.reading;
        const overlaps = (reading: Reading) => sameReading(reading, chosen) || reading.capabilities.some((capability) => capabilityKind(capability) === "function" && chosen.capabilities.includes(capability));
        const others = readings.filter((reading) => reading !== chosen && isReadOnlyReading(reading) && !overlaps(reading)).slice(0, MAX_OTHER_READINGS);
        return { basis: picked.basis, kind: "most_likely", others, reading: picked.reading };
      }
    }
    return asked ? { kind: "still_unclear", missing: "reading" } : { kind: "ask_readings", readings };
  }
  return { kind: "proceed" };
}
