import assert from "node:assert/strict";
import test from "node:test";

import { createAppointmentInitialProposalBoundary, createAppointmentInitialProposalHandlers } from "../../app/api/appointments/initial-proposal-handlers";
import { createConversationMessagesPostHandler } from "../../app/api/relationship-communication/handler";
import { createRelationshipPageGetHandler } from "../../app/api/relationship-communication/read-handler";
import { createPostgresAppointmentRepository } from "../../features/appointments/postgres-repository";
import { createAppointmentService } from "../../features/appointments/service";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runInviteCodeMigrations } from "../../features/invite-codes/migrations";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { createPostgresRelationshipEventExchanges } from "../../features/relationship-communication/event-exchange-link";
import { createPostgresRelationshipInviteLinks } from "../../features/relationship-communication/invite-link";
import { createPostgresRelationshipMeetingProposals } from "../../features/relationship-communication/meeting-proposals";
import { createRelationshipCommunicationService, type RelationshipCommunicationActor } from "../../features/relationship-communication/service";
import type { RelationshipMessagesSyncSource } from "../../features/sync/domain-registry";
import { readRelationshipDomainPage, readRelationshipDomainSummary } from "../../features/sync/relationship-message-domain-reader";
import { connect, createRelationshipHarness, relationshipPostgresSkip as skip, type RelationshipHarness } from "../support/relationship-message-harness";

/**
 * R39 (contact-reach D1/D2/D2b/D3) against real PostgreSQL: one private schema
 * holding the orbit_records + relationship message tables, the real
 * appointment and invite-code migrations, and the event-exchange columns the
 * readers use. Every service, store and reader is the production one.
 */
const A: RelationshipCommunicationActor = { accountId: "account:reach-a", displayName: "Aiko", email: "aiko@reach.test" };
const B: RelationshipCommunicationActor = { accountId: "account:reach-b", displayName: "Ben", email: "ben@reach.test" };
const C: RelationshipCommunicationActor = { accountId: "account:reach-c", displayName: "Chen", email: "chen@reach.test" };
const D: RelationshipCommunicationActor = { accountId: "account:reach-d", displayName: "Dana", email: "dana@reach.test" };
// Event exchange A↔B; invite code A↔C; email invitation A→D; a plain name card of A.
const A_OF_B = "contact:a:ben", B_OF_A = "contact:b:aiko", A_OF_B_MERGED = "contact:a:ben-merged";
const A_OF_C = "contact:a:chen", C_OF_A = "contact:c:aiko";
const A_OF_D = "contact:a:dana";
const A_CARD = "contact:a:card-only";
const NAMES: Record<string, string> = { [A_OF_B]: "Ben", [A_OF_B_MERGED]: "Ben", [B_OF_A]: "Aiko", [A_OF_C]: "Chen", [C_OF_A]: "Aiko", [A_OF_D]: "Dana", [A_CARD]: "Card Person" };
const OWNERS: Record<string, string> = { [A_OF_B]: A.accountId, [A_OF_B_MERGED]: A.accountId, [B_OF_A]: B.accountId, [A_OF_C]: A.accountId, [C_OF_A]: C.accountId, [A_OF_D]: A.accountId, [A_CARD]: A.accountId };
const SECRET = "relationship-contact-reach-cursor-secret-xxxxxxxxxxxx";

const proposal = (days: number[], note = "") => ({
  candidateTimes: days.map((day) => ({ startsAtUtc: `2026-12-${String(day).padStart(2, "0")}T01:00:00.000Z` })),
  durationMinutes: 60, medium: { kind: "video" as const, provider: "google_meet" as const, joinUrl: null }, note, timezone: "Asia/Tokyo",
});

