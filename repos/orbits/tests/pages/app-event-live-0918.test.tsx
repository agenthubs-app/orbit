import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { EventLive, resultsBoundaryCopy } from "../../app/(app)/app/events/events-0918/event-live";
import {
  AGENDA_STATE,
  GRAPH_CX,
  GRAPH_CY,
  GRAPH_R,
  agendaStatus,
  currentRound,
  formatJstClock,
  graphLayout,
  graphLegendKind,
  hotTags,
  liveTabFrom,
  matchesPersonQuery,
  paginate,
  sharedTopics,
} from "../../app/(app)/app/events/events-0918/events-model";
import type {
  OrbitPartyPersonView,
  OrbitPartyTableView,
  OrbitPartyViewModel,
} from "../../app/(app)/app/orbit-party-route-view-model";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const DESIGN_MOCKS = /山本健|Sakana AI|Tokyo Innovation Hub|Robert Chen|田中惠子|Sakura Capital|128 位|Orbit_Event|orbit2026|二度人脉|可能感兴趣|潜在机会|换一批|打招呼|添加到日历|现场提示|分享活动|最后更新|下一轮分组预告|查看完整分组安排|按关系|按兴趣|按行业/u;
const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-09-22T10:00:00.000Z";

function person(overrides: Partial<OrbitPartyPersonView> = {}): OrbitPartyPersonView {
  return {
    company: "LoopMatter",
    contactId: null,
    contactRequestDirection: null,
    contactRequestId: null,
    contactRequestRevision: null,
    contactRequestStatus: "none",
    g: "g-indigo",
    groupNumber: 2,
    icebreakers: [],
    id: "participant:aiko",
    industry: "Circular economy",
    initial: "A",
    isRecommended: true,
    memberHint: null,
    name: "Aiko Mori",
    noMatchReason: null,
    offering: "Packaging reuse pilot data",
    reason: "Her enterprise pilots complement your manufacturing network.",
    score: 91,
    seat: "T2-S3",
    seeking: "Manufacturing buyers",
    summary: "Founder · LoopMatter · Scaling reusable packaging in Japan.",
    title: "Founder",
    topics: ["Reuse systems", "Enterprise procurement"],
    ...overrides,
  };
}

function table(members: OrbitPartyPersonView[]): OrbitPartyTableView {
  return {
    icebreakers: ["Compare the evidence behind each current priority", "Agree on one concrete post-event introduction"],
    memberPrompts: ["Ask which procurement signal is strongest"],
    members: members.map((member) => ({ ...member, groupingRationale: `${member.name} complements the table.` })),
    myRationale: "Your Japan partnership experience anchors this table.",
    rationale: "This table connects implementation evidence with buying access.",
    seat: "R1-T1-S1",
    tableNumber: 1,
    theme: "From pilot evidence to enterprise adoption",
  };
}

