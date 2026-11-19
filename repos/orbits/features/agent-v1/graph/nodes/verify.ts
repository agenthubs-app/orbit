/**
 * verify (code): before delivery, every record the answer cites is checked again under the permissions
 * of now, so a source ref in the result document always opens (agent-design AG05-3, PLANNER 易错边界 4).
 * The check returns ids only. A citation that no longer opens is removed; a records part left with no
 * citation is not delivered (unfinished, with code's sentence). The result's sourceRefs are the
 * citations in the order the parts were said.
 */
import { basisOf } from "../../answer/basis";
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
      run.basis = null;
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
    // AG09 run-04 (AE-WEB-004): a read part whose search came back empty does not say "nothing found" when another part of
    // the same turn whose words hold it (or that it holds) read and cited the record it refers to.
    const quoteOf = (part: GraphPart) => input.message.slice(part.quote[0], part.quote[1]);
    for (const part of parts) {
      if (!(part.gaps ?? []).includes("no_record") || part.cites?.length) continue;
      const own = quoteOf(part);
      const covering = parts.find((other) => other !== part && (other.cites?.length ?? 0) > 0 && (quoteOf(other).includes(own) || own.includes(quoteOf(other))));
      if (!covering) continue;
      const line = words.noRecord(own);
      const lines = run.gapLines.get(part.localId) ?? [];
      if (!lines.includes(line)) continue;
      run.gapLines.set(part.localId, lines.filter((item) => item !== line));
      emitTrace({ coveredBy: covering.localId, partId: part.localId, type: "verify.no_record_covered" });
    }
    const ordered = [...parts].sort((left, right) => left.quote[0] - right.quote[0]);
    run.sourceRefs = [...new Set(ordered.flatMap((part) => part.cites ?? []))];
    // AG07: the basis line and one link per cited record that was read in this request.
    run.basis = basisOf(run.sourceRefs, run.readSources, state.language);
    // AG07 (coordinator note): the basis line already says the answer rests on the user's notes; code's footnote
    // （以上出自你的笔记。） is not said a second time. Without a basis line it stays.
    if (run.basis) {
      for (const [partId, lines] of run.gapLines) run.gapLines.set(partId, lines.filter((line) => line !== words.fromNotes()));
    }
    emitTrace({ basis: run.basis ? { links: run.basis.links.length, text: run.basis.text } : null, sourceRefs: run.sourceRefs, type: "verify.done" });
    return { parts };
  };
}
