import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { pickActiveV2Plan } from "../../app/(app)/app/orbit-2026/plan/plan-model";
import { createPlanFlowHandlers } from "../../features/plans/v2/flow-handlers";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";
import { confirmed, draftFixture, intakeFixture, premiseIntake, questionsIntake } from "./support/plan-flow-fixtures";

// R23 (UI-SPEC ① ② ③): the Web plan generation screens rendered for real. fetch is
// stubbed in the page and every call is recorded, so each test asserts which
// requests a step makes — and that ticking, choosing and typing make none.
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[] };
type Fixture = { view: "goal" | "flow" | "edit" | "overview" | "slot-error"; id?: string; lang?: string; handlers: Handler[] };
type Call = { url: string; method: string; body?: any; lang?: string };

const ok = (data: unknown, status = 200): Reply => ({ body: { data, success: true }, status });
const fail = (status: number, reason: string, extra: Record<string, string> = {}): Reply => ({ body: { error: { code: "CONFLICT", context: { reason, ...extra }, message: reason }, success: false }, status });

let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { PlanGoalEntry } from "./app/(app)/app/orbit-2026/plan/PlanGoalEntry";
    import { PlanFlowScreen } from "./app/(app)/app/orbit-2026/plan/PlanFlowScreen";
    import { PlanManualEditScreen } from "./app/(app)/app/orbit-2026/plan/PlanManualEditScreen";
    import { PlanOverview } from "./app/(app)/app/orbit-2026/plan/PlanOverview";
    import { PlanSlotError } from "./app/(app)/app/orbit-2026/plan/PlanSlotError";
    const f = window.shellFixture;
    const counts = {};
    window.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      const body = init.body ? JSON.parse(init.body) : undefined;
      f.fetches.push({ url: String(url), method, body, lang: init.headers && init.headers["x-orbit-lang"] });
      if (f.bridge) {
        // The bridge is exposed right after the page mounts; wait for it.
        while (!window.planServer) await new Promise((resolve) => setTimeout(resolve, 10));
        const reply = await window.planServer(String(url), method, init.body || null, (init.headers && init.headers["x-orbit-lang"]) || "ja");
        return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
      }
      const index = f.handlers.findIndex((h) => h.method === method && new RegExp(h.url).test(String(url)));
      if (index === -1) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "no stub" } }), { status: 404 });
      const handler = f.handlers[index];
      const n = counts[index] = (counts[index] ?? -1) + 1;
      const reply = handler.replies[Math.min(n, handler.replies.length - 1)];
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
    };
    const view = f.view === "goal" ? <PlanGoalEntry /> : f.view === "flow" ? <PlanFlowScreen intakeId={f.id} /> : f.view === "overview" ? <PlanOverview planId={f.id} /> : f.view === "slot-error" ? <PlanSlotError /> : <PlanManualEditScreen draftId={f.id} />;
    createRoot(document.getElementById("root")).render(view);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function screen(t: { after: (fn: () => Promise<void>) => void }, fixture: Fixture & { bridge?: boolean }, setup?: (page: Page) => Promise<void>): Promise<Page> {
  const opened = await open(browser, code, { html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ path: "/app/plans", lang: fixture.lang ?? "ja", calls: [], fetches: [], ...fixture })}</script>` });
  if (setup) await setup(opened);
  t.after(async () => { const errors = errorsOf(opened); await opened.close(); assert.deepEqual(errors, []); });
  return opened;
}

const fetches = (page: Page): Promise<Call[]> => page.evaluate(() => (window as any).shellFixture.fetches);
const calls = (page: Page): Promise<unknown[]> => page.evaluate(() => (window as any).shellFixture.calls);
const path = (call: Call) => call.url.replace(/^\/api\/agent\/plans/u, "");

/* ---------- ① 目標入力 ---------- */

test("goal input: the guess fills the chip once per text, a hand-picked chip is never overwritten, the sample card asks nothing", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok({ activeGoalLimit: 2, activeGoals: 0, intakes: [], newGoalsLeftThisMonth: 9 })], url: "/intakes$" },
    { method: "POST", replies: [ok({ goalKind: "fundraising", source: "rule" })], url: "/goal-kind$" },
  ], view: "goal" });
  await page.getByText("何を達成したいですか？").waitFor();
  await page.locator("[data-plan-sample]").getByText("サンプル").waitFor();
  assert.deepEqual((await fetches(page)).map((call) => `${call.method} ${path(call)}`), ["GET /intakes"], "only the quota read on open (the sample card is static)");
  const input = page.getByLabel("目標", { exact: true });
  await input.fill("短い");
  await page.waitForTimeout(1000);
  assert.equal((await fetches(page)).length, 1, "under 6 characters: no guess");
  await input.fill("シリーズA で資金調達したい");
  await page.getByRole("button", { name: "💰 資金調達", pressed: true }).waitFor();
  let all = await fetches(page);
  assert.deepEqual(all.map((call) => `${call.method} ${path(call)}`), ["GET /intakes", "POST /goal-kind"]);
  assert.deepEqual(all[1]!.body, { text: "シリーズA で資金調達したい" });
  assert.equal(all[1]!.lang, "ja", "x-orbit-lang carries the UI language");
  // Same text again (edit away and back): answered from memory, not re-sent.
  await input.fill("シリーズA で資金調達したい！");
  await input.fill("シリーズA で資金調達したい");
  await page.waitForTimeout(1000);
  all = await fetches(page);
  assert.equal(all.filter((call) => path(call) === "/goal-kind").length, 1, "the same text is never sent twice");
  // The person picks a chip: later guesses never overwrite it.
  await page.getByRole("button", { name: "🧑‍💼 採用" }).click();
  await input.fill("エンジニアを採用してチームを作りたい");
  await page.waitForTimeout(1100);
  assert.equal(await page.getByRole("button", { name: "🧑‍💼 採用" }).getAttribute("aria-pressed"), "true");
  assert.equal((await fetches(page)).filter((call) => path(call) === "/goal-kind").length, 1, "no guessing after a manual choice");
});

test("goal input: 「iOrbit と具体化する」 creates the intake once with a key and goes to its page", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok({ activeGoalLimit: 2, activeGoals: 0, intakes: [], newGoalsLeftThisMonth: 9 })], url: "/intakes$" },
    { method: "POST", replies: [ok({ goalKind: "launch", source: "rule" })], url: "/goal-kind$" },
    { method: "POST", replies: [ok(intakeFixture(), 201)], url: "/intakes$" },
  ], view: "goal" });
  await page.getByLabel("目標", { exact: true }).fill("新サービスを有料にしたい");
  await page.getByRole("button", { name: "🚀 上市・収益化" }).click();
  await page.getByRole("button", { name: "iOrbit と具体化する" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.length > 0);
  const create = (await fetches(page)).filter((call) => call.method === "POST" && path(call) === "/intakes");
  assert.equal(create.length, 1);
  assert.equal(create[0]!.body.goalKind, "launch");
  assert.equal(create[0]!.body.source, "task");
  assert.match(create[0]!.body.idempotencyKey, /^web:plan:/u);
  assert.deepEqual(await calls(page), [{ push: "/app/plans/flow/in-1" }]);
});

test("goal input: no new goals left this month is said up front and the button is off", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok({ activeGoalLimit: 2, activeGoals: 0, intakes: [{ goal: "Old goal", goalKind: "sales", href: "/app/plans/flow/old", intakeId: "old", status: "background", updatedAt: "2026-10-01T00:00:00Z" }], newGoalsLeftThisMonth: 0 })], url: "/intakes$" },
  ], view: "goal" });
  await page.getByText("今月はこれ以上新しい目標を作れません。").waitFor();
  await page.getByLabel("目標", { exact: true }).fill("何か新しいことを始めたい");
  assert.equal(await page.getByRole("button", { name: "iOrbit と具体化する" }).isDisabled(), true);
  await page.getByText("作りかけのプラン：Old goal").waitFor();
  await page.getByRole("button", { name: "続ける" }).click();
  assert.deepEqual(await calls(page), [{ push: "/app/plans/flow/old" }]);
});

/* ---------- ② 背景 ---------- */

test("background: わたし → チーム → 目的 in order; current open, later dashed with the draft", async (t) => {
  const page = await screen(t, { handlers: [{ method: "GET", replies: [ok(intakeFixture())], url: "/intakes/in-1$" }], id: "in-1", view: "flow" });
  await page.locator("[data-plan-background]").waitFor();
  const blocks = await page.locator("[data-plan-block]").evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute("data-plan-block")}:${node.getAttribute("data-state")}`));
  assert.deepEqual(blocks, ["me:current", "team:later", "purpose:later"]);
  await page.getByText("下書き：Build the service into a brand and a business").waitFor();
  assert.equal(await page.locator("[aria-current='step']").textContent(), "背景");
});

