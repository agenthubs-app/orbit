import assert from "node:assert/strict";
import test from "node:test";
import { useState } from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";

import { ReferenceChips, ReferencePicker, useReferenceComposer, type PickerKeys, type ReferenceComposer } from "../../app/(app)/app/agent/iorbit-2026/ReferencePicker";
import type { AgentReferenceSearchResultContract } from "../../shared/contract/agent-v1";

/**
 * agent-design AG11-1/AG11-3 (获批视觉稿 D1–D7): the web composer's @ picker — typing @ opens it with the words after the @
 * as the search, results grouped by kind with the kind's badge and the line that tells same names apart; picking one puts
 * 「@名字 」 in the sentence and a chip above it; 「＋」 picks several and inserts them in order; × keeps the words without
 * the @ and stops sending it; editing the words of a mark drops it. What is sent carries each mark's place.
 */

const RESULT: AgentReferenceSearchResultContract = {
  groups: [
    { items: [{ detail: { company: "东和商事", role: "采购主管" }, id: "contact:c30", name: "田中浩", type: "contact" }], more: false, type: "contact" },
    { items: [
      { detail: { date: "2026-11-10T03:00:00.000Z", dateKind: "written", people: ["田中浩"] }, id: "note:m37", name: "客户访谈", type: "memo" },
      { detail: { date: "2026-11-13T03:00:00.000Z", dateKind: "written", people: ["王强"] }, id: "note:m61", name: "客户访谈", type: "memo" },
    ], more: false, type: "memo" },
    { items: [{ detail: { date: "2026-11-17T09:00:00.000Z", dateKind: "due" }, id: "task:t44", name: "回复田中的询价", type: "todo" }], more: false, type: "todo" },
    { items: [{ detail: { date: "2026-11-19T03:00:00.000Z", dateKind: "at" }, id: "personal:s11", name: "和田中午餐", type: "schedule" }], more: false, type: "schedule" },
    { items: [{ detail: { date: "2026-11-19T10:00:00.000Z", dateKind: "at", place: "丸之内" }, eventKind: "platform", id: "event:e103", name: "SaaS 定价研讨会", type: "event" }], more: false, type: "event" },
    { items: [{ detail: { date: "2026-11-08", dateKind: "on" }, id: "attendance:a1", name: "大学同学聚会", type: "attendance" }], more: false, type: "attendance" },
  ],
  query: "",
};

const t = (copy: { zh: string }) => copy.zh;

function mount() {
  const requests: string[] = [];
  const request = (async (url: string) => {
    requests.push(String(url));
    return Response.json({ data: RESULT, success: true });
  }) as unknown as typeof fetch;
  const handle: { composer?: ReferenceComposer; text: string; keys: { current: PickerKeys | null } } = { keys: { current: null }, text: "" };
  function Harness() {
    const [text, setText] = useState("");
    const composer = useReferenceComposer(text, setText, "zh");
    handle.composer = composer;
    handle.text = text;
    return <form data-orbit-agent-chat-composer>
      {composer.picker ? <ReferencePicker composer={composer} language="zh" t={t} request={request} keysRef={handle.keys} onPicked={() => undefined} /> : null}
      {composer.bindings.length ? <ReferenceChips composer={composer} language="zh" t={t} onRemoved={() => undefined} /> : null}
      <textarea value={text} onChange={() => undefined} />
    </form>;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<Harness />); });
  const type = async (next: string) => act(async () => { handle.composer!.onTextChange(next, next.length); });
  const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });
  const texts = (node: ReactTestInstance) => node.findAll((item) => typeof item.type === "string").flatMap((item) => item.children.filter((child): child is string => typeof child === "string"));
  return { handle, renderer, requests, settle, texts, type };
}

