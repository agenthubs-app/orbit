import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NEEDS_NETWORK, PAGE_OFFLINE_INVENTORY } from "../scripts/page-offline-inventory";
import { OFFLINE_BANNER, UNAVAILABLE_BANNER, fixtureValue, requestsOf, startOfflinePageHarness } from "./helpers/offline-page-harness";

// Sprint 0131: the agent action centre and the All Actions ledger read their
// page copy first and keep it offline (「截至」, confirm/undo need the network);
// online-only pages show the calm 「需要联网」 state instead of an error page.
const action = (id: string, title: string) => ({ actionId: id, actionType: "dormant_activation", title, contactName: "张伟", organization: "星河能源", priority: "high", dueLabel: "today", reason: "三个月没有联系，最近在找储能合作。", recommendedAction: "发一条问候", confirmationRequired: true });
const actionsPayload = { actions: [action("a1", "唤醒张伟的储能合作")] };
const ledgerEntry = (i: number, status = "completed") => ({ entryId: "action:" + String(i).padStart(4, "0"), createdAt: "2026-09-27T01:00:00.000Z", updatedAt: "2026-09-27T01:0" + (i % 10) + ":00.000Z", evidenceChips: [], evidenceIds: [], operations: [], sourceRefs: [], status, title: "账本操作 " + i, undoable: false, whyNow: "测试" });
const ledgerPage = (from: number, next: string | null) => ({ entries: [from, from + 1].map((i) => ledgerEntry(i, i === 1 ? "awaiting_confirmation" : "completed")), nextCursor: next, nextAction: "先确认待处理的操作", state: "success", summary: "账本摘要" });

let harness: Awaited<ReturnType<typeof startOfflinePageHarness>>;
test.before(async () => {
  harness = await startOfflinePageHarness([
    { name: "actions", importPath: "./src/screens/ai/AgentActionsScreen", exportName: "AgentActionsScreen" },
    { name: "ledger", importPath: "./src/screens/agent/AgentLedgerScreen", exportName: "AllActionsAgentLedgerScreen" },
    { name: "boundary", importPath: "./tests/helpers/online-only-probe-screen", exportName: "OnlineOnlyProbeRoute" },
  ]);
});
test.after(async () => { await harness?.close(); });

test("online: the action centre shows the server answer and saves it as the device's page copy", async (t) => {
  const page = await harness.open(t, { screen: "actions", responses: { "/api/agent/actions": actionsPayload } });
  await page.getByText("唤醒张伟的储能合作").waitFor();
  assert.deepEqual(await fixtureValue<string[]>(page, "saves"), ["agent-actions|main"]);
  assert.equal(await page.getByText(OFFLINE_BANNER).count(), 0);
});

test("offline: the action centre shows the page copy with 截至, and confirming needs the network and sends nothing", async (t) => {
  const page = await harness.open(t, { screen: "actions", online: false, copies: { "agent-actions|main": { data: actionsPayload, syncedAt: "2026-09-28T01:10:00.000Z" } } });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("唤醒张伟的储能合作").waitFor();
  const confirm = page.getByRole("button", { name: /确认建议 · 需要联网/ });
  assert.equal(await confirm.isDisabled(), true);
  await confirm.click({ force: true });
  assert.deepEqual((await requestsOf(page)).filter((entry) => entry.startsWith("post:")), []);
  assert.equal(await page.getByText("页面暂时无法加载").count(), 0, "no error block over the copy");
});

test("a 5xx keeps the copy and says the service is unavailable; a 4xx is the server's word and replaces it", async (t) => {
  const unavailable = await harness.open(t, { screen: "actions", status5xx: true, copies: { "agent-actions|main": { data: actionsPayload, syncedAt: "2026-09-28T01:10:00.000Z" } } });
  await unavailable.getByText(UNAVAILABLE_BANNER).waitFor();
  await unavailable.getByText("唤醒张伟的储能合作").waitFor();
  const forbidden = await harness.open(t, { screen: "actions", responses: { "/api/agent/actions": { __status: 403, __code: "FORBIDDEN", __message: "没有权限" } }, copies: { "agent-actions|main": { data: actionsPayload, syncedAt: "2026-09-28T01:10:00.000Z" } } });
  await forbidden.getByText("没有权限").waitFor();
  assert.equal(await forbidden.getByText("唤醒张伟的储能合作").count(), 0, "a forbidden answer is not covered by the copy");
});

test("offline without a copy: the action centre says it is not on this device yet, not a server error", async (t) => {
  const page = await harness.open(t, { screen: "actions", online: false });
  await page.getByText("这项内容还没保存在这台设备上，联网打开一次后断网也能看。").waitFor();
  assert.equal(await page.getByText("服务器连不上").count(), 0);
  assert.equal(await page.getByText("页面暂时无法加载").count(), 0);
});

