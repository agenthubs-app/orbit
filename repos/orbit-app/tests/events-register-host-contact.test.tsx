import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { journeyOverview } from "../../orbits/shared/mock/demo-world/events-journey";
import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// 申込完了（RegisterPage）：结果里有微信 / LINE 时自动弹出主办方联系方式，关掉后完成页保留同一张卡片；没有 ID 不弹。
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([{ name: "register", importPath: "./src/screens/events/v2/RegisterPage", exportName: "RegisterPage" }]);
});
after(async () => { await harness.close(); });

const overview = { ...journeyOverview("many", "app"), priceYen: 3000 };
const eventId = overview.eventId;
const base = `/api/events/${encodeURIComponent(eventId)}`;
const step = { done: true, index: 3, question: null, remainingMinutes: 0, total: 3 };
const profile = { coverage: 80, items: [{ done: true, key: "company" }], review: true, selfIntro: { source: "profile", text: "做 B2B SaaS。" }, topics: ["SaaS"] };
const result = (hostContact: unknown) => ({ eventId, hostContact, startsAt: overview.startsAt, status: "pending_review", submittedAt: "2026-11-14T03:00:00.000Z" });
const responses = (hostContact: unknown) => ({ [`${base}/overview`]: overview, [`${base}/join/next`]: step, [`${base}/join/profile`]: profile, [`${base}/join/submit`]: result(hostContact) });

test("with a WeChat / LINE ID the contact opens right after applying; closing it leaves the same card on the done page", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: responses({ lineId: "orbit_line", note: "加好友时请备注姓名", wechatId: "orbit_wx" }) });
  await page.getByRole("button", { name: "按这个内容报名", exact: true }).click();
  await page.getByText("已收到报名", { exact: true }).waitFor();
  const sheet = page.getByTestId("host-contact-sheet");
  await sheet.waitFor();
  await sheet.getByText("orbit_wx", { exact: true }).waitFor();
  await sheet.getByText("请联系主办方完成付款，主办方确认后会通过审核。", { exact: true }).waitFor();
  await sheet.getByRole("button", { name: "关闭", exact: true }).click();
  await sheet.waitFor({ state: "detached" });
  const card = page.getByTestId("host-contact");
  await card.getByText("orbit_line", { exact: true }).waitFor();
  assert.equal(await card.getByRole("button", { name: "复制LINE", exact: true }).count(), 1);
  // Pending with an ID: the status card says to contact the organizer instead of the generic wait line.
  assert.equal(await page.getByText("请联系主办方完成付款，主办方确认后会通过审核。", { exact: true }).count(), 1);
});

test("without an ID nothing pops up; the done page still shows the card with 暂无", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: responses({ lineId: null, note: "当天现场联系", wechatId: null }) });
  await page.getByRole("button", { name: "按这个内容报名", exact: true }).click();
  await page.getByText("已收到报名", { exact: true }).waitFor();
  await page.getByTestId("host-contact-empty").getByText("暂无", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("host-contact-sheet").count(), 0);
  assert.equal(await page.getByText("请联系主办方", { exact: false }).count(), 0);
});
