import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// 参加者（b13 HM-P1–P9，2026-11-26）：手机上办完审核——行尾承認、左滑待ち/見送り、长按或「選択」进入选择模式批量、
// 見送り 一律先确认、详情里直接决定、搜索与「プロフィール未完了」、さらに表示、还没有申込时的链接与 QR。
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([{ name: "console", importPath: "./src/screens/host/HostConsole", exportName: "HostConsoleScreen" }]);
});
after(async () => { await harness.close(); });

const people = JSON.parse(readFileSync(new URL("./fixtures/host/people.json", import.meta.url), "utf8"));
const eventId = people.event.eventId as string;
const base = `/api/host/events/${encodeURIComponent(eventId)}`;
const [morita, aoki, matsumoto] = people.rows as { actorId: string; name: string }[];
const decided = (actorId: string, status: string) => ({ actorId, applicationVersion: 2, notified: 1, receptionNumber: null, status });
const person = { actorId: morita!.actorId, attendCount: 2, checkedInAt: null, eventId, hostAnswers: [], initial: "森", matching: null, name: morita!.name, needs: [], offers: [], org: null, profile: [], receptionNumber: null, role: null, source: "application", status: "pending", submittedAt: "2026-10-01T03:00:00.000Z", topics: [] };
const open = (t: Parameters<typeof harness.open>[0], patch: Record<string, unknown> = {}) => harness.open(t, {
  screen: "console", language: "ja", toasts: true, params: { id: eventId, seg: "people", bucket: "pending" },
  responses: { [`${base}/people`]: people, [`${base}/people/`]: decided(morita!.actorId, "approved") }, ...patch,
});
type Page = Awaited<ReturnType<typeof open>>;
const decisions = (page: Page) => page.evaluate(() => ((window as any).fixture.postBodies ?? []).filter((call: any) => call.path.endsWith("/decision")).map((call: any) => [call.path.split("/people/")[1].replace("/decision", ""), call.body.decision]));
const confirms = (page: Page) => page.evaluate(() => (window as any).fixture.confirms ?? []);
const reads = (page: Page) => page.evaluate(() => (window as any).fixture.requests.filter((item: string) => item.includes("/people?")));

test("a row approves on its own; the list shows approved / capacity, the profile score, and no line sending people to a computer", async (t) => {
  const page = await open(t);
  await page.getByTestId(`host-approve-${morita!.actorId}`).click();
  await page.getByText(`${morita!.name}さんを承認にしました`, { exact: false }).waitFor();
  assert.deepEqual(await decisions(page), [[encodeURIComponent(morita!.actorId), "approve"]]);
  const capacity = await page.getByTestId("host-people-capacity").innerText();
  assert.match(capacity, /承認済み\s*104\s*\/\s*150/u);
  assert.match(capacity, /残り枠 46/u);
  assert.equal(await page.getByText(/PC/u).count(), 0);
});

test("見送り always asks first (it notifies them and cannot be undone); keeping it sends nothing", async (t) => {
  const page = await open(t);
  await page.getByTestId(`host-swipe-reject-${aoki!.actorId}`).dispatchEvent("click");
  await page.waitForTimeout(150);
  assert.deepEqual(await confirms(page), [{ message: "申込者に Orbit から定型文でお知らせします。この操作は取り消せません。", title: `${aoki!.name}さんを見送りにしますか？` }]);
  assert.deepEqual(await decisions(page), []);
  await page.evaluate(() => { (window as any).fixture.confirmNext = true; });
  await page.getByTestId(`host-swipe-reject-${aoki!.actorId}`).dispatchEvent("click");
  await page.getByText(/見送り/u).first().waitFor();
  await page.waitForTimeout(150);
  assert.deepEqual(await decisions(page), [[encodeURIComponent(aoki!.actorId), "reject"]]);
  // 待ち needs no confirmation.
  await page.getByTestId(`host-swipe-wait-${matsumoto!.actorId}`).dispatchEvent("click");
  await page.waitForTimeout(150);
  assert.equal((await confirms(page)).length, 2);
  assert.deepEqual((await decisions(page)).at(-1), [encodeURIComponent(matsumoto!.actorId), "waitlist"]);
});

test("選択 → pick rows → the bottom bar approves them one by one; a conflict stays selected and says so", async (t) => {
  const page = await open(t, { responses: { [`${base}/people`]: people, [`${base}/people/`]: decided("x", "approved"), [`${base}/people/${encodeURIComponent(aoki!.actorId)}/decision`]: { __status: 409, __code: "CONFLICT" } } });
  await page.getByTestId("host-people-select").click();
  await page.getByTestId("host-people-selhead").waitFor();
  assert.equal(await page.getByTestId(`host-approve-${morita!.actorId}`).count(), 0, "no row buttons while selecting");
  await page.getByTestId(`host-check-${morita!.actorId}`).click();
  await page.getByTestId(`host-check-${aoki!.actorId}`).click();
  await page.getByText("2名を選択中").first().waitFor();
  await page.getByTestId("host-bulk-approve").click();
  await page.getByText("1名を更新しました。1名は更新できませんでした", { exact: false }).waitFor();
  assert.deepEqual(await decisions(page), [[encodeURIComponent(morita!.actorId), "approve"], [encodeURIComponent(aoki!.actorId), "approve"]]);
  await page.getByTestId(`host-row-${aoki!.actorId}`).getByRole("alert").waitFor();
  await page.getByText("1名を選択中").first().waitFor(); // the failed row stays selected
});

