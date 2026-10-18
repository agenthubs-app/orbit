import assert from "node:assert/strict";
import test from "node:test";
import { contactPageContextSource, createContactPageContextLoader, loadContactPageContext } from "../../app/(app)/app/orbit-2026/iorbit/page-context";

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

test("a page context response cannot reopen a switch after the user leaves that question", async () => {
  let finish!: (count: number) => void;
  const loader = createContactPageContextLoader(async (industry) => new Promise((resolve) => {
    finish = (count) => resolve({ route: "/app/contacts", filters: { industry }, count });
  }));
  const pending = loader.resolve(["none"]);
  loader.clear();
  finish(3);
  assert.equal(await pending, null);
});

test("an obsolete page context failure does not replace a newer result", async () => {
  let rejectOld!: (error: Error) => void;
  const loader = createContactPageContextLoader(async (industry) => industry.length
    ? new Promise((_resolve, reject) => { rejectOld = reject; })
    : { route: "/app/contacts", filters: { industry }, count: 8 });
  const old = loader.resolve(["none"]);
  const current = loader.resolve([]);
  rejectOld(new Error("slow old request"));
  assert.equal(await old, null);
  assert.deepEqual(await current, { route: "/app/contacts", filters: { industry: [] }, count: 8 });
});
