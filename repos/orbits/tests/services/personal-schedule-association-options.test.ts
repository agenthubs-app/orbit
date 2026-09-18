import assert from "node:assert/strict";
import test from "node:test";
import { associationTextMatches, createAssociationOptionsService, type AssociationCandidateReader } from "../../features/personal-schedule/association-options";

test("association matching supports literal text, Chinese initials and fixed surname readings", () => {
  for (const [title, q, kind, want] of [
    ["林悦", "LY", "contact", true], ["林悦", "ly", "contact", true],
    ["林悦", "林", "contact", true], ["林悦", "LM", "contact", false],
    ["产品体验演练", "CPTY", "note", true], ["Alice Brown", "AB", "contact", true],
    ["单明", "SM", "contact", true], ["单明", "DM", "contact", false],
    ["𠮷田", "𠮷", "contact", true], ["𠮷田", "JT", "contact", false],
    ["林悦", "  ", "contact", true], ["林悦", "林 LY", "contact", true],
  ] as const) assert.equal(associationTextMatches(title, q, kind), want, `${title}/${q}`);
});

function fixture(titles: string[]) {
  const calls: { actorId: string; kind: string; limit: number; afterId?: string }[] = [];
  let version = "revision-1";
  const records = titles.map((title, index) => ({ id: `choice:${String(index).padStart(5, "0")}`, title }));
  const reader: AssociationCandidateReader = async input => {
    calls.push(input);
    const candidates = records.filter(record => !input.afterId || record.id > input.afterId).slice(0, input.limit);
    return { candidates, sourceVersion: version, hasMore: candidates.length > 0 && candidates.at(-1)!.id !== records.at(-1)!.id };
  };
  return { service: createAssociationOptionsService(reader), calls, changeVersion() { version = "revision-2"; } };
}

test("empty query pages owned summaries and scopes cursors to actor, kind and query", async () => {
  const f = fixture(Array.from({ length: 25 }, (_, index) => `Existing ${index}`));
  const first = await f.service({ actorId: "actor-1", kind: "note", q: "", limit: 20 });
  assert.equal(first.options.length, 20);
  assert.equal(first.options[0]!.title, "Existing 0");
  assert.ok(first.nextCursor);
  const next = await f.service({ actorId: "actor-1", kind: "note", q: "", limit: 20, cursor: first.nextCursor });
  assert.deepEqual(next.options.map(option => option.title), ["Existing 20", "Existing 21", "Existing 22", "Existing 23", "Existing 24"]);
  assert.equal(next.nextCursor, undefined);
  assert.ok(f.calls.every(call => call.actorId === "actor-1" && call.kind === "note" && call.limit <= 40));
  for (const patch of [{ actorId: "actor-2" }, { kind: "contact" as const }, { q: "changed" }]) {
    await assert.rejects(f.service({ actorId: "actor-1", kind: "note", q: "", limit: 20, cursor: first.nextCursor, ...patch }), /invalid.*cursor/i);
  }
});

test("Chinese initial matches beyond the first scan remain reachable with explicit partial continuation", async () => {
  const f = fixture([...Array.from({ length: 299 }, () => "其他人物"), "林悦"]);
  const first = await f.service({ actorId: "actor-1", kind: "contact", q: "LY", limit: 20 });
  assert.deepEqual(first.options, []);
  assert.equal(first.partial, true);
  assert.ok(first.nextCursor);
  assert.ok(f.calls.reduce((sum, call) => sum + call.limit, 0) <= 200);
  const next = await f.service({ actorId: "actor-1", kind: "contact", q: "LY", limit: 20, cursor: first.nextCursor });
  assert.deepEqual(next.options, [{ id: "choice:00299", title: "林悦" }]);
  assert.equal(next.partial, false);
  assert.equal(next.nextCursor, undefined);
});

test("source mutation or permission revocation invalidates continuation rather than mixing versions", async () => {
  const f = fixture(Array.from({ length: 25 }, (_, index) => `Person ${index}`));
  const first = await f.service({ actorId: "actor-1", kind: "contact", q: "", limit: 20 });
  f.changeVersion();
  await assert.rejects(f.service({ actorId: "actor-1", kind: "contact", q: "", limit: 20, cursor: first.nextCursor }), /choices changed/i);
});

test("association summary ordering follows PostgreSQL C byte order for non-ASCII canonical IDs", async () => {
  const candidates = [{ id: "note:\uE000", title: "First" }, { id: "note:\u{10000}", title: "Second" }];
  const service = createAssociationOptionsService(async () => ({ candidates, sourceVersion: "v1", hasMore: false }));
  const page = await service({ actorId: "actor-1", kind: "note", q: "", limit: 20 });
  assert.deepEqual(page.options, candidates);
});
