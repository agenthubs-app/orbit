import assert from "node:assert/strict";
import test from "node:test";

import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { createPostgresRelationshipInviteLinks } from "../../features/relationship-communication/invite-link";
import { searchRelationshipMessages } from "../../features/relationship-communication/message-search";
import { createRelationshipCommunicationService } from "../../features/relationship-communication/service";
import { runInviteCodeMigrations } from "../../features/invite-codes/migrations";
import { createRelationshipHarness, relationshipPostgresSkip } from "../support/relationship-message-harness";

// QA-C4: people connected by invite code may message each other. Real PostgreSQL
// (private schema) with the real invite-codes migration and message tables.
const kato = { accountId: "account:kato", displayName: "Kato Account", email: "kato@orbit.test" };
const tester = { accountId: "account:tester", displayName: "Tester Account", email: "tester@orbit.test" };
const stranger = { accountId: "account:stranger", displayName: "Stranger", email: "stranger@orbit.test" };
// Kato owns the code; tester redeemed it. Each side has its own contact of the other.
const KATO_CONTACT_OF_TESTER = "contact:invite:kato-side";
const TESTER_CONTACT_OF_KATO = "contact:invite:tester-side";
const contacts: Record<string, { contactId: string; displayName: string }> = {
  [`${kato.accountId}|${KATO_CONTACT_OF_TESTER}`]: { contactId: KATO_CONTACT_OF_TESTER, displayName: "Tess" },
  [`${tester.accountId}|${TESTER_CONTACT_OF_KATO}`]: { contactId: TESTER_CONTACT_OF_KATO, displayName: "QA Kato" },
  [`${tester.accountId}|contact:plain`]: { contactId: "contact:plain", displayName: "Never connected" },
};

