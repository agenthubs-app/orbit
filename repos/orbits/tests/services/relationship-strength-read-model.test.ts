import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { RelationshipTimelineItem } from "../../shared/contract/relationship-timeline";
import {
  createMemoryRelationshipStrengthStore,
  createPostgresRelationshipStrengthStore,
  RelationshipStrengthSourceLimitError,
  relationshipStrengthStampSql,
  ensureRelationshipStrengths,
  ensureRelationshipStrengthsForPage,
  readRelationshipTierBoard,
} from "../../features/relationship-strength/read-model";
import type { ActorRelationshipTimelines } from "../../features/relationship-strength/timelines";

// W0047 SC-02（内存实现）：ensure 的读写调用计数；刷新入口不在 /api/mobile/**（R-1）。

const NOW = new Date("2026-10-02T03:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function captureItem(contactId: string, days: number): RelationshipTimelineItem {
  return { id: `capture:${contactId}`, source: "capture", contactId, occurredAt: ago(days), occurredAtPrecision: "instant", title: { zh: "", en: "" }, ref: { store: "contacts", recordId: contactId }, detail: { captureMethod: "business_card" } };
}
function memoItem(contactId: string, id: string, days: number): RelationshipTimelineItem {
  return { id: `memo:${id}`, source: "memo", contactId, occurredAt: ago(days), occurredAtPrecision: "day", title: { zh: "", en: "" }, ref: { store: "contact_detail_states", recordId: `d:${contactId}`, subId: id } };
}

function harness() {
  const data = new Map<string, RelationshipTimelineItem[]>([
    ["c1", [captureItem("c1", 10), memoItem("c1", "m1", 3)]],
    ["c2", [captureItem("c2", 40)]],
  ]);
  let stamp = 1;
  const calls = { stamp: 0, timelines: 0 };
  const store = createMemoryRelationshipStrengthStore({
    stamp: () => { calls.stamp += 1; return `s${stamp}`; },
    timelines: (): ActorRelationshipTimelines => {
      calls.timelines += 1;
      return { timelines: new Map([...data].map(([id, items]) => [id, [...items]])), earliestCaptureAt: ago(40), truncatedSources: [] };
    },
  });
  return { data, store, calls, bump: () => { stamp += 1; } };
}

test("memory: unchanged stamp and Tokyo day → 0 timeline reads; a new memo → one recompute", async () => {
  const { data, store, calls, bump } = harness();
  assert.equal((await ensureRelationshipStrengths("actor:a", NOW, { store })).status, "recomputed");
  assert.equal(calls.timelines, 1);
  assert.equal((await ensureRelationshipStrengths("actor:a", new Date(NOW.getTime() + 3_600_000), { store })).status, "fresh");
  assert.equal(calls.timelines, 1);

  data.get("c2")!.push(memoItem("c2", "m2", 0));
  bump();
  assert.equal((await ensureRelationshipStrengths("actor:a", new Date(NOW.getTime() + 7_200_000), { store })).status, "recomputed");
  assert.equal(calls.timelines, 2);
  assert.equal(store.rows.get("actor:a")!.get("c2")!.signals.some((signal) => signal.source === "memo"), true);
  // 他人 0 行。
  assert.equal(store.rows.has("actor:b"), false);
  const board = await readRelationshipTierBoard({ actorId: "actor:a" }, { store });
  assert.equal(board.counts.new, 2);
  assert.deepEqual(board.columns.new.map((card) => card.contactId), ["c2", "c1"]);
});

test("memory: a stamp that moves during the computation is not written (compare-and-write)", async () => {
  const { store, bump } = harness();
  const racing = { ...store, readTimelines: async (actorId: string, now: Date) => { const result = await store.readTimelines(actorId, now); bump(); return result; } };
  assert.equal((await ensureRelationshipStrengths("actor:a", NOW, { store: racing })).status, "skipped");
  assert.equal(store.rows.size, 0);
  assert.equal((await ensureRelationshipStrengths("actor:a", NOW, { store })).status, "recomputed");
});

