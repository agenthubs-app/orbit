/**
 * QA-C4: people who connected through an invite code have both agreed to be
 * connected, so they may message each other without a separate relationship
 * invitation. This module reads the active invite connection for one of my
 * contacts and, for conversations where I am the invitee, which of my own
 * contacts stands for the other person (so every reader hands each side its
 * own contact id, not the other account's).
 *
 * The invite tables are created by the invite-codes migration on first use;
 * before that (or in a schema without them) every lookup answers "none"
 * without running a failing statement, so a surrounding transaction is safe.
 */
export interface RelationshipInviteLink {
  inviterAccountId: string;
  inviterContactId: string;
  redeemerAccountId: string;
  redeemerContactId: string;
}

export interface RelationshipInviteLinks {
  /** The active invite connection that placed `contactId` in `accountId`'s network. */
  forContact(accountId: string, contactId: string): Promise<RelationshipInviteLink | null>;
  /** For each peer account: my contact id of that person through an active invite connection. */
  myContactIds(accountId: string, peerAccountIds: readonly string[]): Promise<Map<string, string>>;
}

interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

interface LinkRow {
  inviter_actor_id: string;
  inviter_contact_id: string;
  redeemer_actor_id: string;
  redeemer_contact_id: string;
}

async function tablePresent(client: Queryable): Promise<boolean> {
  const result = await client.query<{ present: boolean }>("select to_regclass('invite_connections') is not null as present");
  return result.rows[0]?.present === true;
}

function linkFrom(row: LinkRow): RelationshipInviteLink {
  return {
    inviterAccountId: row.inviter_actor_id,
    inviterContactId: row.inviter_contact_id,
    redeemerAccountId: row.redeemer_actor_id,
    redeemerContactId: row.redeemer_contact_id,
  };
}

export function createPostgresRelationshipInviteLinks(client: Queryable, workspaceId: string): RelationshipInviteLinks {
  return {
    async forContact(accountId, contactId) {
      if (!accountId || !contactId || !(await tablePresent(client))) return null;
      const result = await client.query<LinkRow>(
        `select inviter_actor_id, inviter_contact_id, redeemer_actor_id, redeemer_contact_id from invite_connections
          where workspace_id = $1 and unlinked_at is null
            and ((inviter_actor_id = $2 and inviter_contact_id = $3) or (redeemer_actor_id = $2 and redeemer_contact_id = $3))
          order by created_at desc limit 1`,
        [workspaceId, accountId, contactId],
      );
      return result.rows[0] ? linkFrom(result.rows[0]) : null;
    },
    async myContactIds(accountId, peerAccountIds) {
      const peers = [...new Set(peerAccountIds.filter((id) => id && id !== accountId))];
      const mapped = new Map<string, string>();
      if (!accountId || !peers.length || !(await tablePresent(client))) return mapped;
      const result = await client.query<LinkRow>(
        `select inviter_actor_id, inviter_contact_id, redeemer_actor_id, redeemer_contact_id from invite_connections
          where workspace_id = $1 and unlinked_at is null
            and ((inviter_actor_id = $2 and redeemer_actor_id = any($3::text[])) or (redeemer_actor_id = $2 and inviter_actor_id = any($3::text[])))`,
        [workspaceId, accountId, peers],
      );
      for (const row of result.rows) {
        const link = linkFrom(row);
        if (link.inviterAccountId === accountId) mapped.set(link.redeemerAccountId, link.inviterContactId);
        else mapped.set(link.inviterAccountId, link.redeemerContactId);
      }
      return mapped;
    },
  };
}

/**
 * Conversation rows name the inviter's contact. Where I am the invitee and the
 * other person is in my network through an invite code, my own contact id is
 * used instead; otherwise the row is unchanged.
 */
export async function withMyContactIds<T extends { contactId: string; participantAccountIds?: readonly string[] }>(
  links: RelationshipInviteLinks | null | undefined,
  accountId: string,
  rows: readonly T[],
): Promise<T[]> {
  const inviteeRows = rows.filter((row) => row.participantAccountIds?.[1] === accountId && row.participantAccountIds[0] !== accountId);
  if (!links || !inviteeRows.length) return [...rows];
  const mine = await links.myContactIds(accountId, inviteeRows.map((row) => row.participantAccountIds![0]!));
  if (!mine.size) return [...rows];
  return rows.map((row) => {
    if (row.participantAccountIds?.[1] !== accountId) return row;
    const contactId = mine.get(row.participantAccountIds[0]!);
    return contactId ? { ...row, contactId } : row;
  });
}