async function setup(t: { after(fn: () => Promise<void>): void }) {
  const h = await createRelationshipHarness({ prefix: "rel_reach" });
  const events = createEventOperationsPostgresClient({ connectionString: process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!, pool: h.pool });
  const runtime = { client: events, workspaceId: h.workspaceId };
  t.after(() => h.close());
  await runAppointmentMigrations(events);
  await runInviteCodeMigrations(h.client);
  // The event-exchange columns the readers use (event operations migration shape, without the
  // membership/event foreign keys an accepted exchange needs upstream of these rows).
  await h.pool.query(`drop table event_ops_relationship_evidence, event_ops_relationship_sides, event_ops_relationship_pairs, event_ops_contact_requests cascade;
    create table event_ops_contact_requests (workspace_id text not null, request_id text not null, event_id text not null,
      requester_actor_id text not null, target_actor_id text not null, status text not null, relationship_pair_id text, primary key (workspace_id, request_id));
    create table event_ops_relationship_sides (workspace_id text not null, relationship_pair_id text not null, owner_actor_id text not null,
      other_actor_id text not null, contact_id text not null, created_at timestamptz not null default now(),
      primary key (workspace_id, relationship_pair_id, owner_actor_id), unique (workspace_id, owner_actor_id, contact_id))`);
  await h.pool.query(`insert into event_ops_contact_requests values ($1, 'request:ab', 'event:summit', $2, $3, 'accepted', 'pair:ab')`, [h.workspaceId, A.accountId, B.accountId]);
  await h.pool.query(`insert into event_ops_relationship_sides (workspace_id, relationship_pair_id, owner_actor_id, other_actor_id, contact_id)
    values ($1, 'pair:ab', $2, $3, $4), ($1, 'pair:ab', $3, $2, $5)`, [h.workspaceId, A.accountId, B.accountId, A_OF_B, B_OF_A]);
  await h.pool.query(`insert into invite_codes (workspace_id, id, actor_id, code, expires_at) values ($1, 'code-a', $2, '23456789', now() + interval '1 day')`, [h.workspaceId, A.accountId]);
  await linkInvite(h, "conn-ac-1");

  let clock = Date.parse("2026-11-20T00:00:00.000Z");
  const now = () => new Date(clock += 1000).toISOString();
  const setClock = (iso: string) => { clock = Date.parse(iso); };
  const links = createPostgresRelationshipInviteLinks(h.client, h.workspaceId);
  const service = (actor: RelationshipCommunicationActor, withMeetings = true) => createRelationshipCommunicationService({
    actor, invitationBaseUrl: "https://orbit.example/app/invitations", messages: h.messages, store: h.store, workspaceId: h.workspaceId, now,
    inviteLinks: links, eventExchanges: createPostgresRelationshipEventExchanges(h.client, h.workspaceId),
    meetings: withMeetings ? createPostgresRelationshipMeetingProposals({ runtime, now }) : null,
    resolveContact: async (contactId, accountId) => OWNERS[contactId] === accountId ? { contactId, displayName: NAMES[contactId]!, organization: "" } : null,
  });
  const appointments = createAppointmentService({ now, repository: createPostgresAppointmentRepository(runtime), authorityVerifier: { resolveAcceptedBilateralContact: async () => null } });
  const count = async (table: string, where = "true", values: unknown[] = []) => (await h.pool.query(`select count(*)::int as n from ${table} where ${where}`, values)).rows[0].n as number;
  return { h, runtime, service, appointments, count, now, setClock };
}

async function linkInvite(h: RelationshipHarness, id: string) {
  await h.pool.query(`insert into invite_connections (workspace_id, id, code_id, inviter_actor_id, redeemer_actor_id, outcome, inviter_contact_id, redeemer_contact_id,
      inviter_contact_created, redeemer_contact_created, redeemer_idempotency_key) values ($1, $2, 'code-a', $3, $4, 'connected', $5, $6, true, true, $2)`,
  [h.workspaceId, id, A.accountId, C.accountId, A_OF_C, C_OF_A]);
}

/** The state invite-codes `unlink` leaves on the connection (it never touches conversations or appointments). */
async function unlinkInvite(h: RelationshipHarness, id: string, keepAsContact: boolean) {
  await h.pool.query(`update invite_connections set unlinked_at = now(), unlinked_by = $3, unlink_kept = $4, unlink_idempotency_key = $2 where workspace_id = $1 and id = $2`,
    [h.workspaceId, id, A.accountId, keepAsContact]);
}

const routeActor = (who: RelationshipCommunicationActor, workspaceId: string) => ({ id: who.accountId, accountId: who.accountId, name: who.displayName, email: who.email, workspaceId });
type Json = { success: boolean; data?: any; error?: { code: string; message: string; context?: Record<string, string> } };

function initialProposalRoutes(h: RelationshipHarness, runtime: { client: ReturnType<typeof createEventOperationsPostgresClient>; workspaceId: string }, who: RelationshipCommunicationActor) {
  const handlers = createAppointmentInitialProposalHandlers({ resolveActor: async () => routeActor(who, h.workspaceId),
    boundary: (workspaceId, contactId) => createAppointmentInitialProposalBoundary(runtime, workspaceId, contactId) });
  const call = async (response: Promise<Response>) => { const r = await response; return { status: r.status, body: await r.json() as Json }; };
  const url = "https://orbit.example/api/appointments/initial-proposal";
  return {
    available: (contactId: string) => call(handlers.GET(new Request(`${url}?contactId=${encodeURIComponent(contactId)}`))),
    create: (contactId: string, key: string, days: number[]) => call(handlers.POST(new Request(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ contactId, proposal: proposal(days) }) }))),
  };
}

