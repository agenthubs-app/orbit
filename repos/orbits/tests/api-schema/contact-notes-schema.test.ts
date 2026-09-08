import assert from "node:assert/strict";
import test from "node:test";
import { contactNotesPayloadSchema } from "../../shared/api-schema/contact-notes";
import { createMockContactDetailTagStatusService } from "../../features/contacts/mock-detail-service";

test("contact note response validation keeps literal body text and supports legacy visibility", async () => {
  const service = createMockContactDetailTagStatusService();
  const result = await service.updateContactDetail({ contactId: "demo-contact-1", note: { body: "战略契合 / strategic_fit\nCRM mock 案例", authorLabel: "我" } });
  assert.ok(result.success);
  if (!result.success) throw new Error("Missing mock data");
  const data = contactNotesPayloadSchema.parse(result.data);
  assert.equal(data.contact.id, "demo-contact-1");
  assert.equal(data.contact.notes.find((note) => note.privacy === "private")?.body, "战略契合 / strategic_fit\nCRM mock 案例");
  assert.ok(data.contact.notes.some((note) => note.privacy === undefined));
});

test("malformed note lists and unknown visibility are rejected, not treated as an empty list", () => {
  for (const notes of [undefined, null, {}, [{ noteId: "note:1", body: 42, createdAt: "2026-09-08" }], [{ noteId: "note:1", body: "hello", createdAt: "2026-09-08", privacy: "everyone" }]]) {
    assert.equal(contactNotesPayloadSchema.safeParse({ contact: { id: "contact:1", notes } }).success, false);
  }
  assert.equal(contactNotesPayloadSchema.safeParse({ contact: null }).success, false);
  assert.equal(contactNotesPayloadSchema.safeParse({ contact: { id: "", notes: [] } }).success, false);
  assert.equal(contactNotesPayloadSchema.safeParse({ contact: { id: "contact:1", notes: [] } }).success, true);
});
