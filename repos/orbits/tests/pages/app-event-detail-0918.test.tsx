import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { loadAppEventDetailRoute } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { eventDetailRouteToOrbitLandingEventView } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { OrbitEventMatchmaking } from "../../app/(app)/app/events/[id]/orbit-event-matchmaking";
import { EventDetail, personViewFromDirectory, personViewFromRecap, recapPeople, recapStats } from "../../app/(app)/app/events/events-0918/event-detail";
import { formatEventDateRange } from "../../app/(app)/app/events/events-0918/events-model";
import type { OrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const DESIGN_MOCKS = /Tokyo AI Community|Tokyo Innovation Hub|山本健|Robert Chen|Sakana AI|BUILD\nTOGETHER|开放交流|思维碰撞|合作机会|回看完整视频|下载全部资料|活动回放视频/u;

async function baseEvent(): Promise<OrbitLandingEventView> {
  const routeModel = await loadAppEventDetailRoute({ eventId: "demo-event-1", mode: "mock" });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") throw new Error("fixture");
  return eventDetailRouteToOrbitLandingEventView(routeModel);
}

function hiddenState(html: string, panel: string): boolean {
  const match = html.match(new RegExp(`<div class="ev-panel" data-events-panel="${panel}"( hidden="")?>`, "u"));
  assert.ok(match, `panel ${panel} must render`);
  return Boolean(match[1]);
}

test("detail hero renders real event fields per design 141–163 and no design mock strings", async () => {
  const base = await baseEvent();
  const event: OrbitLandingEventView = {
    ...base,
    cap: 40,
    participantCount: 12,
    stats: { ...base.stats, count: 12, youRsvped: false },
    status: "upcoming",
    tags: ["live", "AI"],
    youRsvped: false,
  };
  const html = renderToStaticMarkup(<EventDetail event={event} registrationAvailability="open" />);

  assert.match(html, /class="ev-main"[^>]*data-events-view="detail"/);
  assert.match(html, /class="btn ev-back"/);
  assert.match(html, /class="cover cover-grain ev-hero-cover"/);
  assert.match(html, /class="ev-chip ev-chip-cover" style="background:#FBF1DC;color:#8A6420">即将开始</);
  assert.match(html, new RegExp(`<h1 class="ev-hero-h1">${base.name}</h1>`, "u"));
  assert.match(html, /class="ev-hero-lede"/);
  assert.match(html, /<span class="ev-dtag">线下活动<\/span><span class="ev-dtag">AI<\/span><span class="ev-dtag">限 40 人<\/span>/);
  assert.match(html, new RegExp(`ev-info-icon">▦</span>${formatEventDateRange(event, "zh", true)}</span>`, "u"));
  assert.match(html, new RegExp(`ev-info-icon">◎</span>${base.venue}`, "u"));
  assert.match(html, new RegExp(`ev-info-icon">◫</span>${base.organizer}</span>`, "u"));
  assert.match(html, /ev-info-icon">◌<\/span>12 \/ 40 人已报名</);
  assert.match(html, /<a class="btn ev-cta-primary" data-events-cta="register" href="\/app\/events\/[^"]+\/register" style="background:#4B4FC7;color:#FFFFFF">立即报名<\/a>/);
  assert.doesNotMatch(html, /修改报名信息|主办方后台|⋮/);
  assert.doesNotMatch(html, DESIGN_MOCKS);
  // No inline numeric typography / gaps (pixel rule).
  assert.doesNotMatch(html, /style="[^"]*(font-size|font-weight|gap):\s*\d/);
});

test("registered live event: 「进入活动现场」 + 「修改报名信息」; organizer sees 「主办方后台 →」", async () => {
  const base = await baseEvent();
  const event: OrbitLandingEventView = { ...base, status: "active", stats: { ...base.stats, youRsvped: true }, youRsvped: true };
  const html = renderToStaticMarkup(<EventDetail canOpenOperations event={event} registrationAvailability="registration_closed" />);

  assert.match(html, /<a class="btn ev-cta-primary" data-events-cta="live" href="\/app\/events\/[^"]+\/live" style="background:#0E1225;color:#FFFFFF">进入活动现场 →<\/a>/);
  // Live event: the registration window is closed → the edit control is disabled, not a dead link.
  assert.match(html, /<button class="btn ev-cta-secondary ev-cta-disabled" data-events-cta="modify" disabled=""/);
  assert.match(html, /<a class="btn ev-host-btn" href="\/app\/events\/[^"]+\/operations">主办方后台 →<\/a>/);
  assert.match(html, /查看全部参会者 →/);

  const participant = renderToStaticMarkup(<EventDetail canOpenOperations={false} event={event} registrationAvailability="registration_closed" />);
  assert.doesNotMatch(participant, /主办方后台/);
});

test("detail tabs use the design's overlapping semantics (dIntro = intro||agenda, dPeople = people||intro, dHost = host)", async () => {
  const base = await baseEvent();
  const event: OrbitLandingEventView = { ...base, status: "upcoming", stats: { ...base.stats, youRsvped: false }, youRsvped: false };

  const ssr = renderToStaticMarkup(<EventDetail event={event} registrationAvailability="open" />);
  assert.equal(hiddenState(ssr, "intro"), false);
  assert.equal(hiddenState(ssr, "people"), false);
  assert.equal(hiddenState(ssr, "host"), true);
  assert.match(ssr, /class="btn ev-tab ev-tab-on" role="tab" type="button">介绍</);

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(EventDetail, { event, registrationAvailability: "open" }));
  });
  try {
    const panelHidden = (panel: string) => Boolean(renderer.root.find((node) => node.type === "div" && node.props["data-events-panel"] === panel).props.hidden);
    const clickTab = async (label: string) => {
      const tab = renderer.root.find((node) => node.type === "button" && node.props.role === "tab" && node.children.join("") === label);
      await act(async () => { tab.props.onClick(); });
    };
    await clickTab("议程");
    assert.deepEqual([panelHidden("intro"), panelHidden("people"), panelHidden("host")], [false, true, true]);
    await clickTab("参会者");
    assert.deepEqual([panelHidden("intro"), panelHidden("people"), panelHidden("host")], [true, false, true]);
    await clickTab("主办方");
    assert.deepEqual([panelHidden("intro"), panelHidden("people"), panelHidden("host")], [true, true, false]);
    await clickTab("介绍");
    assert.deepEqual([panelHidden("intro"), panelHidden("people"), panelHidden("host")], [false, false, true]);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("intro = real description + real agenda (highlights omitted); unregistered attendees see 「报名后可见」", async () => {
  const base = await baseEvent();
  const event: OrbitLandingEventView = { ...base, status: "upcoming", stats: { ...base.stats, youRsvped: false }, youRsvped: false };
  const html = renderToStaticMarkup(<EventDetail event={event} registrationAvailability="open" />);

  assert.match(html, /<h2 class="ev-h2">活动介绍<\/h2><p class="ev-p">/);
  assert.match(html, /<h2 class="ev-h2">活动议程<\/h2>/);
  for (const item of event.agenda) {
    assert.match(html, new RegExp(`<span class="ev-agenda-time">${item.time}</span><span class="ev-agenda-copy"><strong class="ev-agenda-title">${item.label}</strong>`, "u"));
  }
  assert.match(html, /class="ev-agenda-caret">⌄</);
  assert.doesNotMatch(html, /ev-highlight|开放交流|思维碰撞/);
  assert.match(html, /data-events-people="teaser"/);
  assert.match(html, /报名后可见/);
  assert.doesNotMatch(html, /data-event-participant-directory/);
  assert.match(html, /<span class="ev-host-logo">/);
  assert.match(html, new RegExp(`<strong class="ev-host-name">${base.organizer}</strong>`, "u"));
});

test("recap state renders for ?view=recap or an ended event: shared body, 「—」 stat cards, 保持联系 gated on contactId", async () => {
  const base = await baseEvent();
  const ended: OrbitLandingEventView = {
    ...base,
    stats: {
      ...base.stats,
      attendees: [
        { initial: "A", name: "Alice Attendee", role: "Founder" },
        { initial: "B", name: "Bob Attendee", role: "" },
      ],
      count: 2,
      youRsvped: true,
    },
    status: "ended",
    youRsvped: true,
  };
  const html = renderToStaticMarkup(<EventDetail event={ended} />);

  assert.match(html, /data-events-view="recap"/);
  assert.match(html, /class="ev-chip ev-chip-hero" style="background:#F0F1F8;color:#6B6F99">已结束</);
  assert.match(html, /class="ev-recap-h1"/);
  assert.match(html, /<span class="ev-initial">A<\/span><span class="ev-initial">B<\/span>/);
  assert.match(html, /class="ev-recap-n">2 人参加过</);
  for (const label of ["回顾", "参会者", "交流记录", "生成总结"]) assert.match(html, new RegExp(`role="tab" type="button">${label}<`, "u"));
  const stats = [...html.matchAll(/<strong class="ev-rstat-n">([^<]*)<\/strong><span class="ev-rstat-label">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(stats, [["2", "总参会人数"], ["—", "交流对话数"], ["—", "达成后续意向"], ["—", "参与企业 / 机构"]]);
  // Server roster has no contact ids → no 「保持联系」 anywhere.
  assert.match(html, /data-events-recap-person="attendee"/);
  assert.doesNotMatch(html, /class="btn ev-person-btn"|◎ 保持联系|\/app\/contacts\//);
  assert.match(html, /<a class="btn ev-banner-btn" href="\/app\/events">探索更多活动 →<\/a>/);
  assert.doesNotMatch(html, /回看活动现场|回看完整视频|会后资料|下载全部资料/);
  assert.doesNotMatch(html, DESIGN_MOCKS);

  // An active event addressed with ?view=recap also renders the recap state.
  const active = renderToStaticMarkup(<EventDetail event={{ ...base, status: "active" }} view="recap" />);
  assert.match(active, /data-events-view="recap"/);
  assert.match(active, /class="ev-chip ev-chip-hero" style="background:#E6F1EC;color:#2F6B4F">进行中</);
  // Unregistered viewers never see names.
  const anonymous = renderToStaticMarkup(<EventDetail event={{ ...ended, stats: { ...ended.stats, attendees: [], youRsvped: false }, youRsvped: false }} />);
  assert.match(anonymous, /仅向已确认参会者开放/);
  assert.doesNotMatch(anonymous, /Alice Attendee/);
});

test("recapPeople prefers the published directory and exposes contactId only for accepted exchanges", async () => {
  const base = await baseEvent();
  const event = { stats: { ...base.stats, attendees: [{ initial: "S", name: "Server Roster", role: "PM" }] } };
  const summary = {
    acceptedContacts: 1,
    people: [
      { company: "Acme", contactId: "contact:1", displayName: "Kept Contact", participantId: "p1", role: "CEO" },
      { company: null, contactId: null, displayName: "Just Attended", participantId: "p2", role: null },
    ],
    recommendationCount: 0,
    resultsState: "ready" as const,
    roundOneTable: null,
    roundTwoTable: null,
  };
  assert.deepEqual(recapPeople(event, summary, true).map((p) => [p.name, p.contactId]), [["Kept Contact", "contact:1"], ["Just Attended", null]]);
  assert.deepEqual(recapPeople(event, null, true).map((p) => [p.name, p.contactId]), [["Server Roster", null]]);
  assert.deepEqual(recapPeople(event, summary, false), []);
  assert.deepEqual(recapStats({ stats: { ...base.stats, count: null, attendees: [] } }, false).map((s) => s.n), ["—", "—", "—", "—"]);
  assert.deepEqual(recapStats({ stats: { ...base.stats, count: 7, attendees: [] } }, false).map((s) => s.n), ["7", "—", "—", "—"]);

  // Rendered: 「保持联系」 links only the person with a contactId.
  const html = renderToStaticMarkup(<EventDetail event={{ ...base, status: "ended", stats: { ...base.stats, youRsvped: true, attendees: [] }, youRsvped: true }} />);
  assert.doesNotMatch(html, /class="btn ev-person-btn"|◎ 保持联系/);
  const rendered = recapPeople(event, summary, true);
  assert.equal(rendered.filter((p) => p.contactId).length, 1);
});

test("recap 「生成总结」 tab is the explicit 「等 W4」 empty state; other tabs only switch the highlight", async () => {
  const base = await baseEvent();
  const event: OrbitLandingEventView = { ...base, status: "ended", stats: { ...base.stats, youRsvped: false }, youRsvped: false };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(EventDetail, { event }));
  });
  try {
    const body = () => JSON.stringify(renderer.toJSON()).replace(/ev-tab-(on|off)/g, "").replace(/"aria-selected":(true|false)/g, "");
    const clickTab = async (label: string) => {
      const tab = renderer.root.find((node) => node.type === "button" && node.props.role === "tab" && node.children.join("") === label);
      await act(async () => { tab.props.onClick(); });
    };
    const initial = body();
    assert.match(initial, /数据亮点/);
    await clickTab("参会者");
    assert.equal(body(), initial);
    await clickTab("交流记录");
    assert.equal(body(), initial);
    await clickTab("生成总结");
    assert.match(body(), /data-events-recap-empty":"summary"/);
    assert.match(body(), /等 W4/);
    assert.doesNotMatch(body(), /数据亮点/);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("page wiring: events-0918 wrapper, nav by auth, view=recap passthrough, loaders untouched", () => {
  const page = readFileSync(join(projectRoot, "app/(app)/app/events/[id]/page.tsx"), "utf8");
  assert.match(page, /data-orbit-real-page="events-0918"/);
  assert.match(page, /authenticated \? <AccountTopNav active="events" \/> : <PublicTopNav active="events" \/>/);
  assert.match(page, /readSearchParam\(query, "view"\) === "recap"/);
  assert.match(page, /canOpenOperations=\{resolution\.canOpenOperations\}/);
  assert.match(page, /resolveConfiguredCanonicalEventDetailView/);
  assert.doesNotMatch(page, /orbit-real-event-detail/);
});

// ── Task 5: 详情参会者页签 / 回顾态精选参会者 → Orbit_0918 参会者弹窗 ──
test("Task 5: recap people avatars open a reduced attendee modal; directory participants map to a reduced OrbitPartyPersonView", async () => {
  const base = await baseEvent();
  const ended: OrbitLandingEventView = {
    ...base,
    stats: { ...base.stats, attendees: [{ initial: "A", name: "Alice Attendee", role: "Founder" }], count: 1, youRsvped: true },
    status: "ended",
    youRsvped: true,
  };
  const ssr = renderToStaticMarkup(<EventDetail event={ended} />);
  assert.match(ssr, /<button aria-label="查看 Alice Attendee 的资料" class="btn ev-avatar ev-avatar-open" data-live-open="attendee" type="button">A<\/button>/);
  assert.doesNotMatch(ssr, /data-events-modal=/);

  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<EventDetail event={ended} />); });
    const avatar = renderer.root.find((node) => node.type === "button" && node.props["aria-label"] === "查看 Alice Attendee 的资料");
    await act(async () => { avatar.props.onClick(); });
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /"data-events-modal":"attendee"/);
    assert.match(json, /Alice Attendee/);
    // recap person without a live request context (no me) → reduced modal: no exchange / schedule buttons, no fabricated me
    assert.match(json, /"data-events-attendee-mode":"reduced"/);
    assert.doesNotMatch(json, /"data-events-modal-action":"exchange"|"data-events-modal-action":"schedule"|活动开始后可申请交换/);
    assert.equal(renderer.root.findAll((node) => node.type === "button" && node.props["data-events-modal-action"] === "note").length, 0, "server roster has no contactId");
    const close = renderer.root.find((node) => node.type === "button" && node.props["aria-label"] === "关闭");
    await act(async () => { close.props.onClick(); });
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /"data-events-modal"/);
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
  }

  const view = personViewFromDirectory({
    contactRequest: { contactId: "contact:9", direction: "outgoing", requestId: "req:9", revision: 3, status: "accepted" },
    contactRequestsOpen: true,
    me: { company: "Orbit", displayName: "Li Wei", experienceHighlight: null, industry: null, languages: [], needs: [], offers: [], participantId: "p:me", role: "Investor", topics: [] },
    participant: { company: "LoopMatter", displayName: "Aiko Mori", experienceHighlight: "Scaling reuse", industry: "Circular", languages: ["ja"], needs: ["Buyers"], offers: ["Pilot data", "Intros"], participantId: "p:aiko", role: "Founder", topics: ["Reuse"] },
    recommendation: { icebreakers: ["Ask about pilots"], memberHint: "hint", reasons: ["Complementary"], score: 88, targetParticipantId: "p:aiko" },
  });
  assert.equal(view.id, "p:aiko");
  assert.equal(view.contactId, "contact:9");
  assert.equal(view.contactRequestStatus, "accepted");
  assert.equal(view.contactRequestId, "req:9");
  assert.equal(view.contactRequestRevision, 3);
  assert.equal(view.offering, "Pilot data\nIntros");
  assert.equal(view.seeking, "Buyers");
  assert.equal(view.summary, "Scaling reuse");
  assert.equal(view.reason, "Complementary");
  assert.equal(view.score, 88);
  assert.equal(view.isRecommended, true);
  assert.equal(view.initial, "A");
  assert.equal(view.seat, null);
  const recap = personViewFromRecap({ company: "Acme", contactId: "contact:1", initial: "K", name: "Kept Contact", participantId: "p1", role: "CEO" });
  assert.equal(recap.contactRequestStatus, "accepted");
  assert.equal(recap.id, "p1");
  assert.equal(recap.title, "CEO");
  assert.equal(personViewFromRecap({ company: null, contactId: null, initial: "J", name: "Just", role: null }).contactRequestStatus, "none");
});

