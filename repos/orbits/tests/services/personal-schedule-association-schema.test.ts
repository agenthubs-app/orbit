import assert from "node:assert/strict";
import test from "node:test";
import { personalScheduleAssociationOptionsPageSchema } from "../../shared/api-schema/personal-schedule-associations";

const page = { actorId: "actor-1", kind: "contact", options: [{ id: "contact-1", title: "林悦" }], sourceVersion: "revision-1", partial: false };

test("association page schema accepts bounded summaries and explicit partial continuation", () => {
  assert.deepEqual(personalScheduleAssociationOptionsPageSchema.parse(page), page);
  assert.equal(personalScheduleAssociationOptionsPageSchema.safeParse({ ...page, options: [], partial: true, nextCursor: "cursor-1" }).success, true);
});

test("association page schema rejects private fields, duplicates and oversized pages", () => {
  for (const invalid of [
    { ...page, body: "private" },
    { ...page, options: [{ ...page.options[0], body: "private" }] },
    { ...page, options: [page.options[0], page.options[0]] },
    { ...page, options: Array.from({ length: 21 }, (_, i) => ({ id: String(i), title: "Person" })) },
    { ...page, actorId: "" }, { ...page, sourceVersion: "" },
    { ...page, partial: true }, { ...page, kind: "unknown" },
    { ...page, nextCursor: "x".repeat(2049) },
    { ...page, options: [{ id: "contact-1", title: "" }] },
    { ...page, options: [{ id: "contact-1", title: "Person", avatarUrl: "javascript:alert(1)" }] },
    { ...page, options: [{ id: "contact-1", title: "Person", avatarUrl: "https://user:secret@example.com/avatar" }] },
  ]) assert.equal(personalScheduleAssociationOptionsPageSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
});