test("team: ticking a capability updates 空き at once with zero requests", async (t) => {
  const intake = confirmed(intakeFixture(), ["me"]);
  const page = await screen(t, { handlers: [{ method: "GET", replies: [ok(intake)], url: "/intakes/in-1$" }], id: "in-1", view: "flow" });
  const row = page.locator("tr[data-capability='design']");
  await row.waitFor();
  const before = (await fetches(page)).length;
  assert.equal(await row.locator("[data-plan-cover]").textContent(), "空き");
  await row.getByRole("button", { name: "Hana Yamada · デザイン" }).click();
  assert.equal(await row.locator("[data-plan-cover]").textContent(), "1人");
  await row.getByRole("button", { name: "Hana Yamada · デザイン" }).click();
  assert.equal(await row.locator("[data-plan-cover]").textContent(), "空き");
  // Solo: only your own column counts.
  await page.getByRole("tab", { name: "一人" }).click();
  assert.equal(await page.locator("tr[data-capability='ops_infra'] [data-plan-cover]").textContent(), "空き");
  assert.equal((await fetches(page)).length, before, "ticks and the solo switch are local");
});

test("team confirm sends every member's ticks with the version it read; a stale write offers a reload", async (t) => {
  const intake = confirmed(intakeFixture(), ["me"]);
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(intake)], url: "/intakes/in-1$" },
    { method: "PATCH", replies: [fail(409, "STALE")], url: "/intakes/in-1$" },
  ], id: "in-1", view: "flow" });
  await page.locator("tr[data-capability='brand']").getByRole("button", { name: "Ken Mori · ブランド" }).click();
  await page.getByRole("button", { name: "チームを確定 → 目的へ" }).click();
  await page.locator("[data-plan-notice='stale']").waitFor();
  const patch = (await fetches(page)).find((call) => call.method === "PATCH")!;
  assert.equal(patch.body.block, "team");
  assert.equal(patch.body.expectedUpdatedAt, intake.updatedAt);
  assert.deepEqual(patch.body.team.members.find((member: any) => member.memberId === "contact:c-1").capabilities, ["product", "ops_infra", "brand"]);
  await page.getByRole("button", { name: "読み直す" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.filter((call: any) => call.method === "GET").length === 2);
});

