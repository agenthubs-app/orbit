import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// 参会者详情的介绍 = 对方为这场活动确认的第一人称介绍：有就在最前，没有就不留那一行，话题是问答第一行。
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([{ name: "attendee", importPath: "./tests/helpers/attendee-sheet-host", exportName: "AttendeeSheetHost" }]);
});
after(async () => { await harness.close(); });

const path = "/api/events/e1/attendees/profile";
const base = { answers: [{ a: "AI · 出海", q: "想聊的话题" }, { a: "客户引荐", q: "能提供的" }], attendeeId: "a1", canRequestExchange: true, exchange: "none", initial: "佐", name: "佐藤", participantId: "p1", together: { recommended: false, sharedRounds: [] } };

test("the confirmed introduction comes first, then the questions with the topic on top", async (t) => {
  const page = await harness.open(t, { screen: "attendee", responses: { [path]: { ...base, intro: "我在做 B2B SaaS，想认识投资人。" } } });
  const card = page.getByTestId("events-attendee-intro");
  await card.waitFor();
  assert.match(await card.innerText(), /^自我介绍\s+我在做 B2B SaaS，想认识投资人。\s+想聊的话题\s+AI · 出海\s+能提供的\s+客户引荐$/u);
});

test("without one there is no empty line; with nothing at all there is no card", async (t) => {
  for (const intro of [null, ""]) {
    const page = await harness.open(t, { screen: "attendee", responses: { [path]: { ...base, intro } } });
    const card = page.getByTestId("events-attendee-intro");
    await card.waitFor();
    assert.match(await card.innerText(), /^想聊的话题\s+AI · 出海\s+能提供的\s+客户引荐$/u);
    const [cardBox, firstBox] = [(await card.boundingBox())!, (await page.getByText("想聊的话题", { exact: true }).boundingBox())!];
    assert.ok(firstBox.y - cardBox.y < 24, "the first row starts at the card's own padding");
  }
  const bare = await harness.open(t, { screen: "attendee", responses: { [path]: { ...base, answers: [], intro: null } } });
  await bare.getByTestId("events-attendee-request").waitFor();
  assert.equal(await bare.getByTestId("events-attendee-intro").count(), 0);
});
