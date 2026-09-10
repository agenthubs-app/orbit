import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;
const title = "东京跨境科技与零售伙伴交流会：共同确认未来一年在日本市场的合作计划";

// Production screens, content, view-models, controls and theme stay real. Only
// navigation, HTTP and native boundaries are controlled; no business writes occur.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
const listeners = new Set(); let revision = 0;
export const state = window.fixture = { requests: [], navigation: [], kind: "success", busy: false, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(f => f()); } };
export const useFixture = () => { useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => revision); return state; };
const event = { id: "event:style", title: ${JSON.stringify(title)}, startsAt: "2026-12-19T09:00:00Z", status: "scheduled", venue: "东京国际交流中心三层合作伙伴会议室", coverPath: "/orbit-covers/meeting.jpg", description: "围绕零售合作的现场交流。", organizer: "东京伙伴社区", feeLabel: "免费", stats: { youRsvped: false, attendeeCount: 24 } };
const registration = { registration: null, questionSet: { questions: [{ id: "target_attendees", intent: "target_attendees", optional: true, options: ["日本本地 SaaS 买方", "跨境渠道合作伙伴"], participantProfileField: "targetAttendees", prompt: "这场活动里，你最想认识哪类人？" }] } };
const recommendationMode = new URLSearchParams(location.search).get("recommendations") === "true";
const events = recommendationMode ? [event, { ...event, id: "event:second", title: "第二场东京伙伴交流会" }] : [event];
const recommendations = { state: "success", profile: { calendarFit: "open", goal: "拓展合作", industryPreference: "technology", location: "Tokyo" }, nextAction: "先看活动再确认安排", recommendations: events.map(e => ({ eventId: e.id, title: e.title, startsAt: e.startsAt, valueScore: 94, scoreBand: "high", venue: e.venue, location: "Tokyo", recommendedAction: "先看活动再确认安排", signals: [{ label: "目标一致", detail: "可以找到日本合作伙伴", weight: 1 }] })) };
const homeHub = new URLSearchParams(location.search).get("screen") === "homeHub";
const finalInsets = new URLSearchParams(location.search).get("insets") === "true";
const profile = { profile: { displayName: "林悦", relationshipGoal: "认识日本零售伙伴", ...(homeHub ? { bio: "负责日本零售市场的合作伙伴拓展。", headline: "跨境合作负责人", role: "日本市场合作伙伴拓展负责人", industry: "跨境零售与企业软件合作", timezone: "Asia/Tokyo", organization: "东京伙伴社区", offering: ["日本渠道资源"], seeking: ["零售采购伙伴"], topics: ["企业软件合作"] } : {}) } };
const contacts = { contacts: homeHub ? [{ id: "contact:sato", displayName: "佐藤 葵", organization: "东京零售协会", role: "合作负责人", status: "active" }, { id: "contact:li", displayName: "李 明", organization: "合作伙伴社区", role: "顾问", status: "dormant" }] : [] };
const attendees = { event: { ...event, name: event.title }, attendees: [{ attendeeId: "participant:sato", displayName: "佐藤 葵", checkInStatus: "registered", organization: "东京零售协会", role: "合作负责人", relationshipContext: "共同关注日本市场", suggestedNextAction: "先当面确认合作时间", attendeeTags: [{ label: "零售合作" }], eligibleRecommendation: { isEligible: true, reasons: ["同样关注零售合作"], recommendationCandidateId: "recommendation:1", blockedByKnownContact: false } }] };
const rolePayload = { event: { eventId: "event:style", title: event.title }, members: [{ assignedAt: null, assignedByActorId: null, eventId: "event:style", reason: null, revision: 0, role: "owner", state: "active", subjectActorId: "actor:owner" }, { assignedAt: "2026-08-19T09:00:00Z", assignedByActorId: "actor:owner", eventId: "event:style", reason: "负责现场签到", revision: 2, role: "check_in", state: "active", subjectActorId: "actor:staff" }] };
const center = [{ endsAt: "2026-08-21T21:00:00+09:00", eventId: "event:style", lifecycleState: "published", migrationPending: false, owner: true, revision: 3, role: "owner", startsAt: "2026-08-21T18:00:00+09:00", title: event.title, venue: event.venue }];
const insetMatches = { matches: [{ matchId: "match:style", participantNames: ["佐藤 葵", "林悦"], successNotice: { title: "可以一起讨论零售合作", message: "双方均希望认识对方。" } }] };
function insetData(path) {
  if (path.endsWith("/readiness")) return { goal: { intent: "认识东京采购负责人" }, preparationState: { readinessScore: 75 }, suggestedGoals: [{ goalId: "goal:style", intent: "确认采购合作需求", label: "先了解采购需求", rationale: "已有零售渠道背景" }], readinessChecklist: [] };
  if (path.includes("/recommendations/event/")) return { recommendations: [{ recommendationId: "recommendation:style", attendee: { attendeeId: "participant:sato", displayName: "佐藤 葵", organization: "东京零售协会", role: "合作负责人" }, rank: 1, score: 90, reasons: ["共同关注零售合作"], openingLine: { text: "贵团队今年有哪些采购计划？" }, recommendedAction: "先当面认识" }] };
  if (path.endsWith("/post-event")) return { state: "success", contacts: [{ contactDraftId: "draft:style", displayName: "佐藤 葵", summary: { headline: "现场讨论零售合作", whyNow: "已约好继续交流" }, followUpSuggestion: { messageDraft: "很高兴现场讨论采购合作。", urgency: "this_week" } }] };
  if (path.includes("matches")) return insetMatches;
  if (path.includes("attendees")) return attendees;
}
export const useApiResource = path => { useFixture(); return { kind: state.kind, data: (finalInsets ? insetData(path) : undefined) ?? (path.includes("recommendations/events") ? recommendations : path.endsWith("/center") ? center : path.endsWith("/access/roles") ? rolePayload : path.includes("registration") ? registration : path.includes("attendees") ? attendees : path.includes("matches") ? { matches: [] } : path.includes("contacts") ? contacts : path.includes("profile") ? profile : path.endsWith("/events/public") || path.endsWith("/events") ? { events } : { event }), error: { message: "当前账号没有权限" }, refreshing: false, refresh() {} }; };
export const useLocalSearchParams = () => ({ id: "event:style", eventId: "event:style", code: "event:style", slug: "event:style" });
export const usePathname = () => "/events";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
export const useOrbitAuthSession = () => ({ ready: true, signedIn: recommendationMode || finalInsets });
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture" });
const record = method => async (path, options) => {
  state.requests.push({ method, path, body: options?.body });
  if (finalInsets && method === "POST") {
    if (path.endsWith("/encounters")) return { success: true, data: { participant: { displayName: "佐藤 葵" }, encounter: { encounterId: "encounter:style" }, note: { text: "现场确认采购需求" }, evidenceDraft: {}, nextAction: "先复核现场记录" } };
    if (path.endsWith("/interview")) return { success: true, data: { done: false, question: { field: "targetAttendees", prompt: "你想认识哪类采购伙伴？", options: [] } } };
    if (path.endsWith("/persona")) return { success: true, data: { persona: { tagline: "连接东京采购合作伙伴", tags: ["零售合作"], industryTags: ["零售"], seeking: "采购负责人", offering: "本地渠道经验", openers: [], energyStyle: "先倾听对方需求" } } };
  }
  return { success: false, error: { message: "暂时无法保存，请重试" } };
};
export const useOrbitApiClient = () => ({ post: record("POST"), put: record("PUT"), get: record("GET") });
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size }} />;
export const useRelationshipInboxBadgeCount = () => 0;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React, { useState } from "react"; import { createRoot } from "react-dom/client";
import { AppScreen } from "./src/components/AppScreen";
import { EventsScreen } from "./src/screens/events/EventsScreen";
import { EventDetailScreen } from "./src/screens/events/EventDetailScreen";
import { EventRegistrationScreen } from "./src/screens/events/EventRegistrationScreen";
import { HomeScreen } from "./src/screens/home/HomeScreen";
import { OrganizerPublicScreen } from "./src/screens/organizer/OrganizerPublicScreen";
import { RegisterInviteScreen } from "./src/screens/register/RegisterInviteScreen";
import { PartyModeScreen } from "./src/screens/party/PartyModeScreen";
import { EventAttendeesScreen } from "./src/screens/events/EventAttendeesScreen";
import { EventCenterScreen } from "./src/screens/events/EventCenterScreen";
import { EventRolesScreen } from "./src/screens/events/EventRolesScreen";
import { EventAdmissionReviewContent } from "./src/screens/events/EventAdmissionReviewContent";
import { EventAnalyticsContent } from "./src/screens/events/EventAnalyticsContent";
import { eventAdmissionApplicationToView, eventAdmissionReviewListToView } from "./src/view-models/event-admission-review";
import { eventAnalyticsToView } from "./src/view-models/event-analytics";
import { EventOperationsContent } from "./src/screens/events/EventOperationsContent";
import { EventRolesContent } from "./src/screens/events/EventRolesContent";
import { EventCheckInContent } from "./src/screens/events/EventCheckInContent";
import { eventOperationsToView } from "./src/view-models/event-operations";
import { eventRoleMembersToView } from "./src/view-models/event-roles";
import { eventCheckInRosterToView } from "./src/view-models/event-check-in";
import { state, useFixture } from "event-fixture";
const configuration = { checkInOpensAt: "2026-08-19T08:00:00Z", eventEndsAt: "2026-08-19T13:00:00Z", eventId: "event:style", eventStartsAt: "2026-08-19T09:00:00Z", maxAttemptsPerTask: 3, organizerActorId: "actor:owner", profileEditDeadlineAt: "2026-08-18T09:00:00Z", recommendationCount: 3, registrationCutoffAt: "2026-08-18T10:00:00Z", resultsAvailableAt: "2026-08-19T08:30:00Z", roundOneStartsAt: "2026-08-19T10:00:00Z", roundTwoStartsAt: "2026-08-19T11:00:00Z", shardSize: 20, tableSize: 6, updatedAt: "2026-08-18T12:00:00Z" };
const generation = { aiRequestFingerprint: "fingerprint", completedAt: "2026-08-18T13:00:00Z", createdAt: "2026-08-18T12:30:00Z", errorCode: null, errorMessage: null, eventId: "event:style", expectedTaskCount: 5, generationId: "generation:01", idempotencyKey: "key:01", organizerActorId: "actor:owner", publishedAt: null, snapshot: { capturedAt: "2026-08-18T12:30:00Z", hash: "abcdef1234567890", participants: [{ participantId: "p1" }] }, status: "completed", updatedAt: "2026-08-18T13:00:00Z" };
const view = eventOperationsToView({ configuration, eventId: "event:style", generations: [{ generation, progress: { completedTasks: 5, failedTasks: 0, percent: 100, totalTasks: 5 } }], metrics: { acceptedContactRequests: 1, checkedIn: 3, contactRequests: 2, participantCount: 8, publishedGenerationId: null }, publishedResult: null });
const roles = eventRoleMembersToView({ event: { eventId: "event:style", title: ${JSON.stringify(title)} }, members: [{ assignedAt: null, assignedByActorId: null, eventId: "event:style", reason: null, revision: 0, role: "owner", state: "active", subjectActorId: "actor:owner" }, { assignedAt: "2026-08-19T09:00:00Z", assignedByActorId: "actor:owner", eventId: "event:style", reason: "负责现场签到与合作伙伴接待", revision: 2, role: "check_in", state: "active", subjectActorId: "actor:staff" }] });
const roster = eventCheckInRosterToView({ eventId: "event:style", participants: [{ checkedIn: false, checkedInAt: null, displayName: "佐藤 葵", participantId: "participant:sato" }, { checkedIn: true, checkedInAt: "2026-08-19T09:15:00Z", displayName: "李 明", participantId: "participant:li" }] });
function ContentFixture() { useFixture(); const [query, setQuery] = useState(""); const [segment, setSegment] = useState("all"); const screen = new URLSearchParams(location.search).get("screen"); const contentState = { kind: state.kind, message: "当前账号没有权限" }; return <AppScreen title="活动运营">{screen === "operations" ? <EventOperationsContent busy={state.busy ? "generation:01" : null} onGenerationAction={g => state.requests.push({ action: g.action, generationId: g.generationId })} onOpenAnalytics={() => state.navigation.push("analytics")} onOpenCheckIn={() => state.navigation.push("check-in")} onOpenRoles={() => state.navigation.push("roles")} onStartGeneration={() => state.requests.push({ action: "generate" })} state={contentState} view={view} /> : screen === "roles" ? <EventRolesContent onEdit={member => state.requests.push({ action: "edit", actor: member.subjectActorId, revision: member.revision })} onOpenGrant={() => state.navigation.push("grant")} roles={roles} state={contentState} /> : <EventCheckInContent pendingParticipantId={state.busy ? "participant:sato" : null} onCheckIn={id => state.requests.push({ action: "check-in", id })} onQueryChange={setQuery} onSegmentChange={setSegment} query={query} segment={segment} roster={roster} state={contentState} />}</AppScreen>; }
const application = { actorId: "actor:aiko", applicationVersion: 1, decidedAt: null, decisionActorId: null, eventId: "event:style", policyVersion: 2, displayName: "森爱子", profilePayload: { displayName: "森爱子", answers: { desiredOutcome: "找到采购伙伴并安排下一次讨论", industry: "工业 AI", positioning: "跨境产品负责人", targetAttendees: "制造业采购负责人", valueOffered: "市场进入经验与产业引荐" }, interviewResponses: [{ responseId: "response:1", prompt: "希望继续讨论什么？", answer: "日本市场合作方案" }] }, status: "pending_review", submittedAt: "2026-08-05T09:05:00Z", updatedAt: "2026-08-05T09:05:00Z" };
function AdmissionFixture() {
  useFixture(); const [selected, setSelected] = useState(false); const [queue, setQueue] = useState("pending");
  const list = eventAdmissionReviewListToView({ items: [application], nextCursor: "page:2", total: 2, view: queue });
  return <AppScreen title="报名审核"><EventAdmissionReviewContent busy={state.busy} detail={selected ? eventAdmissionApplicationToView({ ...application, status: state.processed ? "admitted" : "pending_review" }) : null} detailLoading={false} list={list} onBackToList={() => setSelected(false)} onChangeView={setQueue} onDecision={decision => state.requests.push({ decision })} onLoadMore={() => state.requests.push({ action: "more" })} onSelectApplicant={actor => { state.navigation.push(actor); setSelected(true); }} state={{ kind: state.kind, message: "当前账号没有权限" }} /></AppScreen>;
}
const analytics = eventAnalyticsToView({ appointments: { awaitingResponse: 0, cancelled: 0, completed: 0, confirmed: 0, draft: 0, negotiating: 0, reschedulePending: 0 }, checkIns: { checkedIn: 2 }, contactRequests: { accepted: 1, awaitingTargetConsent: 0, declined: 0, withdrawn: 0 }, encounters: { captured: 1, projected: 0 }, eventId: "event:style", grouping: { published: false, roundOne: { assignedParticipants: 0, tables: 0 }, roundTwo: { assignedParticipants: 0, tables: 0 } }, kind: "organizer_aggregate", registrations: { active: 4, cancelled: 0 } });
function AnalyticsFixture() { useFixture(); const [kind, setKind] = useState("organizer_aggregate"); return <AppScreen title="活动数据报告"><EventAnalyticsContent activeKind={kind} attendeeAvailable organizerAvailable={state.organizerAvailable !== false} onChangeKind={value => { state.navigation.push(value); setKind(value); }} state={{ kind: state.kind, message: "当前账号没有权限" }} view={analytics} /></AppScreen>; }
const screens = { events: EventsScreen, detail: EventDetailScreen, registration: EventRegistrationScreen, home: () => <HomeScreen mode="events" />, homeHub: () => <HomeScreen mode="hub" />, organizer: OrganizerPublicScreen, invite: RegisterInviteScreen, party: PartyModeScreen, partyGraph: () => <PartyModeScreen variant="graph" />, partyCheckIn: () => <PartyModeScreen variant="checkin" />, attendees: EventAttendeesScreen, center: EventCenterScreen, rolesEditor: EventRolesScreen, admission: AdmissionFixture, analytics: AnalyticsFixture };
const Screen = screens[new URLSearchParams(location.search).get("screen")] || ContentFixture;
createRoot(document.getElementById("root")).render(<Screen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "event-boundaries", setup(plugin) {
      // Optional retrospective replay; never replaces the working production file.
      if (process.env.APP_STYLE_HOME_BASELINE === "1") plugin.onLoad({ filter: /\/src\/screens\/home\/HomeScreen\.tsx$/ }, () => ({ contents: readFileSync("../../.superpowers/sdd/2026-09-08-app-wide-style/baseline-src/screens/home/HomeScreen.tsx", "utf8"), loader: "tsx" }));
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(event-fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient|ApiBaseUrlProvider|AuthSessionProvider|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "event-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "event-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }]
  });
  server = createServer((_request, response) => { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(`<style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

async function open(t: { after: (fn: () => Promise<void>) => void }, screen: string, colorScheme: "light" | "dark" = "light"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 320, height: 874 }, colorScheme }); page.setDefaultTimeout(3000); t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.request().resourceType() === "image" ? route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#626874"/></svg>' }) : route.abort()); await page.goto(`${url}?screen=${screen}`); return page;
}
async function fits(control: Locator, minHeight = 44) { const box = (await control.boundingBox())!; assert.ok(box && box.height >= minHeight, `expected ${minHeight}pt target, got ${box?.height}`); assert.ok(box.x >= 0 && box.x + box.width <= 320, "control fits a 320pt phone"); }
async function unclipped(text: Locator) { assert.equal(await text.evaluate(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1), false, "important title or value must remain fully readable"); }
async function capture(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-events-${name}.png`, fullPage: true }); }

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: final inset event readiness, suggestion, opener and follow-up draft retain their boundaries`, async t => {
    const page = await open(t, "detail&insets=true", scheme);
    const panels = [
      page.getByText("认识东京采购负责人", { exact: true }).first().locator("..").locator(".."),
      page.getByRole("button", { name: /先了解采购需求/ }),
      page.getByText("贵团队今年有哪些采购计划？", { exact: true }).locator("..").locator(".."),
      page.getByText("很高兴现场讨论采购合作。", { exact: true }).locator("..")
    ];
    const radii = []; for (const panel of panels) { await panel.waitFor(); radii.push(await panel.evaluate(el => getComputedStyle(el).borderRadius)); }
    await page.getByRole("button", { name: /先了解采购需求/ }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    assert.deepEqual(radii, ["12px", "12px", "12px", "12px"], "readinessGoal, goalSuggestionCard, openingLineBox, postEventDraftBox");
  });
  test(`${scheme}: final inset attendee note, saved evidence and match render through real handlers`, async t => {
    const page = await open(t, "attendees&insets=true", scheme);
    const note = page.getByText("现场记录", { exact: true }).locator("..");
    const match = page.getByText("可以一起讨论零售合作", { exact: true }).locator("..");
    const radii = [await note.evaluate(el => getComputedStyle(el).borderRadius), await match.evaluate(el => getComputedStyle(el).borderRadius)];
    const input = page.getByPlaceholder("聊到了什么、对方想找什么、下一步怎么跟。");
    await input.fill("现场确认采购需求"); await page.getByRole("button", { name: "保存现场记录", exact: true }).click();
    const evidence = page.getByText("记录已保存", { exact: true }).locator(".."); await evidence.waitFor();
    radii.push(await evidence.evaluate(el => getComputedStyle(el).borderRadius));
    assert.equal(await input.inputValue(), "");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "POST", path: "/api/events/event%3Astyle/encounters", body: { contactId: "contact:generated:participant:sato", noteText: "现场确认采购需求" } }]);
    assert.deepEqual(radii, ["12px", "12px", "12px"], "encounterBox, matchBlock, evidenceBox");
  });
  test(`${scheme}: final inset persona preview follows the controlled interview without registering`, async t => {
    const page = await open(t, "registration&insets=true", scheme);
    await page.getByRole("button", { name: "下一题", exact: true }).click();
    await page.getByText("你想认识哪类采购伙伴？", { exact: true }).waitFor();
    await page.getByPlaceholder("写一句具体的补充。").last().fill("希望认识东京采购负责人");
    await page.getByRole("button", { name: "生成活动画像", exact: true }).click();
    const persona = page.getByText("连接东京采购合作伙伴", { exact: true }).locator(".."); await persona.waitFor();
    const requests = await page.evaluate(() => (window as any).fixture.requests);
    assert.deepEqual(requests.map((r: any) => [r.method, r.path]), [["POST", "/api/events/event%3Astyle/registration/interview"], ["POST", "/api/events/event%3Astyle/registration/persona"]]);
    assert.deepEqual(requests[1].body.transcript, [{ answer: "希望认识东京采购负责人", field: "targetAttendees", prompt: "你想认识哪类采购伙伴？" }]);
    assert.equal(await persona.evaluate(el => getComputedStyle(el).borderRadius), "12px", "personaPreview");
  });
  test(`${scheme}: final inset party match and unavailable ticket keep their semantic boundaries`, async t => {
    const page = await open(t, "party&insets=true", scheme);
    const match = page.getByText("可以一起讨论零售合作", { exact: true }).locator("..");
    const ticket = page.getByText("未生成签到码", { exact: true }).locator("..");
    assert.deepEqual([await match.evaluate(el => getComputedStyle(el).borderRadius), await ticket.evaluate(el => getComputedStyle(el).borderRadius)], ["12px", "12px"], "matchRow, ticketCompact");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: public event list preserves complete long title, date, venue and cover in open rows`, async t => {
    const page = await open(t, "events", scheme); const name = page.getByText(title, { exact: true }); await name.waitFor();
    await unclipped(name);
    const event = page.getByRole("button", { name: new RegExp(title) }); await fits(event);
    assert.equal(await event.locator("..").evaluate(el => getComputedStyle(el).borderTopWidth), "0px", "list has no enclosing card");
    assert.ok(await event.locator('img[src*="meeting.jpg"]').count() > 0);
    await unclipped(page.getByText(/东京国际交流中心三层/));
    await page.getByRole("button", { name: "筛选活动", exact: true }).click();
    const topic = page.getByRole("button", { name: "跨境商务", exact: true }); await fits(topic); await topic.click();
    assert.equal(await topic.getAttribute("aria-selected"), "true");
    await capture(page, `list-${scheme}`); await event.click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), [{ pathname: "/events/[id]", params: { id: "event:style" } }]);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  });
  test(`${scheme}: public event detail grows its cover title and keeps all destination actions accessible`, async t => {
    const page = await open(t, "detail", scheme); const name = page.getByText(title, { exact: true }); await name.waitFor(); await unclipped(name);
    const register = page.getByRole("button", { name: "报名参加", exact: true }); await fits(register, 50);
    assert.equal(await register.locator("..").evaluate(el => getComputedStyle(el).borderTopWidth), "0px", "registration summary is open");
    assert.ok(await page.locator('img[src*="meeting.jpg"]').count() > 0);
    await register.click(); await page.getByRole("button", { name: /^参会者/ }).click(); await page.getByRole("button", { name: /^现场/ }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/events/event%3Astyle/register", "/events/event%3Astyle/attendees", "/party?eventId=event%3Astyle"]);
    await capture(page, `detail-${scheme}`);
  });
}