test("SC-R39-01 eligibility: event exchange opens one conversation per pair; name cards and email-only contacts cannot receive proposals", { skip, timeout: 120_000 }, async (t) => {
  const { h, runtime, service, count } = await setup(t);

  // Name card: nothing (only the existing invitation path).
  const card = await service(A).getEligibility(A_CARD);
  assert.equal(card.canStart ?? false, false);
  assert.equal(card.canSend, false);
  assert.equal(card.canProposeMeeting, false);
  assert.equal(card.canInvite, true);
  assert.equal((await initialProposalRoutes(h, runtime, A).available(A_CARD)).body.data.available, false);
  await assert.rejects(service(A).startConversation(A_CARD), /not available/i);

  // Email invitation only: can message, cannot propose (no bilateral contact records).
  await connect(h, A, D, A_OF_D);
  const email = await service(A).getEligibility(A_OF_D);
  assert.equal(email.canSend, true);
  assert.equal(email.canProposeMeeting, false);
  assert.equal(email.activeAppointmentId, null);

  // Invite code: start + propose.
  const invite = await service(A).getEligibility(A_OF_C);
  assert.deepEqual([invite.canStart, invite.canSend, invite.canProposeMeeting], [true, false, true]);

  // Event exchange: start + propose; before R39 it was a dead end.
  const before = await service(A).getEligibility(A_OF_B);
  assert.deepEqual([before.canStart, before.canSend, before.canProposeMeeting, before.status], [true, false, true, "unregistered"]);
  assert.equal(before.activeAppointmentId, null);
  // Without the meetings dependency proposals are simply off.
  assert.equal((await service(A, false).getEligibility(A_OF_B)).canProposeMeeting ?? false, false);

  // Both people start at the same moment: one conversation.
  const [fromA, fromB] = await Promise.all([service(A).startConversation(A_OF_B), service(B).startConversation(B_OF_A)]);
  assert.equal(fromA.conversationId, fromB.conversationId);
  assert.equal(fromA.canSend, true);
  assert.equal(fromA.canProposeMeeting, true);
  assert.equal(fromB.remoteAccount?.accountId, A.accountId);
  assert.equal(await count("relationship_conversations", "(inviter_account_id = $1 and invitee_account_id = $2) or (inviter_account_id = $2 and invitee_account_id = $1)", [A.accountId, B.accountId]), 1);
  // Starting again and reading eligibility from either side: the same conversation.
  assert.equal((await service(B).startConversation(B_OF_A)).conversationId, fromA.conversationId);
  assert.equal((await service(B).getEligibility(B_OF_A)).conversationId, fromA.conversationId);
  assert.equal((await service(A).getEligibility(A_OF_B)).conversationId, fromA.conversationId);

  // Each side reads its own contact id of the other person.
  const reader = (who: RelationshipCommunicationActor) => createRelationshipBoundedReader({ client: h.client, workspaceId: h.workspaceId, actorId: who.accountId, cursorSecret: SECRET,
    inviteLinks: createPostgresRelationshipInviteLinks(h.client, h.workspaceId) });
  const contactOf = async (who: RelationshipCommunicationActor) => (await reader(who).conversations({ conversationId: fromA.conversationId })).items[0]?.contactId;
  assert.deepEqual([await contactOf(A), await contactOf(B)].sort(), [A_OF_B, B_OF_A].sort());

  // A merges Ben into another contact: the exchange now names the merged contact; the pair still has the same conversation.
  await h.pool.query("update event_ops_relationship_sides set contact_id = $3 where workspace_id = $1 and owner_actor_id = $2", [h.workspaceId, A.accountId, A_OF_B_MERGED]);
  const merged = await service(A).getEligibility(A_OF_B_MERGED);
  assert.equal(merged.conversationId, fromA.conversationId);
  assert.equal(merged.canProposeMeeting, true);
  assert.equal((await service(A).startConversation(A_OF_B_MERGED)).conversationId, fromA.conversationId);
  assert.equal(await count("relationship_conversations"), 2, "email and event — nothing new after the merge");
});