test("typing @ opens the picker with the words after it; six kinds grouped, each with its badge and the line that tells same names apart", async () => {
  const view = mount();
  await view.type("根据 @");
  assert.equal(view.handle.composer!.picker?.mode, "at");
  await view.type("根据 @客户");
  await view.settle();
  assert.match(view.requests.at(-1)!, /\/api\/agent\/references\/search\?q=%E5%AE%A2%E6%88%B7/u);
  const picker = view.renderer.root.find((node) => node.props["data-orbit-reference-picker"] === "at");
  const groups = picker.findAll((node) => node.props.role === "group").map((node) => node.props["aria-label"]);
  assert.deepEqual(groups, ["联系人", "笔记", "待办", "日程", "活动", "我去过"]);
  const all = view.texts(picker);
  for (const words of ["田中浩 · 11月10日（周二）", "王强 · 11月13日（周五）", "东和商事 · 采购主管", "截止 11月17日（周二）", "11月19日（周四）19:00 · 丸之内", "11月8日"]) assert.ok(all.includes(words), words);
  // The filter buttons (D3): all and the six kinds.
  assert.deepEqual(picker.findAll((node) => node.props["aria-pressed"] !== undefined && node.type === "button").map((node) => view.texts(node).join("")), ["全部", "联系人", "笔记", "待办", "日程", "活动", "我去过"]);
});

test("picking one closes the @ picker, puts 「@名字 」 in the sentence and a chip; × keeps the words without the @ (D2)", async () => {
  const view = mount();
  await view.type("根据 @");
  await view.type("根据 @客户");
  await view.settle();
  const option = view.renderer.root.find((node) => node.props["data-orbit-reference-option"] === "memo:note:m37");
  await act(async () => { option.props.onClick(); });
  assert.equal(view.handle.text, "根据 @客户访谈 ");
  assert.equal(view.handle.composer!.picker, null);
  const chip = view.renderer.root.find((node) => node.props["data-orbit-reference-chip"] === "memo:note:m37");
  assert.deepEqual(view.texts(chip).slice(0, 2), ["笔记", "客户访谈"]);
  await view.type("根据 @客户访谈 看看来不来得及");
  const sent = view.handle.composer!.forSend(view.handle.text);
  assert.deepEqual(sent.references, [{ end: 8, id: "note:m37", start: 3, type: "memo" }]);
  const remove = chip.find((node) => node.type === "button");
  await act(async () => { remove.props.onClick(); });
  assert.equal(view.handle.text, "根据 客户访谈 看看来不来得及");
  assert.deepEqual(view.handle.composer!.forSend(view.handle.text).references, [], "the removed mark is not sent");
});

test("「＋」 picks several, inserted in order at the caret; the same-named chips carry what tells them apart (D1, D6)", async () => {
  const view = mount();
  await view.type("看看 ");
  await act(async () => { view.handle.composer!.openPlus(3); });
  await view.settle();
  for (const key of ["memo:note:m37", "memo:note:m61"]) {
    const option = view.renderer.root.find((node) => node.props["data-orbit-reference-option"] === key);
    await act(async () => { option.props.onClick(); });
  }
  const done = view.renderer.root.findAll((node) => node.type === "button").find((node) => view.texts(node).join("") === "完成（2）")!;
  await act(async () => { done.props.onClick(); });
  assert.equal(view.handle.text, "看看 @客户访谈 @客户访谈 ");
  const sent = view.handle.composer!.forSend(view.handle.text);
  assert.deepEqual(sent.references.map((item) => [item.id, sent.message.slice(item.start, item.end)]), [["note:m37", "@客户访谈"], ["note:m61", "@客户访谈"]]);
  const hints = view.renderer.root.findAll((node) => node.props["data-orbit-reference-chip"] !== undefined).map((node) => view.texts(node).join("|"));
  assert.deepEqual(hints, ["笔记|客户访谈|田中浩|×", "笔记|客户访谈|王强|×"]);
});

test("editing the words of a mark drops it; keys move and pick; Esc closes", async () => {
  const view = mount();
  await view.type("@");
  await view.type("@回复");
  await view.settle();
  const press = async (key: string) => act(async () => { view.handle.keys.current!.onKeyDown({ key, nativeEvent: { isComposing: false }, preventDefault() {} } as never); });
  await press("ArrowDown");
  await press("ArrowDown");
  await press("Enter");
  assert.equal(view.handle.text, "@客户访谈 ", "the third row (the second memo) was picked");
  assert.equal(view.handle.composer!.bindings[0].id, "note:m61");
  await view.type("@客户访 ");
  assert.deepEqual(view.handle.composer!.bindings, []);
  await view.type("@客户访 @");
  assert.equal(view.handle.composer!.picker?.mode, "at");
  await press("Escape");
  assert.equal(view.handle.composer!.picker, null);
});
