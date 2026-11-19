/**
 * agent-design AG17 (设计稿 §5.4, §10 站内收件箱; AG15 交接): the inbox line a new external proposal writes — source
 * «外部提议», naming the client that proposed it and pointing at the card. The words are the card's own summary; the
 * entry ends when the card does.
 */
import type { AgentActionRecord } from "../../agent/runtime/contract";
import type { InboxNotificationUpsert } from "../../notifications/inbox-record-service";
import type { AgentConnection } from "./connections";

const TITLE: Record<AgentConnection["locale"], (client: string) => string> = {
  en: (client) => `${client} proposed a change for you to confirm`,
  ja: (client) => `${client} から変更の提案があります。確認をお待ちしています`,
  zh: (client) => `${client} 提了一项修改，等你确认`,
};

export function externalProposalInboxEntry(input: { action: AgentActionRecord; connection: AgentConnection; now: string }): InboxNotificationUpsert {
  const { action, connection } = input;
  const title = TITLE[connection.locale](connection.clientName);
  return {
    actions: ["read"],
    actorId: connection.accountId,
    ...(action.expiresAt ? { expiresAt: action.expiresAt } : {}),
    kind: "suggestion",
    object: { id: connection.id, name: connection.clientName },
    occurredAt: action.createdAt,
    origin: "automation",
    reason: action.preview,
    // One entry per card: proposing the same thing again with the same key writes nothing new.
    semanticKey: `agent-external-proposal:${action.actionId}`,
    sources: [{ excerpt: action.title.slice(0, 300), objectId: connection.id, occurredAt: action.createdAt, readAt: input.now, sourceId: action.actionId, sourceKind: "external_proposal", sourceRevision: `r${action.revision ?? 1}` }],
    target: { href: null, id: action.actionId, kind: "card", status: "available" },
    title,
  };
}