test("registration options have full touch targets and failed submission preserves the selected answer", async t => {
  const page = await open(t, "registration", "dark"); const option = page.getByRole("button", { name: "日本本地 SaaS 买方", exact: true }); await fits(option); await option.click();
  const input = page.getByPlaceholder("写一句具体的补充。"); assert.equal(await input.inputValue(), "日本本地 SaaS 买方");
  const submit = page.getByRole("button", { name: "确认报名", exact: true }); await fits(submit, 50); await capture(page, "registration-dark"); await submit.click();
  await page.getByText("暂时无法保存，请重试", { exact: true }).waitFor(); assert.equal(await input.inputValue(), "日本本地 SaaS 买方");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "POST", path: "/api/events/event%3Astyle/registration", body: { answers: { targetAttendees: "日本本地 SaaS 买方" } } }]);
});

test("operations uses open sections and a 50pt publication action with unchanged generation identity", async t => {
  const page = await open(t, "operations"); const publish = page.getByRole("button", { name: /发布/ }); await fits(publish, 50);
  assert.equal(await page.getByText("AI 匹配与发布", { exact: true }).locator("..").locator("..").locator("..").evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
  for (const label of ["签到台", "活动分析", "角色"]) { const action = page.getByRole("button", { name: label, exact: true }); await fits(action); await action.click(); }
  await page.evaluate(() => (window as any).fixture.update({ busy: true })); assert.equal(await page.getByRole("button", { name: "正在处理", exact: true }).isDisabled(), true);
  await page.evaluate(() => (window as any).fixture.update({ busy: false })); await publish.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: "publish", generationId: "generation:01" }]); await capture(page, "operations");
  await page.evaluate(() => (window as any).fixture.update({ kind: "failure" })); await page.getByText("当前账号没有权限", { exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: /发布/ }).count(), 0);
});

