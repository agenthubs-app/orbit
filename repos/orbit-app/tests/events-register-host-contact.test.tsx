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

test("the introduction on the review page is always sent: as drafted, trimmed and at most 400 characters, and not at all when emptied", async (t) => {
  const open = (selfIntro: unknown) => harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses({ lineId: null, note: null, wechatId: null }), [`${base}/join/profile`]: { ...profile, selfIntro } } });
  const sent = (page: Awaited<ReturnType<typeof open>>) => page.evaluate(() => (window as any).fixture.postBodies.find((call: any) => call.path.endsWith("/join/submit")).body.selfIntro);
  const apply = async (page: Awaited<ReturnType<typeof open>>) => { await page.getByRole("button", { name: "按这个内容报名", exact: true }).click(); await page.getByText("已收到报名", { exact: true }).waitFor(); };
  const drafted = await open({ source: "ai_draft", text: "  我在做 B2B SaaS。\n" });
  await apply(drafted);
  assert.equal(await sent(drafted), "我在做 B2B SaaS。");
  const long = await open({ source: "profile", text: "字".repeat(450) });
  await apply(long);
  assert.equal((await sent(long)).length, 400);
  const emptied = await open({ source: "ai_draft", text: "我在做 B2B SaaS。" });
  await emptied.getByRole("button", { name: "编辑", exact: true }).click();
  await emptied.locator("textarea").fill("   ");
  await apply(emptied);
  assert.equal(await sent(emptied), undefined);
  const none = await open(null);
  await apply(none);
  assert.equal(await sent(none), undefined);
});

test("first come, first served: 报名 → 确定参加 → 当天, nothing about a review or a result", async (t) => {
  const tentative = { endsAt: overview.endsAt ?? overview.startsAt, startsAt: overview.startsAt, title: overview.title };
  const done = async (status: string) => {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses({ lineId: null, note: null, wechatId: null }), [`${base}/join/submit`]: { ...result(null), status, tentative } } });
    await page.getByRole("button", { name: "按这个内容报名", exact: true }).click();
    await page.getByText("已收到报名", { exact: true }).waitFor();
    return page.getByTestId("events-join-done").innerText();
  };
  const confirmed = await done("registered");
  assert.match(confirmed, /报名[\s\S]*确定参加[\s\S]*当天/u);
  assert.doesNotMatch(confirmed, /审核|结果/u);
  const screened = await done("pending_review");
  assert.match(screened, /报名[\s\S]*审核[\s\S]*结果通知[\s\S]*当天/u);
  assert.match(screened, /结果出来后自动更新/u);
});

test("the review names everything attendees see, wrapped inside the card", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: responses({ lineId: null, note: null, wechatId: null }) });
  const line = page.getByText("名字 · 公司 · 行业 · 自我介绍 · 参加目的 · 想见的人 · 话题 · 能提供的 · 交流方式 · 会后联系方式", { exact: true });
  await line.waitFor();
  const box = (await line.boundingBox())!;
  assert.ok(box.x + box.width <= (page.viewportSize()?.width ?? 390) - 18, JSON.stringify(box));
  // 「参加目的」「想见的人」也公开给参加者，不再有「仅主办方」一行。
  assert.equal(await page.getByText("仅主办方", { exact: true }).count(), 0);
  const chip = (await page.getByText("所有参会者", { exact: true }).boundingBox())!;
  assert.ok(chip.height < 24, `the chip stays on one line: ${JSON.stringify(chip)}`);
});

