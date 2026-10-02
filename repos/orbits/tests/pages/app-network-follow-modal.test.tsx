/**
 * W0046 SC-W0046-03：「写 memo」弹窗与「最近互动」时间线（组件测试）。
 *
 * 弹窗：文字必填、日期默认东京今天、可选关联活动（当天已报名活动推荐，没有数据只隐藏）、提示行；
 * 删去「同步到 AI 分析」、需求／提供／下一步、阶段箭头、标签区；保存请求体只有 memo note。
 * 时间线：day 精度不显示时分；unavailableSources 非空一行说明；空时「还没有互动记录」；中英双语；
 * 示例模式：示例时间线是前端静态数据，点「写 memo」0 请求（拦截见 app-network-demo-mode.test.tsx）。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactElement } from "react";

import { buildDemoNetworkDetail } from "../../app/(app)/app/_demo/demo-network";
import { NetworkDetailModal, formatTimelineTime } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";
import { NetworkFollowModal, buildMemoPatch, memoEventSuggestions, tokyoDayWindow, tokyoToday } from "../../app/(app)/app/contacts/network-0918/network-follow-modal";
import type { OrbitContactView } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { RelationshipTimelineItem } from "../../shared/contract/relationship-timeline";

const contact = {
  id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa", title: "PM", valueTags: [], editableTags: [{ value: "ai", label: "AI" }],
  stage: "Active", relationshipStatus: "active", pipelineStatus: "in_progress", notes: [], encounters: [], lastInteraction: "", nextAction: null,
  source: "event", met: "", email: "", phone: "", wechat: "", lineId: "", location: "",
} as unknown as OrbitContactView;

test("tokyoToday／tokyoDayWindow 按东京日期，不依赖进程时区", () => {
  assert.equal(tokyoToday(new Date("2026-10-01T15:30:00.000Z")), "2026-10-02");
  assert.equal(tokyoToday(new Date("2026-10-01T14:59:00.000Z")), "2026-10-01");
  assert.deepEqual(tokyoDayWindow("2026-10-02"), { from: "2026-10-01T15:00:00.000Z", to: "2026-10-02T15:00:00.000Z" });
  assert.equal(tokyoDayWindow("2026-02-30"), null);
  assert.equal(tokyoDayWindow(""), null);
});

test("buildMemoPatch 只发 memo note：正文、日期、可选活动、kind，不带 status／标签／lastInteraction", () => {
  assert.deepEqual(buildMemoPatch({ body: "  聊了融资 ", date: "2026-10-02", eventId: "event:e1" }), {
    note: { body: "聊了融资", authorLabel: "我", occurredAt: "2026-10-02", eventId: "event:e1", kind: "memo" },
  });
  const plain = buildMemoPatch({ body: "x", date: "2026-10-01", eventId: null });
  assert.equal("eventId" in plain.note, false);
  assert.deepEqual(Object.keys(plain), ["note"]);
});

test("memoEventSuggestions 只取所选东京日期的已报名活动，去重，最多 6 个", () => {
  const options = [
    { eventId: "e1", title: "SaaS Night", startsAt: "2026-10-02T09:00:00.000Z" },
    { eventId: "e1", title: "SaaS Night", startsAt: "2026-10-02T10:00:00.000Z" },
    { eventId: "e2", title: "前一天", startsAt: "2026-10-01T14:00:00.000Z" },
    { eventId: "e3", title: "东京当天清晨", startsAt: "2026-10-01T15:30:00.000Z" },
  ];
  assert.deepEqual(memoEventSuggestions(options, "2026-10-02"), [{ eventId: "e1", title: "SaaS Night" }, { eventId: "e3", title: "东京当天清晨" }]);
  assert.deepEqual(memoEventSuggestions(undefined, "2026-10-02"), []);
  assert.deepEqual(memoEventSuggestions(options, "bad"), []);
});

test("「写 memo」弹窗：文字必填、日期、提示行；删去旧的需求／提供／下一步、阶段箭头、标签区与同步摆设", () => {
  const html = renderToStaticMarkup(<NetworkFollowModal contact={contact} onClose={() => {}} onSaved={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="写 memo"/);
  assert.match(html, /<strong class="nw-fu-title">写 memo<\/strong>/);
  assert.match(html, /Nexa · PM/);
  assert.equal((html.match(/<textarea/g) ?? []).length, 1);
  assert.match(html, /<textarea id="nw-fu-memo"[^>]*autofocus/);
  assert.equal((html.match(/type="date"/g) ?? []).length, 1);
  assert.match(html, new RegExp(`type="date"[^>]*value="${tokyoToday()}"`));
  assert.match(html, /memo 会用于为你生成人脉分析，仅你可见/);
  assert.match(html, /nw-fu-save"[^>]*disabled/);
  assert.match(html, /保存 memo/);
  for (const gone of [/对方当前需求/, /我可提供的帮助/, /下一步动作/, /nw-fu-stage/, /nw-fu-tagbox/, /同步到 AI 分析/, /记录跟进/]) assert.doesNotMatch(html, gone);
  // 没有推荐数据时不渲染关联活动区。
  assert.doesNotMatch(html, /data-memo-event-suggestions/);
  const withEvents = renderToStaticMarkup(<NetworkFollowModal contact={{ ...contact, memoEventOptions: [{ eventId: "e1", title: "SaaS Night", startsAt: new Date().toISOString() }] }} onClose={() => {}} onSaved={() => {}} />);
  assert.match(withEvents, /data-memo-event-suggestions/);
  assert.match(withEvents, /关联活动（可选）/);
  assert.match(withEvents, /aria-pressed="false"[^>]*>SaaS Night/);
  const en = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkFollowModal contact={contact} onClose={() => {}} onSaved={() => {}} /></OrbitLanguageProvider>);
  assert.match(en, /Write a memo/);
  assert.match(en, /Only you can see them/);
});

async function mountModal(t: TestContext, element: ReactElement) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return Response.json({ success: true });
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let root: ReactTestRenderer | null = null;
  t.after(() => {
    act(() => root?.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  });
  await act(async () => { root = create(element); });
  return { requests, root: root as unknown as ReactTestRenderer };
}

test("填文字、改日期、选当天活动后保存：只发一个 PATCH，请求体是 memo note；保存后回调刷新", async (t) => {
  let saved = 0;
  const today = tokyoToday();
  const options = [{ eventId: "event:e9", title: "Founders Meetup", startsAt: `${today}T03:00:00.000Z` }];
  const { requests, root } = await mountModal(t, <NetworkFollowModal contact={{ ...contact, memoEventOptions: options }} onClose={() => {}} onSaved={() => { saved += 1; }} />);
  // 打开弹窗不发请求（推荐数据随详情下发）。
  assert.equal(requests.length, 0);
  const textarea = root.root.findByProps({ id: "nw-fu-memo" });
  await act(async () => { textarea.props.onChange({ target: { value: "她在找 B 轮投资人" } }); });
  const eventButton = root.root.findAll((node) => node.type === "button" && node.props.className?.startsWith("btn nw-fu-event"))[0]!;
  await act(async () => { eventButton.props.onClick(); });
  await act(async () => { await root.root.findByProps({ className: "btn nw-fu-save" }).props.onClick(); });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/contacts/c1");
  assert.equal(requests[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    note: { body: "她在找 B 轮投资人", authorLabel: "我", occurredAt: today, eventId: "event:e9", kind: "memo" },
  });
  t.mock.timers.tick(1200);
  assert.equal(saved, 1);
});

function item(partial: Partial<RelationshipTimelineItem> & Pick<RelationshipTimelineItem, "id" | "source" | "occurredAt">): RelationshipTimelineItem {
  return { contactId: "c1", occurredAtPrecision: "instant", title: { zh: "标题", en: "Title" }, ref: { store: "contacts", recordId: "c1" }, ...partial };
}

test("formatTimelineTime：东京时间；day 精度只显示日期", () => {
  assert.equal(formatTimelineTime({ occurredAt: "2026-09-19T15:00:00.000Z", occurredAtPrecision: "day" }), "9月20日");
  assert.equal(formatTimelineTime({ occurredAt: "2026-09-19T15:00:00.000Z", occurredAtPrecision: "instant" }), "9月20日 00:00");
  assert.equal(formatTimelineTime({ occurredAt: "2026-09-19T15:00:00.000Z", occurredAtPrecision: "day" }, (copy) => copy.en), "Sep 20");
});

test("「最近互动」渲染聚合时间线：来源标签、日期、节选；共 N 条；部分来源读不到时一行说明；空时说明；按钮改名「写 memo」", () => {
  const timeline = {
    items: [
      item({ id: "memo:m1", source: "memo", occurredAt: "2026-09-19T15:00:00.000Z", occurredAtPrecision: "day", title: { zh: "写了 memo", en: "Wrote a memo" }, excerpt: "聊了 B 轮融资" }),
      item({ id: "capture:c1", source: "capture", occurredAt: "2026-09-01T01:00:00.000Z", title: { zh: "在活动中交换名片", en: "Exchanged cards at an event" } }),
    ],
    unavailableSources: [],
    total: 25,
  };
  const html = renderToStaticMarkup(<NetworkDetailModal contact={{ ...contact, timeline }} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.equal((html.match(/class="nw-tl-row"/g) ?? []).length, 2);
  assert.match(html, /data-timeline-source="memo"/);
  assert.match(html, /<span class="nw-tl-time">9月20日<\/span><strong class="nw-tl-kind">memo<\/strong>/);
  assert.match(html, /写了 memo/);
  assert.match(html, /聊了 B 轮融资/);
  assert.match(html, /<span class="nw-tl-time">9月1日 10:00<\/span><strong class="nw-tl-kind">建立联系<\/strong>/);
  assert.match(html, /共 25 条 · 显示最近 2 条/);
  assert.doesNotMatch(html, /部分记录暂时读不到|nw-tl-empty/);
  assert.match(html, /class="btn nw-detail-follow"[^>]*>▤ 写 memo/);
  assert.doesNotMatch(html, /记录互动/);

  const partial = renderToStaticMarkup(<NetworkDetailModal contact={{ ...contact, timeline: { items: [], unavailableSources: ["plan"] } }} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(partial, /部分记录暂时读不到/);
  const empty = renderToStaticMarkup(<NetworkDetailModal contact={{ ...contact, timeline: { items: [], unavailableSources: [] } }} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(empty, /还没有互动记录/);
  assert.doesNotMatch(empty, /共 \d+ 条/);

  const en = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="en"><NetworkDetailModal contact={{ ...contact, timeline }} closeHref="/app/contacts" onFollow={() => {}} /></OrbitLanguageProvider>);
  assert.match(en, /<span class="nw-tl-time">Sep 20<\/span><strong class="nw-tl-kind">Memo<\/strong>/);
  assert.match(en, /Wrote a memo/);
  assert.match(en, /25 records in total/);
  assert.match(en, /▤ Write memo/);
});

test("示例详情的时间线是前端静态数据（memo + 建立联系），不含读失败说明", () => {
  const demo = buildDemoNetworkDetail("demo:wang-yan", new Date("2026-09-28T03:00:00.000Z"), "zh")!;
  assert.ok(demo.timeline);
  assert.ok(demo.timeline.items.some((entry) => entry.source === "memo"));
  assert.equal(demo.timeline.items.filter((entry) => entry.source === "capture").length, 1);
  assert.deepEqual(demo.timeline.unavailableSources, []);
  const times = demo.timeline.items.map((entry) => entry.occurredAt);
  assert.deepEqual(times, [...times].sort().reverse());
});