test("roles keeps a long event title complete and offers management only for delegated members", async t => {
  const page = await open(t, "roles", "dark"); const name = page.getByText(title, { exact: true }); await name.waitFor(); await unclipped(name);
  await fits(page.getByRole("button", { name: "授予角色", exact: true }), 50);
  assert.equal(await page.getByRole("button", { name: "管理 actor:owner 的角色", exact: true }).count(), 0);
  const manage = page.getByRole("button", { name: "管理 actor:staff 的角色", exact: true }); await fits(manage); await manage.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: "edit", actor: "actor:staff", revision: 2 }]); await capture(page, "roles-dark");
});

test("check-in keeps filters, search and a bounded primary action without reopening completed arrivals", async t => {
  const page = await open(t, "check-in"); const action = page.getByRole("button", { name: "将 佐藤 葵 标记为已签到", exact: true }); await fits(action, 50);
  assert.equal(await page.getByRole("button", { name: "李 明 已签到", exact: true }).isDisabled(), true);
  const pending = page.getByRole("button", { name: "未签到 1", exact: true }); await fits(pending); await pending.click(); assert.equal(await page.getByText("李 明", { exact: true }).count(), 0);
  await page.getByRole("textbox", { name: "按姓名搜索参会者" }).fill("佐藤"); await action.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ action: "check-in", id: "participant:sato" }]); await capture(page, "check-in");
});