test("わたし: a changed 「やりたいこと」 rebuilds the ladder first, then confirms with the new version", async (t) => {
  const after = { ...intakeFixture(), updatedAt: "2026-10-10T00:05:00.000Z" };
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(intakeFixture())], url: "/intakes/in-1$" },
    { method: "POST", replies: [ok(after)], url: "/ladder$" },
    { method: "PATCH", replies: [ok(confirmed(after, ["me"]))], url: "/intakes/in-1$" },
  ], id: "in-1", view: "flow" });
  await page.getByLabel("やりたいこと").fill("Make it a brand");
  await page.getByRole("button", { name: "わたしを確定 → チームへ" }).click();
  await page.locator("[data-plan-block='team'][data-state='current']").waitFor();
  const writes = (await fetches(page)).filter((call) => call.method !== "GET");
  assert.deepEqual(writes.map((call) => `${call.method} ${path(call)}`), ["POST /intakes/in-1/ladder", "PATCH /intakes/in-1"]);
  assert.equal(writes[0]!.body.wants, "Make it a brand");
  assert.equal(writes[1]!.body.expectedUpdatedAt, after.updatedAt);
  assert.notEqual(writes[0]!.body.idempotencyKey, writes[1]!.body.idempotencyKey);
});

/* ---------- ≤5 問 / 前提 ---------- */