test("an item filled from the profile says so; 编辑 asks that one item, and the mark goes once it is answered", async (t) => {
  const question = { allowCustom: true, field: "targetAttendees", help: "同场参会者也能看到（可多选）", max: null, multi: true, options: ["投资人", "创业者"], prompt: "这次活动上，你最想认识哪类人？", questionToken: "q-target" };
  const items = (fromProfile: boolean) => [{ done: true, key: "company" }, { done: true, key: "target", ...(fromProfile ? { fromProfile } : {}) }, { done: true, key: "offer", fromProfile: true }];
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses(null), [`${base}/join/profile`]: { ...profile, items: items(true) } } });
  await page.getByTestId("events-join-from-profile-target").waitFor();
  assert.equal(await page.getByText("来自资料", { exact: true }).count(), 2);
  assert.equal(await page.getByTestId("events-join-from-profile-company").count(), 0);
  const edit = page.getByRole("button", { name: "编辑 想见的人", exact: true });
  const [note, button] = [(await page.getByTestId("events-join-from-profile-target").boundingBox())!, (await edit.boundingBox())!];
  assert.ok(note.x + note.width <= button.x && button.x + button.width <= (page.viewportSize()?.width ?? 390) - 18, JSON.stringify([note, button]));
  await page.evaluate(([key, next]) => { (window as any).fixture.responses[key as string] = next; }, [`${base}/join/next`, { ...step, done: false, index: 1, question }] as const);
  await edit.click();
  await page.getByText(question.prompt, { exact: true }).waitFor();
  const asked = await page.evaluate(() => (window as any).fixture.postBodies.filter((call: any) => call.path.endsWith("/join/next")).at(-1).body);
  assert.deepEqual(asked, { answers: [], focus: "target", more: true });
  await page.evaluate(([next, shown, nextBody, shownBody]) => { const { responses } = (window as any).fixture; responses[next as string] = nextBody; responses[shown as string] = shownBody; },
    [`${base}/join/next`, `${base}/join/profile`, step, { ...profile, items: items(false) }] as const);
  await page.getByRole("button", { name: "投资人", exact: true }).click();
  await page.getByTestId("events-join-next").click();
  await page.getByTestId("events-join-from-profile-offer").waitFor();
  assert.equal(await page.getByTestId("events-join-from-profile-target").count(), 0);
  const last = await page.evaluate(() => (window as any).fixture.postBodies.filter((call: any) => call.path.endsWith("/join/next")).at(-1).body);
  assert.equal(last.answers[0].questionToken, "q-target");
  assert.ok(!("focus" in last), "answering goes on without a focus");
});

test("without fromProfile (an older server) the list is as before, with the same wording as the visibility line", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses(null), [`${base}/join/profile`]: { ...profile, items: [{ done: true, key: "purpose" }, { done: false, key: "offer" }] } } });
  await page.getByText("参加目的", { exact: true }).waitFor();
  assert.equal(await page.getByText("来自资料", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "添加", exact: true }).click();
  const asked = await page.evaluate(() => (window as any).fixture.postBodies.filter((call: any) => call.path.endsWith("/join/next")).at(-1).body);
  assert.deepEqual(asked, { answers: [], more: true });
});

// 改资料（2026-11-26）：已报名 / 审核中 / 候补再次提交 = 更新同一份；改不了的先说明。
const open = { ...overview, endsAt: "2099-12-10T21:30:00+09:00", registrationClosesAt: "2099-12-03T23:59:00+09:00", startsAt: "2099-12-10T19:00:00+09:00" };
const registered = (status: string, patch: object = {}) => ({ ...open, registration: { ...overview.registration, status }, ...patch });
const submits = (page: { evaluate<T>(fn: () => T): Promise<T> }) => page.evaluate(() => ((window as any).fixture.postBodies ?? []).filter((call: any) => call.path.endsWith("/join/submit")).map((call: any) => call.body));

test("someone already registered, in review or waitlisted changes the same registration: edit is sent and the done page says it was saved, without the calendar or the host contact popup", async (t) => {
  const tentative = { endsAt: open.endsAt, startsAt: open.startsAt, title: open.title };
  for (const status of ["pending_review", "waitlisted", "registered"]) {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses(null), [`${base}/overview`]: registered(status), [`${base}/join/profile`]: { ...profile, review: status !== "registered" },
      [`${base}/join/submit`]: { ...result({ lineId: "orbit_line", note: null, wechatId: null }), status: status === "registered" ? "registered" : "pending_review", tentative } } });
    await page.getByRole("button", { name: "按这个内容报名", exact: true }).click();
    await page.getByText("修改已保存", { exact: true }).waitFor();
    assert.equal((await submits(page))[0].edit, true, status);
    assert.equal(await page.getByText("已收到报名", { exact: true }).count(), 0);
    assert.equal(await page.getByTestId("events-join-calendar").count(), 0);
    assert.equal(await page.getByTestId("host-contact-sheet").count(), 0);
  }
  for (const status of ["none", "cancelled"]) {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses(null), [`${base}/overview`]: registered(status), [`${base}/join/submit`]: { ...result(null), tentative } } });
    await page.getByRole("button", { name: "按这个内容报名", exact: true }).click();
    await page.getByText("已收到报名", { exact: true }).waitFor();
    assert.ok(!("edit" in (await submits(page))[0]), `${status} registers anew`);
    assert.equal(await page.getByTestId("events-join-calendar").count(), 1);
  }
});

