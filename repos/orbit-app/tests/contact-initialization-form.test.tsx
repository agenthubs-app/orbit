import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";
import type { ContactInitializationState } from "../src/view-models/relationship-initialization";

const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }, original = loader._load;
loader._load = (name, ...args) => {
  if (name === "expo-crypto") return { randomUUID: () => "render-only" };
  if (name === "expo-router") return { useRouter: () => ({ push() {} }) };
  if (name.endsWith("/api/AuthSessionProvider")) return { useOrbitAuthSession: () => ({}) };
  if (name.endsWith("/api/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({}) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  return original(name, ...args);
};
let ContactInitializationForm: typeof import("../src/screens/contacts/ContactRelationshipInitializer").ContactInitializationForm;
try { ({ ContactInitializationForm } = require("../src/screens/contacts/ContactRelationshipInitializer")); } finally { loader._load = original; }
const blank: ContactInitializationState = { view: { kind: "pending" }, busy: false, locked: false, error: "", notice: null, draft: { stage: "", goal: "", title: "", date: "", time: "", archiveConfirmed: false } };
const render = (state = blank, language: "zh" | "en" | "ja" = "zh") => renderToHtml(<ContactInitializationForm state={state} ready language={language} timeZone="Asia/Shanghai" canSave onChange={() => {}} onSave={async () => {}} onRefresh={async () => {}} onOpenTask={() => {}} />);

test("native form offers explicit choices with no selected stage or invented field values", () => {
  const html = render();
  assert.equal((html.match(/role="radio"/g) ?? []).length, 4);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 0);
  assert.match(html, /待设置关系/); assert.match(html, /确认我的选择/);
  assert.doesNotMatch(html, /尚不支持|Web 联系人详情/);
  const goal = render({ ...blank, draft: { ...blank.draft, stage: "active" } });
  assert.match(goal, /aria-label="关系目标"/); assert.match(goal, /value=""/);
  const dated = render({ ...blank, draft: { ...blank.draft, stage: "needs_follow_up" } });
  assert.match(dated, /aria-label="下次日期"/); assert.match(dated, /aria-label="下次时间"/);
  assert.equal((dated.match(/value=""/g) ?? []).length, 3);
  assert.match(dated, /Asia\/Shanghai/);
});
test("retry preserves reviewed goal and shows exact failure and retry controls", () => {
  const html = render({ ...blank, locked: true, error: "REVISION_CONFLICT: Refresh first", draft: { ...blank.draft, stage: "active", goal: "Reviewed goal" } });
  assert.match(html, /Reviewed goal/); assert.match(html, /REVISION_CONFLICT: Refresh first/);
  assert.match(html, /重试原提交/); assert.match(html, /刷新关系状态/);
  assert.match(html, /readonly/i);
});
test("canonical read/replayed receipt shows goal or dated task and task entry in three languages", () => {
  for (const language of ["zh", "en", "ja"] as const) {
    const html = render({ ...blank, view: { kind: "initialized", stage: "active", goal: "Confirmed goal", connectionId: "connection:one", tasks: [] }, notice: "replayed" }, language);
    assert.match(html, /Confirmed goal/); assert.doesNotMatch(html, /role="radio"|<input/);
  }
  const html = render({ ...blank, view: { kind: "initialized", stage: "needs_follow_up", goal: null, connectionId: "connection:one", tasks: [{ id: "task:one", title: "Meet again", dueAt: "2026-10-01T07:00:00Z" }] } });
  assert.match(html, /Meet again/); assert.match(html, /处理关系跟进/);
  assert.equal(render({ ...blank, view: { kind: "hidden" } }), "");
});
