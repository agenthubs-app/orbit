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

export function mergePickIntoQuestion(parts: GraphPart[], message: string): { parts: GraphPart[]; merged: { pick: string; into: string }[] } {
  const merged: { pick: string; into: string }[] = [];
  const out = [...parts];
  for (const pick of [...out].sort((left, right) => left.quote[0] - right.quote[0])) {
    if (!isBarePick(pick) || pick.capabilities.some((capability) => SET_READS.includes(capability))) continue;
    // The question it depends on, else the part right before it in the message.
    const before = out.filter((other) => other !== pick && other.quote[1] <= pick.quote[0]).sort((left, right) => right.quote[1] - left.quote[1])[0];
    const question = out.find((other) => other !== pick && pick.dependsOn.includes(other.localId) && isQuestionOfSet(other)) ?? (before && isQuestionOfSet(before) ? before : undefined);
    if (!question || question.quote[1] > pick.quote[0] || !GAP.test(message.slice(question.quote[1], pick.quote[0]))) continue;
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
