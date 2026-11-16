import assert from "node:assert/strict";
import test from "node:test";

import { relationshipDeliveryReceiptMatches } from "../src/api/contact-communication";
import type { SyncRecord } from "../src/api/contract/sync";
import { decodeRelationshipMessagePage } from "../src/view-models/relationship-pages";
import { localRelationshipMessagePage, relationshipDeviceConversations, relationshipDeviceMessages } from "../src/view-models/relationship-local";

// R39 (contact-reach D2/D3): a message may carry the appointment sent with it.
// The device mirror keeps it, the local page returns it, and the send receipt
// is checked against it.
const A = "account:a";
const B = "account:b";
const CID = "conversation:reach";
const NOW = "2026-11-20T00:00:00.000Z";

function record(id: string, payload: Record<string, unknown>): SyncRecord<Record<string, unknown>> {
  return { id, payload, revision: "1", deletedAt: null } as unknown as SyncRecord<Record<string, unknown>>;
}

const conversation = record(CID, {
  conversationId: CID, contactId: "contact:b", participantAccountIds: [A, B], participantDisplayNames: { [A]: "Aiko", [B]: "Ben" },
  qualificationVersion: "qv_1", status: "active", createdAt: NOW, updatedAt: NOW, unreadCount: 0, readSeq: 2, lastMessageSeq: 2,
  lastMessage: { messageId: "message:2", senderAccountId: A, sentAt: NOW, bodyPreview: "Shall we meet?" },
});
const message = (seq: number, extra: Record<string, unknown>) => record(`${CID}/${seq}`, {
  conversationId: CID, seq, messageId: `message:${seq}`, senderAccountId: A, senderDisplayName: "Aiko", body: seq === 1 ? "Hi" : "Shall we meet?", sentAt: NOW, ...extra,
});

test("the device mirror keeps a message's appointment id; plain and pre-R39 rows have none", () => {
  const messages = relationshipDeviceMessages([message(1, {}), message(2, { appointmentId: "appointment:1" })], CID);
  assert.deepEqual(messages.map((row) => row.appointmentId ?? null), [null, "appointment:1"]);
  assert.equal("appointmentId" in messages[0]!, false, "a plain message keeps its pre-R39 shape");
  const page = localRelationshipMessagePage(relationshipDeviceConversations([conversation], A), messages, A, CID, { asOf: NOW });
  assert.deepEqual(page?.items.map((item) => item.appointmentId ?? null), [null, "appointment:1"]);
  const decoded = decodeRelationshipMessagePage(page, A, CID);
  assert.deepEqual(decoded?.items.map((item) => item.appointmentId ?? null), [null, "appointment:1"], "the page decoder keeps the field");
});

test("the delivery receipt carries the appointment exactly when a proposal was sent", () => {
  const receipt = (appointmentId?: string | null) => ({
    conversationId: CID, deliveryState: "delivered", qualificationVersion: "qv_1",
    message: { body: "Shall we meet?", conversationId: CID, deliveryState: "delivered", messageId: "message:2", senderAccountId: A, senderDisplayName: "Aiko", sentAt: NOW,
      ...(appointmentId === undefined ? {} : { appointmentId }) },
  });
  const expected = { body: "Shall we meet?", conversationId: CID, qualificationVersion: "qv_1", senderAccountId: A };
  assert.equal(relationshipDeliveryReceiptMatches(receipt(), expected), true, "a pre-R39 receipt of a plain message");
  assert.equal(relationshipDeliveryReceiptMatches(receipt(null), expected), true);
  assert.equal(relationshipDeliveryReceiptMatches(receipt("appointment:1"), expected), false, "a plain send must not come back with a proposal");
  assert.equal(relationshipDeliveryReceiptMatches(receipt("appointment:1"), { ...expected, withProposal: true }), true);
  assert.equal(relationshipDeliveryReceiptMatches(receipt(null), { ...expected, withProposal: true }), false);
  assert.equal(relationshipDeliveryReceiptMatches(receipt(), { ...expected, withProposal: true }), false);
  assert.equal(relationshipDeliveryReceiptMatches(receipt(""), { ...expected, withProposal: true }), false);
});
