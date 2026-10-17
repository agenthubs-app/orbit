import assert from "node:assert/strict";
import test from "node:test";
import { useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { TodoDraftDrawer, draftMailto, type ManualTodoDraft } from "../../app/(app)/app/orbit-2026/todo/TodoDraftDrawer";
import { Orbit2026Scope } from "../../app/(app)/app/orbit-2026/ui";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
const button = (root: ReactTestRenderer, label: string) => root.root.findAllByType("button").find(node => text(node) === label)!;
function Harness({ canHandoff = true, scopeKey = "a/day1" }: { canHandoff?: boolean; scopeKey?: string }) {
  const [draft, setDraft] = useState<ManualTodoDraft>({ to: "", subject: "お礼", body: "" });
  return <Orbit2026Scope language="ja"><TodoDraftDrawer open title="面談のお礼" reason="昨日の面談" value={draft} canHandoff={canHandoff} scopeKey={scopeKey} onChange={setDraft} onClose={() => {}} /></Orbit2026Scope>;
}
function documentStub() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  return () => descriptor ? Object.defineProperty(globalThis, "document", descriptor) : Reflect.deleteProperty(globalThis, "document");
}

test("manual draft exposes AI/save unavailability and never calls a generator or sends mail", async t => {
  const restore = documentStub();
  t.mock.method(globalThis, "fetch", async () => { throw Error("MUST_NOT_CALL_AI_OR_SEND"); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Harness />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const rendered = JSON.stringify(root!.toJSON());
  assert.ok(rendered.includes("日本語の AI 下書きはまだ使えません。手動で編集できます。"));
  assert.ok(rendered.includes("入力はこのページだけに残ります。再読み込みやアカウント切替で消えます。サーバーには保存しません。"));
  assert.equal(button(root!, "書き直す").props.disabled, true);
  assert.equal(button(root!, "下書きを保存").props.disabled, true);
  assert.equal(button(root!, "コピー").props.disabled, true);
  assert.equal(root!.root.findAllByType("a").length, 0);
});

test("editing produces an encoded mailto handoff; clipboard failures retain all input and show no success", async t => {
  const restore = documentStub();
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let fail = true;
  const copies: string[] = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => { copies.push(value); if (fail) throw Error("DENIED"); } } } });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Harness />); });
  t.after(() => { act(() => root.unmount()); restore(); if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else Reflect.deleteProperty(globalThis, "navigator"); });
  const inputs = root!.root.findAllByType("input");
  await act(async () => inputs[0]!.props.onChange({ target: { value: "person@example.test" } }));
  await act(async () => inputs[1]!.props.onChange({ target: { value: "お礼 & 資料" } }));
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "ありがとうございました。\nhttps://example.test/?a=1&b=2" } }));
  const href = root!.root.findByType("a").props.href;
  assert.equal(href, draftMailto({ to: "person@example.test", subject: "お礼 & 資料", body: "ありがとうございました。\nhttps://example.test/?a=1&b=2" }));
  await act(async () => button(root!, "コピー").props.onClick());
  assert.ok(JSON.stringify(root!.toJSON()).includes("コピーできませんでした。本文を選んでコピーしてください。"));
  assert.equal(root!.root.findByType("textarea").props.value, "ありがとうございました。\nhttps://example.test/?a=1&b=2");
  fail = false;
  await act(async () => button(root!, "コピー").props.onClick());
  assert.ok(JSON.stringify(root!.toJSON()).includes("コピーしました"));
  assert.deepEqual(copies, ["ありがとうございました。\nhttps://example.test/?a=1&b=2", "ありがとうございました。\nhttps://example.test/?a=1&b=2"]);
});

test("mailto rejects recipient/header injection and oversized text before any handoff", () => {
  const draft = { to: "person@example.test", subject: "お礼", body: "本文" };
  assert.equal(draftMailto(draft), "mailto:person%40example.test?subject=%E3%81%8A%E7%A4%BC&body=%E6%9C%AC%E6%96%87");
  for (const to of ["", "not email", "a@example.test,b@example.test", "a@example.test\r\nBcc:b@example.test", "a@example.test?bcc=b@example.test", "a\0b@example.test", "\uD800@example.test"]) assert.equal(draftMailto({ ...draft, to }), null);
  assert.equal(draftMailto({ ...draft, subject: "Hi\r\nBcc:other@example.test" }), null);
  assert.equal(draftMailto({ ...draft, body: "x".repeat(50001) }), null);
  assert.equal(draftMailto({ ...draft, body: " " }), null);
  assert.equal(draftMailto({ ...draft, body: "文".repeat(1000) }), null, "oversized encoded mailto stays copy-only");
});

test("revoked item binding keeps manual text but hides handoff and ignores a late prior-scope clipboard result", async t => {
  const restore = documentStub(), previous = Object.getOwnPropertyDescriptor(globalThis, "navigator"); let resolve!: () => void; let calls = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => { calls++; if (calls === 1) await new Promise<void>(done => { resolve = done; }); } } } });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Harness />); });
  t.after(() => { act(() => root.unmount()); restore(); if (previous) Object.defineProperty(globalThis, "navigator", previous); else Reflect.deleteProperty(globalThis, "navigator"); });
  await act(async () => root!.root.findAllByType("input")[0]!.props.onChange({ target: { value: "person@example.test" } }));
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "Preserved manual text" } }));
  const oldCopy = button(root!, "コピー").props.onClick;
  await act(async () => oldCopy());
  await act(async () => root.update(<Harness canHandoff={false} scopeKey="a/day2" />));
  await act(async () => resolve());
  assert.equal(root!.root.findByType("textarea").props.value, "Preserved manual text");
  assert.equal(button(root!, "コピー").props.disabled, true);
  assert.equal(root!.root.findAllByType("a").length, 0);
  assert.ok(!JSON.stringify(root!.toJSON()).includes("コピーしました"));
  await act(async () => oldCopy());
  assert.equal(calls, 1);
  await act(async () => root.update(<Harness scopeKey="a/day2" />));
  await act(async () => button(root!, "コピー").props.onClick());
  assert.equal(calls, 2);
  assert.ok(JSON.stringify(root!.toJSON()).includes("コピーしました"));
});