test("questions: one submit for all, a double click sends once; untouched blanks are left to the guess", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(questionsIntake())], url: "/intakes/in-1$" },
    { method: "POST", replies: [ok(premiseIntake())], url: "/answers$" },
  ], id: "in-1", view: "flow" });
  await page.locator("[data-plan-questions]").waitFor();
  assert.equal(await page.locator("[data-question='R1']").getByText("推測").count(), 1, "the guess is preselected and marked");
  const before = (await fetches(page)).length;
  await page.locator("[data-question='R2']").getByRole("button", { name: "法人" }).click();
  await page.locator("[data-question='R7']").getByRole("button", { name: "仲間に入れる" }).click();
  await page.locator("[data-question='R7']").getByRole("button", { name: "外部に頼む" }).click();
  assert.equal((await fetches(page)).length, before, "choosing options sends nothing");
  await page.getByRole("button", { name: "まとめて回答する（3問）" }).dblclick();
  await page.locator("[data-plan-premise]").waitFor();
  const sent = (await fetches(page)).filter((call) => path(call).endsWith("/answers"));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.body.answers, [
    { questionId: "R1", text: null, values: [] },
    { questionId: "R2", text: null, values: ["businesses"] },
    { questionId: "R7", text: null, values: ["recruit", "outsource"] },
  ]);
});

test("premise: a row is changed in place with the question's options", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(premiseIntake())], url: "/intakes/in-1$" },
    { method: "PATCH", replies: [ok(premiseIntake({ premiseVersion: 2 }))], url: "/premise$" },
  ], id: "in-1", view: "flow" });
  await page.locator("[data-premise='R1']").click();
  await page.getByLabel("選択肢").selectOption("paying");
  await page.getByLabel("内容", { exact: true }).fill("48 users");
  await page.getByRole("button", { name: "保存" }).click();
  await page.locator("[data-premise='R1']").waitFor();
  const patch = (await fetches(page)).find((call) => call.method === "PATCH")!;
  assert.equal(patch.body.key, "R1");
  assert.equal(patch.body.value, "有料あり · 48 users");
  await page.getByRole("button", { name: "この前提で初版をつくる" }).waitFor();
});

/* ---------- 初版 / AI 修正 ---------- */

const drafted = () => ({ ...premiseIntake(), draftId: "dr-1", status: "drafted" as const });

test("draft card: citations open by default on the Web and fold away; sources link out", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture())], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  const section = page.locator("[data-plan-citations]");
  await section.waitFor();
  assert.equal(await section.getAttribute("data-plan-citations"), "open");
  assert.equal(await page.getByRole("link", { name: "出典：Public pricing pages" }).getAttribute("href"), "https://example.org/l-012");
  const toggle = page.getByRole("button", { name: "この案で参考にした業界の現状 2件" });
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByText("Card and contact apps").count(), 0);
  await toggle.click();
  await page.getByText("Card and contact apps").waitFor();
  assert.equal(await page.locator("[aria-current='step']").textContent(), "初版");
});

test("fix bar: shows what is left; at 0 the input is off and only edit / confirm remain", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture({ aiFixUsed: 1, turns: [{ at: "2026-10-10T01:00:00Z", changes: [{ after: "New name", before: "Say who it is for", label: "Step 1 の名前", path: "steps.0.title" }], input: "Sales stays with the two of us for now", n: 1, noChangeReason: null, unchanged: ["Types"] }] }))], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await page.locator("[data-plan-fixbar]").waitFor();
  assert.equal(await page.locator("[data-plan-fix-left]").textContent(), "2");
  assert.equal(await page.locator("[aria-current='step']").textContent(), "AI 修正");
  await page.getByText("AI 修正 1 / 3 を反映 · 方案を更新しました").waitFor();
  await page.locator("[data-change='steps.0.title']").getByText("New name").waitFor();
  assert.equal(await page.getByRole("button", { name: "修正する" }).isDisabled(), true, "empty text cannot be sent");

  const used = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture({ aiFixUsed: 3 }))], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await used.locator("[data-plan-fix-usedup]").waitFor();
  assert.equal(await used.locator("[data-plan-fix-left]").textContent(), "0");
  assert.equal(await used.getByLabel("修正したいことを入力").isDisabled(), true);
  assert.equal(await used.getByRole("button", { name: "修正する" }).isDisabled(), true);
  assert.equal(await used.getByRole("button", { name: "手動で編集" }).isDisabled(), false);
  await used.getByRole("button", { name: "手動で編集" }).click();
  assert.deepEqual(await calls(used), [{ push: "/app/plans/drafts/dr-1/edit" }]);
});