test("全員を選択 and bulk 見送り ask once for all of them", async (t) => {
  const page = await open(t, { confirmNext: true });
  await page.getByTestId("host-people-select").click();
  await page.getByTestId("host-select-all").click();
  await page.getByText(`${people.rows.length}名を選択中`).first().waitFor();
  await page.getByTestId("host-bulk-reject").click();
  await page.waitForTimeout(300);
  assert.deepEqual(await confirms(page), [{ message: "申込者に Orbit から定型文でお知らせします。この操作は取り消せません。", title: `${people.rows.length}名を見送りにしますか？` }]);
  assert.equal((await decisions(page)).length, people.rows.length);
});

test("the detail decides too: 承認 / 待ち / 見送り at its foot, 見送り asking first", async (t) => {
  const page = await open(t, { responses: { [`${base}/people`]: people, [`${base}/people/${encodeURIComponent(morita!.actorId)}/decision`]: decided(morita!.actorId, "waitlisted"), [`${base}/people/${encodeURIComponent(morita!.actorId)}`]: person } });
  await page.getByTestId(`host-person-open-${morita!.actorId}`).click();
  const foot = page.getByTestId("host-person-decide");
  await foot.waitFor();
  assert.match(await foot.innerText(), /理由は相手に表示されません/u);
  await page.getByTestId("host-person-reject").click();
  await page.waitForTimeout(150);
  assert.equal((await confirms(page)).length, 1);
  assert.deepEqual(await decisions(page), []);
  await page.getByTestId("host-person-wait").click();
  await page.waitForTimeout(200);
  assert.deepEqual(await decisions(page), [[encodeURIComponent(morita!.actorId), "waitlist"]]);
});

test("search and the incomplete chip go to the server; nothing matching offers to clear them", async (t) => {
  const page = await open(t);
  await page.getByTestId("host-people-incomplete").click();
  await page.getByTestId("host-people-search").fill("森田");
  await page.waitForTimeout(500);
  const last = (await reads(page)).at(-1) as string;
  assert.match(last, /bucket=pending/u); assert.match(last, /incomplete=1/u); assert.match(last, /q=%E6%A3%AE%E7%94%B0/u);
  await page.evaluate(([key, value]) => { (window as any).fixture.responses[key as string] = value; }, [`${base}/people`, { ...people, rows: [], more: 0, nextCursor: null }] as const);
  await page.getByTestId("host-people-search").fill("森田 拓");
  const none = page.getByTestId("host-people-nomatch");
  await none.waitFor();
  await none.getByRole("button", { name: "検索をクリア" }).waitFor();
  await none.getByRole("button", { name: "絞り込みを外す" }).waitFor();
});

test("さらに表示 reads the next page with the cursor and appends", async (t) => {
  const page = await open(t);
  await page.evaluate(([key, value]) => { (window as any).fixture.responses[key as string] = value; }, [`${base}/people?bucket=pending&cursor=`, { ...people, more: 0, nextCursor: null, rows: [{ ...people.rows[0], actorId: "actor:next", initial: "次", name: "次の 人" }] }] as const);
  await page.getByTestId("host-people-load-more").click();
  await page.getByText("次の 人").waitFor();
  assert.ok((await page.getByTestId(`host-person-open-${morita!.actorId}`).count()) === 1, "the first page stays");
});

test("no application yet: the sign-up link with copy and QR (HM-P7)", async (t) => {
  const empty = { ...people, counts: { approved: 0, pending: 0, rejected: 0, waitlisted: 0 }, rows: [], more: 0, nextCursor: null };
  const page = await open(t, { responses: { [`${base}/people`]: empty } });
  const card = page.getByTestId("host-people-empty");
  await card.waitFor();
  assert.match(await card.innerText(), /e\/cfo-night-18/u);
  await card.getByRole("button", { name: "QR コード" }).click();
  await page.getByTestId("host-people-qr").waitFor();
});

test("a long press starts selecting with that row already chosen", async (t) => {
  const page = await open(t);
  const row = page.getByTestId(`host-person-open-${aoki!.actorId}`);
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.getByText("1名を選択中").first().waitFor();
  await page.waitForTimeout(200);
  assert.equal(await page.getByText("1名を選択中").count() > 0, true);
});

test("the detail shows the profile score with what is missing, and this event's introduction", async (t) => {
  const page = await open(t, { responses: { [`${base}/people`]: people, [`${base}/people/${encodeURIComponent(morita!.actorId)}`]: { ...person, intro: "SaaS をやっています。", missing: ["topics", "offer"], profileScore: 60 } } });
  await page.getByTestId(`host-person-open-${morita!.actorId}`).click();
  const score = page.getByTestId("host-person-score");
  await score.waitFor();
  assert.match(await score.innerText(), /プロフィール 60%[\s\S]*話したいテーマ・提供できることが未入力/u);
  assert.match(await page.getByTestId("host-person-intro").innerText(), /SaaS をやっています。/u);
});
