/**
 * agent-design AG14 dev run 1 (AE-FN-002): "11 月 21 日和 22 日有哪些活动值得去？帮我挑两场。" — the first layer sometimes
 * gives one part (a ranking of events) and sometimes two: the question (a read of events) and "帮我挑两场" (a pick that
 * depends on it). As two parts the question was answered as a plain directory search and the pick waited for it. They
 * are one ranking: a pick with no set of its own takes its set from the question right before it. Code decides it from
 * the parts' capabilities and where they sit in the message; no words are added or changed.
 */
import type { GraphPart } from "../graph/state";
import { capabilityKind, type Capability } from "../route/capabilities";

const SET_READS: readonly Capability[] = ["event.read", "contact.read", "todo.read"];
/** Only punctuation and space between the two parts. */
const GAP = /^[\s，,。.！!？?；;、]*$/u;

function isQuestionOfSet(part: GraphPart): boolean {
  if (!part.capabilities.some((capability) => SET_READS.includes(capability))) return false;
  if (part.plan.negation || part.plan.hypothesis) return false;
  return part.capabilities.every((capability) => SET_READS.includes(capability) || capability === "fn.rank");
}

function isBarePick(part: GraphPart): boolean {
  if (!part.capabilities.includes("fn.rank")) return false;
  if (part.plan.negation || part.plan.hypothesis) return false;
  if (part.refs.some((ref) => ref.recordId)) return false;
  // Nothing but the pick itself (and, at most, the same kind of read as the question's).
  return part.capabilities.every((capability) => capability === "fn.rank" || SET_READS.includes(capability)) && part.capabilities.every((capability) => capabilityKind(capability) !== "write");
}

/** Asking for recommendations ("推荐", "おすすめ", "recommend", "worth going"). */
const RECOMMEND_WORDS = /(推荐|值得去|值得参加|おすすめ|オススメ|お勧め|\brecommend(?:ed|ation|ations|s)?\b|\bworth (?:going|attending)\b|\bsuggest(?:ions?)?\b)/iu;

/**
 * AG14 dev run 2 (AE-MEM-002): "来週のおすすめイベントを教えて。" came tagged as a plain read of events (no fn.rank), which
 * this version answers with "cannot search the directory by conditions". Asking which events are recommended is asking
 * to pick: a part that only reads events, names none of them and asks for recommendations is a ranking — it is ranked
 * by what is saved, or asked about once when nothing is.
 */
export function recommendIsRanking(parts: GraphPart[], message: string): string[] {
  const changed: string[] = [];
  for (const part of parts) {
    if (part.capabilities.length !== 1 || part.capabilities[0] !== "event.read") continue;
    if (part.plan.negation || part.plan.hypothesis || part.refs.some((ref) => ref.recordId)) continue;
    if (!RECOMMEND_WORDS.test(message.slice(part.quote[0], part.quote[1]))) continue;
    part.capabilities = ["event.read", "fn.rank"];
    part.plan = { ...part.plan, deliverable: "ranked_list", rank: part.plan.rank ?? {} };
    changed.push(part.localId);
  }
  return changed;
}

export function mergePickIntoQuestion(parts: GraphPart[], message: string): { parts: GraphPart[]; merged: { pick: string; into: string }[] } {
  const merged: { pick: string; into: string }[] = [];
  const out = [...parts];
  for (const pick of [...out].sort((left, right) => left.quote[0] - right.quote[0])) {
    if (!isBarePick(pick)) continue;
    // The question it depends on, else the part right before it in the message.
    const before = out.filter((other) => other !== pick && other.quote[1] <= pick.quote[0]).sort((left, right) => right.quote[1] - left.quote[1])[0];
    const depended = out.find((other) => other !== pick && pick.dependsOn.includes(other.localId) && isQuestionOfSet(other));
    const question = depended ?? (before && isQuestionOfSet(before) ? before : undefined);
    if (!question || question.quote[1] > pick.quote[0] || !GAP.test(message.slice(question.quote[1], pick.quote[0]))) continue;
    // A pick that names a read of its own is bare only when it says it depends on the question and reads nothing else
    // (dev run 2: "帮我挑两场。" came tagged fn.rank + event.read, depending on the question before it).
    const ownReads = pick.capabilities.filter((capability) => SET_READS.includes(capability));
    if (ownReads.length && !(depended === question && ownReads.every((capability) => question.capabilities.includes(capability)))) continue;
    question.quote = [question.quote[0], pick.quote[1]];
    question.capabilities = [...new Set([...question.capabilities, ...pick.capabilities])];
    question.plan = {
      ...question.plan,
      clarity: "clear",
      deliverable: "ranked_list",
      rank: { ...(question.plan.rank ?? {}), ...(pick.plan.rank ?? {}) },
      ...(question.plan.readFilter ?? pick.plan.readFilter ? { readFilter: question.plan.readFilter ?? pick.plan.readFilter } : {}),
    };
    question.dependsOn = question.dependsOn.filter((id) => id !== pick.localId);
    out.splice(out.indexOf(pick), 1);
    for (const other of out) if (other.dependsOn.includes(pick.localId)) other.dependsOn = [...new Set(other.dependsOn.map((id) => (id === pick.localId ? question.localId : id)).filter((id) => id !== other.localId))];
    merged.push({ into: question.localId, pick: pick.localId });
  }
  return { merged, parts: out };
}