test("the page wrapper never throws and an unconfigured store is a no-op", async () => {
  const { store } = harness();
  const broken = { ...store, readStampAndState: async () => { throw new Error("db down"); } };
  const errors: string[] = [];
  const original = console.error;
  console.error = (line: string) => errors.push(line);
  try {
    await ensureRelationshipStrengthsForPage("actor:a", NOW, { store: broken });
  } finally {
    console.error = original;
  }
  assert.match(errors[0] ?? "", /relationship_strength_refresh_failed/);
  assert.deepEqual(await ensureRelationshipStrengths("actor:a", NOW, { store: null }), { status: "unconfigured", state: null });
});

test("R-1: no file under app/api/mobile references the strength refresh entry", () => {
  const root = fileURLToPath(new URL("../../app/api/mobile", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
    }
  };
  walk(root);
  assert.ok(files.some((file) => file.endsWith("contacts-dashboard/handler.ts")), "scanned the mobile routes");
  const offenders = files.filter((file) => /ensureRelationshipStrengths|relationship-strength\/read-model/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("review P2-3: a source that hits the row limit fails the refresh with zero writes and keeps the previous cache", async () => {
  const { store, bump } = harness();
  assert.equal((await ensureRelationshipStrengths("actor:a", NOW, { store })).status, "recomputed");
  const before = structuredClone([...store.rows.get("actor:a")!.values()]);
  const stateBefore = structuredClone(store.states.get("actor:a"));
  bump();
  let writes = 0;
  const truncated = {
    ...store,
    readTimelines: async (actorId: string, now: Date) => ({ ...(await store.readTimelines(actorId, now)), truncatedSources: ["note" as const] }),
    replaceIfCurrent: async (...args: Parameters<typeof store.replaceIfCurrent>) => { writes += 1; return store.replaceIfCurrent(...args); },
  };
  const original = console.error;
  const logged: string[] = [];
  console.error = (line: string) => logged.push(line);
  try {
    await assert.rejects(ensureRelationshipStrengths("actor:a", new Date(NOW.getTime() + 3_600_000), { store: truncated }), RelationshipStrengthSourceLimitError);
  } finally {
    console.error = original;
  }
  assert.equal(writes, 0);
  assert.deepEqual([...store.rows.get("actor:a")!.values()], before);
  assert.deepEqual(store.states.get("actor:a"), stateBefore);
  assert.match(logged[0] ?? "", /relationship_strength_sources_truncated/);
});

test("review P2-4: the source stamp uses sync_revision when the column exists and falls back to updated_at once when it does not", async () => {
  const run = async (hasRevision: boolean) => {
    const seen: string[] = [];
    const client = {
      async query(text: string) {
        seen.push(/stamp-and-state:(\w+)/.exec(text)?.[1] ?? "other");
        if (text.includes("max(sync_revision)") && !hasRevision) throw Object.assign(new Error('column "sync_revision" does not exist'), { code: "42703" });
        return { rows: [{ row_count: "3", max_revision: "77", max_updated: "2026-10-01 00:00:00+00", sum_updated: "123", plan_count: "1", plan_max_seq: "9", state_payload: null }] };
      },
      transaction: async () => { throw new Error("unused"); },
    };
    const store = createPostgresRelationshipStrengthStore({ client: client as never, workspaceId: "w" });
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      const first = await store.readStampAndState("actor:a");
      const second = await store.readStampAndState("actor:a");
      return { seen, first: first.sourceStamp, second: second.sourceStamp, mode: store.stampMode() };
    } finally {
      console.warn = warn;
    }
  };
  const withRevision = await run(true);
  assert.deepEqual(withRevision, { seen: ["revision", "revision"], first: "rev|3|77|1|9", second: "rev|3|77|1|9", mode: "revision" });
  const without = await run(false);
  assert.deepEqual(without, { seen: ["revision", "timestamp", "timestamp"], first: "ts|3|2026-10-01 00:00:00+00|123|1|9", second: "ts|3|2026-10-01 00:00:00+00|123|1|9", mode: "timestamp" });
  // 两种口径的 SQL：revision 不看 updated_at，timestamp 不看 sync_revision。
  assert.match(relationshipStrengthStampSql("revision"), /max\(sync_revision\)/);
  assert.doesNotMatch(relationshipStrengthStampSql("revision"), /updated_at/);
  assert.doesNotMatch(relationshipStrengthStampSql("timestamp"), /sync_revision/);
});
