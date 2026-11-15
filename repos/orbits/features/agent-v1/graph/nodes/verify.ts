/**
 * verify (code): before delivery, every record the answer cites is checked again under the permissions
 * of now, so a source ref in the result document always opens (agent-design AG05-3, PLANNER 易错边界 4).
 * The check returns ids only. A citation that no longer opens is removed; a records part left with no
 * citation is not delivered (unfinished, with code's sentence). The result's sourceRefs are the
 * citations in the order the parts were said.
 */
import { gapWords } from "../../answer/gap-copy";
import { emitTrace } from "../../observability/trace";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

export function verifyNode({ deps, input, run }: NodeScope): GraphNode {
  return async (state: AgentGraphState) => {
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    const cited = parts.filter((part) => part.cites?.length);
    if (!cited.length) {
      run.sourceRefs = [];
      return {};
    }
    const refs = [...new Set(cited.flatMap((part) => part.cites ?? []))];
    // Platform events are not account records; they were read just now under the event rules.
    const accountRefs = refs.filter((ref) => !ref.startsWith("event:"));
    let visible: Set<string> | null = null;
    try {
      visible = deps.records ? await deps.records.visible(input.actorId, accountRefs) : new Set();
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "verify.visible" });
    }
    const words = gapWords(state.language);
    const dropped: string[] = [];
    for (const part of cited) {
      // When the check itself failed, the citations read moments ago stand (fail visibly in the trace above).
      const keep = (part.cites ?? []).filter((ref) => ref.startsWith("event:") || !visible || visible.has(ref));
      dropped.push(...(part.cites ?? []).filter((ref) => !keep.includes(ref)));
      part.cites = keep;
      if (!keep.length) {
        part.status = "unfinished";
        part.reason = "source_not_accessible";
        part.gaps = [...new Set([...(part.gaps ?? []), "unreadable"])];
        run.answers.delete(part.localId);
        run.gapLines.set(part.localId, [words.unreadableEarlier()]);
      }
    }
    if (dropped.length) emitTrace({ dropped, note: "cited records that no longer open are not delivered", type: "verify.cites_dropped" });
    const ordered = [...parts].sort((left, right) => left.quote[0] - right.quote[0]);
    run.sourceRefs = [...new Set(ordered.flatMap((part) => part.cites ?? []))];
    emitTrace({ sourceRefs: run.sourceRefs, type: "verify.done" });
    return { parts };
  };
}
