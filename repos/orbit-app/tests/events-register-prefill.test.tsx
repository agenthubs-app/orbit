import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { journeyOverview } from "../../orbits/shared/mock/demo-world/events-journey";
import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// 資料にある「会いたい人」「提供できること」は最初から選択済み。ほかの選択肢と同じように外せる。
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([{ name: "register", importPath: "./src/screens/events/v2/RegisterPage", exportName: "RegisterPage" }]);
});
after(async () => { await harness.close(); });

const overview = { ...journeyOverview("many", "app"), priceYen: 3000 };
const base = `/api/events/${encodeURIComponent(overview.eventId)}`;
const question = { allowCustom: false, field: "target", help: null, max: null, multi: true, options: ["投资人", "客户", "工程师"], prompt: "想见谁？", questionToken: "token-1" };
const profile = { coverage: 80, items: [{ done: true, key: "company" }], review: false, selfIntro: null, topics: [] };
const responses = (extra: object) => ({ [`${base}/overview`]: overview, [`${base}/join/next`]: { done: false, index: 1, question: { ...question, ...extra }, remainingMinutes: 1, total: 3 }, [`${base}/join/profile`]: profile });

test("options from the profile start selected, and one tap takes each away", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: overview.eventId }, responses: responses({ prefill: ["投资人", "客户"] }) });
  const next = page.getByRole("button", { name: "下一步（已选2个）", exact: true });
  await next.waitFor();
  await page.getByRole("button", { name: "客户", exact: true }).click();
  await page.getByRole("button", { name: "投资人", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: /^下一/u }).isDisabled(), true);
});

test("without any in the profile nothing is selected", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: overview.eventId }, responses: responses({}) });
  await page.getByRole("button", { name: "投资人", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^下一/u }).isDisabled(), true);
});