function viewModel(overrides: Partial<OrbitPartyViewModel> = {}): OrbitPartyViewModel {
  const aiko = person();
  const ken = person({ id: "participant:ken", initial: "K", isRecommended: false, name: "Ken Sato", company: "Bridge Works", title: "CTO", topics: ["Reuse systems", "Developer tools"], score: 0 });
  return {
    accessCode: null,
    agenda: [
      { at: "2026-09-22T08:00:00.000Z", description: { en: "Doors open", zh: "开放入场" }, label: { en: "Check-in opens", zh: "开始签到" }, time: "08:00" },
      { at: "2026-09-22T09:30:00.000Z", description: { en: "Curated tables", zh: "按桌号入座" }, label: { en: "Round one tables", zh: "第一轮分桌" }, time: "09:30" },
      { at: "2026-09-22T11:00:00.000Z", description: { en: "Topic tables", zh: "话题桌" }, label: { en: "Round two topic tables", zh: "第二轮话题桌" }, time: "11:00" },
    ],
    attendees: [aiko, ken],
    checkedInAt: null,
    checkInAvailable: true,
    contactRequests: [],
    eventId: EVENT_ID,
    eventName: "Orbit Connection Night",
    eventEndsAt: "2026-09-22T12:00:00.000Z",
    eventPhase: "active",
    eventStartsAt: "2026-09-22T08:30:00.000Z",
    eventVenue: "Marunouchi Hall",
    generationNotice: null,
    graph: {
      edges: [
        { fromParticipantId: "participant:me", id: "edge:rec", kind: "recommendation", label: "Complementary", toParticipantId: aiko.id },
        { fromParticipantId: "participant:me", id: "edge:table", kind: "round_one_table", label: "Table 1", toParticipantId: ken.id },
      ],
      nodes: [
        { company: aiko.company, displayName: aiko.name, participantId: aiko.id },
        { company: ken.company, displayName: ken.name, participantId: ken.id },
      ],
    },
    icebreakers: [],
    me: {
      groupNumber: 1,
      initial: "L",
      name: "Li Wei",
      participantId: "participant:me",
      offering: ["Japan market partnerships"],
      prompts: [],
      role: "Investor · Orbit Capital",
      seat: "R1-T1-S1",
      seeking: ["Circular economy founders"],
      topics: ["Reuse systems", "Go-to-market"],
    },
    profileEditDeadlineAt: "2026-09-22T07:00:00.000Z",
    profileEditable: false,
    recommendationNoMatchReason: null,
    recommendations: [aiko],
    resultsAvailableAt: "2026-09-22T08:30:00.000Z",
    resultsState: "ready",
    roundOne: table([ken]),
    roundTwo: null,
    tableMates: [ken],
    ...overrides,
  };
}

/** 去掉 <style>（EVENTS_STYLES 的 CSS 注释含设计词），只断言页面标记。 */
export function stripStyles(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/u, "");
}

function render(vm: OrbitPartyViewModel, tab: Parameters<typeof EventLive>[0]["initialTab"] = "home", now = NOW): string {
  return stripStyles(renderToStaticMarkup(<EventLive initialTab={tab} now={now} viewModel={vm} />));
}

const t = (copy: { en: string; zh: string }) => copy.zh;

