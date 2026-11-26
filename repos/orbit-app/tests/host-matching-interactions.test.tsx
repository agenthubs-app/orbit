import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { startOfflinePageHarness } from "./helpers/offline-page-harness";

// マッチング（b13 HM-M1–M10，2026-11-26）：手机上生成・改条件・换桌（移動 → 选桌 / 未配置へ）・空き席に入れる・再生成（先确认）・
// （测试 harness 没有 portal：抽屉在页面底栏下面，抽屉里的按钮用 dispatchEvent 点。）
// 公開（确认写明「公開後はテーブルを変更できません」，可通知共同運営者）；公开后只读；不再说「PC で」。
let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
before(async () => {
  harness = await startOfflinePageHarness([{ name: "console", importPath: "./src/screens/host/HostConsole", exportName: "HostConsoleScreen" }]);
});
after(async () => { await harness.close(); });

const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/host/${name}.json`, import.meta.url), "utf8"));
const overview = read("overview");
const matching = read("matching");
const eventId = matching.event.eventId as string;
const base = `/api/host/events/${encodeURIComponent(eventId)}`;
const none = { ...matching, generationId: null, state: "none", tables: [], unplaced: [], generationsUsed: 0 };
const published = { ...matching, state: "published", unplaced: [] };
const open = (t: Parameters<typeof harness.open>[0], patch: Record<string, unknown> = {}, params: Record<string, string> = {}) => harness.open(t, {
  screen: "console", language: "ja", toasts: true, params: { id: eventId, seg: "matching", ...params },
  responses: { [`${base}/overview`]: overview, [`${base}/matching`]: matching, [`${base}/matching/overrides`]: matching, [`${base}/matching/publish`]: published },
  ...patch,
});
type Page = Awaited<ReturnType<typeof open>>;
const posts = (page: Page, suffix: string) => page.evaluate((end) => ((window as any).fixture.postBodies ?? []).filter((call: any) => call.path.endsWith(end)).map((call: any) => call.body), suffix);
const puts = (page: Page) => page.evaluate(() => ((window as any).fixture.putBodies ?? []).map((call: any) => call.body));
const reads = (page: Page) => page.evaluate(() => (window as any).fixture.requests.filter((item: string) => item.startsWith("get:") && item.includes("/matching?")).length);

test("a draft: status card, unplaced first, tables one line each; 公開する confirms that tables can't change afterwards", async (t) => {
  const page = await open(t);
  const status = page.getByTestId("host-matching-status");
  await status.waitFor();
  assert.match(await status.innerText(), /下書き · 未公開[\s\S]*112名 · 22テーブル · 1卓 5名[\s\S]*再生成[\s\S]*残り 2回/u);
  assert.match(await page.getByTestId("host-matching-unplaced").innerText(), /未配置の 3名/u);
  assert.equal(await page.getByText(/PC/u).count(), 0);
  await page.getByTestId("host-matching-publish").click();
  const sheet = page.getByTestId("host-match-publish-sheet");
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /第1ラウンド[\s\S]*第2ラウンド[\s\S]*未配置/u);
  assert.equal(await page.getByTestId("host-match-publish-note").innerText(), "公開後はテーブルを変更できません。配置を確認してから公開してください。");
  await page.getByTestId("host-match-publish-confirm").dispatchEvent("click");
  await page.getByText("公開しました", { exact: false }).first().waitFor();
  assert.deepEqual(await posts(page, "/matching/publish"), [{ generationId: matching.generationId, notifyCohosts: true, overridesVersion: 0 }]);
  // Published: read only.
  await page.getByTestId("host-matching-published").waitFor();
  assert.equal(await page.getByTestId("host-matching-publish").count(), 0);
  assert.equal(await page.getByText("移動", { exact: true }).count(), 0);
  assert.equal(await page.getByTestId("host-matching-regen").count(), 0);
});

test("移動 → pick a table (or 未配置へ) writes one move to the adjustments with the version", async (t) => {
  const page = await open(t);
  const first = matching.tables[0].members[1];
  await page.getByTestId(`host-move-${first.participantId}`).click();
  const sheet = page.getByTestId("host-move-sheet");
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /木村 洋平 を移動[\s\S]*第1ラウンド · いまはテーブル A/u);
  assert.equal(await page.getByTestId("host-move-to-A").isDisabled(), true, "the current table can't be picked");
  await page.getByTestId("host-move-to-B").dispatchEvent("click");
  await page.getByText("木村 洋平をテーブル B に移しました", { exact: false }).first().waitFor();
  await page.getByTestId(`host-move-${first.participantId}`).click();
  await page.getByTestId("host-move-to-unplaced").dispatchEvent("click");
  await page.waitForTimeout(200);
  assert.deepEqual(await puts(page), [
    { expectedVersion: 0, generationId: matching.generationId, moves: [{ participantId: first.participantId, round: 1, toTable: "B" }] },
    { expectedVersion: 0, generationId: matching.generationId, moves: [{ participantId: first.participantId, round: 1, toTable: null }] },
  ]);
});

test("空き席に入れる places everyone unplaced; a conflict says someone else changed it and reads again", async (t) => {
  // Table B has three free seats.
  const seats = { ...matching, tables: matching.tables.map((table: { table: string; members: unknown[] }) => (table.table === "B" ? { ...table, members: table.members.slice(0, 2) } : table)) };
  const page = await open(t, { responses: { [`${base}/overview`]: overview, [`${base}/matching`]: seats, [`${base}/matching/overrides`]: { __status: 409, __code: "CONFLICT" } } });
  await page.getByTestId("host-matching-fill").click();
  await page.getByText("他の運営者が先に更新しました", { exact: false }).first().waitFor();
  const [body] = await puts(page);
  assert.equal(body.moves.length, 3);
  assert.deepEqual(body.moves.map((move: { toTable: string | null }) => move.toTable), ["B", "B", "B"]);
  assert.ok((await reads(page)) >= 2, "read again after the conflict");
});

test("full tables: 空き席に入れる says there is no seat and writes nothing", async (t) => {
  const page = await open(t);
  await page.getByTestId("host-matching-fill").click();
  await page.getByText("空きのあるテーブルがありません").first().waitFor();
  assert.deepEqual(await puts(page), []);
});

test("再生成 asks first (manual changes are lost); keeping it sends nothing", async (t) => {
  const page = await open(t);
  await page.getByTestId("host-matching-regen").click();
  await page.waitForTimeout(150);
  const confirms = await page.evaluate(() => (window as any).fixture.confirms ?? []);
  assert.deepEqual(confirms.map((item: { title: string }) => item.title), ["再生成しますか？"]);
  assert.deepEqual(await posts(page, "/matching/generate"), []);
});

test("not generated yet: checks, conditions (size 3–8 in a sheet), then マッチングを生成 sends them; generating reads again", async (t) => {
  const page = await open(t, { responses: { [`${base}/overview`]: overview, [`${base}/matching`]: none, [`${base}/matching/generate`]: { ...none, state: "generating" } } });
  const card = page.getByTestId("host-matching-none");
  await card.waitFor();
  assert.match(await card.innerText(), /申込 128名[\s\S]*プロフィール完了 112 \/ 128名/u);
  await page.getByRole("button", { name: /1テーブルの人数/u }).click();
  const sheet = page.getByTestId("host-conditions-sheet");
  await sheet.waitFor();
  await sheet.getByRole("tab", { name: "6名" }).dispatchEvent("click");
  await page.getByTestId("host-conditions-apply").dispatchEvent("click");
  await page.waitForTimeout(150);
  await page.getByRole("switch", { name: "同じ会社は別テーブル" }).click();
  await page.getByTestId("host-matching-generate").click();
  await page.getByTestId("host-matching-generating").waitFor();
  const [sent] = await posts(page, "/matching/generate");
  assert.deepEqual(sent.conditions, { ...matching.conditions, separateCompanies: false, tableSize: 6 });
  assert.ok(sent.idempotencyKey);
  const before = await reads(page);
  await page.waitForTimeout(4300);
  assert.ok((await reads(page)) > before, "polls while generating");
});

test("too few applicants: マッチングを生成 stays off", async (t) => {
  const page = await open(t, { responses: { [`${base}/overview`]: overview, [`${base}/matching`]: { ...none, applied: 12 } } });
  await page.getByTestId("host-matching-none").waitFor();
  assert.equal(await page.getByTestId("host-matching-generate").isDisabled(), true);
});

test("概要's 公開する comes with publish=1 and opens the confirmation once", async (t) => {
  const page = await open(t, {}, { publish: "1" });
  await page.getByTestId("host-match-publish-sheet").waitFor();
  const navigation = await page.evaluate(() => (window as any).fixture.navigation as string[]);
  assert.ok(navigation.some((item) => item.startsWith("setParams:")), "publish=1 is taken off so it opens once");
});