test("SC-R39-02 invite-code connections can receive proposals until unlinked (both keepAsContact modes); existing appointments stay readable", { skip, timeout: 120_000 }, async (t) => {
  const { h, runtime, service, appointments } = await setup(t);
  const routes = initialProposalRoutes(h, runtime, A);
  assert.equal((await routes.available(A_OF_C)).body.data.available, true);
  const created = await routes.create(A_OF_C, "invite-proposal-1", [10, 11, 12]);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const appointmentId = created.body.data.appointmentId as string;
  const stored = await appointments.get({ actorId: C.accountId, appointmentId });
  assert.equal(stored.eventId, null);
  assert.equal(stored.authorityRequestId, "invite:conn-ac-1");
  assert.deepEqual(stored.contactIdsByActor, { [A.accountId]: A_OF_C, [C.accountId]: C_OF_A });
  assert.equal(stored.status, "awaiting_response");
  assert.equal((await service(A).getEligibility(A_OF_C)).activeAppointmentId, appointmentId, "no conversation yet; the pair is known from the link");

  // Unlink keeping the contact: no new proposal, the old appointment is still readable by both.
  await unlinkInvite(h, "conn-ac-1", true);
  assert.equal((await routes.available(A_OF_C)).body.data.available, false);
  const refused = await routes.create(A_OF_C, "invite-proposal-2", [13, 14, 15]);
  assert.equal(refused.status, 403);
  assert.equal((await service(A).getEligibility(A_OF_C)).canProposeMeeting, false);
  assert.equal((await appointments.get({ actorId: A.accountId, appointmentId })).appointmentId, appointmentId);
  assert.equal((await appointments.get({ actorId: C.accountId, appointmentId })).appointmentId, appointmentId);

  // Linked again, then unlinked without keeping the contact: same result.
  await linkInvite(h, "conn-ac-2");
  assert.equal((await routes.available(A_OF_C)).body.data.available, true);
  assert.equal((await initialProposalRoutes(h, runtime, C).available(C_OF_A)).body.data.available, true, "either side may propose");
  await unlinkInvite(h, "conn-ac-2", false);
  assert.equal((await routes.available(A_OF_C)).body.data.available, false);
  assert.equal((await routes.create(A_OF_C, "invite-proposal-3", [16, 17, 18])).status, 403);
  assert.equal((await appointments.get({ actorId: C.accountId, appointmentId })).status, "awaiting_response");

  // The event-exchange path is unchanged: still available (and wins over an invite link).
  assert.equal((await routes.available(A_OF_B)).body.data.available, true);
});

