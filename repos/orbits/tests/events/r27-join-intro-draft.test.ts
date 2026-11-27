/**
 * 2026-11-26：答完后 AI 写自我介绍要几秒。写好之前确认页说明「正在写」、不能提交、不能改介绍；写完自动恢复；
 * 没写成 / 超时给兜底（资料里的介绍或空）并说明可以自己写或直接报名；改资料不写。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { INTRO_DRAFT_WAIT_MS, introDraftOutcome, waitForIntroDraft } from "../../app/(app)/app/orbit-2026/events/intro-draft-wait";
import { eventsJourneyCopy } from "../../app/(app)/app/orbit-2026/copy/eventsJourney";

const flow = readFileSync("app/(app)/app/orbit-2026/events/RegisterFlow.tsx", "utf8");

test("the wait is bounded by the model's own timeout plus a margin; a late draft is still handed over", async () => {
  assert.equal(INTRO_DRAFT_WAIT_MS, 70_000);
  const fast = await waitForIntroDraft(Promise.resolve("draft"), 1_000);
  assert.deepEqual(fast, { timedOut: false, value: "draft" });
  let finish!: (value: string) => void;
  const slow = new Promise<string>((resolve) => { finish = resolve; });
  const waited = await waitForIntroDraft(slow, 5, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  assert.equal(waited.timedOut, true);
  finish("late draft");
  assert.equal(waited.timedOut && (await waited.late), "late draft");
});

test("outcome: an AI draft is shown as is; the profile's intro, nothing, or a failed request fall back with the note", () => {
  assert.deepEqual(introDraftOutcome({ ok: true, selfIntro: { source: "ai_draft", text: "AI の紹介" } }), { state: "idle", text: "AI の紹介" });
  assert.deepEqual(introDraftOutcome({ ok: true, selfIntro: { source: "profile", text: "資料の紹介" } }), { state: "failed", text: "資料の紹介" });
  assert.deepEqual(introDraftOutcome({ ok: true, selfIntro: null }), { state: "failed", text: "" });
  assert.deepEqual(introDraftOutcome({ ok: false }), { state: "failed", text: "" });
});

test("while drafting: apply waits and says why, the intro cannot be edited, the state is announced; edits never draft", () => {
  assert.match(flow, /disabled=\{busy \|\| draft === "running"( \|\| wechatNeeded)?\}[^\n]*aria-disabled=\{draft === "running"\}[^\n]*\{draft === "running" \? t\("introDrafting"\)/, "apply: disabled with the reason on the button");
  assert.match(flow, /if \(!mode \|\| draft === "running"( \|\| wechatNeeded)?\) return;/, "apply refuses while drafting even if the button is reached");
  assert.match(flow, /aria-label=\{t\("edit"\)\} disabled=\{draft === "running"\}/, "intro edit waits");
  assert.match(flow, /aria-busy=\{draft === "running"\}/);
  assert.match(flow, /role="status" aria-live="polite" data-join-intro-draft=\{draft\}/);
  assert.match(flow, /introPending=\{draft === "running"\}/, "the right card shows the same wait, not old text");
  assert.match(flow, /if \(introRef\.current !== null\) return;/, "an intro that exists (written or edited) is not drafted again");
  const editBranch = flow.slice(flow.indexOf("if (editing) {", flow.indexOf("const submitAnswer")), flow.indexOf("const next = [...answers, given];"));
  assert.doesNotMatch(editBranch, /draftIntro|profile\(eventId, \w+, true\)/, "changing a registration never asks for a new draft");
  assert.match(flow, /const confirmed = \(intro \?\? profile\?\.selfIntro\?\.text \?\? ""\)/, "what is shown is what is submitted");
  for (const key of ["introDrafting", "introDraftFailed"] as const) for (const language of ["ja", "zh", "en"] as const) assert.ok(eventsJourneyCopy[key][language]);
});

test("a finished draft is announced (same words as the App); a blocked page shows no empty card, only what was submitted, read-only", () => {
  assert.match(flow, /draft === "ready" \? <span className=\{r\.srOnly\}>\{t\("introDrafted"\)\}<\/span>/);
  assert.match(flow, /\{blocked && !profile \? null : <ProfileCard/);
  assert.match(flow, /blocked \? "readonly"/);
  assert.deepEqual([eventsJourneyCopy.introDrafted.ja, eventsJourneyCopy.introDrafted.zh, eventsJourneyCopy.introDrafted.en], ["自己紹介ができました", "自我介绍已生成", "Your introduction is ready"]);
});
