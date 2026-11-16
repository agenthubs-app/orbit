/**
 * R39 (contact-reach D1): two people whose name cards were exchanged and
 * accepted at an event both agreed to be connected, so either side may open a
 * conversation with the other (no separate relationship invitation).
 *
 * The exchange is bilateral only when the accepted contact request has both
 * canonical sides (event_ops_relationship_sides): mine, naming my contact of
 * the other person, and theirs. The event tables are created by the event
 * operations migration; before that (or in a schema without them) every lookup
 * answers "none" without running a failing statement, so a surrounding
 * transaction is safe.
 */
export interface RelationshipEventExchange {
  /** The other person's account. */
  peerAccountId: string;
}

export interface RelationshipEventExchanges {
  /** The accepted bilateral exchange that placed `contactId` in `accountId`'s network. */
  forContact(accountId: string, contactId: string): Promise<RelationshipEventExchange | null>;
  /** For each peer account: my contact id of that person through an accepted bilateral exchange. */
  myContactIds(accountId: string, peerAccountIds: readonly string[]): Promise<Map<string, string>>;
}

interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

async function tablesPresent(client: Queryable): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "select to_regclass('event_ops_relationship_sides') is not null and to_regclass('event_ops_contact_requests') is not null as present",
  );
  return result.rows[0]?.present === true;
}

// My side, the accepted request of the same pair, and the other person's side.
const BILATERAL = `from event_ops_relationship_sides mine
  join event_ops_relationship_sides theirs on theirs.workspace_id = mine.workspace_id
    and theirs.relationship_pair_id = mine.relationship_pair_id and theirs.owner_actor_id = mine.other_actor_id
  where mine.workspace_id = $1 and mine.owner_actor_id = $2 and mine.other_actor_id <> $2
    and exists (select 1 from event_ops_contact_requests request
      where request.workspace_id = mine.workspace_id and request.relationship_pair_id = mine.relationship_pair_id
        and request.status = 'accepted'
        and ((request.requester_actor_id = $2 and request.target_actor_id = mine.other_actor_id)
          or (request.target_actor_id = $2 and request.requester_actor_id = mine.other_actor_id)))`;

export function createPostgresRelationshipEventExchanges(client: Queryable, workspaceId: string): RelationshipEventExchanges {
  return {
    async forContact(accountId, contactId) {
      if (!accountId || !contactId || !(await tablesPresent(client))) return null;
      const result = await client.query<{ peer: string }>(
        `select mine.other_actor_id as peer ${BILATERAL} and mine.contact_id = $3
          order by mine.created_at desc, mine.relationship_pair_id limit 1`,
        [workspaceId, accountId, contactId],
      );
      const peer = result.rows[0]?.peer;
      return typeof peer === "string" && peer ? { peerAccountId: peer } : null;
    },
    async myContactIds(accountId, peerAccountIds) {
      const peers = [...new Set(peerAccountIds.filter((id) => id && id !== accountId))];
      const mapped = new Map<string, string>();
      if (!accountId || !peers.length || !(await tablesPresent(client))) return mapped;
      const result = await client.query<{ peer: string; contact_id: string }>(
        `select mine.other_actor_id as peer, mine.contact_id ${BILATERAL} and mine.other_actor_id = any($3::text[])
          order by mine.created_at desc, mine.relationship_pair_id`,
        [workspaceId, accountId, peers],
      );
      // Newest exchange first; the first one per peer wins.
      for (const row of result.rows) if (!mapped.has(row.peer)) mapped.set(row.peer, row.contact_id);
      return mapped;
    },
  };
}
