import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { RELATIONSHIP_MESSAGE_SCHEMA_SQL } from "../../features/relationship-communication/message-tables";
import { meetingProposalSchema } from "../../shared/api-schema/appointment-initial-proposal";
import { relationshipMessagePageSchema, relationshipMessageSchema } from "../../shared/api-schema/relationship-pages";

// R39 (contact-reach D2/D3): messages may carry the appointment sent with them.
const message = {
  messageId: "message:1", conversationId: "conversation:1", senderAccountId: "account:a", senderDisplayName: "Aiko",
  body: "Shall we meet?", sentAt: "2026-11-20T00:00:00.000Z", deliveryState: "delivered",
};

test("SC-R39-04 a pre-R39 message (no appointmentId) still parses; new ones keep the id or null", () => {
  assert.equal(relationshipMessageSchema.parse(message).appointmentId, undefined);
  assert.equal(relationshipMessageSchema.parse({ ...message, appointmentId: null }).appointmentId, null);
  assert.equal(relationshipMessageSchema.parse({ ...message, appointmentId: "appointment:1" }).appointmentId, "appointment:1");
  assert.equal(relationshipMessageSchema.safeParse({ ...message, appointmentId: "" }).success, false);
  const page = relationshipMessagePageSchema.parse({
    actorId: "account:a", items: [message, { ...message, messageId: "message:2", appointmentId: "appointment:1" }], nextCursor: null, newestCursor: null,
    hasMore: false, direction: "older", asOf: "2026-11-20T00:00:00.000Z",
    conversation: { conversationId: "conversation:1", contactId: "contact:1", participantAccountIds: ["account:a", "account:b"], participantDisplayNames: {},
      qualificationVersion: "qv_1", status: "active", createdAt: "2026-11-20T00:00:00.000Z", updatedAt: "2026-11-20T00:00:00.000Z" },
  });
  assert.deepEqual(page.items.map((item) => item.appointmentId ?? null), [null, "appointment:1"], "the page projection keeps the field instead of stripping it");
});

test("SC-R39-04 the message proposal is the initial-proposal structure", () => {
  const proposal = { candidateTimes: [1, 2, 3].map((day) => ({ startsAtUtc: `2026-12-0${day}T01:00:00.000Z` })), durationMinutes: 60,
    medium: { kind: "phone", phoneHint: null }, note: "", timezone: "Asia/Tokyo" };
  assert.equal(meetingProposalSchema.safeParse(proposal).success, true);
  assert.equal(meetingProposalSchema.safeParse({ ...proposal, candidateTimes: proposal.candidateTimes.slice(0, 2) }).success, false);
  assert.equal(meetingProposalSchema.safeParse({ ...proposal, extra: true }).success, false);
});

test("SC-R39-04 the production migration entry reaches the appointment_id column", () => {
  assert.match(RELATIONSHIP_MESSAGE_SCHEMA_SQL, /alter table relationship_messages add column if not exists appointment_id text;/);
  const root = join(__dirname, "..", "..");
  const entry = readFileSync(join(root, "scripts/migrate-web-runtime.ts"), "utf8");
  assert.match(entry, /await runOrbitRecordsMigration\(recordsClient\)/);
  const records = readFileSync(join(root, "shared/storage/migrations.ts"), "utf8");
  assert.match(records, /await runRelationshipMessageMigrations\(client\)/);
});
