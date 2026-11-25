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
const current = (status: string, patch: object = {}) => ({ answers: [], ask: [], blocked: null, selfIntro: null, status, ...patch });
const responses = (hostContact: unknown) => ({ [`${base}/overview`]: overview, [`${base}/join/current`]: current("none"), [`${base}/join/next`]: step, [`${base}/join/profile`]: profile, [`${base}/join/submit`]: result(hostContact) });

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

// 改资料（2026-11-26）：进页先读 join/current；已报名 / 审核中 / 候补从上次的回答和介绍开始，逐项改；改不了的先说明。
const q = (field: string, prompt: string, options: string[], patch: object = {}) => ({ allowCustom: true, field, help: null, max: null, multi: true, options, prompt, questionToken: `token-${field}`, ...patch });
const stored = (field: string, answer: string, item: string | null, question: object) => ({ answer, field, item, prompt: `旧：${field}`, question, questionToken: `token-${field}` });
const target = q("targetAttendees", "想见谁？", ["投资人", "创业者", "客户"], { prefill: ["投资人"] });
const diet = q("host:lib-diet", "有饮食限制吗", ["无", "素食"], { allowCustom: false, multi: false, prefill: ["无"], questionToken: "host:lib-diet" });
const mine = (status: string, patch: object = {}) => current(status, { answers: [stored("host:lib-diet", "无", null, diet), stored("targetAttendees", "投资人", "target", target)], selfIntro: "第一版介绍。", ...patch });
const editItems = [{ done: true, key: "company" }, { done: true, key: "target" }, { done: true, fromProfile: true, key: "offer" }, { done: false, key: "topics" }];
const tentative = { endsAt: "2099-12-10T21:30:00+09:00", startsAt: "2099-12-10T19:00:00+09:00", title: overview.title };
const editing = (status: string, patch: object = {}) => ({ ...responses({ lineId: "orbit_line", note: null, wechatId: null }), [`${base}/join/current`]: mine(status, patch), [`${base}/join/profile`]: { ...profile, items: editItems, selfIntro: { source: "profile", text: "资料里的介绍。" } },
  [`${base}/join/submit`]: { ...result({ lineId: "orbit_line", note: null, wechatId: null }), status: status === "registered" ? "registered" : "pending_review", tentative } });
type Harnessed = Awaited<ReturnType<typeof harness.open>>;
const posts = (page: Harnessed, end: string) => page.evaluate((suffix) => ((window as any).fixture.postBodies ?? []).filter((call: any) => call.path.endsWith(suffix)).map((call: any) => call.body), end);
const answer = (page: Harnessed, key: string, value: unknown) => page.evaluate(([path, body]) => { (window as any).fixture.responses[path as string] = body; }, [key, value] as const);
const save = (page: Harnessed) => page.getByRole("button", { name: "保存修改", exact: true });

test("someone registered, in review or waitlisted starts on the review with the last answers and introduction; nothing is asked or drafted again", async (t) => {
  for (const status of ["pending_review", "waitlisted", "registered"]) {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: editing(status) });
    await save(page).waitFor();
    await page.getByText("第一版介绍。", { exact: true }).waitFor();
    assert.equal(await page.getByText("资料里的介绍。", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "按这个内容报名", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "回到问题", exact: true }).count(), 0);
    assert.equal(await page.getByText("AI 根据回答写好了草稿", { exact: true }).count(), 0);
    assert.deepEqual(await posts(page, "/join/next"), []);
    const given = [{ answer: "无", field: "host:lib-diet", prompt: "旧：host:lib-diet", questionToken: "host:lib-diet" }, { answer: "投资人", field: "targetAttendees", prompt: "旧：targetAttendees", questionToken: "token-targetAttendees" }].map((item) => ({ ...item, questionToken: `token-${item.field}` }));
    assert.deepEqual(await posts(page, "/join/profile"), [{ answers: given, draft: false, edit: true }]);
    await save(page).click();
    await page.getByText("修改已保存", { exact: true }).waitFor();
    const [body] = await posts(page, "/join/submit");
    assert.deepEqual([body.answers, body.edit, body.selfIntro], [given, true, "第一版介绍。"], "unchanged, sent back as it was");
    assert.equal(await page.getByTestId("events-join-calendar").count(), 0);
    assert.equal(await page.getByTestId("host-contact-sheet").count(), 0);
  }
});

