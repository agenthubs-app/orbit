/**
 * QA-C4: the signed-in account's relationship messages that contain every query
 * term, for the global search's conversations group. Only conversations the
 * account is an active member of (the same rule as the summary page); one row
 * per conversation, its newest match. The other person's name is the member
 * name stored with the conversation.
 */
import type { RelationshipMessageSearchRow } from "../../shared/compute/relationship-message-search";

interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

const SEARCH_SQL = `
  /* search:relationship-messages */
  with mine as (
    select me.conversation_id from relationship_conversation_members me
    join relationship_conversations c on c.workspace_id = me.workspace_id and c.conversation_id = me.conversation_id and c.status = 'active'
    where me.workspace_id = $1 and me.account_id = $2 and me.state = 'active'
  ), hits as (
    select distinct on (m.conversation_id) m.conversation_id, m.body, m.sent_at
    from mine join relationship_messages m on m.workspace_id = $1 and m.conversation_id = mine.conversation_id
    where m.body ilike all($3::text[])
    order by m.conversation_id, m.seq desc
  )
  select h.conversation_id, left(h.body, 2000) as body,
    to_char(h.sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as sent_at,
    coalesce((select left(o.display_name, 256) from relationship_conversation_members o
      where o.workspace_id = $1 and o.conversation_id = h.conversation_id and o.account_id <> $2 limit 1), '') as title
  from hits h order by h.sent_at desc limit $4`;

const likePattern = (term: string) => `%${term.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;

export async function searchRelationshipMessages(client: Queryable, input: {
  workspaceId: string; actorId: string; terms: readonly string[]; limit: number;
}): Promise<RelationshipMessageSearchRow[]> {
  const terms = input.terms.filter(Boolean).slice(0, 4);
  if (!input.actorId.trim() || !terms.length || input.limit < 1) return [];
  const result = await client.query<{ conversation_id: string; body: string; sent_at: string; title: string }>(
    SEARCH_SQL, [input.workspaceId, input.actorId, terms.map(likePattern), Math.min(input.limit, 20)],
  );
  return result.rows.map((row) => ({ body: row.body, conversationId: row.conversation_id, sentAt: row.sent_at, title: row.title }));
}