test("Task 5 fix: a recap person with a contact id gets only 打开联系人名片 + 记录交流, and never the exchange / schedule modals", async () => {
  const base = await baseEvent();
  const ended: OrbitLandingEventView = { ...base, stats: { ...base.stats, attendees: [], count: 1, youRsvped: true }, status: "ended", youRsvped: true };
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<EventDetail event={ended} />); });
    // Feed the published directory (contactId) through the matchmaking summary callback.
    const matchmaking = renderer.root.findByType(OrbitEventMatchmaking);
    await act(async () => {
      matchmaking.props.onWorkspaceSummary({
        acceptedContacts: 1,
        people: [{ company: "Acme", contactId: "contact:1", displayName: "Kept Contact", participantId: "p1", role: "CEO" }],
        recommendationCount: 0,
        resultsState: "ready",
        roundOneTable: null,
        roundTwoTable: null,
      });
    });
    const avatar = renderer.root.find((node) => node.type === "button" && node.props["aria-label"] === "查看 Kept Contact 的资料");
    await act(async () => { avatar.props.onClick(); });
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /"data-events-attendee-mode":"reduced"/);
    assert.match(json, /"data-events-modal-action":"open-contact","href":"\/app\/contacts\/contact%3A1"/);
    assert.doesNotMatch(json, /"data-events-modal-action":"exchange"|"data-events-modal-action":"schedule"/);
    const note = renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "note");
    await act(async () => { note.props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /"data-events-modal":"note"/);
    // 查看资料 → back to the reduced attendee modal (still no me)
    const back = renderer.root.find((node) => node.type === "button" && node.props["data-events-modal-action"] === "open-profile");
    await act(async () => { back.props.onClick(); });
    assert.match(JSON.stringify(renderer.toJSON()), /"data-events-attendee-mode":"reduced"/);
  } finally {
    if (renderer) await act(async () => { renderer.unmount(); });
  }
});