test("编辑 shows that one question with the last answer selected, replaces that answer and comes back; ‹ comes back without changing it", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: editing("pending_review") });
  await page.getByRole("button", { name: "编辑 想见的人", exact: true }).click();
  await page.getByText("想见谁？", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("events-join-next").isDisabled(), false, "the last answer is selected");
  for (const text of ["旧：targetAttendees", "✓ 公司、职位、行业已从资料填好，只需回答几个问题"]) assert.equal(await page.getByText(text, { exact: true }).count(), 0, text);
  assert.equal(await page.getByText("约剩", { exact: false }).count(), 0, "no progress");
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await save(page).waitFor();
  // A host question of its own: its prompt as a row.
  assert.match(await page.getByTestId("events-join-edit-host:lib-diet").innerText(), /有饮食限制吗/u);
  await page.getByRole("button", { name: "编辑 有饮食限制吗", exact: true }).click();
  await page.getByRole("button", { name: "素食", exact: true }).click();
  await page.getByTestId("events-join-next").click();
  await save(page).waitFor();
  await page.getByRole("button", { name: "编辑 想见的人", exact: true }).click();
  await page.getByRole("button", { name: "创业者", exact: true }).click();
  await page.getByPlaceholder("自由回答或补充").fill("高校");
  await page.getByTestId("events-join-next").click();
  // Opened again it starts from what was just answered, the written one included.
  await page.getByRole("button", { name: "编辑 想见的人", exact: true }).click();
  await page.getByRole("button", { name: "高校", exact: true }).waitFor();
  await page.getByRole("button", { name: "下一步（已选3个）", exact: true }).waitFor();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await save(page).click();
  await page.getByText("修改已保存", { exact: true }).waitFor();
  const [body] = await posts(page, "/join/submit");
  assert.deepEqual(body.answers.map((item: any) => [item.field, item.answer]), [["host:lib-diet", "素食"], ["targetAttendees", "投资人 · 创业者 · 高校"]]);
  assert.deepEqual(await posts(page, "/join/next"), [], "no interview");
  assert.ok((await posts(page, "/join/profile")).every((item: any) => item.edit === true && item.draft === false));
});

test("what the host added since is asked first and cannot be skipped; then the review", async (t) => {
  const added = { ...q("host:new", "想喝什么？", ["茶", "咖啡"], { allowCustom: false, multi: false, questionToken: "host:new" }), item: null };
  const free = { ...q("host:note", "想说的话", [], { allowCustom: true, questionToken: "host:note" }), item: null };
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: editing("registered", { ask: [added, free] }) });
  await page.getByText("想喝什么？", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "返回", exact: true }).count(), 0);
  assert.equal(await save(page).count(), 0);
  await page.getByRole("button", { name: "茶", exact: true }).click();
  await page.getByTestId("events-join-next").click();
  await page.getByText("想说的话", { exact: true }).waitFor();
  await page.getByPlaceholder("自由回答或补充").fill("请多关照");
  await page.getByTestId("events-join-next").click();
  await save(page).click();
  await page.getByText("修改已保存", { exact: true }).waitFor();
  const [body] = await posts(page, "/join/submit");
  assert.deepEqual(body.answers.slice(-2).map((item: any) => [item.field, item.answer]), [["host:new", "茶"], ["host:note", "请多关照"]]);
});

test("in an edit, an item filled from the profile or missing still asks through next with its focus", async (t) => {
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...editing("pending_review"), [`${base}/join/next`]: { ...step, done: false, index: 3, question: q("experienceHighlight", "想聊什么？", ["AI"]), total: 5 } } });
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByText("想聊什么？", { exact: true }).waitFor();
  assert.deepEqual((await posts(page, "/join/next")).map((body: any) => [body.focus, body.more]), [["topics", true]]);
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByTestId("events-join-next").click();
  await save(page).click();
  await page.getByText("修改已保存", { exact: true }).waitFor();
  const [body] = await posts(page, "/join/submit");
  assert.deepEqual(body.answers.at(-1), { answer: "AI", field: "experienceHighlight", prompt: "想聊什么？", questionToken: "token-experienceHighlight" });
});

