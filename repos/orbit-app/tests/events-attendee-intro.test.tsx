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

// 「参加目的」「想见的人」按服务端给的问答显示：有就两行，旧报名没有就不留空行，最多 8 行都显示。
test("the purpose and who to meet show as questions when the server gives them", async (t) => {
  const page = await harness.open(t, { screen: "attendee", responses: { [path]: { ...base, answers: [...base.answers, { a: "找到合作伙伴", q: "参加目的" }, { a: "投资人、创业者", q: "想见的人" }], intro: null } } });
  const card = page.getByTestId("events-attendee-intro");
  await card.waitFor();
  assert.match(await card.innerText(), /参加目的\s+找到合作伙伴\s+想见的人\s+投资人、创业者$/u);
  const old = await harness.open(t, { screen: "attendee", responses: { [path]: { ...base, intro: null } } });
  await old.getByTestId("events-attendee-intro").waitFor();
  assert.equal(await old.getByText("参加目的", { exact: true }).count() + await old.getByText("想见的人", { exact: true }).count(), 0);
});

test("all eight questions show", async (t) => {
  const answers = Array.from({ length: 8 }, (_, index) => ({ a: `回答${index + 1}`, q: `问题${index + 1}` }));
  const page = await harness.open(t, { screen: "attendee", responses: { [path]: { ...base, answers, intro: "介绍" } } });
  const card = page.getByTestId("events-attendee-intro");
  await card.waitFor();
  const text = await card.innerText();
  for (const { a, q } of answers) assert.ok(text.includes(q) && text.includes(a), `${q} missing: ${text}`);
});
