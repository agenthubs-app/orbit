import assert from "node:assert/strict";
import test from "node:test";
import { requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// LF11: the search screen on the device. Offline, people and conversations come from the mirror (no blank page);
// online one request asks the server for events and conversations only — people are never sent to the server.
const contact = (id: string, name: string, org: string) => ({
  id, tags: [], detail: null,
  card: { id, displayName: name, organization: org, role: "", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-10-01T00:00:00.000Z" },
  search: { text: `${name} ${org}`.toLowerCase(), occurredAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", error: null },
});
const records = { contact: [contact("c1", "高橋 美咲", "青葉ベンチャーズ"), contact("c2", "佐藤 花子", "星河能源")] };

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => { harness = await startOfflinePageHarness([{ name: "search", importPath: "./src/screens/search/GlobalSearchScreen", exportName: "GlobalSearchScreen" }]); });
test.after(async () => { await harness?.close(); });

test("offline: a name is found on the device, and the screen says events need a connection", async (t) => {
  const page = await harness.open(t, { screen: "search", online: false, records });
  await page.getByTestId("global-search-input").fill("高橋");
  await page.getByText("高橋 美咲").first().waitFor({ timeout: 3000 });
  await page.getByText(/活动要联网后才能搜/u).waitFor({ timeout: 3000 });
  assert.equal(await page.getByText("佐藤 花子").count(), 0);
});

test("online: the only search request is for events and conversations", async (t) => {
  const empty = { alternatives: [], events: { items: [], total: 0 }, examples: [], people: { items: [], total: 0 }, query: "高橋", searchedPeople: 0, semantic: { available: true, enabled: false }, suggestions: [], types: ["people", "events", "conversations"], conversations: { items: [], total: 0 } };
  const page = await harness.open(t, { screen: "search", records, responses: { "/api/search/global": empty } });
  await page.getByTestId("global-search-input").fill("高橋");
  await page.getByText("高橋 美咲").first().waitFor({ timeout: 3000 });
  await page.waitForTimeout(400);
  const searches = (await requestsOf(page)).filter((request) => request.includes(":/api/search/global"));
  assert.ok(searches.length >= 1);
  for (const request of searches) assert.match(request, /types=events%2Cconversations/u, request);
});