test("AI limit shows the limit text, not the failure card; AI failure shows the failure card with もう一度", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture())], url: "/drafts/dr-1$" },
    { method: "POST", replies: [fail(409, "AI_LIMIT", { limit: "daily", retryOn: "2026-10-11" }), { body: { error: { code: "SERVICE_UNAVAILABLE", context: { reason: "AI_FAILED" }, message: "x" }, success: false }, status: 503 }, ok(draftFixture({ aiFixUsed: 1 }))], url: "/fix$" },
  ], id: "in-1", view: "flow" });
  await page.getByLabel("修正したいことを入力").fill("Design partner first");
  await page.getByRole("button", { name: "修正する" }).click();
  await page.locator("[data-plan-limit='daily']").getByText("今日はここまでです · 明日また使えます。").waitFor();
  assert.equal(await page.locator("[data-plan-failure]").count(), 0, "a limit is not a failure");
  await page.getByRole("button", { name: "修正する" }).click();
  await page.locator("[data-plan-failure='fix']").getByText("回数は減っていません。").waitFor();
  assert.equal(await page.locator("[data-plan-limit]").count(), 0);
  await page.getByRole("button", { name: "もう一度" }).click();
  await page.locator("[data-plan-fix-left]").filter({ hasText: "2" }).waitFor();
  const keys = (await fetches(page)).filter((call) => path(call).endsWith("/fix")).map((call) => call.body.idempotencyKey);
  assert.equal(new Set(keys).size, 3, "each try is a new action with its own key");
});

/* ---------- ③ 手動編集 ---------- */

test("manual edit: points move 5 at a time from the highest type, the total stays 100, and the changes list says so", async (t) => {
  const page = await screen(t, { handlers: [{ method: "GET", replies: [ok(draftFixture())], url: "/drafts/dr-1$" }], id: "dr-1", view: "edit" });
  const points = page.getByLabel("D Founderの配点");
  await points.waitFor();
  const before = (await fetches(page)).length;
  await points.fill("15");
  await points.press("Enter");
  assert.equal(await page.locator("[data-plan-total]").textContent(), "100");
  assert.equal(await page.getByLabel("A First payerの配点").inputValue(), "25", "the highest type gives 5");
  await page.getByText("D Founder 10 → 15").first().waitFor();
  // Not a multiple of 5: refused in place, nothing moves.
  await points.fill("17");
  await points.press("Enter");
  await page.getByText("5点刻みで入力してください").waitFor();
  assert.equal(await page.locator("[data-plan-total]").textContent(), "100");
  // Fewer people: the remainder goes to the last person.
  await page.getByRole("button", { name: "A First payerを減らす" }).click();
  await page.getByRole("button", { name: "A First payerを減らす" }).click();
  await page.getByRole("button", { name: "A First payerを減らす" }).click();
  await page.locator("[data-plan-totalbar]").getByText("合計 100 / 100 · 変更 3件 · 手動編集は 1回だけ").waitFor();
  assert.equal((await fetches(page)).length, before, "editing is local until 「このプランで始める」");
});

test("manual edit: removing a type redistributes its points after a confirmation; 元に戻す restores the AI plan", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(draftFixture())], url: "/drafts/dr-1$" },
    { method: "POST", replies: [ok({ archivedV1PlanId: null, href: "/app/tasks?tab=plan&plan=p-1", planId: "p-1", replayed: false }, 201)], url: "/manual-edit$" },
  ], id: "dr-1", view: "edit" });
  await page.getByRole("button", { name: "C Prior productを外す" }).click();
  const dialog = page.locator("[data-plan-remove]");
  await dialog.getByText("20点を 5点ずつ、配点の高いタイプから順に配り直します。").waitFor();
  assert.deepEqual(await dialog.locator("li").allTextContents(), ["A First payer 30 → 35", "B Brand builder 25 → 30", "D Founder 10 → 15", "イベント 15 → 20"]);
  await page.getByRole("button", { name: "外す", exact: true }).click();
  assert.equal(await page.locator("tr[data-slot='prior_product']").count(), 0);
  assert.equal(await page.locator("[data-plan-total]").textContent(), "100");
  await page.locator("[data-plan-reset]").click();
  assert.equal(await page.locator("tr[data-slot='prior_product']").count(), 1);
  // Rename a step and start: one request with the revision and the whole edit.
  await page.getByLabel("Step の名前").first().fill("Say it in one line");
  await page.getByText("元：Say who it is for").waitFor();
  await page.getByRole("button", { name: "このプランで始める" }).dblclick();
  await page.waitForFunction(() => (window as any).shellFixture.calls.length > 0);
  const sent = (await fetches(page)).filter((call) => path(call).endsWith("/manual-edit"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.body.expectedRevision, draftFixture().revision);
  assert.equal(sent[0]!.body.steps[0].title, "Say it in one line");
  assert.equal(sent[0]!.body.personTypes.reduce((sum: number, type: any) => sum + type.allocation, 0) + sent[0]!.body.event.allocation, 100);
  assert.deepEqual(await calls(page), [{ push: "/app/tasks?tab=plan&plan=p-1" }]);
});

