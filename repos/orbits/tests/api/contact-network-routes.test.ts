import assert from "node:assert/strict";
import test from "node:test";

import { createContactCardGetHandler } from "../../app/api/contacts/page/handler";
import { createContactGoalRelatedGetHandler } from "../../app/api/contacts/goal-related-ids/handler";
import { readContactCardQuery } from "../../features/contacts/card-service";
import { goalRelatedLinks, readContactGoalRelated } from "../../features/contacts/goal-related";
import { contactGoalRelatedIdsSchema } from "../../shared/api-schema/contact-goal-related";
import { DEMO_GOAL_RELATED } from "../../shared/mock/demo-world/network";

// R11a SC-05：列表接口的新参数、goal-related-ids 的上限 / truncated / 演示数据。
const actor = { id: "a", accountId: "a", userId: "u", workspaceId: "w", name: "Test", email: "a@example.test" };
const empty = { items: [], nextCursor: null, hasMore: false, asOf: "2026-10-18T00:00:00Z" };

test("R11a: tab and filter parameters reach the reader; absent ones leave the old query unchanged", () => {
  const read = (qs: string) => readContactCardQuery(new URL(`http://localhost/api/contacts/page?${qs}`).searchParams);
  assert.deepEqual(read(""), { query: null, cursor: null, limit: 30, sourceFilters: [], statusFilters: [], tagFilters: [], valueFilters: [] });
  const query = read("goalRelated=1&needsFollowUp=true&industry=finance,it.saas&region=Tokyo&region=none&met=event&density=1,3&status=active,nurture");
  assert.equal(query.goalRelated, true);
  assert.equal(query.needsFollowUp, true);
  assert.deepEqual(query.industryFilters, ["finance", "it.saas"]);
  assert.deepEqual(query.regionFilters, ["Tokyo", "none"]);
  assert.deepEqual(query.metFilters, ["event"]);
  assert.deepEqual(query.densityFilters, ["1", "3"]);
  assert.deepEqual(query.statusFilters, ["active", "nurture"]);
  assert.equal(read("goalRelated=0").goalRelated, undefined);
  assert.equal(read("stage=active").statusFilters?.length, 0, "there is no stage parameter (unknown parameters are ignored)");
  assert.throws(() => read("goalRelated=yes"), /CONTACT_PAGE_INPUT_INVALID/);
  assert.throws(() => read("needsFollowUp=1&needsFollowUp=1"), /CONTACT_PAGE_INPUT_INVALID/);
});

test("RD-33: sort=added reaches the reader; sort=recent / absent keep the old query; anything else is invalid", () => {
  const read = (qs: string) => readContactCardQuery(new URL(`http://localhost/api/contacts/page?${qs}`).searchParams);
  assert.equal(read("sort=added&limit=4").sort, "added");
  assert.equal(read("sort=recent").sort, undefined);
  assert.equal(read("").sort, undefined);
  assert.throws(() => read("sort=name"), /CONTACT_PAGE_INPUT_INVALID/);
  assert.throws(() => read("sort=added&sort=added"), /CONTACT_PAGE_INPUT_INVALID/);
});

test("R11a: an invalid flag answers 400 with the original contract error", async () => {
  const handler = createContactCardGetHandler({ resolveActor: async () => actor, service: () => ({ page: async () => empty as never, summary: async () => { throw Error("unused"); } }) });
  const response = await handler(new Request("http://localhost/api/contacts/page?goalRelated=maybe"));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
});

test("R11a: goal-related-ids needs sign-in, reads plans once and answers the bounded contract", async () => {
  assert.equal((await createContactGoalRelatedGetHandler({ resolveActor: async () => null })()).status, 401);
  let reads = 0;
  const handler = createContactGoalRelatedGetHandler({ resolveActor: async () => actor, read: async (actorId) => {
    reads += 1; assert.equal(actorId, "a");
    return { ids: ["c1"], truncated: false, asOf: "2026-10-18T00:00:00.000Z", links: [{ contactId: "c1", label: "VC パートナー", talked: true }] };
  } });
  const response = await handler();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await response.json()).data.links, [{ contactId: "c1", label: "VC パートナー", talked: true }]);
  assert.equal(reads, 1);
  const failing = createContactGoalRelatedGetHandler({ resolveActor: async () => actor, read: async () => { throw new Error("db password leaked?"); } });
  const failed = await failing();
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /password/);
});

test("R11a: mock mode answers the demo world (sample)", async () => {
  const response = await createContactGoalRelatedGetHandler({ resolveActor: async () => actor, mode: () => "mock" })();
  const body = await response.json();
  assert.equal(body.data.sample, true);
  assert.deepEqual(body.data.ids, DEMO_GOAL_RELATED.ids);
  assert.ok(DEMO_GOAL_RELATED.ids.length > 0);
});

test("R11a: links come from the merged plan needs — first need names the person, established anywhere = talked; the cap sets truncated", async () => {
  const need = (title: string, links: { contactId: string; state: "linked" | "established" }[]) => ({ kind: "network_need", title, contactLinks: links.map((link) => ({ ...link, linkedAt: "x", establishedAt: null })) });
  const snapshot = { items: [need("VC パートナー", [{ contactId: "c2", state: "linked" }, { contactId: "c1", state: "linked" }]), { kind: "task", title: "x", contactLinks: [] }, need("CFO 経験者", [{ contactId: "c1", state: "established" }])] } as never;
  assert.deepEqual(goalRelatedLinks(snapshot), [{ contactId: "c2", label: "VC パートナー", talked: false }, { contactId: "c1", label: "VC パートナー", talked: true }]);
  const many = Array.from({ length: 503 }, (_, n) => ({ contactId: `c${String(n).padStart(4, "0")}`, state: "linked" as const }));
  const result = await readContactGoalRelated("a", () => new Date("2026-10-18T00:00:00.000Z"), { readV1: async () => ({ items: [need("T", many)] } as never), readV2: async () => null });
  assert.equal(result.ids.length, 500);
  assert.equal(result.truncated, true);
  assert.equal(result.links?.length, 500);
  assert.ok(contactGoalRelatedIdsSchema.safeParse(result).success);
  const none = await readContactGoalRelated("a", undefined, { readV1: async () => null, readV2: async () => null });
  assert.deepEqual([none.ids, none.truncated], [[], false]);
});
