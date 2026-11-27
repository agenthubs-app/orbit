import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { journeyOverview } from "../../orbits/shared/mock/demo-world/events-journey";
import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// 见面准备只给已确定参加的人（2026-11-26，同 Web 7a5de9043）：审核中 / 候补没有入口；准备页读不到时说清楚为什么、下一步去哪；
// 名单门槛对审核中 / 候补说「审核通过后可以看到」，不再请他们去报名。
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([
    { name: "prep", importPath: "./src/screens/events/v2/PrepPage", exportName: "PrepPage" },
    { name: "detail", importPath: "./src/screens/events/v2/EventDetailPage", exportName: "EventDetailPage" },
    { name: "people", importPath: "./src/screens/events/v2/EventPeoplePage", exportName: "EventPeoplePage" },
  ]);
});
after(async () => { await harness.close(); });

const overview = { ...journeyOverview("many", "app"), endsAt: "2099-12-10T21:30:00+09:00", registrationClosesAt: "2099-12-03T23:59:00+09:00", startsAt: "2099-12-10T19:00:00+09:00" };
const eventId = overview.eventId;
const path = `/api/events/${encodeURIComponent(eventId)}`;
const withStatus = (status: string, patch: object = {}) => ({ ...overview, registration: { ...overview.registration, status }, ...patch });
const navigated = (page: Awaited<ReturnType<typeof harness.open>>) => page.evaluate(() => JSON.stringify((window as any).fixture.navigation));

test("the prep page says why it cannot be shown and where to go next; a failed read can be retried", async (t) => {
  for (const [reason, text, button, target] of [
    ["PREP_PENDING_REVIEW", "审核通过后可以做见面准备", "去活动详情", `/events/${encodeURIComponent(eventId)}`],
    ["PREP_NOT_REGISTERED", "报名后可以做见面准备", "报名", `/events/${encodeURIComponent(eventId)}/register`],
  ] as const) {
    const page = await harness.open(t, { screen: "prep", params: { id: eventId }, responses: { [`${path}/prep`]: { __code: "FORBIDDEN", __reason: reason, __status: 403 } } });
    await page.getByText(text, { exact: true }).waitFor();
    assert.equal(await page.getByText("找不到这个活动", { exact: true }).count(), 0);
    await page.getByRole("button", { name: button, exact: true }).click();
    assert.ok((await navigated(page)).includes(target), reason);
  }
  const gone = await harness.open(t, { screen: "prep", params: { id: eventId }, responses: { [`${path}/prep`]: { __status: 404 } } });
  await gone.getByText("找不到这个活动", { exact: true }).waitFor();
  const failed = await harness.open(t, { screen: "prep", params: { id: eventId }, responses: { [`${path}/prep`]: { __status: 503, __code: "SERVICE_UNAVAILABLE" } } });
  await failed.getByText("没有成功，请再试一次", { exact: true }).waitFor();
  assert.equal(await failed.getByText("找不到这个活动", { exact: true }).count(), 0);
  const reads = () => failed.evaluate(() => (window as any).fixture.requests.filter((item: string) => item.includes("/prep")).length);
  const before = await reads();
  await failed.getByRole("button", { name: /重试|再试/u }).first().click();
  await failed.waitForTimeout(200);
  assert.ok((await reads()) > before, "read again");
});

test("only a confirmed registration offers 去做见面准备; in review or waitlisted the event page offers none", async (t) => {
  for (const [status, offered] of [["registered", 1], ["pending_review", 0], ["waitlisted", 0]] as const) {
    const page = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`${path}/overview`]: withStatus(status) } });
    await page.getByTestId("events-detail-cta").waitFor();
    assert.equal(await page.getByRole("button", { name: "去做见面准备", exact: true }).count(), offered, status);
    const note = page.getByTestId("events-detail-cta-status");
    if (offered) assert.equal(await note.count(), 0);
    else {
      await page.getByTestId("events-detail-more").waitFor();
      assert.equal(await note.innerText(), status === "waitlisted" ? "候补中 · 有空位会通知你" : "审核中 · 结果会通知你");
      const [text, more] = [(await note.boundingBox())!, (await page.getByTestId("events-detail-more").boundingBox())!];
      assert.ok(text.x + text.width <= more.x, "the status sits left of ⋯");
      assert.equal(await page.getByTestId("events-detail-cta").getByRole("button").count(), 1, "nothing else to tap");
    }
  }
});

test("seats (2026-11-27, as Web): no seat and no waitlist = 名额已满 (not tappable); with a waitlist = 排队候补; cancelled may register again; closed shows no entry", async (t) => {
  const cases = [
    [withStatus("none", { capacity: 20, remaining: 0, waitlistEnabled: false }), "events-detail-full", "名额已满"],
    [withStatus("none", { capacity: 20, remaining: 0, waitlistEnabled: true }), "events-detail-register", "排队候补"],
    [withStatus("cancelled", { capacity: 20, remaining: 3 }), "events-detail-register", null],
  ] as const;
  for (const [data, id, label] of cases) {
    const page = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`${path}/overview`]: data } });
    const button = page.getByTestId(id);
    await button.waitFor();
    if (label) assert.equal(await button.innerText(), label);
    if (id === "events-detail-full") assert.equal(await button.isDisabled(), true);
  }
  const closed = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`${path}/overview`]: withStatus("none", { registrationClosesAt: "2020-01-01T00:00:00+09:00" }) } });
  await closed.getByTestId("events-detail-save").or(closed.getByText(overview.title).first()).first().waitFor();
  assert.equal(await closed.getByTestId("events-detail-register").count(), 0);
});

test("the roster gate tells people in review to wait for approval, and others to register", async (t) => {
  for (const [status, text, cta] of [["pending_review", "审核通过后可以看到名字和一句话介绍", 0], ["waitlisted", "审核通过后可以看到名字和一句话介绍", 0], ["none", "报名后可以看到参加者的名字和一句话介绍", 1]] as const) {
    const event = withStatus(status, { attendees: [], rosterLocked: true });
    const detail = await harness.open(t, { screen: "detail", params: { id: eventId }, responses: { [`${path}/overview`]: event } });
    const gate = detail.getByTestId("events-detail-roster-gate");
    await gate.getByText(text, { exact: true }).waitFor();
    assert.equal(await gate.getByRole("button", { name: "去报名", exact: true }).count(), cta, `detail ${status}`);
    const people = await harness.open(t, { screen: "people", params: { id: eventId }, responses: { [`${path}/overview`]: event } });
    const locked = people.getByTestId("events-people-locked");
    await locked.getByText(text, { exact: true }).waitFor();
    assert.equal(await locked.getByRole("button", { name: "去报名", exact: true }).count(), cta, `people ${status}`);
  }
});
