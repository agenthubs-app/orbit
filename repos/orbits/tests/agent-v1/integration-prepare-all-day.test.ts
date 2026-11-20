import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnswerBlock } from "../../features/agent-v1/answer/blocks";
import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { fnWorld, runFn } from "./functions-kit";
import { graphKit, recordAccessOf } from "./graph-kit";

/**
 * Integration of the hotfix's preparation answer (graph/nodes/prepare.ts, which lists the user's own private events)
 * and AG20a's all-day private events: the two were built on separate lines. An all-day private event in
 * 「接下来的会面或活动，该准备什么？」 reads 「全天」 on its card and in its line of the text — through the same helper every
 * other server-written surface uses (answer/blocks.ts recordOfView) — and never 00:00.
 */

const ACTOR = "actor:a";
const NOW = "2026-11-15T01:00:00.000Z";

test("an all-day private event in the preparation answer reads 全天, on the card and in the text, never 00:00", async () => {
  const base = fnWorld();
  const kit = graphKit((async () => { throw new Error("replaced"); }) as never, { now: NOW, records: recordAccessOf(base) });
  kit.deps.records!.registeredEventIds = async () => [];
  // 11月19日 in Tokyo, the whole day: stored as that day's local midnight with the all-day flag (AG20a).
  const offsite = { allDay: true, endsAt: undefined, id: "private_event:offsite", kind: "private_event" as const, location: "箱根", startsAt: "2026-11-18T15:00:00.000Z", title: "团队外出日", updatedAt: "2026-11-10T00:00:00.000Z", version: 1 };
  const access = kit.deps.records!;
  access.reader = createDomainRegistry({ cursorKey: new Uint8Array(Buffer.from("agent-v1-graph-kit-cursor-key-0123456789")), denied: () => new Set(), events: { byIds: async () => [], own: async (_actor, id) => (id === offsite.id ? offsite : null) }, now: () => NOW, source: access.source });
  access.privateEvents = { get: async () => null, list: async () => [{ accountId: ACTOR, allDay: true, createdAt: offsite.updatedAt, id: offsite.id, startsAt: offsite.startsAt, title: offsite.title, updatedAt: offsite.updatedAt, version: 1 }], references: async () => [] } as never;
  const message = "接下来的会面或活动，该准备什么？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", requiredCapabilities: ["schedule.read", "event.read"], sourceQuote: message }], { session: kit });
  const cards = run.result.blocks.filter((block: AnswerBlock): block is Extract<AnswerBlock, { type: "records" }> => block.type === "records").flatMap((block) => block.items);
  const card = cards.find((item) => item.id === offsite.id);
  assert.ok(card, `the private event is among the cards: ${cards.map((item) => item.id).join(", ")}`);
  assert.equal(card.eventKind, "private");
  assert.match(card.top ?? "", /11月19日.*全天/u, card.top);
  assert.doesNotMatch(card.top ?? "", /0?0:00/u, "an all-day event shows no time of day");
  const line = run.result.text.split("\n").find((text) => text.includes("团队外出日")) ?? "";
  assert.match(line, /全天/u, run.result.text);
  assert.doesNotMatch(line, /0?0:00/u, run.result.text);
});
