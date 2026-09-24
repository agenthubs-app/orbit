import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventNoteModal } from "../../app/(app)/app/events/events-0918/event-note-modal";
import { composeNoteText } from "../../app/(app)/app/events/events-0918/events-model";
import { DESIGN_MODAL_MOCKS, MODAL_EVENT_ID, jsonHeaders, modalPerson, stripStyles, t } from "./event-modal-fixtures";
import { resetContactRequestStateCache } from "../../app/(app)/app/events/events-0918/live-controls";

// 交换状态缓存按 <eventId participantId> 键跨挂载共享（终审 M1）；每条用例从空缓存开始。
test.beforeEach(() => resetContactRequestStateCache());

/**
 * 记录交流弹窗（Orbit_0918 Events 设计 763–780）：POST /api/encounters 请求体与 orbit-encounter-capture.tsx:33 一致；
 * 无 contactId → 「先交换名片」禁用；语音备忘 / 后续提醒省略。
 */
const noop = () => undefined;
const WITH_CONTACT = { contactId: "contact:aiko", contactRequestDirection: "outgoing" as const, contactRequestId: "req:3", contactRequestRevision: 2, contactRequestStatus: "accepted" as const };

function element(overrides: Parameters<typeof modalPerson>[0] = {}, extra: Partial<Parameters<typeof EventNoteModal>[0]> = {}) {
  return <EventNoteModal eventId={MODAL_EVENT_ID} onClose={noop} onOpenProfile={noop} onSaved={noop} person={modalPerson(overrides)} t={t} {...extra} />;
}

test("note modal SSR: shell, person card with 查看资料, four fields with counters, topic tags + custom input, footer; voice memo / reminder omitted", () => {
  const html = stripStyles(renderToStaticMarkup(element(WITH_CONTACT)));
  assert.match(html, /<div class="ev-mo-overlay ev-mo-z120" data-events-modal="note">/);
  assert.match(html, /class="ev-mo-panel ev-mo-panel-700 ev-mo-panel-gap-20"/);
  assert.match(html, /<strong class="ev-mo-title ev-mo-title-26" id="ev-mo-note-title">记录交流<\/strong><span class="ev-mo-sub">记录你与参会者的交流内容，方便后续跟进。只有你主动保存的内容才会被记录。<\/span>/);
  assert.match(html, /<span aria-hidden="true" class="ev-mo-note-avatar">A<\/span><span class="ev-mo-note-person-copy"><strong class="ev-mo-note-name">Aiko Mori<\/strong><span class="ev-mo-note-role">Founder · LoopMatter<\/span>/);
  assert.match(html, /<button class="btn ev-mo-note-open" data-events-modal-action="open-profile" type="button">查看资料 →<\/button>/);
  assert.match(html, /<label class="ev-mo-note-label" for="ev-mo-note-what">▤ 聊了什么 <span class="ev-mo-required">\*<\/span><\/label>/);
  for (const id of ["ev-mo-note-what", "ev-mo-note-need", "ev-mo-note-offer", "ev-mo-note-next"]) {
    assert.match(html, new RegExp(`<textarea class="ev-mo-textarea" id="${id}" maxLength="500"`));
  }
  assert.equal((html.match(/<span class="ev-mo-counter">0\/500<\/span>/g) ?? []).length, 4);
  assert.match(html, /<button aria-pressed="false" class="btn ev-mo-note-tag" data-events-note-tag="Reuse systems" type="button">Reuse systems<\/button>/);
  assert.match(html, /<input aria-label="自定义标签" class="ev-mo-note-custom" placeholder="＋ 自定义" value=""\/>/);
  assert.match(html, /<span class="ev-mo-foot-note">只有你主动保存的内容才会被记录，会议组织方和其他参会者不可见。<\/span>/);
  assert.match(html, /<button class="btn ev-mo-btn-cancel ev-mo-btn-sm" type="button">取消<\/button><button class="btn ev-mo-btn-primary ev-mo-btn-sm" data-events-modal-action="save-note" disabled="" type="button">保存记录<\/button>/);
  assert.doesNotMatch(html, /语音备忘|录音|type="date"|data-events-note-gate/);
  assert.doesNotMatch(html, DESIGN_MODAL_MOCKS);
  assert.doesNotMatch(html, /font-size:|font-weight:/u);
});

test("note modal: without a contact id the save button stays disabled and the 「先交换名片」 gate shows", () => {
  const html = stripStyles(renderToStaticMarkup(element()));
  assert.match(html, /<span class="ev-mo-hint ev-mo-hint-warn" data-events-note-gate="no-contact" role="status">先交换名片：交流记录挂在联系人名片上。<\/span>/);
  assert.match(html, /data-events-modal-action="save-note" disabled=""/);
});