test("Chinese UI: the flow speaks Chinese and sends x-orbit-lang: zh", async (t) => {
  const page = await screen(t, { handlers: [{ method: "GET", replies: [ok(intakeFixture())], url: "/intakes/in-1$" }], id: "in-1", lang: "zh", view: "flow" });
  await page.getByRole("button", { name: "确认我 → 团队" }).waitFor();
  assert.equal((await fetches(page))[0]!.lang, "zh");
});

/* ---------- mock end to end: empty state → confirmed ---------- */

// No Neon and no paid AI: the browser's fetch is bridged to the real route handlers
// in mock mode (in-memory repository, mock AI), so the screens and the server agree
// on every request body. Ends with the person's own v2 plan as the 「已確定」 card.
test("mock end to end: goal input → background → questions → premise → draft → confirm → confirmed card", async (t) => {
  resetPlansV2MockRepositoryForTests();
  t.after(() => resetPlansV2MockRepositoryForTests());
  const flow = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const v2 = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  type RouteHandler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
  const routes: [string, RegExp, RouteHandler, string[]][] = [
    ["POST", /^\/goal-kind$/u, flow.goalKind, []],
    ["GET", /^\/intakes$/u, flow.listIntakes, []],
    ["POST", /^\/intakes$/u, flow.createIntake, []],
    ["GET", /^\/intakes\/([^/]+)$/u, flow.getIntake, ["intakeId"]],
    ["PATCH", /^\/intakes\/([^/]+)$/u, flow.confirmBlock, ["intakeId"]],
    ["POST", /^\/intakes\/([^/]+)\/background$/u, flow.retryBackground, ["intakeId"]],
    ["POST", /^\/intakes\/([^/]+)\/members$/u, flow.addMembers, ["intakeId"]],
    ["POST", /^\/intakes\/([^/]+)\/ladder$/u, flow.ladder, ["intakeId"]],
    ["POST", /^\/intakes\/([^/]+)\/questions$/u, flow.questions, ["intakeId"]],
    ["POST", /^\/intakes\/([^/]+)\/answers$/u, flow.answers, ["intakeId"]],
    ["PATCH", /^\/intakes\/([^/]+)\/premise$/u, flow.premise, ["intakeId"]],
    ["POST", /^\/intakes\/([^/]+)\/draft$/u, flow.draft, ["intakeId"]],
    ["GET", /^\/drafts\/([^/]+)$/u, flow.getDraft, ["draftId"]],
    ["POST", /^\/drafts\/([^/]+)\/fix$/u, flow.fix, ["draftId"]],
    ["POST", /^\/drafts\/([^/]+)\/manual-edit$/u, flow.manualEdit, ["draftId"]],
    ["POST", /^\/drafts\/([^/]+)\/confirm$/u, flow.confirm, ["draftId"]],
    ["GET", /^\/v2\/([^/]+)$/u, v2.detail, ["planId"]],
  ];
  const bridge = async (page: Page) => {
    await page.exposeFunction("planServer", (url: string, method: string, body: string | null, lang: string) => serve(url, method, body, lang));
    const serve = async (url: string, method: string, body: string | null, lang: string) => {
      const sub = url.replace(/^\/api\/agent\/plans/u, "");
      for (const [verb, pattern, handler, names] of routes) {
        const match = verb === method ? pattern.exec(sub) : null;
        if (!match) continue;
        const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1]!)]));
        const response = await handler(new Request(`http://localhost${url}`, { body: body ?? undefined, headers: { "content-type": "application/json", "x-orbit-lang": lang }, method }), { params: Promise.resolve(params) });
        return { body: await response.json(), status: response.status };
      }
      return { body: { error: { code: "NOT_FOUND", message: sub }, success: false }, status: 404 };
    };
  };

  // ① 目標入力 → the flow page.
  const goal = await screen(t, { bridge: true, handlers: [], view: "goal" }, bridge);
  await goal.getByLabel("目標", { exact: true }).fill("シリーズA の資金調達をしたい");
  await goal.getByRole("button", { name: "💰 資金調達", pressed: true }).waitFor();
  await goal.getByRole("button", { name: "iOrbit と具体化する" }).click();
  await goal.waitForFunction(() => (window as any).shellFixture.calls.length > 0);
  const [{ push }] = (await calls(goal)) as { push: string }[];
  const intakeId = decodeURIComponent(/^\/app\/plans\/flow\/(.+)$/u.exec(push)![1]!);

  // ② 背景 → ≤5 問 → 前提 → 初版 → 確定.
  const page = await screen(t, { bridge: true, handlers: [], id: intakeId, view: "flow" }, bridge);
  await page.locator("[data-plan-block='me'][data-state='current']").waitFor();
  const stance = page.getByRole("group", { name: "立場" }).getByRole("button", { pressed: true });
  if (await stance.count() === 0) await page.getByRole("button", { name: "代表・オーナー" }).click();
  await page.getByRole("button", { name: "わたしを確定 → チームへ" }).click();
  await page.locator("[data-plan-block='team'][data-state='current']").waitFor();
  await page.getByRole("button", { name: "チームを確定 → 目的へ" }).click();
  await page.locator("[data-plan-block='purpose'][data-state='current']").waitFor();
  await page.getByRole("button", { name: "目的を確定" }).click();
  await page.getByRole("button", { name: "この背景で質問へ（5問まで）" }).click();
  await page.locator("[data-plan-questions]").waitFor();
  await page.getByRole("button", { name: /^まとめて回答する/u }).click();
  await page.getByRole("button", { name: "この前提で初版をつくる" }).click();
  await page.locator("[data-plan-draft]").waitFor();
  await page.locator("[data-plan-fix-left]").filter({ hasText: "3" }).waitFor();
  await page.getByRole("button", { name: "この内容で確定" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.length > 0);
  const [{ push: done }] = (await calls(page)) as { push: string }[];
  assert.match(done, /^\/app\/tasks\?tab=plan&plan=/u);
  const methods = (await fetches(page)).map((call) => `${call.method} ${path(call).replace(intakeId, ":id").replace(/drafts\/[^/]+/u, "drafts/:id")}`);
  assert.deepEqual(methods.filter((call) => !call.startsWith("GET")), [
    "PATCH /intakes/:id", "PATCH /intakes/:id", "PATCH /intakes/:id",
    "POST /intakes/:id/questions", "POST /intakes/:id/answers", "POST /intakes/:id/draft", "POST /drafts/:id/confirm",
  ], "only the designed triggers write");

  // Task › プラン: with an active v2 plan the slot shows the プラン概要 (R24 replaced the 「已確定」 card).
  const summary = await (await v2.summary(new Request("http://localhost/api/agent/plans/v2/summary"))).json();
  const mine = summary.data.goals.find((item: { goal: string }) => item.goal === "シリーズA の資金調達をしたい");
  assert.equal(mine?.status, "active", "confirming made an active v2 plan");
  const card = pickActiveV2Plan({ current: null, goals: [mine] });
  assert.ok(pickActiveV2Plan(summary.data), "an active plan → the overview, not the goal input");
  assert.ok(card);
  const view = await screen(t, { bridge: true, handlers: [], id: card.planId, view: "overview" }, bridge);
  await view.locator("[data-plan-goal]").getByText("シリーズA の資金調達をしたい", { exact: true }).waitFor();
  assert.equal(await view.locator("[data-plan-score]").getAttribute("data-plan-score"), String(card.total));
  assert.deepEqual((await fetches(view)).map((call) => `${call.method} ${path(call)}`), [`GET /v2/${encodeURIComponent(card.planId)}`], "the overview only reads");
});

