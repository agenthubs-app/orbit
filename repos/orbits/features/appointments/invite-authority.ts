import { createHash } from "node:crypto";

/**
 * R39 (contact-reach D1): people connected by invite code may propose a
 * meeting to each other. The live invite connection already names both
 * people's contacts of each other, which is what an appointment's
 * `contactIdsByActor` needs. The connection is read again on every check
 * (`unlinked_at is null`), so an unlink — keeping the contact or not — stops
 * new proposals at once; appointments created before stay readable.
 *
 * Authority reference: `invite:<connection id>`; appointments created on it
 * have no event (`eventId: null`) and one relationship pair id per pair of
 * accounts, so the active-appointment unique index allows one ongoing
 * invite-based meeting per pair. Before the invite tables exist every lookup
 * answers "none" without running a failing statement.
 */
export const INVITE_AUTHORITY_PREFIX = "invite:";

interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

interface ConnectionRow {
  id: string;
  inviter_actor_id: string;
  inviter_contact_id: string;
  redeemer_actor_id: string;
  redeemer_contact_id: string;
}

export interface AppointmentInviteContext {
  eventId: null;
  authorityReference: string;
}

export interface AppointmentInviteAuthority {
  authorityRequestId: string;
  contactIdsByActor: Readonly<Record<string, string>>;
  counterpartyActorId: string;
  relationshipPairId: string;
}

/** One relationship pair id per pair of accounts (order-independent). */
export function inviteRelationshipPairId(accountId: string, otherAccountId: string): string {
  const [low, high] = [accountId, otherAccountId].sort();
  return `invite-pair:${createHash("sha256").update(`${low}\u0000${high}`).digest("hex").slice(0, 40)}`;
}

async function tablePresent(client: Queryable): Promise<boolean> {
  const result = await client.query<{ present: boolean }>("select to_regclass('invite_connections') is not null as present");
  return result.rows[0]?.present === true;
}

const COLUMNS = "id, inviter_actor_id, inviter_contact_id, redeemer_actor_id, redeemer_contact_id";

export function createAppointmentInviteAuthorityReader(input: { client: Queryable; workspaceId: string }) {
  const { client, workspaceId } = input;
  return {
    /** The live invite connection behind `contactId` in `actorId`'s network. */
    async read(actorId: string, contactId: string): Promise<AppointmentInviteContext | null> {
      if (!actorId || !contactId || !(await tablePresent(client))) return null;
      const result = await client.query<ConnectionRow>(
        `select ${COLUMNS} from invite_connections
          where workspace_id = $1 and unlinked_at is null
            and ((inviter_actor_id = $2 and inviter_contact_id = $3) or (redeemer_actor_id = $2 and redeemer_contact_id = $3))
          order by created_at desc limit 1`,
        [workspaceId, actorId, contactId],
      );
      const row = result.rows[0];
      return row ? { eventId: null, authorityReference: `${INVITE_AUTHORITY_PREFIX}${row.id}` } : null;
    },

    /** The live connection named by an `invite:` reference, from `actorId`'s side; null once unlinked. */
    async resolve(actorId: string, authorityReference: string): Promise<AppointmentInviteAuthority | null> {
      if (!actorId || !authorityReference.startsWith(INVITE_AUTHORITY_PREFIX)) return null;
      const connectionId = authorityReference.slice(INVITE_AUTHORITY_PREFIX.length);
      if (!connectionId || !(await tablePresent(client))) return null;
      const result = await client.query<ConnectionRow>(
        `select ${COLUMNS} from invite_connections
          where workspace_id = $1 and id = $2 and unlinked_at is null and (inviter_actor_id = $3 or redeemer_actor_id = $3)`,
        [workspaceId, connectionId, actorId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const counterpartyActorId = row.inviter_actor_id === actorId ? row.redeemer_actor_id : row.inviter_actor_id;
      return {
        authorityRequestId: authorityReference,
        // Each side's own contact of the other person.
        contactIdsByActor: { [row.inviter_actor_id]: row.inviter_contact_id, [row.redeemer_actor_id]: row.redeemer_contact_id },
        counterpartyActorId,
        relationshipPairId: inviteRelationshipPairId(actorId, counterpartyActorId),
      };
    },
  };
}

export type AppointmentInviteAuthorityReader = ReturnType<typeof createAppointmentInviteAuthorityReader>;