test("what cannot be changed is said on arrival, with the way to the event page", async (t) => {
  const past = { registrationClosesAt: "2026-10-03T23:59:00+09:00" };
  for (const [event, review, text] of [
    [registered("rejected"), true, "报名未通过，不能再次提交"],
    [registered("registered", past), false, "报名已截止"],
    [registered("pending_review", past), true, "报名已截止"],
    [registered("registered"), true, "报名已通过审核，不能再修改"],
  ] as const) {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses(null), [`${base}/overview`]: event, [`${base}/join/profile`]: { ...profile, review } } });
    const card = page.getByTestId("events-join-blocked");
    await card.getByText(text, { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "按这个内容报名", exact: true }).count(), 0);
    await card.getByRole("button", { name: "去活动详情", exact: true }).click();
    assert.ok((await page.evaluate(() => JSON.stringify((window as any).fixture.navigation))).includes(`/events/${encodeURIComponent(eventId)}`));
  }
});

test("a refusal says why and the page follows what changed: after a cancellation the next one registers anew", async (t) => {
  const page = await harness.open(t, { screen: "register", toasts: true, params: { id: eventId }, responses: { ...responses(null), [`${base}/overview`]: registered("pending_review"), [`${base}/join/submit`]: { __code: "CONFLICT", __reason: "JOIN_CANCELLED", __status: 409 } } });
  const apply = page.getByRole("button", { name: "按这个内容报名", exact: true });
  await apply.waitFor();
  await page.evaluate(([key, value]) => { (window as any).fixture.responses[key as string] = value; }, [`${base}/overview`, registered("cancelled")] as const);
  await apply.click();
  await page.getByText("报名已取消，请重新报名", { exact: true }).waitFor();
  await page.evaluate(([key, value]) => { (window as any).fixture.responses[key as string] = value; }, [`${base}/join/submit`, result(null)] as const);
  await page.waitForTimeout(200);
  await apply.click();
  await page.getByText("已收到报名", { exact: true }).waitFor();
  assert.deepEqual((await submits(page)).map((body: any) => body.edit), [true, undefined]);
  const reasons = [["JOIN_CLOSED", "报名已截止"], ["JOIN_LOCKED", "报名已通过审核，不能再修改"], ["JOIN_REJECTED", "报名未通过，不能再次提交"], [undefined, "没能报名"]] as const;
  for (const [reason, text] of reasons) {
    const refused = await harness.open(t, { screen: "register", toasts: true, params: { id: eventId }, responses: { ...responses(null), [`${base}/overview`]: registered("none"), [`${base}/join/submit`]: { __code: "CONFLICT", __reason: reason, __status: 409 } } });
    await refused.getByRole("button", { name: "按这个内容报名", exact: true }).click();
    await refused.getByText(text, { exact: true }).waitFor();
  }
});

test("sent before the event overview arrived: whether it changes a registration is still known", async (t) => {
  for (const [status, edit, title] of [["registered", true, "修改已保存"], ["none", undefined, "已收到报名"]] as const) {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, slowPrefix: `${base}/overview`, slowMs: 2500, responses: { ...responses(null), [`${base}/overview`]: registered(status), [`${base}/join/profile`]: { ...profile, review: false }, [`${base}/join/submit`]: { ...result(null), status: "registered" } } });
    await page.getByRole("button", { name: "按这个内容报名", exact: true }).click();
    await page.getByText(title, { exact: true }).waitFor();
    assert.equal((await submits(page))[0].edit, edit, status);
    // A new registration reads as 「registered」 from now on; the page keeps what was sent.
    await page.waitForTimeout(400);
    assert.equal(await page.getByText(title, { exact: true }).count(), 1);
  }
});