test("SC-R39-03 a message with a proposal is one atomic command: rollback, read chain, idempotency, D2b conflicts", { skip, timeout: 120_000 }, async (t) => {
  const { h, service, appointments, count, setClock } = await setup(t);
  const started = await service(A).startConversation(A_OF_B);
  const conversationId = started.conversationId!;
  const deps = (who: RelationshipCommunicationActor) => ({ resolveActor: async () => routeActor(who, h.workspaceId), createService: () => service(who) });
  const send = async (who: RelationshipCommunicationActor, key: string, body: Record<string, unknown>, id = conversationId) => {
    const response = await createConversationMessagesPostHandler(deps(who))(new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
    return { status: response.status, body: await response.json() as Json };
  };
  const base = { qualificationVersion: started.qualificationVersion };

  // A failing message insert leaves no appointment, no outbox event, no receipt and no message.
  await h.pool.query("alter table relationship_messages add constraint r39_reject_messages check (false) not valid");
  const failed = await send(A, "atomic-1", { ...base, body: "Shall we meet?", proposal: proposal([1, 2, 3]) });
  // The message insert runs after the appointment insert in the same transaction, so this failure undoes both.
  assert.match(failed.body.error?.message ?? "", /r39_reject_messages/, JSON.stringify(failed));
  for (const table of ["appointment_aggregates", "appointment_outbox", "appointment_command_receipts", "relationship_messages"]) assert.equal(await count(table), 0, table);
  await h.pool.query("alter table relationship_messages drop constraint r39_reject_messages");

  // Success: 201, the receipt, the stored message, GET messages and the sync reader all carry the appointment id.
  const sent = await send(A, "atomic-1", { ...base, body: "Shall we meet?", proposal: proposal([1, 2, 3], "Coffee") });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const appointmentId = sent.body.data.message.appointmentId as string;
  assert.match(appointmentId, /^appointment:/);
  const appointment = await appointments.get({ actorId: B.accountId, appointmentId });
  assert.deepEqual([appointment.status, appointment.ownerActorId, appointment.inviteeActorId, appointment.eventId], ["awaiting_response", A.accountId, B.accountId, "event:summit"]);
  assert.equal(appointment.proposals[0]?.note, "Coffee");
  assert.deepEqual((await h.pool.query("select event_type from appointment_outbox")).rows.map((row) => row.event_type), ["appointment.proposed"]);
  assert.equal((await service(B).getConversation(conversationId)).messages.at(-1)?.appointmentId, appointmentId);
  const reader = createRelationshipBoundedReader({ client: h.client, workspaceId: h.workspaceId, actorId: B.accountId, cursorSecret: SECRET });
  const page = await createRelationshipPageGetHandler("messages", { resolveActor: async () => routeActor(B, h.workspaceId), service: () => reader })(
    new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(conversationId)}/messages`), { params: Promise.resolve({ id: conversationId }) });
  const pageBody = await page.json() as Json;
  assert.equal(pageBody.data.items.at(-1).appointmentId, appointmentId);
  const summary = await readRelationshipDomainSummary(h.client, { workspaceId: h.workspaceId, actorId: B.accountId });
  const synced = await readRelationshipDomainPage(h.client, { view: "messages" } as RelationshipMessagesSyncSource,
    { workspaceId: h.workspaceId, actorId: B.accountId, afterRevision: "0", highWatermark: summary.watermarks.messages, limit: 50 });
  assert.equal(synced.changes.at(-1)?.payload?.appointmentId, appointmentId);

  // Replays: same key and content → the original message and appointment; different content → REQUEST_REUSED.
  const replay = await send(A, "atomic-1", { ...base, body: "Shall we meet?", proposal: proposal([3, 2, 1], "Coffee") });
  assert.equal(replay.status, 201);
  assert.deepEqual([replay.body.data.message.messageId, replay.body.data.message.appointmentId], [sent.body.data.message.messageId, appointmentId]);
  assert.equal(await count("appointment_aggregates"), 1);
  for (const reused of [
    { ...base, body: "Shall we meet?", proposal: proposal([4, 5, 6], "Coffee") },
    { ...base, body: "Shall we meet?" },
    { ...base, body: "Different words", proposal: proposal([1, 2, 3], "Coffee") },
  ]) {
    const response = await send(A, "atomic-1", reused);
    assert.equal(response.status, 409);
    assert.equal(response.body.error?.context?.reason, "REQUEST_REUSED");
  }
  const plainKey = await send(A, "plain-1", { ...base, body: "Plain" });
  assert.equal(plainKey.body.data.message.appointmentId, undefined, "a plain message keeps its pre-R39 shape");
  assert.equal((await send(A, "plain-1", { ...base, body: "Plain", proposal: proposal([1, 2, 3]) })).body.error?.context?.reason, "REQUEST_REUSED");

  // D2b: an ongoing meeting blocks a new proposal from either side (409 with its id); nothing is written.
  const messagesBefore = await count("relationship_messages");
  const blocked = await send(B, "atomic-2", { ...base, body: "Another time?", proposal: proposal([7, 8, 9]) });
  assert.equal(blocked.status, 409);
  assert.deepEqual([blocked.body.error?.context?.reason, blocked.body.error?.context?.appointmentId], ["MEETING_ALREADY_ACTIVE", appointmentId]);
  assert.equal(await count("relationship_messages"), messagesBefore);
  assert.equal((await service(A).getEligibility(A_OF_B)).activeAppointmentId, appointmentId);

  // Invalid proposals are rejected before anything is written.
  const invalid = await send(A, "atomic-bad", { ...base, body: "Bad", proposal: { ...proposal([1, 2]) } });
  assert.equal(invalid.status, 400);

  // Confirmed and still upcoming: still blocked. Confirmed and over: completed first, then the new proposal.
  const confirmed = await appointments.command({ actorId: B.accountId, appointmentId, command: "accept", candidateId: appointment.proposals[0]!.candidateTimes[0]!.candidateId,
    expectedVersion: appointment.version, idempotencyKey: "accept-1" });
  assert.equal(confirmed.appointment.status, "confirmed");
  assert.equal((await send(B, "atomic-3", { ...base, body: "Again?", proposal: proposal([20, 21, 22]) })).status, 409);
  setClock("2026-12-05T00:00:00.000Z");
  const next = await send(B, "atomic-4", { ...base, body: "Again?", proposal: proposal([20, 21, 22]) });
  assert.equal(next.status, 201, JSON.stringify(next.body));
  assert.notEqual(next.body.data.message.appointmentId, appointmentId);
  assert.equal((await appointments.get({ actorId: A.accountId, appointmentId })).status, "completed");
  assert.equal((await appointments.get({ actorId: A.accountId, appointmentId: next.body.data.message.appointmentId })).ownerActorId, B.accountId);

  // An email-only conversation can message but never carries a proposal.
  const email = await connect(h, A, D, A_OF_D);
  const emailBefore = await count("relationship_messages");
  const noProposal = await send(A, "email-1", { qualificationVersion: email.qualificationVersion, body: "Meet?", proposal: proposal([20, 21, 22]) }, email.conversationId);
  assert.equal(noProposal.status, 403);
  assert.equal(noProposal.body.error?.context?.reason, "MEETING_NOT_AVAILABLE");
  assert.equal(await count("relationship_messages"), emailBefore);
  assert.equal((await send(A, "email-2", { qualificationVersion: email.qualificationVersion, body: "Hi" }, email.conversationId)).status, 201);
});

test("SC-R39-03 invite-code conversation: a proposal is accepted while linked and refused once unlinked", { skip, timeout: 120_000 }, async (t) => {
  const { h, service, count } = await setup(t);
  const started = await service(C).startConversation(C_OF_A);
  const sendWith = (key: string) => service(C).sendMessage({ body: "Lunch?", conversationId: started.conversationId!, qualificationVersion: started.qualificationVersion!, requestId: key, proposal: proposal([1, 2, 3]) });
  const sent = await sendWith("invite-msg-1");
  assert.ok(sent.message.appointmentId);
  assert.equal((await service(A).getEligibility(A_OF_C)).activeAppointmentId, sent.message.appointmentId);
  // Replay after the unlink still returns the delivered message (receipt before eligibility).
  await unlinkInvite(h, "conn-ac-1", true);
  assert.equal((await sendWith("invite-msg-1")).message.appointmentId, sent.message.appointmentId);
  await h.pool.query("update appointment_aggregates set status = 'cancelled'");
  await assert.rejects(sendWith("invite-msg-2"), (error: Error) => error.name === "RelationshipMeetingUnavailableError");
  assert.equal(await count("appointment_aggregates"), 1);
});

test("SC-R39-04 migration: the nullable appointment_id column on a new and an upgraded table; old rows read as null", { skip, timeout: 120_000 }, async (t) => {
  const { h } = await setup(t);
  const column = async () => (await h.pool.query(`select is_nullable, data_type from information_schema.columns
    where table_schema = $1 and table_name = 'relationship_messages' and column_name = 'appointment_id'`, [h.schema])).rows[0];
  assert.deepEqual(await column(), { is_nullable: "YES", data_type: "text" }, "new database");

  // A pre-R39 table with a pre-R39 message, then the same migration again.
  const { conversationId, qualificationVersion } = await connect(h, A, D, A_OF_D);
  await h.pool.query("alter table relationship_messages drop column appointment_id");
  await h.client.transaction(async (tx) => {
    const { acquireSyncCommitOrderLock } = await import("../../features/sync/commit-order-lock");
    await acquireSyncCommitOrderLock(tx);
    await tx.query(`with bumped as (update relationship_conversations set last_message_seq = last_message_seq + 1, last_message_at = now() where workspace_id = $1 and conversation_id = $2 returning last_message_seq)
      insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
      select $1, $2, last_message_seq, 'message:old', $3, 'Aiko', 'Before R39', now(), $4, 'old-1' from bumped`, [h.workspaceId, conversationId, A.accountId, qualificationVersion]);
  }, { isolation: "read committed" });
  assert.equal(await column(), undefined);
  const { runRelationshipMessageMigrations } = await import("../../features/relationship-communication/message-tables");
  await runRelationshipMessageMigrations(h.client);
  assert.deepEqual(await column(), { is_nullable: "YES", data_type: "text" }, "upgraded table");
  const page = await createRelationshipBoundedReader({ client: h.client, workspaceId: h.workspaceId, actorId: D.accountId, cursorSecret: SECRET }).messages(conversationId);
  assert.deepEqual(page.items.map((item) => [item.messageId, item.appointmentId ?? null]), [["message:old", null]]);
  assert.equal((await h.messages.message("message:old"))?.appointmentId, null);
});
