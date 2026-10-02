import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NetworkDetailModal, formatNoteTime } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";

const contact = {
  id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa AI", title: "合作伙伴负责人", industry: "科技与互联网", source: "event", stage: "Active", pipelineStatus: "in_progress", relationshipStatus: "active", location: "日本 东京", met: "东京 AI 峰会",
  lastInteraction: "昨天聊了知识库方案", editableInteraction: { channel: "manual_note", occurredAt: "2026-09-19T01:00:00Z", summary: "昨天聊了知识库方案" }, nextAction: { text: "下周约产品演示", reason: "对方对知识库方案有兴趣" }, valueTags: ["AI"], editableTags: [{ value: "ai", label: "AI" }],
  notes: [
    { id: "n0", body: "较早的备注", createdAt: "2026-09-10T02:00:00Z" },
    { id: "n1", body: "讨论合作模式", createdAt: "2026-09-18T07:30:00Z" },
  ],
  encounters: [{ id: "e", eventId: "", createdAt: "", context: { metAt: "", reason: "", score: 0, tableNo: 1, publicProfile: { bio: "", intro: "", industry: "", topics: ["生成式 AI"], offering: ["企业级 AI 知识库"], seeking: ["日本市场 AI 方案"], conversationPrompts: [] } } }],
} as never;

test("detail modal renders overview rows, timeline from notes, and next steps", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /联系人详情/);
  assert.match(html, /Nexa AI · 合作伙伴负责人/);
  assert.match(html, /◎ 日本 东京/);
  assert.match(html, /⇢ 来自 活动认识/);
  for (const s of ["关系档位", "上次互动", "下次计划", "来源", "生成式 AI", "企业级 AI 知识库", "日本市场 AI 方案", "讨论合作模式", "下周约产品演示", "对方对知识库方案有兴趣"]) assert.match(html, new RegExp(s));
  // 联系频率无数据源 → 不渲染；四条概览
  assert.doesNotMatch(html, /联系频率/);
  assert.equal((html.match(/class="nw-ov"/g) ?? []).length, 4);
  // 时间线倒序：最新备注在前，首点 #4B4FC7
  assert.ok(html.indexOf("讨论合作模式") < html.indexOf("较早的备注"));
  assert.match(html, /background:#4B4FC7[^>]*><\/span>[\s\S]*?9月18日 07:30/);
  assert.match(html, /备注/);
  // 按钮：关闭（链接）、写 memo（W0046 改名）；W0047 下线「更新状态」
  assert.match(html, /class="btn nw-detail-close" href="\/app\/contacts"/);
  assert.match(html, /class="btn nw-modal-close" href="\/app\/contacts"/);
  assert.match(html, /class="btn nw-detail-follow"[^>]*>▤ 写 memo/);
  assert.doesNotMatch(html, /nw-detail-status|更新状态/);
  // 没有强度缓存：档位显示「暂未评估」，不显示依据按钮。
  assert.match(html, /关系档位<\/span><strong class="nw-ov-v">暂未评估</);
  assert.doesNotMatch(html, /nw-basis-toggle|关系阶段/);
  assert.doesNotMatch(html, /平均 2–3 周一次|1 周后（9月25日）|编辑资料|约时间|查看全部/);
});

test("detail modal shows interaction time as 上次互动 and never repeats the summary outside the timeline", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  // 上次互动值 = editableInteraction.occurredAt 的 M月D日 HH:mm，说明 = 互动摘要
  // 时间只用 UTC 分量（服务端 / 客户端一致）：2026-09-19T01:00:00Z → 9月19日 01:00
  assert.match(html, /上次互动<\/span><strong class="nw-ov-v">9月19日 01:00<\/strong><span class="nw-ov-d">昨天聊了知识库方案/);
  const outsideTimeline = html.replace(/<div class="nw-tl">[\s\S]*?<\/div>\s*<\/div>/, "");
  assert.ok((outsideTimeline.match(/昨天聊了知识库方案/g) ?? []).length <= 1);
  // reason 与互动摘要相同时不再重复
  const same = { ...(contact as object), nextAction: { text: "下周约产品演示", reason: "昨天聊了知识库方案" } } as never;
  const html2 = renderToStaticMarkup(<NetworkDetailModal contact={same} closeHref="/app/contacts" onFollow={() => {}} />);
  const outside2 = html2.replace(/<div class="nw-tl">[\s\S]*?<\/div>\s*<\/div>/, "");
  assert.equal((outside2.match(/昨天聊了知识库方案/g) ?? []).length, 1);
  assert.doesNotMatch(html2, /nw-step-reason/);
});

