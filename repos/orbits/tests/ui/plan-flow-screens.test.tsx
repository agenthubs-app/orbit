import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { pickActiveV2Plan } from "../../app/(app)/app/orbit-2026/plan/plan-model";
import { createPlanFlowHandlers } from "../../features/plans/v2/flow-handlers";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";
import { confirmed, draftFixture, draftV3Fixture, intakeFixture, premiseIntake, questionsIntake } from "./support/plan-flow-fixtures";

// R23 (UI-SPEC ① ② ③): the Web plan generation screens rendered for real. fetch is
// stubbed in the page and every call is recorded, so each test asserts which
// requests a step makes — and that ticking, choosing and typing make none.
type Reply = { status: number; body: unknown };
type Handler = { method: string; url: string; replies: Reply[]; delay?: number };
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
      if (handler.delay) await new Promise((resolve) => setTimeout(resolve, handler.delay));
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

// The goal input also reads the profile once (the saved goal); plan assertions leave that read out.
const fetches = async (page: Page): Promise<Call[]> => (await page.evaluate(() => (window as any).shellFixture.fetches as Call[])).filter((call) => call.url !== "/api/profile");
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

test("goal input: the goal saved in onboarding fills the input and its type, without a guess", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok({ profile: { relationshipGoal: "資金調達、採用：シリーズA" } })], url: "^/api/profile$" },
    { method: "GET", replies: [ok({ activeGoalLimit: 2, activeGoals: 0, intakes: [], newGoalsLeftThisMonth: 9 })], url: "/intakes$" },
  ], view: "goal" });
  const input = page.getByLabel("目標", { exact: true });
  await page.waitForFunction(() => (document.querySelector("input[aria-label='目標']") as HTMLInputElement | null)?.value !== "");
  assert.equal(await input.inputValue(), "資金調達：シリーズA");
  await page.getByRole("button", { name: "💰 資金調達", pressed: true }).waitFor();
  await page.waitForTimeout(1000);
  assert.equal((await fetches(page)).filter((call) => path(call) === "/goal-kind").length, 0, "the saved type is used, nothing is guessed");
});

test("goal input: no new goals left this month is said up front and the button is off", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok({ activeGoalLimit: 2, activeGoals: 0, intakes: [{ goal: "Old goal", goalKind: "sales", href: "/app/plans/flow/old", intakeId: "old", status: "background", updatedAt: "2026-10-01T00:00:00Z" }], newGoalsLeftThisMonth: 0 })], url: "/intakes$" },
  ], view: "goal" });
  await page.getByText("今月はこれ以上新しい目標を作れません。").waitFor();
  await page.getByLabel("目標", { exact: true }).fill("何か新しいことを始めたい");
  assert.equal(await page.getByRole("button", { name: "iOrbit と具体化する" }).isDisabled(), true);
  // b12 W-R23-02a: the resume card says 作りかけのプラン over the goal (its label reads the whole line).
  await page.locator("[data-plan-resume]").getByLabel("作りかけのプラン：Old goal").waitFor();
  await page.getByRole("button", { name: "続ける" }).click();
  assert.deepEqual(await calls(page), [{ push: "/app/plans/flow/old" }]);
});

/* ---------- ② 背景 ---------- */