test("online-only boundary: a cold open whose first read finds no server shows 需要联网 (no error page); retry opens the page", async (t) => {
  const page = await harness.open(t, { screen: "boundary", online: false });
  await page.getByText("这个页面要连上 Orbit 服务器才能使用。联网后点「重试」。").waitFor();
  assert.equal(await page.getByText("probe page content").count(), 0);
  assert.equal(await page.getByText("页面暂时无法加载").count(), 0);
  assert.deepEqual(await requestsOf(page), ["get:/api/probe-page"], "no extra request: the page's own read decided");
  await page.evaluate(() => { const fixture = (window as unknown as { fixture: { online: boolean; responses: Record<string, unknown> } }).fixture; fixture.online = true; fixture.responses["/api/probe-page"] = { ok: true }; });
  await page.getByRole("button", { name: "重试" }).click();
  await page.getByText("probe page content").waitFor();
});

test("online-only boundary: already unreachable when the page opens shows 需要联网 before any request", async (t) => {
  const page = await harness.open(t, { screen: "boundary", online: false, startUnreachable: true });
  await page.getByText("这个页面要连上 Orbit 服务器才能使用。联网后点「重试」。").waitFor();
  assert.deepEqual(await requestsOf(page), []);
});

test("online-only boundary: a page that opened online keeps its content when a later request fails", async (t) => {
  const page = await harness.open(t, { screen: "boundary", responses: { "/api/probe-page": { ok: true } } });
  await page.getByText("probe page content").waitFor();
  await page.evaluate(() => { (window as unknown as { fixture: { online: boolean } }).fixture.online = false; });
  await page.getByRole("button", { name: "probe write" }).click();
  await page.waitForTimeout(100);
  assert.equal(await page.getByText("probe page content").count(), 1, "typed input is not thrown away");
});

test("every online-only route is wrapped by the boundary (onboarding keeps its own offline form)", async () => {
  for (const entry of PAGE_OFFLINE_INVENTORY.filter((candidate) => candidate.classification === "online-only")) {
    const source = await readFile(entry.file, "utf8");
    if (entry.offline === NEEDS_NETWORK) assert.match(source, /withOnlineOnlyRoute\(/, entry.file);
    else assert.doesNotMatch(source, /withOnlineOnlyRoute\(/, entry.file);
  }
});

test("online: the ledger saves its first page and each older page it loads (up to three) as page copies", async (t) => {
  const page = await harness.open(t, { screen: "ledger", responses: { "/api/agent/ledger?cursor=c2": ledgerPage(3, "c3"), "/api/agent/ledger?cursor=c3": ledgerPage(5, "c4"), "/api/agent/ledger": ledgerPage(1, "c2") } });
  await page.getByText("账本操作 1").waitFor();
  await page.getByRole("button", { name: "加载更多" }).click();
  await page.getByText("账本操作 3").waitFor();
  await page.getByRole("button", { name: "加载更多" }).click();
  await page.getByText("账本操作 5").waitFor();
  assert.deepEqual(await fixtureValue<string[]>(page, "saves"), ["agent-ledger|page-1", "agent-ledger|page-2", "agent-ledger|page-3"]);
});

test("offline: the ledger shows its saved pages with 截至, loads older saved pages from the device, and transitions need the network", async (t) => {
  const copies = { "agent-ledger|page-1": { data: ledgerPage(1, "c2"), syncedAt: "2026-09-28T01:10:00.000Z" }, "agent-ledger|page-2": { data: ledgerPage(3, "c3"), syncedAt: "2026-09-28T01:10:00.000Z" } };
  const page = await harness.open(t, { screen: "ledger", online: false, copies });
  await page.getByText(OFFLINE_BANNER).waitFor();
  await page.getByText("账本操作 1").waitFor();
  const confirm = page.getByRole("button", { name: /· 需要联网$/ }).first();
  assert.equal(await confirm.isDisabled(), true);
  const before = (await requestsOf(page)).length;
  await page.getByRole("button", { name: "加载更多" }).click();
  await page.getByText("账本操作 3").waitFor();
  assert.equal((await requestsOf(page)).length, before, "older pages come from the device, not the network");
  await page.getByRole("button", { name: "加载更多" }).click();
  await page.getByText("更早的记录没有保存在这台设备上，需要联网。").waitFor();
  assert.deepEqual((await requestsOf(page)).filter((entry) => entry.startsWith("post:")), []);
});