/* ---------- R23 review: m10 / m15 / m16 / AI_BUSY ---------- */

test("m10: a failed v2 read in Task › プラン is an error card with retry (refreshes the page)", async (t) => {
  const page = await screen(t, { handlers: [], view: "slot-error" });
  await page.locator("[data-plan-slot-error]").getByText("プランを読めませんでした").waitFor();
  await page.getByRole("button", { name: "再試行" }).click();
  assert.deepEqual(await calls(page), [], "router.refresh is not a push");
  assert.deepEqual(await fetches(page), []);
});

test("m15: drafted but the draft cannot be read → a retry card, and retrying reads it", async (t) => {
  const drafted = { ...premiseIntake(), draftId: "dr-1", status: "drafted" as const };
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted)], url: "/intakes/in-1$" },
    { method: "GET", replies: [{ body: { error: { code: "INTERNAL_ERROR", message: "x" }, success: false }, status: 500 }, ok(draftFixture())], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await page.locator("[data-plan-draft-failed]").getByText("方案を読み込めませんでした").waitFor();
  await page.locator("[data-plan-draft-failed]").getByRole("button", { name: "再試行" }).click();
  await page.locator("[data-plan-draft]").waitFor();
  assert.equal(await page.locator("[data-plan-draft-failed]").count(), 0);
});

