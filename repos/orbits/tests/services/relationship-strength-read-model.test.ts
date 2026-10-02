import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { RelationshipTimelineItem } from "../../shared/contract/relationship-timeline";
import {
  createMemoryRelationshipStrengthStore,
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