test("detail modal falls back to dashes and renders extra above the timeline", () => {
  const bare = { ...(contact as object), location: "", nextAction: null, lastInteraction: "", editableInteraction: undefined, notes: [], encounters: [] } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={bare} closeHref="/app/contacts" onFollow={() => {}} extra={<p data-extra>memo</p>} />);
  assert.doesNotMatch(html, /◎ /);
  assert.match(html, /nw-ov-v">—</);
  assert.ok(html.indexOf("data-extra") < html.indexOf("最近互动"));
  assert.match(html, /nw-tl-empty/);
});

test("formatNoteTime renders UTC M月D日 HH:mm (en: Mon D HH:mm) and dashes on garbage", () => {
  assert.equal(formatNoteTime("2026-09-18T07:30:00Z"), "9月18日 07:30");
  assert.equal(formatNoteTime("2026-09-21T08:00:00Z", (c) => c.en), "Sep 21 08:00");
  assert.equal(formatNoteTime("2026-12-31T23:59:00Z"), "12月31日 23:59");
  assert.equal(formatNoteTime("nope"), "—");
});

test("detail modal renders a 联系方式 block only for the non-empty channels, omitted when all four are empty", () => {
  const withChannels = { ...(contact as object), email: "keiko@nexa.example", phone: "+81 90 0000 0000", wechat: "", lineId: "" } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withChannels} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /data-network-detail-contacts/);
  assert.match(html, /联系方式/);
  assert.match(html, /nw-ov-icon">✉<\/span><span class="nw-ov-copy"><span class="nw-ov-l">邮箱<\/span><strong class="nw-ov-v">keiko@nexa.example</);
  assert.match(html, /nw-ov-icon">☎<\/span><span class="nw-ov-copy"><span class="nw-ov-l">电话<\/span><strong class="nw-ov-v">\+81 90 0000 0000</);
  assert.doesNotMatch(html, /微信|LINE/);
  // 关系概览四行 + 联系方式两行
  assert.equal((html.match(/class="nw-ov"/g) ?? []).length, 6);
  // 联系方式在关系概览之后、最近互动之前
  assert.ok(html.indexOf("关系概览") < html.indexOf("联系方式") && html.indexOf("联系方式") < html.indexOf("最近互动"));
  const empty = { ...(contact as object), email: "", phone: " ", wechat: "", lineId: "" } as never;
  const html2 = renderToStaticMarkup(<NetworkDetailModal contact={empty} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.doesNotMatch(html2, /data-network-detail-contacts|联系方式/);
  assert.equal((html2.match(/class="nw-ov"/g) ?? []).length, 4);
});

test("W0047: the detail modal no longer mounts the manual 待设置关系 panel (API and data stay)", () => {
  const pending = { ...(contact as object), pipelineStatus: "pending_initialization", stage: "待设置关系", nextAction: null } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={pending} closeHref="/app/contacts" onFollow={() => {}} extra={<p data-extra>memo</p>} />);
  assert.doesNotMatch(html, /我的关系设置|data-initialization-refresh|待设置关系|更新状态/);
  assert.ok(html.indexOf("data-extra") < html.indexOf("最近互动"));
});

