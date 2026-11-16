import type { AppointmentAuthorityVerifier } from "./service";
import { z } from "zod";
import { AppointmentError } from "./contract";
import { resolveAcceptedEventContactContext } from "./postgres-repository";
import { createConfiguredEventOperationsPostgresRuntime, type EventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";
import { createAppointmentInviteAuthorityReader, INVITE_AUTHORITY_PREFIX, type AppointmentInviteAuthorityReader } from "./invite-authority";

/** An accepted event exchange (eventId set), or R39: a live invite-code connection (eventId null, `invite:` reference). */
export interface ContactAuthorityContext { eventId: string | null; authorityReference: string }
interface ReaderInput {
  workspaceId: string;
  client: { query(sql: string, values: readonly unknown[]): Promise<{ rows: readonly unknown[] }> };
  verify: (input: { actorId: string; eventId: string; requestId: string }) => ReturnType<AppointmentAuthorityVerifier["resolveAcceptedBilateralContact"]>;
  /** R39: without an accepted event exchange, a live invite connection for the contact. */
  invite?: Pick<AppointmentInviteAuthorityReader, "read"> | null;
}
const key = z.string().min(1).max(256).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value));
const contextSchema = z.object({ eventId: key, authorityReference: key });
const SQL = `select request.event_id as "eventId", request.request_id as "authorityReference"
  from event_ops_relationship_sides side
  join event_ops_contact_requests request on request.workspace_id=side.workspace_id
    and request.relationship_pair_id=side.relationship_pair_id
  where side.workspace_id=$1 and side.owner_actor_id=$2 and side.contact_id=$3
    and request.status='accepted' and (request.requester_actor_id=$2 or request.target_actor_id=$2)
  order by request.request_id collate "C" limit 2`;

export function createAppointmentContactAuthorityReader(input: ReaderInput) {
  return { async read(actorId: string, contactId: string): Promise<ContactAuthorityContext | null> {
    if (![input.workspaceId, actorId, contactId].every(value => key.safeParse(value).success)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Invalid proposal contact identity.");
    const response = await input.client.query(SQL, [input.workspaceId, actorId, contactId]);
    const rows = z.array(contextSchema).max(2).parse(response.rows);
    if (rows.length > 1) throw new AppointmentError("APPOINTMENT_CONFLICT", "More than one accepted event context exists for this contact.");
    const context = rows[0];
    if (context && validAuthority(await input.verify({ actorId, eventId: context.eventId, requestId: context.authorityReference }), actorId, contactId, context.authorityReference)) return context;
    // R39: the event exchange path is unchanged; an invite connection is the fallback.
    return input.invite ? input.invite.read(actorId, contactId) : null;
  } };
}

type ResolvedAuthority = Awaited<ReturnType<AppointmentAuthorityVerifier["resolveAcceptedBilateralContact"]>>;

function validAuthority(authority: ResolvedAuthority, actorId: string, contactId: string, reference: string): boolean {
  return Boolean(authority && authority.authorityRequestId === reference && Object.keys(authority.contactIdsByActor).length === 2 && authority.contactIdsByActor[actorId] === contactId
    && authority.counterpartyActorId !== actorId && key.safeParse(authority.counterpartyActorId).success
    && key.safeParse(authority.contactIdsByActor[authority.counterpartyActorId]).success
    && key.safeParse(authority.relationshipPairId).success);
}

/**
 * The create-time recheck for one contact (initial proposal, R39 message with
 * a proposal): an event reference must still be an accepted bilateral
 * exchange, an `invite:` reference a live invite connection, and either must
 * still name the requested contact on the actor's side.
 */
export function createContactAppointmentAuthorityVerifier(runtime: EventOperationsPostgresRuntime, contactId: string): AppointmentAuthorityVerifier {
  const invite = createAppointmentInviteAuthorityReader(runtime);
  return {
    async resolveAcceptedBilateralContact(input) {
      const authority = input.eventId
        ? await resolveAcceptedEventContactContext({ actorId: input.actorId, eventId: input.eventId, requestId: input.authorityReference }, runtime)
        : input.authorityReference.startsWith(INVITE_AUTHORITY_PREFIX) ? await invite.resolve(input.actorId, input.authorityReference) : null;
      return authority?.contactIdsByActor[input.actorId] === contactId ? authority : null;
    },
  };
}

/** Event exchange first, then (R39) a live invite connection, both on one runtime. */
export function createRuntimeAppointmentContactAuthorityReader(runtime: EventOperationsPostgresRuntime) {
  return createAppointmentContactAuthorityReader({ client: runtime.client, workspaceId: runtime.workspaceId,
    verify: input => resolveAcceptedEventContactContext(input, runtime), invite: createAppointmentInviteAuthorityReader(runtime) });
}

export function createConfiguredAppointmentContactAuthorityReader(expectedWorkspaceId: string) {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;
  if (runtime.workspaceId !== expectedWorkspaceId) throw new Error("APPOINTMENT_STORAGE_UNAVAILABLE");
  return createRuntimeAppointmentContactAuthorityReader(runtime);
}