test("m16: after AI revisions, changing a premise asks first; cancel sends nothing, confirm sends once", async (t) => {
  const drafted = { ...premiseIntake(), draftId: "dr-1", status: "drafted" as const };
  const withTurn = draftFixture({ aiFixUsed: 1, turns: [{ at: "2026-10-10T01:00:00Z", changes: [], input: "Keep it", n: 1, noChangeReason: "OK", unchanged: [] }] });
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted)], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(withTurn)], url: "/drafts/dr-1$" },
    { method: "PATCH", replies: [ok(premiseIntake({ premiseVersion: 2 }))], url: "/premise$" },
  ], id: "in-1", view: "flow" });
  await page.getByRole("button", { name: "すべて見る" }).click();
  const edit = async () => {
    await page.locator("[data-premise='R2']").click();
    await page.getByLabel("内容", { exact: true }).fill("Organisers and guests");
    await page.getByRole("button", { name: "保存" }).click();
  };
  await edit();
  const dialog = page.getByRole("alertdialog", { name: "この案と修正履歴を破棄しますか？" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  assert.equal((await fetches(page)).filter((call) => call.method === "PATCH").length, 0, "cancel sends nothing");
  await page.getByRole("button", { name: "保存" }).click();
  await dialog.getByRole("button", { name: "破棄して直す" }).click();
  await page.getByRole("button", { name: "この前提で初版をつくる" }).waitFor();
  const patches = (await fetches(page)).filter((call) => call.method === "PATCH");
  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.body.key, "R2");
});

test("m16: without revisions a premise change is sent straight away", async (t) => {
  const drafted = { ...premiseIntake(), draftId: "dr-1", status: "drafted" as const };
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted)], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture())], url: "/drafts/dr-1$" },
    { method: "PATCH", replies: [ok(premiseIntake({ premiseVersion: 2 }))], url: "/premise$" },
  ], id: "in-1", view: "flow" });
  await page.getByRole("button", { name: "すべて見る" }).click();
  await page.locator("[data-premise='R2']").click();
  await page.getByLabel("内容", { exact: true }).fill("Organisers");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByRole("button", { name: "この前提で初版をつくる" }).waitFor();
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  assert.equal((await fetches(page)).filter((call) => call.method === "PATCH").length, 1);
});

test("AI_BUSY: not a failure — 「処理中です」 and the intake and draft are read again once after 2 s", async (t) => {
  const drafted = { ...premiseIntake(), draftId: "dr-1", status: "drafted" as const };
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted)], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture()), ok(draftFixture({ aiFixUsed: 1 }))], url: "/drafts/dr-1$" },
    { method: "POST", replies: [fail(409, "AI_BUSY")], url: "/fix$" },
  ], id: "in-1", view: "flow" });
  await page.getByLabel("修正したいことを入力").fill("Design first");
  await page.getByRole("button", { name: "修正する" }).click();
  await page.locator("[data-plan-notice='busy']").getByText("処理中です。少し待ってから読み直します").waitFor();
  assert.equal(await page.locator("[data-plan-failure]").count(), 0);
  await page.locator("[data-plan-fix-left]").filter({ hasText: "2" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(2500);
  const reads = (await fetches(page)).filter((call) => call.method === "GET").map(path);
  assert.deepEqual(reads, ["/intakes/in-1", "/drafts/dr-1", "/intakes/in-1", "/drafts/dr-1"], "exactly one re-read");
});