test("invite-code connections open one shared conversation from either side; others still need an invitation", { skip: relationshipPostgresSkip, timeout: 60_000 }, async (t) => {
  const h = await createRelationshipHarness({ prefix: "rel_invite_conv" });
  t.after(() => h.close());
  const links = createPostgresRelationshipInviteLinks(h.client, h.workspaceId);
  // Before the invite tables exist the lookups answer "none" without failing.
  assert.equal(await links.forContact(tester.accountId, TESTER_CONTACT_OF_KATO), null);
  assert.equal((await links.myContactIds(tester.accountId, [kato.accountId])).size, 0);

  await runInviteCodeMigrations(h.client);
  await h.client.query(`insert into invite_codes (workspace_id, id, actor_id, code, expires_at) values ($1, 'code-1', $2, '23456789', now() + interval '1 day')`, [h.workspaceId, kato.accountId]);
  await h.client.query(`insert into invite_connections (workspace_id, id, code_id, inviter_actor_id, redeemer_actor_id, outcome, inviter_contact_id, redeemer_contact_id,
      inviter_contact_created, redeemer_contact_created, redeemer_idempotency_key) values ($1, 'conn-1', 'code-1', $2, $3, 'connected', $4, $5, true, true, 'redeem-1')`,
  [h.workspaceId, kato.accountId, tester.accountId, KATO_CONTACT_OF_TESTER, TESTER_CONTACT_OF_KATO]);

  let clock = Date.parse("2026-10-26T10:00:00.000Z");
  const service = (actor: typeof kato) => createRelationshipCommunicationService({
    actor, invitationBaseUrl: "https://orbit.example/app/invitations", inviteLinks: links, messages: h.messages, store: h.store, workspaceId: h.workspaceId,
    now: () => new Date(clock += 1000).toISOString(),
    resolveContact: async (contactId, accountId) => {
      const found = contacts[`${accountId}|${contactId}`];
      return found ? { ...found, organization: "" } : null;
    },
  });

  const before = await service(tester).getEligibility(TESTER_CONTACT_OF_KATO);
  assert.equal(before.canStart, true);
  assert.equal(before.canSend, false);
  assert.equal(before.canInvite, false);

  // Never connected: no conversation can be started, and the invitation path is unchanged.
  await assert.rejects(service(tester).startConversation("contact:plain"), /not available/i);
  assert.equal((await service(tester).getEligibility("contact:plain")).canStart, undefined);
  await assert.rejects(service(stranger).startConversation(TESTER_CONTACT_OF_KATO), /not available/i);

  // The redeemer starts; the conversation is keyed by the code owner's contact.
  const started = await service(tester).startConversation(TESTER_CONTACT_OF_KATO);
  assert.equal(started.status, "confirmed");
  assert.equal(started.canSend, true);
  assert.equal(started.contactId, TESTER_CONTACT_OF_KATO);
  assert.equal(started.remoteAccount?.accountId, kato.accountId);
  assert.equal(started.remoteAccount?.displayName, "QA Kato");
  // Starting again, or from the other side, returns the same conversation.
  assert.equal((await service(tester).startConversation(TESTER_CONTACT_OF_KATO)).conversationId, started.conversationId);
  const fromKato = await service(kato).startConversation(KATO_CONTACT_OF_TESTER);
  assert.equal(fromKato.conversationId, started.conversationId);
  assert.equal(fromKato.remoteAccount?.displayName, "Tester Account");
  assert.equal((await service(kato).getEligibility(KATO_CONTACT_OF_TESTER)).conversationId, started.conversationId);
  assert.equal((await service(tester).getEligibility(TESTER_CONTACT_OF_KATO)).conversationId, started.conversationId);

  // Messages flow both ways and each side reads its own contact id.
  const sent = await service(tester).sendMessage({ body: "QA-C4 hello", conversationId: started.conversationId!, qualificationVersion: started.qualificationVersion!, requestId: "c4-1" });
  assert.equal(sent.deliveryState, "delivered");
  const katoView = await service(kato).getConversation(started.conversationId!);
  assert.equal(katoView.contactId, KATO_CONTACT_OF_TESTER);
  assert.equal(katoView.unreadCount, 1);
  assert.equal((await service(tester).getConversation(started.conversationId!)).contactId, TESTER_CONTACT_OF_KATO);
  const testerList = await service(tester).listConversations();
  assert.deepEqual(testerList.conversations.map((item) => item.contactId), [TESTER_CONTACT_OF_KATO]);

  const reader = (actorId: string) => createRelationshipBoundedReader({ client: h.client, workspaceId: h.workspaceId, actorId, cursorSecret: "c4-secret-".repeat(4), inviteLinks: links });
  assert.equal((await reader(tester.accountId).conversations()).items[0]?.contactId, TESTER_CONTACT_OF_KATO);
  assert.equal((await reader(kato.accountId).conversations()).items[0]?.contactId, KATO_CONTACT_OF_TESTER);
  assert.equal((await reader(tester.accountId).messages(started.conversationId!)).conversation.contactId, TESTER_CONTACT_OF_KATO);

  // Global search reads only the member's own conversations, newest match per conversation.
  const found = await searchRelationshipMessages(h.client, { workspaceId: h.workspaceId, actorId: kato.accountId, terms: ["hello"], limit: 5 });
  assert.deepEqual(found.map((row) => [row.conversationId, row.title, row.body]), [[started.conversationId, "Tester Account", "QA-C4 hello"]]);
  assert.deepEqual(await searchRelationshipMessages(h.client, { workspaceId: h.workspaceId, actorId: stranger.accountId, terms: ["hello"], limit: 5 }), []);
  assert.deepEqual(await searchRelationshipMessages(h.client, { workspaceId: h.workspaceId, actorId: kato.accountId, terms: ["hel%"], limit: 5 }), [], "LIKE wildcards are literal");

  // After the connection ends, nothing new can be started (an existing conversation stays as it is).
  await h.client.query(`update invite_connections set unlinked_at = now(), unlinked_by = $2 where workspace_id = $1`, [h.workspaceId, kato.accountId]);
  assert.equal(await links.forContact(tester.accountId, TESTER_CONTACT_OF_KATO), null);
});
