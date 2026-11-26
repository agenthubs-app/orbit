import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// 页头与概要（b13 HM-T1–T3，2026-11-26）：每一页同一排 6 个页签和右上「⋯」（共同運営者 · 基本情報を編集 · 参加コードを再発行 ·
// 申込ページを開く · イベントを中止）；下書き 横幅直接 公開する（确认三行）；中止 要确认、可写一句（不能带链接）；不再引导去电脑。
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([{ name: "console", importPath: "./src/screens/host/HostConsole", exportName: "HostConsoleScreen" }]);
});
after(async () => { await harness.close(); });

const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/host/${name}.json`, import.meta.url), "utf8"));
const overview = read("overview");
const people = read("people");
const eventId = overview.event.eventId as string;
const base = `/api/host/events/${encodeURIComponent(eventId)}`;
const written = (event: object) => ({ changePreview: null, event: { ...overview.event, ...event, version: overview.event.version + 1 }, notified: 128 });
const cohosts = {
  canManage: true, eventId, eventTitle: overview.event.title, history: [{ action: "changed", at: "2026-10-01T03:00:00.000Z", byName: "林 美穂", reason: "当日の受付をお願いするため", role: "check_in", subjectName: "伊藤 直子" }],
  invites: [], members: [
    { actorId: "actor:me", initial: "林", isMe: true, name: "林 美穂", org: "CFO Night", revision: 1, role: "owner" },
    { actorId: "actor:ito", initial: "伊", isMe: false, name: "伊藤 直子", org: null, revision: 4, role: "check_in" },
  ],
};
const open = (t: Parameters<typeof harness.open>[0], patch: Record<string, unknown> = {}, seg?: string) => harness.open(t, {
  screen: "console", language: "ja", toasts: true, params: { id: eventId, ...(seg ? { seg } : {}) },
  responses: { [`${base}/overview`]: overview, [`${base}/people`]: people, [`${base}/cohosts`]: cohosts, [`${base}/code/reissue`]: written({ participationCode: "NEWCODE1" }), [`${base}/cancel`]: written({ status: "cancelled" }), [`${base}/publish`]: written({ status: "upcoming" }) },
  ...patch,
});
type Page = Awaited<ReturnType<typeof open>>;
const bodies = (page: Page, suffix: string) => page.evaluate((end) => ((window as any).fixture.postBodies ?? []).filter((call: any) => call.path.endsWith(end)).map((call: any) => call.body), suffix);
const sheets = (page: Page) => page.evaluate(() => (window as any).fixture.sheets ?? []);
// The header ⋯ comes first (the participants page has its own ⋯ by the search).
const more = (page: Page) => page.getByRole("button", { name: "その他の操作", exact: true }).first();

test("every page has the same six tabs and the ⋯ menu; nothing sends the organizer to a computer", async (t) => {
  for (const seg of [undefined, "people", "matching"]) {
    const page = await open(t, { responses: { [`${base}/overview`]: overview, [`${base}/people`]: people, [`${base}/matching`]: read("matching") } }, seg);
    const tabs = page.getByTestId("host-console-segs");
    await tabs.waitFor();
    assert.match(await tabs.innerText(), /概要[\s\S]*マッチング[\s\S]*参加者 12[\s\S]*受付[\s\S]*申込設定[\s\S]*レポート/u, String(seg));
    await more(page).click();
    await page.waitForTimeout(100);
    assert.deepEqual((await sheets(page))[0].options, ["cohosts", "edit", "reissue", "open", "cancel"], String(seg));
    // マッチング 的只读说明在第 3 块换掉。
    if (seg !== "matching") assert.equal(await page.getByText(/PC/u).count(), 0, String(seg));
  }
});

test("参加コードを再発行 asks first, then shows the new code", async (t) => {
  const page = await open(t, { confirmNext: true, sheetNext: "reissue" });
  await more(page).waitFor();
  await more(page).click();
  await page.getByText("NEWCODE1", { exact: false }).waitFor();
  assert.deepEqual(await bodies(page, "/code/reissue"), [{ expectedVersion: overview.event.version }]);
});

test("イベントを中止 needs a confirmation; the note is optional, 140 characters at most and without links", async (t) => {
  const page = await open(t, { sheetNext: "cancel" });
  await more(page).waitFor();
  await more(page).click();
  const sheet = page.getByTestId("host-cancel-sheet");
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /申込済み 128名 · キャンセル待ち 8名に通知/u);
  await page.getByTestId("host-cancel-note").fill("詳しくは https://example.com");
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByTestId("host-cancel-confirm").isDisabled(), true);
  await page.getByTestId("host-cancel-note").fill("会場の都合で中止します");
  await page.getByTestId("host-cancel-confirm").click();
  await page.waitForTimeout(200);
  assert.deepEqual(await bodies(page, "/cancel"), [{ expectedVersion: overview.event.version, hostNote: "会場の都合で中止します" }]);
});

test("a draft says so with 公開する on the phone; publishing confirms date, capacity and deadline first", async (t) => {
  const draft = { ...overview, event: { ...overview.event, status: "draft" } };
  const page = await open(t, { responses: { [`${base}/overview`]: draft, [`${base}/publish`]: written({ status: "upcoming" }) } });
  const banner = page.getByTestId("host-banner-draft");
  await banner.waitFor();
  assert.equal(await page.getByTestId("host-open-check-in").count(), 0, "nothing to check in yet");
  await page.getByTestId("host-publish-event").click();
  const sheet = page.getByTestId("host-publish-sheet");
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /日時[\s\S]*定員[\s\S]*申込締切/u);
  await page.getByTestId("host-publish-confirm").click();
  await page.waitForTimeout(200);
  assert.deepEqual(await bodies(page, "/publish"), [{ expectedVersion: overview.event.version }]);
});

test("共同運営者: invite with a role and get the one-time link and code; a member's role change needs a reason", async (t) => {
  const page = await open(t, { responses: { [`${base}/overview`]: overview, [`${base}/cohosts`]: cohosts, [`${base}/cohost-invites`]: { expiresAt: "2026-10-10T00:00:00.000Z", inviteId: "inv-1", link: "/app/host/join/tok", shortCode: "H-ABCD-EFGH" }, [`${base}/cohosts/`]: cohosts }, sheetNext: "cohosts" });
  await more(page).waitFor();
  await more(page).click();
  await page.getByTestId("host-cohosts").waitFor();
  await page.getByText("伊藤 直子", { exact: true }).first().waitFor();
  await page.getByTestId("host-cohost-role-manager").click();
  await page.getByTestId("host-cohost-target").fill("sato@example.com");
  await page.getByTestId("host-cohost-issue").click();
  await page.getByText("H-ABCD-EFGH").waitFor();
  const [invite] = await bodies(page, "/cohost-invites");
  assert.deepEqual([invite.role, invite.target], ["manager", "sato@example.com"]);
  await page.evaluate(() => { (window as any).fixture.sheetNext = "manager"; });
  await page.getByTestId("host-cohost-menu-actor:ito").click();
  await page.getByTestId("host-cohost-edit").waitFor();
  assert.equal(await page.getByTestId("host-cohost-save").isDisabled(), true, "no reason yet");
  await page.getByTestId("host-cohost-reason").fill("当日の進行を任せるため");
  await page.getByTestId("host-cohost-save").click();
  await page.waitForTimeout(200);
  const patched = await page.evaluate(() => (window as any).fixture.requests.filter((item: string) => item.startsWith("patch:")));
  assert.equal(patched.length, 1);
});