test("composeNoteText folds need / offer into noteText with translated prefixes", () => {
  assert.equal(composeNoteText({ what: "聊了产品", need: "找合作", offer: "介绍团队" }, { need: "对方需求", offer: "我能提供" }), "聊了产品\n对方需求：找合作\n我能提供：介绍团队");
  assert.equal(composeNoteText({ what: "聊了产品", need: "  ", offer: "" }, { need: "对方需求", offer: "我能提供" }), "聊了产品");
});

test("note modal: save posts the exact encounter body (talked yes / privacy private / observedAt ISO) with an encounter idempotency key", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ data: { encounterId: "encounter:1" }, success: true }, { status: 201 });
  }) as typeof fetch;
  const saved: string[] = [];
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(element(WITH_CONTACT, { onSaved: (person) => saved.push(person.id) })); });
    const field = (id: string) => renderer.root.find((node) => node.type === "textarea" && node.props.id === id);
    const save = () => renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "save-note");
    assert.equal(save().props.disabled, true, "empty 聊了什么 keeps save disabled");
    await act(async () => { field("ev-mo-note-what").props.onChange({ target: { value: "聊了 Orbit 的产品" } }); });
    assert.equal(save().props.disabled, false);
    await act(async () => { field("ev-mo-note-need").props.onChange({ target: { value: "寻找日本市场的合作伙伴" } }); });
    await act(async () => { field("ev-mo-note-offer").props.onChange({ target: { value: "介绍技术团队" } }); });
    await act(async () => { field("ev-mo-note-next").props.onChange({ target: { value: "下周发送资料" } }); });
    const tag = renderer.root.find((node) => node.type === "button" && node.props["data-events-note-tag"] === "Reuse systems");
    await act(async () => { tag.props.onClick(); });
    const custom = renderer.root.find((node) => node.type === "input" && node.props["aria-label"] === "自定义标签");
    await act(async () => { custom.props.onChange({ target: { value: "日本市场" } }); });
    await act(async () => { custom.props.onKeyDown({ key: "Enter", preventDefault: noop }); });
    assert.match(JSON.stringify(renderer.toJSON()), /"data-events-note-tag":"日本市场"/);
    const before = Date.now();
    await act(async () => { await (save().props.onClick() as Promise<void>); });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/encounters");
    assert.equal(calls[0].init?.method, "POST");
    const headers = jsonHeaders(calls[0].init);
    assert.equal(headers["content-type"], "application/json");
    assert.match(headers["idempotency-key"], /^encounter:[0-9a-f-]{36}$/);
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body), ["commitments", "contactId", "eventId", "nextStep", "noteText", "observedAt", "privacy", "talked", "tags"], "same key order as orbit-encounter-capture.tsx:33");
    assert.deepEqual(body.commitments, []);
    assert.equal(body.contactId, "contact:aiko");
    assert.equal(body.eventId, MODAL_EVENT_ID);
    assert.equal(body.nextStep, "下周发送资料");
    assert.equal(body.noteText, "聊了 Orbit 的产品\n对方需求：寻找日本市场的合作伙伴\n我能提供：介绍技术团队");
    assert.equal(body.privacy, "private");
    assert.equal(body.talked, "yes");
    assert.deepEqual(body.tags, ["Reuse systems", "日本市场"]);
    const observedAt = Date.parse(String(body.observedAt));
    assert.ok(Number.isFinite(observedAt) && observedAt >= before && String(body.observedAt).endsWith("Z"));
    assert.deepEqual(saved, ["participant:aiko"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});

test("note modal: a failed save shows the API message inline and does not call onSaved", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: { code: "VALIDATION_ERROR", message: "talked, privacy, contactId, and observedAt are required." }, success: false }, { status: 400 })) as typeof fetch;
  const saved: string[] = [];
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(element(WITH_CONTACT, { onSaved: (person) => saved.push(person.id) })); });
    const what = renderer.root.find((node) => node.type === "textarea" && node.props.id === "ev-mo-note-what");
    await act(async () => { what.props.onChange({ target: { value: "x" } }); });
    const save = renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "save-note");
    await act(async () => { await (save.props.onClick() as Promise<void>); });
    assert.match(JSON.stringify(renderer.toJSON()), /talked, privacy, contactId, and observedAt are required\./);
    assert.deepEqual(saved, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});