test("background: one screen — わたし folded, チーム and 目的 open, one button to the questions", async (t) => {
  const page = await screen(t, { handlers: [{ method: "GET", replies: [ok(intakeFixture())], url: "/intakes/in-1$" }], id: "in-1", view: "flow" });
  await page.locator("[data-plan-background]").waitFor();
  const blocks = await page.locator("[data-plan-block]").evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute("data-plan-block")}:${node.getAttribute("data-state")}`));
  // R23 pixel rework (b10 「② 背景確認 · Web」): one screen — わたし drafted with a role folds with ✎,
  // チーム and 目的 are open side by side, one button under them confirms all three.
  assert.deepEqual(blocks, ["me:done", "team:current", "purpose:current"]);
  await page.getByRole("button", { name: "この背景で質問へ（5問まで）" }).waitFor();
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
  await page.getByRole("radio", { name: "一人" }).click();
  assert.equal(await page.locator("tr[data-capability='ops_infra'] [data-plan-cover]").textContent(), "空き");
  assert.equal((await fetches(page)).length, before, "ticks and the solo switch are local");
});

test("team confirm sends every member's ticks with the version it read; a stale write offers a reload", async (t) => {
  const intake = confirmed(intakeFixture(), ["me"]);
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(intake)], url: "/intakes/in-1$" },
    { method: "PATCH", replies: [ok({ ...intake, updatedAt: "2026-10-10T00:09:00.000Z" }), fail(409, "STALE")], url: "/intakes/in-1$" },
  ], id: "in-1", view: "flow" });
  await page.locator("tr[data-capability='brand']").getByRole("button", { name: "Ken Mori · ブランド" }).click();
  // One button confirms わたし → チーム → 目的 in order (the server keeps the order); each write carries the version it read.
  await page.getByRole("button", { name: "この背景で質問へ（5問まで）" }).click();
  await page.locator("[data-plan-notice='stale']").waitFor();
  const patches = (await fetches(page)).filter((call) => call.method === "PATCH");
  assert.deepEqual(patches.map((call) => call.body.block), ["me", "team"], "stops at the stale write");
  const patch = patches[1]!;
  assert.equal(patches[0]!.body.expectedUpdatedAt, intake.updatedAt);
  assert.equal(patch.body.expectedUpdatedAt, "2026-10-10T00:09:00.000Z");
  assert.deepEqual(patch.body.team.members.find((member: any) => member.memberId === "contact:c-1").capabilities, ["product", "ops_infra", "brand"]);
  await page.getByRole("button", { name: "最新を読み込む" }).click();
  await page.waitForFunction(() => (window as any).shellFixture.fetches.filter((call: any) => call.method === "GET").length === 2);
});

test("わたし: a changed 「やりたいこと」 rebuilds the ladder first, then confirms with the new version", async (t) => {
  const after = { ...intakeFixture(), updatedAt: "2026-10-10T00:05:00.000Z" };
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(intakeFixture())], url: "/intakes/in-1$" },
    { method: "POST", replies: [ok(after)], url: "/ladder$" },
    { method: "PATCH", replies: [ok(confirmed(after, ["me"]))], url: "/intakes/in-1$" },
  ], id: "in-1", view: "flow" });
  await page.getByRole("button", { name: "わたしを直す" }).click();
  await page.getByRole("textbox", { name: "やりたいこと" }).fill("Make it a brand");
  await page.getByRole("button", { name: "この背景で質問へ（5問まで）" }).click();
  // The stair is redrawn for the new words: confirm わたし and stop so the person can pick a rung again.
  await page.waitForFunction(() => (window as any).shellFixture.fetches.filter((call: any) => call.method !== "GET").length === 2);
  await page.locator("[data-plan-block='me'][data-state='done']").waitFor();
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
  // b10 「③ 5 問 · Web」: the guess is preselected (it is still sent as untouched → the server marks it 推測).
  assert.equal(await page.locator("[data-question='R1'] button[aria-pressed='true']").count(), 1, "the guess is preselected");
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
  // b12 W-R23-15: a question row is changed by its options, then 「この内容にする」.
  await page.locator("[data-premise-edit='R1']").getByRole("button", { name: "有料あり" }).click();
  await page.getByRole("button", { name: "この内容にする" }).click();
  await page.locator("[data-premise='R1']").waitFor();
  const patch = (await fetches(page)).find((call) => call.method === "PATCH")!;
  assert.equal(patch.body.key, "R1");
  assert.equal(patch.body.value.startsWith("有料あり"), true);
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

/* ---------- R36a: 初版 v3（plan-draft-v5 v16「初稿 · 确认」） ---------- */

test("R36a v3 draft: the v16 page renders the conclusion, route, grouped types and evidence; missing blocks are not drawn; a v2 draft keeps the DraftCard", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture())], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  const root = page.locator("[data-plan-draft-v3]");
  await root.waitFor();
  assert.equal(await root.getAttribute("data-plan-draft-total"), "100");
  // 结论区：outcome · conclusion · summary（按 marks 加粗、引用标记：回答 / 来源号；指向不存在来源的标记跳过）· 判定 · 信心
  await root.getByText("目標 · Five paying customers").waitFor();
  assert.equal(await root.locator("h1").textContent(), draftFixture().content.conclusion);
  assert.equal(await root.locator("[data-plan-v3-summary] u").textContent(), "Building is strong");
  assert.equal(await root.locator("[data-plan-v3-summary] button").count(), 2, "answer marker + source 1; the missing source marker is skipped");
  await root.locator("[data-plan-v3-summary]").getByRole("button", { name: "あなたの回答" }).click();
  await root.locator("[data-plan-v3-ref]").getByText("あなたの回答「現在地」：完成・β 運用中").waitFor();
  await root.locator("[data-plan-v3-summary]").getByRole("button", { name: "1" }).click();
  await root.locator("[data-plan-v3-ref]").getByText("情報源 1：Card and contact apps").waitFor();
  assert.equal(await root.locator("[data-plan-v3-verdict]").getAttribute("data-plan-v3-verdict"), "feasible");
  await root.getByRole("button", { name: "確信度 中 ⓘ" }).click();
  await root.getByText("The product is already in beta.").waitFor();
  // 路线：3 个阶段，当前 = 第 1 个
  assert.equal(await root.locator("[data-plan-v3-route] [aria-current='step']").textContent(), "1Say who it is for");
  assert.equal(await root.locator("[data-plan-v3-route] > div").count(), 3);
  // 按阶段分组的类型表：3 个阶段头（Step 1 有 2 类）、4 类 + イベント行、合计 100
  const types = root.locator("[data-plan-v3-types]");
  assert.deepEqual(await types.locator("b").filter({ hasText: /^ステージ/u }).allTextContents(), ["ステージ 1 · Say who it is for", "ステージ 2 · First paying customer", "ステージ 3 · Fill the missing skills"]);
  assert.equal(await types.locator("[data-type]").count(), 5);
  await types.getByText("4 タイプ · 12 人 · イベント 3 回").waitFor();
  // 依据区：顺序理由 2 条（来源号 1 / 2 3）、对比条 3 行按判定、折叠态不画数字 / 风险 / 来源
  const evidence = root.locator("[data-plan-v3-evidence]");
  assert.equal(await evidence.getAttribute("data-plan-v3-evidence"), "closed");
  assert.deepEqual(await evidence.locator("[data-plan-v3-cmp]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-plan-v3-cmp"))), ["preferred", "possible", "not_recommended"]);
  assert.equal(await evidence.locator("[data-plan-v3-risk]").count(), 0);
  await evidence.getByRole("button", { name: "さらに 1 個の数字、2 件のリスク、3 個の情報源を見る ▾" }).click();
  assert.deepEqual(await evidence.locator("[data-plan-v3-risk]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-plan-v3-risk"))), ["risk", "unverified"]);
  await evidence.getByText("未確認").waitFor();
  assert.equal(await evidence.locator("[data-plan-v3-source]").count(), 3);
  assert.equal(await evidence.locator("[data-plan-v3-source='S3']").getAttribute("data-plan-v3-stale"), "true", "a web source fetched over 180 days ago is marked");
  assert.equal(await evidence.locator("[data-plan-v3-source='S2']").getAttribute("data-plan-v3-stale"), null);
  await evidence.locator("[data-plan-v3-source='S3']").getByText("更新されている可能性あり").waitFor();
  assert.equal(await evidence.locator("[data-plan-v3-source='S1']").getByRole("link", { name: "原文を見る ↗" }).getAttribute("href"), "https://example.org/l-012");
  // 用到的你的信息：展开才读资料；读不到 → 「未記入」+ 補足；回答行照前提
  await root.getByRole("button", { name: /あなたの資料と 1 個の回答/u }).click();
  await root.getByText("現在地").waitFor();
  assert.equal(await root.getByText("未記入", { exact: true }).count(), 4);
  // 老画面入口不变：右栏 AI 修正 / 手動で編集 / この内容で確定
  assert.equal(await page.locator("[data-plan-rail='draft']").getByRole("button", { name: "この内容で確定" }).isDisabled(), false);
  assert.equal(await page.locator("[data-plan-rail='draft']").getByRole("button", { name: "手動で編集" }).count(), 1);
  assert.equal(await page.locator("[data-plan-draft='']").count(), 0, "no DraftCard for a v3 draft");
  assert.equal(await page.locator("[aria-current='step']").filter({ hasText: "初版" }).count(), 0, "v3: no five-step bar, the page is the prototype's whole screen");
  assert.equal(await page.locator("[data-plan-premise]").count(), 0, "v3: the premise card is folded into the hero");

  // 缺字段隐藏：没有对比条 / 关键数字 / 风险 / 来源 / 信心 / 判定 / outcome → 这些块一律不画
  const bare = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture({}, { comparison: null, confidence: undefined, keyNumbers: [], outcome: undefined, risks: [], sources: [], verdict: undefined }))], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await bare.locator("[data-plan-draft-v3]").waitFor();
  assert.equal(await bare.locator("[data-plan-v3-cmp], [data-plan-v3-verdict], [data-plan-v3-confidence], [data-plan-v3-risk]").count(), 0);
  assert.equal(await bare.getByText(/^目標 · /u).count(), 0);
  assert.equal(await bare.locator("[data-plan-v3-summary] button").count(), 1, "only the answer marker survives without sources");

  // v2 退回：schemaVersion 缺省 → R23 DraftCard
  const v2 = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture())], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await v2.locator("[data-plan-draft='']").waitFor();
  assert.equal(await v2.locator("[data-plan-draft-v3]").count(), 0);
});

test("R36a v3 adjust: counts, points and removals move the total with plan-allocation; ≠100 turns both confirm buttons off and names the total; confirm sends adjustments only when something changed", async (t) => {
  const confirmReply = ok({ archivedV1PlanId: null, href: "/app/tasks?tab=plan&plan=p-1", planId: "p-1", replayed: false }, 201);
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture())], url: "/drafts/dr-1$" },
    { method: "POST", replies: [confirmReply], url: "/drafts/dr-1/confirm$" },
  ], id: "in-1", view: "flow" });
  const root = page.locator("[data-plan-draft-v3]");
  await root.waitFor();
  const row = (key: string) => root.locator(`[data-type='${key}']`);
  const dockConfirm = root.locator("[data-plan-v3-confirm]");
  const railConfirm = page.locator("[data-plan-rail='draft']").getByRole("button", { name: "この内容で確定" });
  const total = () => root.getAttribute("data-plan-draft-total");
  // 分量 +5 → 105：两个确定都禁用，dock 显示差值；再 −5 回到 100
  await row("first_payer").locator("[data-plan-v3-points] button[aria-label='+5']").click();
  assert.equal(await total(), "105");
  assert.equal(await dockConfirm.isDisabled(), true);
  assert.equal(await railConfirm.isDisabled(), true);
  await root.getByText("配点の合計が 105 で、100 ではありません").waitFor();
  await root.getByText("合計 105 / 100 点、確定する前に 100 にしてください").waitFor();
  await row("first_payer").getByText("変更あり").waitFor();
  await row("first_payer").locator("[data-plan-v3-points] button[aria-label='-5']").click();
  assert.equal(await total(), "100");
  assert.equal(await dockConfirm.isDisabled(), false);
  assert.equal(await row("first_payer").getByText("変更あり").count(), 0);
  // 人数：1–5 之间；分量：5–50 之间（到边界按钮禁用）
  await row("first_payer").locator("[data-plan-v3-count] button[aria-label='-']").click();
  assert.equal(await row("first_payer").locator("[data-plan-v3-count] b").textContent(), "4人");
  assert.equal(await row("brand_pr").locator("[data-plan-v3-points] button[aria-label='+5']").isDisabled(), false);
  for (let n = 0; n < 5; n++) await row("brand_pr").locator("[data-plan-v3-points] button[aria-label='+5']").click();
  assert.equal(await row("brand_pr").locator("[data-plan-v3-points] b").textContent(), "50点");
  assert.equal(await row("brand_pr").locator("[data-plan-v3-points] button[aria-label='+5']").isDisabled(), true);
  for (let n = 0; n < 5; n++) await row("brand_pr").locator("[data-plan-v3-points] button[aria-label='-5']").click();
  assert.equal(await total(), "100");
  // 删一类（10 点）→ 90；它的分给第一类 → 100；删到只剩 1 类时删按钮禁用
  await row("same_path_founder").locator("[data-plan-v3-remove]").click();
  assert.equal(await row("same_path_founder").getAttribute("data-plan-v3-type-on"), "false");
  assert.equal(await total(), "90");
  assert.equal(await row("same_path_founder").locator("[data-plan-v3-count] button[aria-label='+']").isDisabled(), true, "a removed row's steppers are off");
  await row("first_payer").locator("[data-plan-v3-points] button[aria-label='+5']").click();
  await row("first_payer").locator("[data-plan-v3-points] button[aria-label='+5']").click();
  assert.equal(await total(), "100");
  await row("brand_pr").locator("[data-plan-v3-remove]").click();
  await row("prior_product").locator("[data-plan-v3-remove]").click();
  assert.equal(await row("first_payer").locator("[data-plan-v3-remove]").isDisabled(), true, "the last type cannot be removed");
  await row("brand_pr").locator("[data-plan-v3-remove]").click();
  await row("prior_product").locator("[data-plan-v3-remove]").click();
  assert.equal(await total(), "100");
  // 确定：带 adjustments（删掉的类型不在 personTypes 里、人数 / 分量是调整后的、expectedRevision = 草稿 revision）
  await dockConfirm.click();
  await page.waitForFunction(() => (window as any).shellFixture.calls.length > 0);
  const [{ push }] = (await calls(page)) as { push: string }[];
  assert.equal(push, "/app/tasks?tab=plan&plan=p-1");
  const posted = (await fetches(page)).filter((call) => call.method === "POST");
  assert.equal(posted.length, 1);
  assert.deepEqual(posted[0]!.body.adjustments, {
    event: { allocation: 15, targetCount: 3 },
    expectedRevision: draftV3Fixture().revision,
    personTypes: [
      { allocation: 40, key: "first_payer", targetCount: 4 },
      { allocation: 25, key: "brand_pr", targetCount: 2 },
      { allocation: 20, key: "prior_product", targetCount: 2 },
    ],
  });

  // 没动过：请求体只有 idempotencyKey（和改前逐字节相同）
  const clean = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture())], url: "/drafts/dr-1$" },
    { method: "POST", replies: [confirmReply], url: "/drafts/dr-1/confirm$" },
  ], id: "in-1", view: "flow" });
  await clean.locator("[data-plan-draft-v3]").waitFor();
  // 「作り直す」已接接口（R36a，用户 2026-11-02 拍板）：次数没用完、没手动编辑 → 可用；调一下再调回来也算没动过
  assert.equal(await clean.locator("[data-plan-v3-redraft]").isDisabled(), false);
  await clean.locator("[data-type='first_payer'] [data-plan-v3-count] button[aria-label='-']").click();
  await clean.locator("[data-type='first_payer'] [data-plan-v3-count] button[aria-label='+']").click();
  await clean.locator("[data-plan-v3-confirm]").click();
  await clean.waitForFunction(() => (window as any).shellFixture.calls.length > 0);
  const cleanPost = (await fetches(clean)).filter((call) => call.method === "POST");
  assert.deepEqual(Object.keys(cleanPost[0]!.body), ["idempotencyKey"]);
});

test("fix bar: shows what is left; at 0 the input is off and only edit / confirm remain", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture({ aiFixUsed: 1, turns: [{ at: "2026-10-10T01:00:00Z", changes: [{ after: "New name", before: "Say who it is for", label: "Step 1 の名前", path: "steps.0.title" }], input: "Sales stays with the two of us for now", n: 1, noChangeReason: null, unchanged: ["Types"] }] }))], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await page.locator("[data-plan-fixbar]").waitFor();
  assert.equal(await page.locator("[data-plan-fix-left]").textContent(), "2");
  assert.equal(await page.locator("[aria-current='step']").textContent(), "AI 修正");
  await page.locator("[data-turn='1']").getByText("AI 修正 1 / 3 を反映").waitFor();
  await page.locator("[data-turn='1']").getByText("方案を更新しました").waitFor();
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
    { method: "POST", replies: [fail(409, "AI_LIMIT", { limit: "daily", retryOn: "2026-10-11" })], url: "/fix$" },
  ], id: "in-1", view: "flow" });
  await page.getByLabel("修正したいことを入力").fill("Design partner first");
  await page.getByRole("button", { name: "修正する" }).click();
  await page.locator("[data-plan-limit='daily']").getByText("今日はここまでです · 明日また使えます。").waitFor();
  assert.equal(await page.locator("[data-plan-failure]").count(), 0, "a limit is not a failure");
  // b12 W-R23-16c: the input is off with 「明日また使えます」 until the page is read again.
  assert.equal(await page.getByLabel("修正したいことを入力").isDisabled(), true);
  await page.getByPlaceholder("明日また使えます").waitFor();

  const failing = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftFixture())], url: "/drafts/dr-1$" },
    { method: "POST", replies: [{ body: { error: { code: "SERVICE_UNAVAILABLE", context: { reason: "AI_FAILED" }, message: "x" }, success: false }, status: 503 }, ok(draftFixture({ aiFixUsed: 1 }))], url: "/fix$" },
  ], id: "in-1", view: "flow" });
  await failing.getByLabel("修正したいことを入力").fill("Design partner first");
  await failing.getByRole("button", { name: "修正する" }).click();
  await failing.locator("[data-plan-failure='fix']").getByText("回数は減っていません。").waitFor();
  assert.equal(await failing.locator("[data-plan-limit]").count(), 0);
  await failing.getByRole("button", { name: "もう一度" }).click();
  await failing.locator("[data-plan-fix-left]").filter({ hasText: "2" }).waitFor();
  const keys = (await fetches(failing)).filter((call) => path(call).endsWith("/fix")).map((call) => call.body.idempotencyKey);
  assert.equal(new Set(keys).size, 2, "each try is a new action with its own key");
  assert.equal((await fetches(page)).filter((call) => path(call).endsWith("/fix")).length, 1, "the limited page sent once");
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
  // b10 「⑥ 手動編集 · Web」: the total sits in the rail card (合計 / 100 · 変更 n件 · 手動編集は 1回だけ).
  await page.locator("[data-plan-totalbar]").getByText("変更 3件 · 手動編集は 1回だけ").waitFor();
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
  // b12 W-R23-18: every remaining type is listed; the ones that take points show 旧 → 新.
  assert.deepEqual(await dialog.locator("[data-move]").evaluateAll((nodes) => nodes.map((node) => `${node.querySelector("b")!.textContent} ${node.lastElementChild!.textContent}`)), ["A First payer 30 → 35", "B Brand builder 25 → 30", "D Founder 10 → 15", "イベント 15 → 20"]);
  await page.getByRole("button", { name: "外す", exact: true }).click();
  assert.equal(await page.locator("tr[data-slot='prior_product']").count(), 0);
  assert.equal(await page.locator("[data-plan-total]").textContent(), "100");
  await page.locator("[data-plan-reset]").click();
  assert.equal(await page.locator("tr[data-slot='prior_product']").count(), 1);
  // Rename a step and start: one request with the revision and the whole edit.
  // A step's name opens for editing on click (b10: 名前と目安はクリックで編集).
  await page.getByRole("button", { name: "Step の名前 · Say who it is for" }).click();
  await page.getByRole("textbox", { name: "Step の名前" }).fill("Say it in one line");
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
  await page.getByRole("button", { name: "按这个背景提问（最多5题）" }).waitFor();
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
  await page.locator("[data-plan-background]").waitFor();
  // わたし opens only when the draft has no role yet.
  if (await page.locator("[data-plan-block='me'][data-state='current']").count()) await page.getByRole("button", { name: "代表・オーナー" }).click();
  await page.getByRole("button", { name: "この背景で質問へ（5問まで）" }).click();
  await page.locator("[data-plan-questions]").waitFor();
  await page.getByRole("button", { name: /^まとめて回答する/u }).click();
  await page.getByRole("button", { name: "この前提で初版をつくる" }).click();
  await page.locator("[data-plan-draft]").waitFor();
  await page.locator("[data-plan-fix-left]").filter({ hasText: "3" }).waitFor();
  // R36a: the mock first draft is v3, so the page has the rail's and the dock's 「この内容で確定」; the rail's is first.
  await page.getByRole("button", { name: "この内容で確定" }).first().click();
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
  // The goal switcher (web.html .k-wgoal) now reads 「💰 goal」 in one span, so the goal text is a substring.
  await view.locator("[data-plan-goal]").getByText("シリーズA の資金調達をしたい").waitFor();
  assert.equal(await view.locator("[data-plan-score]").getAttribute("data-plan-score"), String(card.total));
  assert.deepEqual((await fetches(view)).map((call) => `${call.method} ${path(call)}`), [`GET /v2/${encodeURIComponent(card.planId)}`, "GET /v2"], "the overview only reads (R25: the plan and the goal list behind the switcher)");
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
  // b12 W-R23-15: after revisions the premises open from the rail's 「前提を直す」.
  await page.locator("[data-plan-premise-open]").click();
  const edit = async () => {
    await page.locator("[data-premise='R2']").click();
    await page.locator("[data-premise-edit='R2']").getByRole("button").first().click();
    await page.getByRole("button", { name: "この内容にする" }).click();
  };
  await edit();
  const dialog = page.getByRole("alertdialog", { name: "この案と修正履歴を破棄しますか？" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  assert.equal((await fetches(page)).filter((call) => call.method === "PATCH").length, 0, "cancel sends nothing");
  await page.getByRole("button", { name: "この内容にする" }).click();
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
  await page.locator("[data-premise-edit='R2']").getByRole("button").first().click();
  await page.getByRole("button", { name: "この内容にする" }).click();
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

/* ---------- R23 pixel rework: D38 回改背景 · 「人脈から選ぶ」 default list ---------- */

test("D38: 背景を見る → 背景を直す asks first; confirm reopens once with the version read, a stale write offers the latest", async (t) => {
  const reopened = intakeFixture();
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(questionsIntake())], url: "/intakes/in-1$" },
    { method: "POST", replies: [fail(409, "STALE"), ok(reopened)], url: "/background/reopen$" },
  ], id: "in-1", view: "flow" });
  await page.getByRole("button", { name: "背景を見る" }).click();
  await page.locator("[data-plan-reopen-open]").click();
  const dialog = page.getByRole("alertdialog", { name: "背景を直しますか？" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  assert.equal((await fetches(page)).filter((call) => path(call).endsWith("/reopen")).length, 0, "cancel sends nothing");
  await page.getByRole("button", { name: "背景を見る" }).click();
  await page.locator("[data-plan-reopen-open]").click();
  await dialog.getByRole("button", { name: "背景を直す" }).click();
  await page.locator("[data-plan-notice='stale']").waitFor();
  await page.getByRole("button", { name: "背景を見る" }).click();
  await page.locator("[data-plan-reopen-open]").click();
  await dialog.getByRole("button", { name: "背景を直す" }).click();
  await page.locator("[data-plan-background]").waitFor();
  const sent = (await fetches(page)).filter((call) => path(call).endsWith("/reopen"));
  assert.equal(sent.length, 2);
  assert.equal(sent[1]!.body.expectedUpdatedAt, questionsIntake().updatedAt);
  assert.notEqual(sent[0]!.body.idempotencyKey, sent[1]!.body.idempotencyKey);
});

test("人脈から選ぶ: the default list comes from member-candidates (no query); picking one previews what they can do", async (t) => {
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(confirmed(intakeFixture(), ["me"]))], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok({ candidates: [{ capabilities: ["design"], cofounder: false, contactId: "c-9", fills: ["design"], name: "Mio Mori", organization: "Studio M", role: "UI designer" }], gaps: ["design"] })], url: "/member-candidates$" },
  ], id: "in-1", view: "flow" });
  await page.getByRole("button", { name: "メンバーを追加" }).click();
  await page.locator("[data-plan-add='network']").getByText("Mio Mori").waitFor();
  assert.equal((await fetches(page)).filter((call) => path(call).endsWith("/member-candidates")).length, 1);
  await page.getByRole("checkbox", { name: "Mio Mori" }).click();
  await page.locator("[data-plan-add-preview]").getByText("Mio Moriさんの「できること」").waitFor();
  assert.equal(await page.getByRole("button", { name: "1名を追加" }).isDisabled(), false);
});

// R36a「重新起草」：没动过 → 直接 POST …/redraft（body 只有 idempotencyKey），进行中显示生成中骨架，回来换成新稿、页上的调整作废；
// 有未保存调整 → 先确认（取消不发请求）；次数用完 / 已手动编辑 → 按钮禁用。
test("R36a v3 redraft: sends POST …/redraft, shows the drafting skeleton meanwhile and swaps in the new draft; unsaved adjustments ask first; used-up or hand-edited drafts disable the button", async (t) => {
  const redrawn = draftV3Fixture({ aiFixUsed: 1, revision: "rev-2" }, { conclusion: "作り直した結論" });
  const page = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture())], url: "/drafts/dr-1$" },
    { delay: 300, method: "POST", replies: [ok(redrawn)], url: "/drafts/dr-1/redraft$" },
  ], id: "in-1", view: "flow" });
  const root = page.locator("[data-plan-draft-v3]");
  await root.waitFor();
  const redraft = root.locator("[data-plan-v3-redraft]");
  assert.equal(await redraft.isDisabled(), false);
  // 没动过：不问，直接发；进行中 = 生成中骨架（data-plan-drafting），回来 = 新稿、aiFixUsed +1
  await redraft.click();
  await page.locator("[data-plan-drafting]").waitFor();
  assert.equal(await page.locator("[data-plan-redraft-ask]").count(), 0);
  await page.locator("[data-plan-draft-v3] h1", { hasText: "作り直した結論" }).waitFor();
  assert.equal(await page.locator("[data-plan-drafting]").count(), 0);
  const posted = (await fetches(page)).filter((call) => call.method === "POST");
  assert.equal(posted.length, 1);
  assert.equal(posted[0]!.url, "/api/agent/plans/drafts/dr-1/redraft");
  assert.deepEqual(Object.keys(posted[0]!.body), ["idempotencyKey"]);
  assert.equal(await page.locator("[data-plan-fix-left]").textContent(), "2");

  // 有未保存调整 → 确认框：取消不发请求、调整还在；确认 → 发请求，回来后调整作废（新稿按 revision 重置）
  const asked = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture())], url: "/drafts/dr-1$" },
    { method: "POST", replies: [ok(redrawn)], url: "/drafts/dr-1/redraft$" },
  ], id: "in-1", view: "flow" });
  const askedRoot = asked.locator("[data-plan-draft-v3]");
  await askedRoot.waitFor();
  await askedRoot.locator("[data-type='first_payer'] [data-plan-v3-points] button[aria-label='+5']").click();
  assert.equal(await askedRoot.getAttribute("data-plan-draft-total"), "105");
  await askedRoot.locator("[data-plan-v3-redraft]").click();
  const dialog = asked.locator("[data-plan-redraft-ask]");
  await dialog.waitFor();
  await dialog.getByText("いまの調整を捨てて、作り直しますか？").waitFor();
  await dialog.getByText("AI 修正を 1 回使います（あと 2 回）").waitFor();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  assert.equal(await dialog.count(), 0);
  assert.equal((await fetches(asked)).filter((call) => call.method === "POST").length, 0, "cancel sends nothing");
  assert.equal(await askedRoot.getAttribute("data-plan-draft-total"), "105", "the adjustments stay");
  await askedRoot.locator("[data-plan-v3-redraft]").click();
  await asked.locator("[data-plan-redraft-confirm]").click();
  await asked.locator("[data-plan-draft-v3] h1", { hasText: "作り直した結論" }).waitFor();
  assert.equal((await fetches(asked)).filter((call) => call.method === "POST").length, 1);
  assert.equal(await askedRoot.getAttribute("data-plan-draft-total"), "100", "the unsaved adjustments are gone with the new draft");
  assert.equal(await askedRoot.locator("[data-plan-v3-redraft]").isDisabled(), false);

  // 次数用完 → 禁用；已手动编辑（manualEditAvailable false）→ 禁用
  const usedUp = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture({ aiFixUsed: 3 }))], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await usedUp.locator("[data-plan-draft-v3]").waitFor();
  assert.equal(await usedUp.locator("[data-plan-v3-redraft]").isDisabled(), true);
  const edited = await screen(t, { handlers: [
    { method: "GET", replies: [ok(drafted())], url: "/intakes/in-1$" },
    { method: "GET", replies: [ok(draftV3Fixture({ manualEditAvailable: false }))], url: "/drafts/dr-1$" },
  ], id: "in-1", view: "flow" });
  await edited.locator("[data-plan-draft-v3]").waitFor();
  assert.equal(await edited.locator("[data-plan-v3-redraft]").isDisabled(), true);
});
