import assert from "node:assert/strict";
import test from "node:test";

import { createEventAttendeesGetHandler } from "../../app/api/events/[id]/attendees/handlers";
import { createMockEventCrudAndImportService } from "../../features/events/event-crud-and-import/mock-service";

async function contexts(lang: string) {
  const list = createEventAttendeesGetHandler({ createEventService: () => createMockEventCrudAndImportService(), resolveActor: async () => ({ id: "account:event-attendee-test" }) });
  const response = await list(new Request("https://orbit.local/api/events/demo-event-1/attendees", { headers: { "x-orbit-lang": lang } }), { params: Promise.resolve({ id: "demo-event-1" }) });
  const text = await response.text();
  return { status: response.status, values: [...text.matchAll(/"relationshipContext":"([^"]*)"/g)].map((match) => match[1]!) };
}

// The label rewrite itself is covered in tests/domain/relationship-context-labels.test.ts; this checks the
// route path: the language header is read and context without Event:/Looking for:/Can offer: is left as written.
test("event attendee route passes free-text relationship context through unchanged in every language", async () => {
  const zh = await contexts("zh");
  const en = await contexts("en");
  assert.equal(zh.status, 200);
  assert.equal(en.status, 200);
  assert.ok(zh.values.length > 0);
  assert.deepEqual(zh.values, en.values);
});
