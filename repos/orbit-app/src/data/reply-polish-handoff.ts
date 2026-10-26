// QA-C4: "Polish" in a conversation opens iOrbit with a prefilled request; a version
// iOrbit suggests can come back into that conversation's reply box. The request text
// ties the iOrbit thread to the conversation, so other iOrbit threads never offer it.
const STALE_MS = 60 * 60 * 1000;

let pending: { conversationId: string; request: string; at: number } | null = null;
let chosen: { conversationId: string; text: string } | null = null;

export function beginReplyPolish(conversationId: string, request: string, now = Date.now()): void {
  pending = { conversationId, request: request.trim(), at: now };
  chosen = null;
}

/** The conversation an iOrbit thread that starts with `firstRequest` polishes for, if any. */
export function replyPolishTarget(firstRequest: string | undefined, now = Date.now()): string | null {
  if (!pending || now - pending.at > STALE_MS || !firstRequest || firstRequest.trim() !== pending.request) return null;
  return pending.conversationId;
}

export function chooseReplyPolish(conversationId: string, text: string): void {
  chosen = { conversationId, text: text.trim() };
  pending = null;
}

/** The chosen version for this conversation, once. */
export function takeReplyPolish(conversationId: string): string | null {
  if (!chosen || chosen.conversationId !== conversationId) return null;
  const { text } = chosen;
  chosen = null;
  return text;
}