const strengthContact = {
  ...(contact as object),
  timeline: {
    items: [
      { id: "schedule:s1", source: "schedule", contactId: "c1", occurredAt: "2026-09-25T01:00:00.000Z", occurredAtPrecision: "instant", title: { zh: "会面：产品演示", en: "Meeting: product demo" }, ref: { store: "personal_schedule_items", recordId: "s1" } },
      { id: "memo:m1", source: "memo", contactId: "c1", occurredAt: "2026-09-19T15:00:00.000Z", occurredAtPrecision: "day", title: { zh: "写了 memo", en: "Wrote a memo" }, ref: { store: "contact_detail_states", recordId: "d", subId: "m1" } },
    ],
    unavailableSources: [],
  },
  relationshipStrength: {
    contactId: "c1", tier: "core", dormant: false, score: 83, peakScore: 83, lastSignalAt: "2026-09-25T01:00:00.000Z",
    signals: [
      { timelineItemId: "schedule:s1", source: "schedule", occurredAt: "2026-09-25T01:00:00.000Z", basePoints: 25, points: 24.4 },
      { timelineItemId: "memo:m1", source: "memo", occurredAt: "2026-09-19T15:00:00.000Z", basePoints: 15, points: 14.3 },
      // 不在最近 20 条时间线里的信号：标题退回来源名。
      { timelineItemId: "encounter:old", source: "encounter", occurredAt: "2026-06-01T03:00:00.000Z", basePoints: 20, points: 9.1 },
    ],
    computedAt: "2026-10-02T03:00:00.000Z", rulesVersion: "rs-2026-10-v1",
  },
} as never;

test("SC-W0047-04: detail shows the tier tag and the basis panel lists each signal's date, source and timeline title (no score)", async (t) => {
  const { act, create } = await import("react-test-renderer");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {}, location: { assign() {} } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {}, documentElement: { lang: "zh" } } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else delete (globalThis as { document?: unknown }).document;
  });
  const { OrbitLanguageProvider } = await import("../../app/(app)/app/orbit-language-context");
  const closed = renderToStaticMarkup(<NetworkDetailModal contact={strengthContact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(closed, /class="nw-detail-stage" data-network-tier="core"[^>]*>核心</);
  assert.match(closed, /关系档位<\/span><strong class="nw-ov-v">核心</);
  assert.match(closed, /class="btn nw-basis-toggle" aria-expanded="false"/);
  assert.doesNotMatch(closed, /data-network-basis/);

  for (const language of ["zh", "en"] as const) {
    let root: ReturnType<typeof create> | undefined;
    await act(async () => {
      root = create(<OrbitLanguageProvider initialLanguage={language}><NetworkDetailModal contact={strengthContact} closeHref="/app/contacts" onFollow={() => {}} /></OrbitLanguageProvider>);
    });
    const toggle = root!.root.find((node) => node.props?.className === "btn nw-basis-toggle");
    await act(async () => { toggle.props.onClick(); });
    const basis = root!.root.find((node) => node.props?.["data-network-basis"] !== undefined);
    const rows = basis.findAll((node) => node.props?.className === "nw-basis-row");
    const text = (node: { children: unknown[] }): string => node.children.map((child) => (typeof child === "string" ? child : text(child as { children: unknown[] }))).join("");
    const lines = rows.map((row) => text(row as never));
    if (language === "zh") {
      assert.deepEqual(lines, ["9月25日 10:00日程会面：产品演示", "9月20日memo写了 memo", "6月1日 12:00见面见面"]);
    } else {
      assert.deepEqual(lines, ["Sep 25 10:00ScheduleMeeting: product demo", "Sep 20MemoWrote a memo", "Jun 1 12:00MetMet"]);
    }
    // 不显示分数（W47-6）。
    assert.doesNotMatch(text(basis as never), /83|24\.4|14\.3|9\.1|分/);
    await act(async () => { root!.unmount(); });
  }
});

test("detail modal shows the business-card notes without the review page's photo headings, and omits the panel when empty", () => {
  const withNotes = { ...(contact as object), cardNotes: "正面 · IMG_1.png\n传真: 03-6800-3712\n微信(Wechat): yoshikuni26" } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={withNotes} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /data-network-detail-card-notes/);
  assert.match(html, /名片备注/);
  assert.match(html, /传真: 03-6800-3712\n微信\(Wechat\): yoshikuni26/);
  assert.doesNotMatch(html, /IMG_1\.png/);
  const without = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.doesNotMatch(without, /data-network-detail-card-notes/);
});

test("W0010: the detail modal offers 关联到计划人脉需求 without reading the plan until clicked", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /data-network-detail-plan-link/);
  assert.match(html, /data-plan-need-link="closed"/);
  assert.match(html, /data-plan-need-link-open[^>]*>关联到计划人脉需求</);
});
