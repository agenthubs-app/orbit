import assert from "node:assert/strict";
import test from "node:test";
import { contactPageContextSource, loadContactPageContext } from "../../app/(app)/app/orbit-2026/iorbit/page-context";

test("page context accepts only an exact contact list and supported industry filters", () => {
  assert.deepEqual(contactPageContextSource("/app/contacts"), []);
  assert.equal(contactPageContextSource("/app/contacts/other"), null);
  assert.equal(contactPageContextSource("//evil.example/app/contacts"), null);
  assert.equal(contactPageContextSource("/app/contacts?query=private"), null);
  assert.equal(contactPageContextSource("/app/contacts#private"), null);
});

test("page context fetches an actor-scoped summary only after explicit opt in", async () => {
  const calls: string[] = [];
  const context = await loadContactPageContext([], (async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ data: { total: 12 } }), { status: 200 });
  }) as typeof fetch);
  assert.deepEqual(calls, ["/api/contacts/summary"]);
  assert.deepEqual(context, { route: "/app/contacts", filters: { industry: [] }, count: 12 });
});
