/**
 * intake (code): the request context, the authorized @ references and the four things the first
 * layer sees (设计稿 §3.9, §3.10).
 *
 * AG05 (§3.6): every @ reference is authorized on its own; one that cannot be opened stays in the
 * context marked as such (the part that points at it asks to choose again) and does not fail the turn.
 * The records the conversation and the session state point at are checked again under the permissions
 * of now — by an existence check that returns ids only — and an earlier answer built on one that cannot
 * be read any more is not shown to the model again.
 */
import { buildFirstLayerContext } from "../../context/build";
import { modelCallLimit } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { replyLanguageOf } from "../../route/handoff-copy";
import type { GraphNode, NodeScope } from "../deps";
import { loadTurnMemory, withholdForgotten } from "../../domains/memory/turn";

const KNOWN = new Set(["contact", "memo", "todo", "schedule", "event"]);

/** "memo:note:abc" from a message's record ref, or the typed ref of a session-state record. */
function typedRef(type: string, id: string): string | null {
  return KNOWN.has(type) ? `${type}:${id}` : null;
}

export function intakeNode({ deps, input, run }: NodeScope): GraphNode {
  return async () => {
    const now = deps.now();
    const references = await deps.authorizeReferences(input.actorId, input.references);
    run.references = references;
    const [stored, state, memory] = await Promise.all([
      deps.loadMessages(input.sessionId).catch(() => []),
      deps.sessionState.get(input.actorId, input.sessionId).catch(() => null),
      // AG14: one read of the account's saved memory; the rules for every task are in force for the whole turn.
      loadTurnMemory(deps.memory, { actorId: input.actorId, now, timeZone: deps.timeZone ?? "Asia/Tokyo" }),
    ]);
    run.memory = memory;
    run.sessionState = state;
    // AG14 (设计稿 §6): a resumed conversation gets its personal context as the entries are now — an answer made with an
    // entry changed or deleted since, and the message a deleted entry came from, are not handed to the model again.
    const { messages, withheld } = withholdForgotten(stored, state?.memoryUses, memory.snapshot);
    if (withheld.stale || withheld.sources || (state?.memoryVersion !== undefined && memory.snapshot && state.memoryVersion !== memory.snapshot.version)) {
      emitTrace({ from: state?.memoryVersion ?? null, to: memory.snapshot?.version ?? null, type: "memory.context_rebuilt", withheld });
    }
    // AG05: re-check the records the context points at (ids only; no content is read here).
    const pointed = new Map<string, string>();
    for (const message of messages) {
      for (const ref of message.recordRefs ?? []) {
        const at = ref.indexOf(":");
        const typed = at > 0 ? typedRef(ref.slice(0, at), ref.slice(at + 1)) : null;
        if (typed) pointed.set(typed, ref.slice(at + 1));
      }
    }
    for (const item of [...(state?.lastMentioned ?? []), ...(state?.shownList?.items ?? [])]) {
      const typed = typedRef(item.type, item.id);
      if (typed) pointed.set(typed, item.id);
    }
    const inaccessible = new Set<string>();
    if (deps.records && pointed.size) {
      try {
        const visible = await deps.records.visible(input.actorId, [...pointed.keys()]);
        for (const [typed, id] of pointed) if (!visible.has(typed)) inaccessible.add(id);
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), type: "error", where: "intake.visible" });
      }
    }
    const context = buildFirstLayerContext({ inaccessible, messages, now, references, state });
    run.context = context;
    const summary = { handles: context.handles.size, idle: context.idle, idleMinutes: context.idleMinutes === null ? null : Math.round(context.idleMinutes), messages: context.messages.length, openItems: context.openItems.length };
    emitTrace({
      ...summary,
      ...(inaccessible.size ? { inaccessible: [...inaccessible] } : {}),
      lastMentioned: context.lastMentioned.map((item) => ({ handle: item.handle, id: item.id, name: item.name, type: item.type })),
      references: references.map((item) => ({ accessible: item.accessible !== false, id: item.id, name: item.name, type: item.type })),
      shownList: context.shownList.map((item) => ({ handle: item.handle, id: item.id, name: item.name, type: item.type })),
      type: "context.built",
    });
    return {
      asOf: now,
      budget: { limit: deps.modelCallLimit ?? modelCallLimit(), used: 0 },
      context: summary,
      // AG06 repair 1: until the first layer reports it; a Han-only message follows the session, else the locale.
      // AG14: a saved rule for every answer ("回答用日语") decides the reply language whatever language the message is in.
      language: memory.replyLanguage ?? replyLanguageOf(input.message, null, input.locale, context.messages.filter((item) => item.role === "user").map((item) => item.text)).language,
      messageRef: `request:${input.requestId}`,
      references: references.filter((item) => item.accessible !== false).map((item) => item.id),
      requestId: input.requestId,
      sessionId: input.sessionId,
      timeZone: deps.timeZone ?? "Asia/Tokyo",
    };
  };
}