test("event actions and identity reflow under doubled browser text at 320pt", async t => {
  for (const screen of ["detail", "registration", "roles", "check-in", "operations"]) {
    const page = await open(t, screen, "dark"); await page.getByRole("button").first().waitFor();
    await page.evaluate(() => document.querySelectorAll("[dir='auto'],input,textarea").forEach(node => { const el = node as HTMLElement, s = getComputedStyle(el); el.style.fontSize = `${parseFloat(s.fontSize) * 2}px`; el.style.lineHeight = `${parseFloat(s.lineHeight) * 2}px`; }));
    for (const action of await page.getByRole("button").all()) { await fits(action); for (const label of await action.locator("[dir='auto']").all()) await unclipped(label); }
    if (screen === "detail" || screen === "roles") await unclipped(page.getByText(title, { exact: true }));
    await capture(page, `${screen}-large-dark`);
  }
});

test("signed-in event recommendations preserve real covers and horizontally reveal bounded actions", async t => {
  const page = await open(t, "events&recommendations=true", "dark");
  await page.getByText("为你推荐", { exact: true }).waitFor();
  const first = page.getByRole("button", { name: "记下推荐", exact: true }).first();
  const card = first.locator("..").locator("..").locator("..");
  const box = (await card.boundingBox())!;
  assert.ok(box.width <= 276 && box.x >= 0 && box.x + box.width <= 320);
  await fits(first, 50); await unclipped(card.getByText(title, { exact: true }));
  assert.ok(await card.locator('img[src*="meeting.jpg"]').count() > 0);
  const rail = card.locator("..").locator("..");
  assert.equal(await rail.evaluate(el => el.scrollWidth > el.clientWidth), true, "the second recommendation remains reachable by horizontal scrolling");
  await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const last = page.getByRole("button", { name: "记下推荐", exact: true }).last();
  await fits(last, 50); await last.click();
  await page.getByText("暂时无法保存，请重试", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "POST", path: "/api/recommendations/events/event%3Asecond/accept", body: undefined }]);
  await capture(page, "recommendations-dark");
});

