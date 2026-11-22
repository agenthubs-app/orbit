/**
 * What a client may keep on screen (设计稿 §7): the result document is the delivery, the event
 * channel is another way to read it. Whatever a client only received on the channel and the
 * stored document does not hold (a stopped turn's text, a revision the server never kept) is not
 * delivered: the client replaces it with the stored document. Pure; clients call it after reading
 * the documents back by requestId (AG07 wires it into both apps).
 */
import type { AgentResultDocument, AgentSessionEventContract } from "../../../shared/contract/agent-v1";

export interface UndeliveredFragment {
  requestId: string;
  revision: number;
  /** What the channel showed that the stored document does not have. */
  text: string | null;
  status: AgentResultDocument["status"];
}

/** The latest document per request among the channel events, in event order. */
export function documentsFromEvents(events: readonly AgentSessionEventContract[]): Map<string, AgentResultDocument> {
  const latest = new Map<string, AgentResultDocument>();
  for (const event of [...events].sort((left, right) => left.seq - right.seq)) {
    if (!event.document) continue;
    const known = latest.get(event.requestId);
    if (!known || event.document.revision >= known.revision) latest.set(event.requestId, event.document);
  }
  return latest;
}

function sameContent(left: AgentResultDocument, right: AgentResultDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reconcileClientView(
  received: ReadonlyMap<string, AgentResultDocument>,
  stored: ReadonlyMap<string, AgentResultDocument>,
): { show: Map<string, AgentResultDocument>; undelivered: UndeliveredFragment[] } {
  const show = new Map<string, AgentResultDocument>();
  const undelivered: UndeliveredFragment[] = [];
  for (const [requestId, document] of received) {
    const kept = stored.get(requestId);
    if (kept && sameContent(kept, document)) continue;
    const keptText = kept?.answer?.text ?? "";
    const shownText = document.answer?.text ?? null;
    undelivered.push({ requestId, revision: document.revision, status: document.status, text: shownText && !keptText.includes(shownText) ? shownText : null });
  }
  for (const [requestId, document] of stored) show.set(requestId, document);
  return { show, undelivered };
}