test("live head renders real event fields, six tabs, and no design mock strings", () => {
  const html = render(viewModel());
  assert.match(html, /class="ev-main"[^>]*data-events-view="live"[^>]*data-live-tab="home"/);
  assert.match(html, /<a class="btn ev-back" href="\/app\/events">← 返回活动列表<\/a>/);
  assert.match(html, new RegExp(`<a class="btn ev-lv-btn-dark ev-lv-btn-14" data-live-action="detail" href="/app/events/${EVENT_ID}">活动详情</a>`, "u"));
  assert.match(html, /class="cover cover-grain ev-lv-cover"/);
  assert.match(html, /<span class="ev-chip ev-chip-hero" style="background:#E6F1EC;color:#2F6B4F">进行中<\/span>/);
  assert.match(html, /<h1 class="ev-lv-h1">Orbit Connection Night · 现场<\/h1>/);
  assert.match(html, /ev-info-icon">▦<\/span>2026年9月22日（周二） 17:30 - 21:00</);
  assert.match(html, /ev-info-icon">◎<\/span>Marunouchi Hall</);
  assert.match(html, /ev-info-icon">◌<\/span>2 位参会者</);
  for (const [key, label] of [["home", "现场主页"], ["rec", "推荐给你"], ["all", "全部参会者"], ["group", "分组"], ["graph", "关系图谱"], ["agenda", "流程议程"]]) {
    assert.match(html, new RegExp(`<button aria-selected="(true|false)" class="btn ev-tab ev-tab-(on|off)" data-live-tab="${key}" role="tab" type="button">${label}</button>`, "u"));
  }
  assert.match(html, /data-live-tab="home" role="tab"/);
  assert.match(html, /class="btn ev-tab ev-tab-on" data-live-tab="home"/);
  assert.doesNotMatch(html, DESIGN_MOCKS);
  assert.doesNotMatch(html, /style="[^"]*(font-size|font-weight|gap):\s*\d/);
});

test("home tab: status tiles, three recommendations, graph summary, current group, mini agenda", () => {
  const html = render(viewModel());
  assert.match(html, /data-live-checkin="open"/);
  assert.match(html, /<button class="btn ev-lv-btn-dark" data-live-action="check-in" type="button">立即签到<\/button>/);
  assert.match(html, /data-live-me="participant:me">Li Wei · Investor · Orbit Capital</);
  assert.match(html, /<strong class="ev-lv-tile-n">1 号桌<\/strong>/);
  assert.match(html, /查看推荐 →/);
  assert.match(html, /data-live-person="participant:aiko"/);
  assert.match(html, /匹配理由<\/span><span>• Her enterprise pilots/);
  assert.match(html, /已认识<\/span><strong class="ev-lv-ministat-n">0<\/strong>/);
  assert.match(html, /查看完整图谱 →/);
  assert.match(html, /第 1 \/ 1 轮/);
  assert.match(html, /本桌参会者（1 人）/);
  assert.match(html, /<span class="ev-lv-mate-name">Ken Sato<\/span><span class="ev-lv-mate-co">Bridge Works<\/span>/);
  assert.match(html, /破冰话题/);
  assert.match(html, /data-live-agenda-status="done"[^>]*>.*?<span class="ev-lv-agenda-mini-time">17:00<\/span><strong class="ev-lv-agenda-mini-title">开始签到/);
  assert.match(html, /data-live-agenda-status="now"[^>]*style="background:#F7F7FD"/);
  assert.match(html, /data-live-agenda-status="soon"/);
  assert.doesNotMatch(html, /记录交流|申请交换联系方式<\/button><\/div><\/div><\/article>.*data-live-tab="rec"/u);
});

test("home tab: check-in button reflects closed window and checked-in state", () => {
  const closed = render(viewModel({ checkInAvailable: false }));
  assert.match(closed, /data-live-checkin="closed"/);
  assert.match(closed, /<button class="btn ev-lv-btn-dark" data-live-action="check-in" disabled="" type="button">当前不在签到时间内<\/button>/);
  const checked = render(viewModel({ checkedInAt: "2026-09-22T09:50:00.000Z" }));
  assert.match(checked, /data-live-checkin="checked"/);
  assert.match(checked, /已完成签到<\/span><span class="ev-lv-tile-green-sub">18:50 签到成功<\/span>/);
  assert.doesNotMatch(checked, /data-live-action="check-in"/);
  const ended = render(viewModel({ eventPhase: "ended" }));
  assert.match(ended, /data-live-checkin="closed"/);
});

test("results state renders the four real empty states in home / rec / group / graph and never mock people", () => {
  const empty: Partial<OrbitPartyViewModel> = { graph: null, recommendations: [], roundOne: null, roundTwo: null, tableMates: [] };
  const vm = viewModel({ ...empty, resultsState: "not_generated" });
  const home = render(vm);
  assert.match(home, /data-live-results-state="not_generated"[^>]*role="status"><strong class="ev-lv-empty-title">结果尚未生成<\/strong><span class="ev-lv-empty-detail">组织者尚未为当前报名快照发布 AI 生成结果。/);
  assert.match(home, /尚未分配座位/);
  assert.match(home, /尚未为你发布分桌结果/);
  assert.match(render(vm, "rec"), /data-live-results-state="not_generated"/);
  assert.match(render(vm, "group"), /data-live-results-state="not_generated"/);
  const graph = render(vm, "graph");
  assert.match(graph, /class="ev-lv-graph-empty"><div class="ev-lv-empty" data-live-results-state="not_generated"/);
  assert.match(graph, /点击节点查看对方信息/);

  const locked = resultsBoundaryCopy(viewModel({ resultsState: "locked", resultsAvailableAt: "2026-09-22T08:30:00.000Z" }), t);
  assert.equal(locked.title, "结果尚未开放");
  assert.equal(locked.detail, "结果将在 2026/09/22 17:30:00 JST 开放。");
  const processing = resultsBoundaryCopy(viewModel({ resultsState: "processing" }), t);
  assert.equal(processing.title, "AI 正在生成");
  const failed = resultsBoundaryCopy(viewModel({ resultsState: "failed", generationNotice: { errorCode: "SHARD_TIMEOUT", errorMessage: "Shard 2 timed out.", status: "failed" } }), t);
  assert.equal(failed.title, "AI 生成失败");
  assert.equal(failed.detail, "Shard 2 timed out.");
  const failedHtml = render(viewModel({ ...empty, resultsState: "failed", generationNotice: { errorCode: "SHARD_TIMEOUT", errorMessage: null, status: "failed" } }), "rec");
  assert.match(failedHtml, /组织者可重试失败分片/);
  assert.match(failedHtml, /<span class="ev-lv-empty-code">SHARD_TIMEOUT<\/span>/);
  const ready = resultsBoundaryCopy(viewModel({ resultsState: "ready", recommendationNoMatchReason: "Profile too thin." }), t);
  assert.equal(ready.title, "暂无推荐匹配");
  assert.equal(ready.detail, "Profile too thin.");
  assert.doesNotMatch(home + graph, DESIGN_MOCKS);
});

test("rec tab: recommended cards with match label, reason, exchange button; filters and shuffle omitted", () => {
  const html = render(viewModel(), "rec");
  assert.match(html, /data-live-panel="rec"/);
  assert.match(html, /<h2 class="ev-h2">为你推荐的参会者<\/h2>/);
  assert.match(html, /<strong class="ev-lv-person-name">Aiko Mori<\/strong><span class="ev-lv-match">91% 匹配<\/span>/);
  assert.match(html, /<span class="ev-lv-person-role">Founder @ LoopMatter<\/span>/);
  assert.match(html, /<span class="ev-lv-tag">Reuse systems<\/span><span class="ev-lv-tag">Enterprise procurement<\/span>/);
  assert.match(html, /<button class="btn ev-lv-btn-ghost ev-lv-btn-grow" data-event-contact-action="request" type="button">申请交换联系方式<\/button>/);
  assert.match(html, /推荐说明/);
  assert.doesNotMatch(html, /筛选条件|重置|只有高匹配|全部行业|<select/);
  assert.doesNotMatch(html, /data-live-person="participant:ken"/);
});

test("all tab: search, hot tags from topic frequency, count, cards with summary; pagination only when more than 12", () => {
  const html = render(viewModel(), "all");
  assert.match(html, /<input aria-label="搜索参会者" class="ev-search-input" placeholder="搜索参会者姓名、公司、职位或关键词…" type="search" value=""\/>/);
  assert.match(html, /热门标签：<button class="btn ev-lv-hot-tag" type="button">Reuse systems<\/button><button class="btn ev-lv-hot-tag" type="button">Developer tools<\/button><button class="btn ev-lv-hot-tag" type="button">Enterprise procurement<\/button>/);
  assert.match(html, /<span class="ev-lv-hot-total">共 2 位参会者<\/span>/);
  assert.match(html, /<span class="ev-lv-person-bio">Founder · LoopMatter · Scaling reusable packaging in Japan.<\/span>/);
  assert.match(html, /<button class="btn ev-lv-btn-dark ev-lv-btn-grow" data-event-contact-action="request" type="button">申请交换联系方式<\/button>/);
  assert.doesNotMatch(html, /ev-lv-pages|行业 ⌄|默认排序|查看资料/);

  const many = Array.from({ length: 14 }, (_, index) => person({ id: `participant:${index}`, name: `Person ${index}`, initial: "P" }));
  const paged = render(viewModel({ attendees: many }), "all");
  assert.match(paged, /class="ev-lv-pages"/);
  assert.match(paged, /<button aria-current="page" class="btn ev-lv-page ev-lv-page-on" type="button">1<\/button><button class="btn ev-lv-page " type="button">2<\/button>/);
  assert.match(paged, /每页 12 条/);
  assert.equal((paged.match(/data-live-person="participant:/g) ?? []).length, 12);
});

test("group tab: current table tiles, members, and real rationales / icebreakers; countdown and preview omitted", () => {
  const html = render(viewModel(), "group");
  assert.match(html, /data-live-round="1"/);
  assert.match(html, /● 第 1 轮进行中/);
  assert.match(html, /当前桌号<\/span><strong class="ev-lv-tile-n-20">1 号桌<\/strong><span class="ev-lv-tile-label-12">R1-T1-S1<\/span>/);
  assert.match(html, /本组人数<\/span><strong class="ev-lv-tile-n-20">2 人<\/strong>/);
  assert.match(html, /本组主题<\/span><strong class="ev-lv-tile-n-17">From pilot evidence to enterprise adoption<\/strong>/);
  assert.match(html, /本组成员（1 人）/);
  assert.match(html, /<strong class="ev-lv-member-name">Ken Sato<\/strong>/);
  assert.match(html, /你为什么被分到这桌<\/strong><span class="ev-lv-note-desc-13" data-party-member-rationale="self">Your Japan partnership experience anchors this table\./);
  assert.match(html, /全桌破冰/);
  assert.match(html, /• Compare the evidence behind each current priority/);
  assert.match(html, /成员分组理由<\/strong>.*data-party-member-rationale="participant:ken">• Ken Sato：Ken Sato complements the table\./);
  assert.doesNotMatch(html, /倒计时|每轮 20 分钟|组长/);
  assert.doesNotMatch(html, DESIGN_MOCKS);
});

test("group tab: second round becomes the current group once its agenda slot has started", () => {
  const vm = viewModel({ roundTwo: { ...table([person()]), tableNumber: 4, theme: "AI partnerships" } });
  const later = render(vm, "group", "2026-09-22T11:30:00.000Z");
  assert.match(later, /data-live-round="2"[^>]*>.*● 第 2 轮进行中/);
  assert.match(later, /4 号桌/);
  assert.match(later, /第 1 轮分组/);
  const earlier = render(vm, "group");
  assert.match(earlier, /● 第 1 轮进行中/);
  assert.match(earlier, /第 2 轮分组/);
});

test("graph tab: circular layout from the design formula, legend kinds, selected node, three real stats", () => {
  const html = render(viewModel(), "graph");
  const layout = graphLayout([1, 2]);
  assert.match(html, new RegExp(`<button class="btn ev-lv-graph-node" data-graph-participant="participant:aiko" style="box-shadow:0 0 0 3px #4B4FC7;left:${layout[0].left}px;top:${layout[0].top}px" title="Aiko Mori" type="button">A</button>`, "u"));
  assert.match(html, new RegExp(`data-graph-participant="participant:ken" style="box-shadow:0 0 0 2px #9FA3D9;left:${layout[1].left}px;top:${layout[1].top}px" title="Ken Sato" type="button">K</button>`, "u"));
  assert.match(html, new RegExp(`class="ev-lv-graph-line" style="background:#7C4FC7;left:${GRAPH_CX}px;top:${GRAPH_CY}px;transform:rotate\\(${layout[0].deg}deg\\);width:${layout[0].len}px"`, "u"));
  assert.match(html, /<span class="ev-lv-graph-me" data-graph-participant="participant:me">L<\/span><span class="ev-lv-graph-me-label">我自己<\/span>/);
  assert.match(html, /<span class="ev-lv-legend-dot" style="background:#4B4FC7"><\/span>我自己/);
  assert.match(html, /<span class="ev-lv-legend-dot" style="background:#5B8C7A"><\/span>已认识/);
  assert.match(html, /<strong class="ev-lv-gsel-name">Aiko Mori<\/strong>/);
  assert.match(html, /你们的关系<\/strong><span class="ev-lv-gsel-rel" style="color:#7C4FC7">● 推荐认识<\/span>/);
  assert.match(html, /共同兴趣<\/strong><span class="ev-lv-gsel-interests"><span class="ev-lv-gsel-interest">Reuse systems<\/span><\/span>/);
  assert.match(html, /已认识<\/span><strong class="ev-lv-stat-n">0<\/strong>/);
  assert.match(html, /推荐认识<\/span><strong class="ev-lv-stat-n">1<\/strong>/);
  assert.match(html, /同组成员<\/span><strong class="ev-lv-stat-n">1<\/strong>/);
  assert.doesNotMatch(html, /潜在机会|−<\/span>100%|⛶|查看完整资料/);
});

test("agenda tab: statuses derive from ISO `at`, labels render in JST, current session panel", () => {
  const html = render(viewModel(), "agenda");
  assert.match(html, /当前时间：9月22日 19:00（JST）/);
  assert.match(html, /data-live-agenda-status="done"[^>]*><span class="ev-lv-agenda-time"><time dateTime="2026-09-22T08:00:00.000Z">17:00<\/time><\/span>/);
  assert.match(html, /<span class="ev-lv-agenda-dot" style="background:#2F6B4F;border-color:#2F6B4F">✓<\/span>/);
  assert.match(html, /data-live-agenda-status="now"[^>]*style="background:#F7F7FD"/);
  assert.match(html, /<span class="ev-lv-agenda-tag" style="background:#DDDEFA;color:#2E3270">进行中<\/span>/);
  assert.match(html, /data-live-agenda-status="soon"/);
  assert.match(html, /<span class="ev-lv-agenda-tag" style="background:#F0F1F8;color:#6B6F99">即将开始<\/span>/);
  assert.match(html, /当前环节说明<\/h2><span class="ev-lv-now-chip">进行中<\/span><strong class="ev-lv-now-title">第一轮分桌<\/strong><p class="ev-lv-now-desc">按桌号入座<\/p>/);
  assert.doesNotMatch(html, /添加到日历|现场提示|Wi-Fi/);
});

test("model: agendaStatus / currentRound / clocks / layout / legend / hotTags / paginate / tab parsing", () => {
  const items = [{ at: "2026-09-22T08:00:00.000Z" }, { at: "2026-09-22T09:30:00.000Z" }, { at: "2026-09-22T11:00:00.000Z" }, { at: "2026-09-22T12:00:00.000Z" }];
  assert.deepEqual(agendaStatus(items, Date.parse("2026-09-22T07:00:00.000Z")), ["soon", "later", "later", "later"]);
  assert.deepEqual(agendaStatus(items, Date.parse("2026-09-22T10:00:00.000Z")), ["done", "now", "soon", "later"]);
  assert.deepEqual(agendaStatus(items, Date.parse("2026-09-22T13:00:00.000Z")), ["done", "done", "done", "now"]);
  assert.deepEqual(agendaStatus([{ at: "" }, { at: "2026-09-22T09:30:00.000Z" }], Date.parse("2026-09-22T10:00:00.000Z")), ["later", "now"]);
  assert.equal(currentRound(items, true, Date.parse("2026-09-22T10:00:00.000Z")), 1);
  assert.equal(currentRound(items, true, Date.parse("2026-09-22T11:30:00.000Z")), 2);
  assert.equal(currentRound(items, false, Date.parse("2026-09-22T11:30:00.000Z")), 1);
  assert.equal(formatJstClock("2026-09-22T08:00:00.000Z"), "17:00");
  assert.equal(formatJstClock("nope"), "—");
  assert.equal(AGENDA_STATE.now.rowBg, "#F7F7FD");

  const three = graphLayout(["a", "b", "c"]);
  assert.equal(three.length, 3);
  assert.equal(Math.round(three[0].x), GRAPH_CX);
  assert.equal(Math.round(three[0].y), GRAPH_CY - GRAPH_R);
  assert.equal(three[0].left, three[0].x - 24);
  assert.equal(three[0].top, three[0].y - 24);
  assert.equal(Math.round(three[1].x), Math.round(GRAPH_CX + GRAPH_R * Math.cos(-Math.PI / 2 + (2 * Math.PI) / 3)));
  assert.equal(Math.round(three[1].y), Math.round(GRAPH_CY + GRAPH_R * Math.sin(-Math.PI / 2 + (2 * Math.PI) / 3)));
  assert.equal(Math.round(three[2].x), Math.round(GRAPH_CX + GRAPH_R * Math.cos(-Math.PI / 2 + (4 * Math.PI) / 3)));
  for (const pos of three) {
    assert.ok(Math.abs(pos.len - GRAPH_R) < 1e-9);
    assert.ok(Math.abs(((Math.atan2(pos.y - GRAPH_CY, pos.x - GRAPH_CX) * 180) / Math.PI) - pos.deg) < 1e-9);
  }

  const edges = [
    { fromParticipantId: "me", id: "1", kind: "recommendation" as const, label: "", toParticipantId: "a" },
    { fromParticipantId: "b", id: "2", kind: "round_two_topic" as const, label: "", toParticipantId: "me" },
    { fromParticipantId: "c", id: "3", kind: "recommendation" as const, label: "", toParticipantId: "d" },
  ];
  const requests = [{ otherParticipantId: "a", status: "accepted" as const }, { otherParticipantId: "b", status: "awaiting_target_consent" as const }];
  assert.equal(graphLegendKind({ participantId: "me" }, edges, requests, "me"), "me");
  assert.equal(graphLegendKind({ participantId: "a" }, edges, requests, "me"), "known");
  assert.equal(graphLegendKind({ participantId: "a" }, edges, [], "me"), "recommended");
  assert.equal(graphLegendKind({ participantId: "b" }, edges, requests, "me"), "group");
  assert.equal(graphLegendKind({ participantId: "c" }, edges, requests, "me"), "other");

  assert.deepEqual(hotTags([{ topics: ["AI", "SaaS"] }, { topics: ["AI", " "] }, { topics: ["Design"] }]), ["AI", "Design", "SaaS"]);
  assert.deepEqual(hotTags(Array.from({ length: 12 }, (_, index) => ({ topics: [`t${index}`] }))).length, 10);
  const paged = paginate(Array.from({ length: 25 }, (_, index) => index), 3);
  assert.deepEqual(paged, { items: [24], page: 3, pageCount: 3, pages: [1, 2, 3], total: 25 });
  assert.equal(paginate([1, 2], 9).page, 1);
  assert.ok(matchesPersonQuery(person(), "loop"));
  assert.ok(!matchesPersonQuery(person(), "zzz"));
  assert.deepEqual(sharedTopics(["A", "b"], ["B", "c"]), ["b"]);
  assert.equal(liveTabFrom("graph"), "graph");
  assert.equal(liveTabFrom("nope"), "home");
  assert.equal(liveTabFrom(undefined), "home");
});

test("live page wires auth redirect, canonical id resolution, the party loader, and the events-0918 shell", () => {
  const source = readFileSync(join(projectRoot, "app/(app)/app/events/[id]/live/page.tsx"), "utf8");
  assert.match(source, /auth\(\)/);
  assert.match(source, /if \(!session\?\.user\?\.id\)/);
  assert.ok(source.includes("redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/${id}/live`)}`)"));
  assert.match(source, /loadAppPartyRouteViewModel\(\{/);
  assert.match(source, /id: session\.user\.id/);
  assert.match(source, /eventCore\.getEvent\(routeId\)/);
  assert.match(source, /data-orbit-real-page="events-0918"/);
  assert.match(source, /<AccountTopNav active="events" \/>/);
  assert.match(source, /<EventLive/);
  assert.match(source, /StateView/);
  assert.doesNotMatch(source, /party-login-return|partyLoginHref|PublicTopNav/);
});