test("personal event collection keeps long cover content and usable search and filters", async t => {
  const page = await open(t, "home", "dark"); await page.getByText(title, { exact: true }).waitFor(); await unclipped(page.getByText(title, { exact: true }));
  assert.ok(await page.locator('img[src*="meeting.jpg"]').count() > 0);
  await page.getByText(title, { exact: true }).evaluate(node => { const el = node as HTMLElement, s = getComputedStyle(el); el.style.fontSize = `${parseFloat(s.fontSize) * 2}px`; el.style.lineHeight = `${parseFloat(s.lineHeight) * 2}px`; });
  await unclipped(page.getByText(title, { exact: true }));
  for (const action of await page.getByRole("button").all()) await fits(action);
  await page.getByText(title, { exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/events/event%3Astyle"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []); await capture(page, "home-dark");
});

test("personal event collection renders its page identity once, without a duplicate eyebrow", async t => {
  const page = await open(t, "home");
  await page.getByText(title, { exact: true }).waitFor();
  assert.equal(await page.getByText("我的活动", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("heading", { name: "我的活动", exact: true }).count(), 1);
});

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: real Home hub keeps profile, pipeline, prompts and entries readable with doubled text at 320pt`, async t => {
    const page = await open(t, "homeHub", scheme);
    await page.getByText("有什么可以帮你？", { exact: true }).waitFor();
    await page.evaluate(() => document.querySelectorAll("[dir='auto'],input,textarea").forEach(node => { const el = node as HTMLElement, s = getComputedStyle(el); el.style.fontSize = `${parseFloat(s.fontSize) * 2}px`; el.style.lineHeight = `${parseFloat(s.lineHeight) * 2}px`; }));
    for (const text of ["有什么可以帮你？", "别人会看到的资料", "认识日本零售伙伴", "负责日本零售市场的合作伙伴拓展。", "日本市场合作伙伴拓展负责人", "跨境零售与企业软件合作", "Asia/Tokyo", "日本渠道资源", "零售采购伙伴", "企业软件合作", "今天我应该先联系谁？", "帮我准备最近一场活动", "有哪些人适合互相介绍？", "通用画像", "名片夹", "日程安排", title]) {
      const value = page.getByText(text, { exact: true }); await unclipped(value);
      const box = (await value.boundingBox())!; assert.ok(box.x >= 0 && box.x + box.width <= 320, `${text} fits the phone`);
    }
    for (const [label, value, detail] of [["活动", "1", "需要准备与复盘"], ["人脉", "2", "可触达关系"], ["推进中", "1", "今天优先处理"]]) {
      const cell = page.getByText(label!, { exact: true }).locator("..");
      assert.equal(await cell.getByText(value!, { exact: true }).count(), 1);
      await unclipped(cell.getByText(value!, { exact: true })); await unclipped(cell.getByText(label!, { exact: true })); await unclipped(cell.getByText(detail!, { exact: true }));
      const box = (await cell.boundingBox())!; assert.ok(box.x >= 0 && box.x + box.width <= 320);
    }
    for (const action of await page.getByRole("button").all()) await fits(action);
    await fits(page.getByPlaceholder("问人脉、活动、待办或日程"));
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    await capture(page, `home-hub-large-${scheme}`);
  });
}

test("real Home hub validates and trims AI input, routes prompts and destinations, and performs no writes", async t => {
  const page = await open(t, "homeHub", "dark");
  const input = page.getByPlaceholder("问人脉、活动、待办或日程"); const send = page.getByRole("button", { name: "发送给 iOrbit", exact: true });
  await input.fill("   "); await send.click();
  await page.getByText("先输入你想让 Orbit AI 判断的问题。", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), []);
  await input.fill("  帮我安排日本合作伙伴会面  "); await send.click();
  assert.equal(await input.inputValue(), ""); assert.equal(await page.getByText("先输入你想让 Orbit AI 判断的问题。", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "帮我准备最近一场活动", exact: true }).click();
  await page.getByRole("button", { name: "通用画像", exact: true }).click();
  await page.getByRole("button", { name: "名片夹", exact: true }).click();
  await page.getByRole("button", { name: "日程安排", exact: true }).click();
  await page.getByText("别人会看到的资料", { exact: true }).click();
  await page.getByRole("button", { name: "全部", exact: true }).click(); await page.getByText(title, { exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), [
    { params: { id: "new", initialMessage: "帮我安排日本合作伙伴会面" }, pathname: "/ai/[id]" },
    { params: { id: "new", initialMessage: "帮我准备最近一场活动" }, pathname: "/ai/[id]" },
    "/profile", "/contacts", "/schedule", "/profile", "/home/events", "/events/event%3Astyle"
  ]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

test("organizer public cover and invite preparation preserve destinations without a registration write", async t => {
  const organizer = await open(t, "organizer"); await organizer.getByText(title, { exact: true }).waitFor(); await unclipped(organizer.getByText(title, { exact: true }));
  for (const action of await organizer.getByRole("button").all()) await fits(action);
  await organizer.getByText(title, { exact: true }).click(); assert.deepEqual(await organizer.evaluate(() => (window as any).fixture.navigation), ["/events/event%3Astyle"]); await capture(organizer, "organizer");
  const invite = await open(t, "invite", "dark"); await invite.getByText(title, { exact: true }).waitFor();
  for (const action of await invite.getByRole("button").all()) await fits(action);
  assert.deepEqual(await invite.evaluate(() => (window as any).fixture.requests), []); await capture(invite, "invite-dark");
});

test("party variants and attendee content preserve real identity, routes and read-only arrival status", async t => {
  for (const screen of ["party", "partyGraph", "partyCheckIn", "attendees"]) {
    const page = await open(t, screen, "dark"); await page.getByText(title, { exact: true }).first().waitFor();
    for (const action of await page.getByRole("button").all()) await fits(action);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    if (screen === "partyGraph") await page.getByText("佐藤 葵", { exact: true }).first().waitFor();
    await capture(page, screen);
  }
});

test("event center gives the phase action its own row and keeps all secondary destinations readable", async t => {
  const page = await open(t, "center"); const primary = page.getByRole("button", { name: `查看活动分析：${title}`, exact: true }); await fits(primary, 50);
  assert.equal((await primary.boundingBox())!.width, 276, "phase action occupies its own row at 320pt");
  const destinations = [[`查看活动分析：${title}`, "/events/event%3Astyle/analytics"], [`管理活动角色：${title}`, "/events/event%3Astyle/operations/roles"], [`打开活动运营台：${title}`, "/events/event%3Astyle/operations"], [`查看活动：${title}`, "/events/event%3Astyle"]] as const;
  for (const [name, path] of destinations) { const action = page.getByRole("button", { name, exact: true }); await fits(action); await action.click(); assert.equal(await page.evaluate(() => (window as any).fixture.navigation.at(-1)), path); }
  await page.evaluate(() => document.querySelectorAll("[dir='auto']").forEach(node => { const el = node as HTMLElement, s = getComputedStyle(el); el.style.fontSize = `${parseFloat(s.fontSize) * 2}px`; el.style.lineHeight = `${parseFloat(s.lineHeight) * 2}px`; }));
  for (const action of await page.getByRole("button").all()) { await fits(action); for (const label of await action.locator("[dir='auto']").all()) await unclipped(label); }
  await capture(page, "center-large"); assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

test("role grant and edit screens keep inset inputs, read-only identity and failed-save drafts", async t => {
  const page = await open(t, "rolesEditor", "dark"); await page.getByRole("button", { name: "授予角色", exact: true }).click();
  const actor = page.getByRole("textbox", { name: "账号 ID", exact: true }); const reason = page.getByRole("textbox", { name: "授权、变更或撤销原因", exact: true });
  await fits(actor); await fits(reason); await actor.fill("actor:guest"); await reason.fill("负责合作伙伴接待");
  const save = page.getByRole("button", { name: "授予角色", exact: true }); await fits(save, 50);
  assert.equal(await actor.locator("..").locator("..").evaluate(el => getComputedStyle(el).borderRadius), "12px");
  for (const action of await page.getByRole("button").all()) await fits(action);
  await save.click(); await page.getByText("暂时无法保存，请重试", { exact: true }).waitFor(); assert.equal(await actor.inputValue(), "actor:guest"); assert.equal(await reason.inputValue(), "负责合作伙伴接待");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "GET", path: "/api/events/event%3Astyle/access/assignments/actor%3Aguest", body: undefined }]);
  await capture(page, "role-grant-dark"); await page.getByRole("button", { name: "返回角色列表", exact: true }).click();
  await page.getByRole("button", { name: "管理 actor:staff 的角色", exact: true }).click(); assert.equal(await actor.inputValue(), "actor:staff"); assert.equal(await actor.isEditable(), false);
  await fits(page.getByRole("button", { name: "更新角色", exact: true }), 50); await fits(page.getByRole("button", { name: "撤销当前角色", exact: true }));
  await reason.fill("交接现场签到职责"); await capture(page, "role-edit-dark");
});

test("admission queue opens the full profile and grows explicit decisions while preserving processed-state guards", async t => {
  const page = await open(t, "admission", "dark");
  for (const label of ["待审核", "已处理"]) { const tab = page.getByRole("tab", { name: label, exact: true }); await fits(tab); await tab.click(); }
  await page.getByRole("tab", { name: "待审核", exact: true }).click();
  const applicant = page.getByRole("button", { name: "查看 森爱子 的申请", exact: true }); await fits(applicant); await applicant.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["actor:aiko"]);
  await page.getByText("市场进入经验与产业引荐", { exact: true }).waitFor();
  const approve = page.getByRole("button", { name: "批准 森爱子 的报名", exact: true }); const reject = page.getByRole("button", { name: "拒绝 森爱子 的报名", exact: true });
  await fits(approve, 50); await fits(reject); await reject.click(); await approve.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ decision: "reject" }, { decision: "approve" }]);
  await page.evaluate(() => (window as any).fixture.update({ busy: true })); assert.equal(await approve.isDisabled(), true); assert.equal(await reject.isDisabled(), true);
  await capture(page, "admission-dark"); await page.evaluate(() => (window as any).fixture.update({ processed: true, busy: false }));
  await page.getByText(/此申请已处理/).waitFor(); assert.equal(await approve.count(), 0); assert.equal(await reject.count(), 0);
});

test("analytics keeps real fractions readable and exposes view switching only when both reports are available", async t => {
  const page = await open(t, "analytics"); const personal = page.getByRole("button", { name: "我的报告", exact: true }); await fits(personal); await personal.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["attendee_report"]);
  for (const heading of ["活动证据", "可解释比率", "联系证据", "约谈进展"]) {
    const text = page.getByText(heading, { exact: true }); assert.deepEqual(await text.evaluate(el => { const s = getComputedStyle(el); return [s.fontSize, s.lineHeight, s.fontWeight]; }), ["18px", "26px", "600"]);
  }
  const report = page.getByText("可解释比率", { exact: true }).locator("..");
  assert.match(await report.innerText(), /2.*4/s);
  await report.locator("[dir='auto']").evaluateAll(elements => elements.forEach(node => { const el = node as HTMLElement, s = getComputedStyle(el); el.style.fontSize = `${parseFloat(s.fontSize) * 2}px`; el.style.lineHeight = `${parseFloat(s.lineHeight) * 2}px`; }));
  for (const text of await report.locator("[dir='auto']").all()) await unclipped(text); await capture(page, "analytics-large");
  await page.evaluate(() => (window as any).fixture.update({ organizerAvailable: false })); assert.equal(await personal.count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ kind: "failure" })); await page.getByText("当前账号没有权限", { exact: true }).waitFor();
});
