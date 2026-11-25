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
const responses = (extra: object) => ({ [`${base}/overview`]: overview, [`${base}/join/current`]: { answers: [], ask: [], blocked: null, selfIntro: null, status: "none" }, [`${base}/join/next`]: { done: false, index: 1, question: { ...question, ...extra }, remainingMinutes: 1, total: 3 }, [`${base}/join/profile`]: profile });

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

test("past five answers the interview goes on for what is missing; the counter and the review follow the server", async (t) => {
  const answered = (index: number, total: number, field: string, prompt: string) => ({ done: false, index, question: { ...question, field, prompt, questionToken: `token-${index}` }, remainingMinutes: 1, total });
  const page = await harness.open(t, { screen: "register", params: { id: overview.eventId }, responses: { [`${base}/overview`]: overview, [`${base}/join/current`]: { answers: [], ask: [], blocked: null, selfIntro: null, status: "none" }, [`${base}/join/next`]: answered(1, 5, "host:lib-purpose", "第1题"), [`${base}/join/profile`]: profile } });
  for (let index = 1; index <= 6; index += 1) {
    await page.getByText(`第${index}题`, { exact: true }).waitFor();
    assert.ok(await page.getByText(` / ${Math.max(5, index)}`, { exact: false }).count() > 0, `question ${index}`);
    await page.evaluate(({ path, step }) => { (window as any).fixture.responses[path] = step; }, { path: `${base}/join/next`, step: index < 6 ? answered(index + 1, Math.max(5, index + 1), "f", `第${index + 1}题`) : { done: true, index: 6, question: null, remainingMinutes: 0, total: 6 } });
    if (index === 6) await page.evaluate(({ path, value }) => { (window as any).fixture.responses[path] = value; }, { path: `${base}/join/profile`, value: { coverage: 80, items: [{ done: true, key: "company" }, { done: true, key: "purpose" }, { done: true, key: "topics" }, { done: false, key: "offer" }], review: false, selfIntro: { source: "profile", text: "做 B2B SaaS。" }, topics: ["SaaS"] } });
    await page.getByRole("button", { name: "投资人", exact: true }).click();
    await page.getByTestId("events-join-next").click();
  }
  // The review ticks what the server says, and 「添加」 asks for what is missing with everything answered so far.
  await page.getByTestId("events-join-review").waitFor();
  assert.equal(await page.getByText("✓", { exact: true }).count(), 3);
  assert.equal(await page.getByText("△", { exact: true }).count(), 1);
  await page.evaluate(({ path, step }) => { (window as any).fixture.responses[path] = step; }, { path: `${base}/join/next`, step: answered(7, 7, "valueOffered", "第7题") });
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByText("第7题", { exact: true }).waitFor();
  await page.evaluate(({ next, profilePath, done, value }) => { const r = (window as any).fixture.responses; r[next] = done; r[profilePath] = value; }, { next: `${base}/join/next`, profilePath: `${base}/join/profile`, done: { done: true, index: 7, question: null, remainingMinutes: 0, total: 7 }, value: { coverage: 100, items: [{ done: true, key: "company" }, { done: true, key: "offer" }], review: false, selfIntro: null, topics: [] } });
  await page.getByRole("button", { name: "投资人", exact: true }).click();
  await page.getByTestId("events-join-next").click();
  await page.getByTestId("events-join-review").waitFor();
  await page.getByText("100%", { exact: true }).first().waitFor();
  const bodies = await page.evaluate(() => (window as any).fixture.postBodies.filter((call: any) => call.path.endsWith("/join/next")).map((call: any) => [call.body.answers.length, call.body.more]));
  assert.deepEqual(bodies, [[0, false], [1, false], [2, false], [3, false], [4, false], [5, false], [6, false], [6, true], [7, false]]);
});
