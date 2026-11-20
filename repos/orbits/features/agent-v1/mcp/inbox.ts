/**
 * agent-design AG17 (设计稿 §5.4, §10 站内收件箱; AG15 交接; approved visual draft board 9): the inbox line a new
 * external proposal writes — source «外部提议», titled «Claude 想改 2 项，等你确认», the card's own count line under it,
 * and it opens the confirm page (the proposal's own address; the card is shown there and in the inbox's right column).
 * The entry ends when the card does.
 */
import type { AgentActionRecord } from "../../agent/runtime/contract";
import type { InboxNotificationUpsert } from "../../notifications/inbox-record-service";
import { PROPOSAL_PAGE_PATH } from "./auth/config";
import type { StoredProposal } from "./confirm-link";
import type { AgentConnection } from "./connections";

const TITLE: Record<AgentConnection["locale"], (client: string, count: number) => string> = {
  en: (client, count) => `${client} wants to change ${count} ${count === 1 ? "item" : "items"} — waiting for you`,
  ja: (client, count) => `${client} が ${count} 件の変更を提案しています。確認をお待ちしています`,
  zh: (client, count) => `${client} 想改 ${count} 项，等你确认`,
};

export function externalProposalInboxEntry(input: { action: AgentActionRecord; connection: AgentConnection; proposal: Pick<StoredProposal, "id">; now: string }): InboxNotificationUpsert {
  const { action, connection } = input;
  const title = TITLE[connection.locale](connection.clientName, Math.max(1, action.operations.length));
  return {
    actions: ["read"],
    actorId: connection.accountId,
    ...(action.expiresAt ? { expiresAt: action.expiresAt } : {}),
    kind: "suggestion",
    object: { id: connection.id, name: connection.clientName },
    occurredAt: action.createdAt,
    origin: "automation",
    // The card's own count line («修改1项，新增1项»); the page adds when it stops being valid.
    reason: action.title,
    // One entry per card: proposing the same thing again with the same key writes nothing new.
    semanticKey: `agent-external-proposal:${action.actionId}`,
    sources: [{ excerpt: action.title.slice(0, 300), objectId: connection.id, occurredAt: action.createdAt, readAt: input.now, sourceId: action.actionId, sourceKind: "external_proposal", sourceRevision: `r${action.revision ?? 1}` }],
    // The confirm page of this proposal: only its opaque id, and only its owner's account can open it.
    target: { href: `${PROPOSAL_PAGE_PATH}/${input.proposal.id}`, id: action.actionId, kind: "card", status: "available" },
    title,
  };
}