test("what cannot be changed is said on arrival, with the way to the event page; nothing is asked", async (t) => {
  for (const [status, blocked, text] of [["rejected", "JOIN_REJECTED", "报名未通过，不能再次提交"], ["registered", "JOIN_CLOSED", "报名已截止"], ["registered", "JOIN_LOCKED", "报名已通过审核，不能再修改"]] as const) {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses(null), [`${base}/join/current`]: current(status, { blocked }) } });
    const card = page.getByTestId("events-join-blocked");
    await card.getByText(text, { exact: true }).waitFor();
    assert.deepEqual(await posts(page, "/join/next"), []);
    await card.getByRole("button", { name: "去活动详情", exact: true }).click();
    assert.ok((await page.evaluate(() => JSON.stringify((window as any).fixture.navigation))).includes(`/events/${encodeURIComponent(eventId)}`));
  }
});

test("nothing is asked or sent until it is known whether this is new; when that cannot be read there is a retry", async (t) => {
  const slow = await harness.open(t, { screen: "register", params: { id: eventId }, slowPrefix: `${base}/join/current`, slowMs: 900, responses: responses(null) });
  await slow.waitForTimeout(300);
  assert.deepEqual([await posts(slow, "/join/next"), await slow.getByTestId("events-join-apply").count()], [[], 0]);
  await slow.getByRole("button", { name: "按这个内容报名", exact: true }).click();
  await slow.getByText("已收到报名", { exact: true }).waitFor();
  assert.ok(!("edit" in (await posts(slow, "/join/submit"))[0]));
  const failed = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...responses(null), [`${base}/overview`]: { ...overview, endsAt: tentative.endsAt, registrationClosesAt: tentative.startsAt, startsAt: tentative.startsAt }, [`${base}/join/current`]: { __status: 503 } } });
  await failed.getByTestId("events-join-error").waitFor();
  assert.deepEqual(await posts(failed, "/join/next"), []);
  await answer(failed, `${base}/join/current`, current("cancelled"));
  await failed.getByRole("button", { name: "再试一次", exact: true }).click();
  await failed.getByRole("button", { name: "按这个内容报名", exact: true }).waitFor();
});

test("a refusal on sending: closed, decided or turned down takes the place of the page; cancelled starts over as a new registration", async (t) => {
  for (const [reason, text] of [["JOIN_CLOSED", "报名已截止"], ["JOIN_LOCKED", "报名已通过审核，不能再修改"], ["JOIN_REJECTED", "报名未通过，不能再次提交"]] as const) {
    const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: { ...editing("pending_review"), [`${base}/join/submit`]: { __code: "CONFLICT", __reason: reason, __status: 409 } } });
    await save(page).click();
    await page.getByTestId("events-join-blocked").getByText(text, { exact: true }).waitFor();
  }
  const other = await harness.open(t, { screen: "register", toasts: true, params: { id: eventId }, responses: { ...editing("pending_review"), [`${base}/join/submit`]: { __code: "CONFLICT", __status: 409 } } });
  await save(other).click();
  await other.getByText("没能报名", { exact: true }).waitFor();
  const page = await harness.open(t, { screen: "register", toasts: true, params: { id: eventId }, responses: { ...editing("pending_review"), [`${base}/join/submit`]: { __code: "CONFLICT", __reason: "JOIN_CANCELLED", __status: 409 } } });
  await save(page).waitFor();
  await answer(page, `${base}/join/current`, current("cancelled"));
  await answer(page, `${base}/join/profile`, profile);
  await save(page).click();
  await page.getByText("报名已取消，请重新报名", { exact: true }).waitFor();
  const apply = page.getByRole("button", { name: "按这个内容报名", exact: true });
  await apply.waitFor();
  await answer(page, `${base}/join/submit`, result(null));
  await apply.click();
  await page.getByText("已收到报名", { exact: true }).waitFor();
  const bodies = await posts(page, "/join/submit");
  assert.deepEqual(bodies.map((body: any) => [body.edit, body.answers.length]), [[true, 2], [undefined, 0]]);
});

test("eleven last answers (five of the host's and six of the interview) are all sent back", async (t) => {
  const fields = [...Array.from({ length: 5 }, (_, index) => `host:q${index}`), ...Array.from({ length: 6 }, (_, index) => `field${index}`)];
  const page = await harness.open(t, { screen: "register", params: { id: eventId }, responses: editing("pending_review", { answers: fields.map((field) => stored(field, "A", null, q(field, `题 ${field}`, ["A", "B"], { prefill: ["A"] }))) }) });
  await page.getByRole("button", { name: "编辑 题 field5", exact: true }).waitFor();
  await save(page).click();
  await page.getByText("修改已保存", { exact: true }).waitFor();
  const [body] = await posts(page, "/join/submit");
  assert.deepEqual(body.answers.map((item: any) => item.field), fields);
});
