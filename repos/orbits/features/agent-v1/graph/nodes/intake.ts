/**
 * intake (code): the request context, the authorized @ references and the four things the first
 * layer sees (设计稿 §3.9, §3.10). No business record is read here except the @ contacts' own check.
 */
import { buildFirstLayerContext } from "../../context/build";
import { modelCallLimit } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { replyLanguage } from "../../route/handoff-copy";
import type { GraphNode, NodeScope } from "../deps";

export function intakeNode({ deps, input, run }: NodeScope): GraphNode {
  return async () => {
    const now = deps.now();
    const references = await deps.authorizeReferences(input.actorId, input.references);
    const [messages, state] = await Promise.all([
      deps.loadMessages(input.sessionId).catch(() => []),
      deps.sessionState.get(input.actorId, input.sessionId).catch(() => null),
    ]);
    const context = buildFirstLayerContext({ messages, now, references, state });
    run.context = context;
    const summary = { handles: context.handles.size, idle: context.idle, idleMinutes: context.idleMinutes === null ? null : Math.round(context.idleMinutes), messages: context.messages.length, openItems: context.openItems.length };
    emitTrace({
      ...summary,
      lastMentioned: context.lastMentioned.map((item) => ({ handle: item.handle, id: item.id, name: item.name, type: item.type })),
      references: references.map((item) => ({ id: item.id, name: item.name, type: item.type })),
      shownList: context.shownList.map((item) => ({ handle: item.handle, id: item.id, name: item.name, type: item.type })),
      type: "context.built",
    });
    return {
      asOf: now,
      budget: { limit: deps.modelCallLimit ?? modelCallLimit(), used: 0 },
      context: summary,
      language: replyLanguage(input.message, input.locale),
      messageRef: `request:${input.requestId}`,
      references: references.map((item) => item.id),
      requestId: input.requestId,
      sessionId: input.sessionId,
      timeZone: deps.timeZone ?? "Asia/Tokyo",
    };
  };
}
