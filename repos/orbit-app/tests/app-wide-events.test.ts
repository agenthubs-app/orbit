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
// Sprint 0115: the device copy of the event day stays empty in this harness; the network read is authoritative.
export const useLocalEventDay = () => ({ records: { registrations: [], events: [], results: [] }, freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh() {} });

import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
import { readinessPayload, peoplePayload, reviewPayload } from "./tests/helpers/event-detail-fixtures";
import { attendeeFixture } from "./tests/helpers/attendee-operations-fixtures";
const listeners = new Set(); let revision = 0;
export const state = window.fixture = { requests: [], resourcePaths: [], navigation: [], kind: "success", busy: false, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(f => f()); } };
export const useFixture = () => { useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => revision); return state; };
const event = { id: "event:style", title: ${JSON.stringify(title)}, startsAt: "2026-12-19T09:00:00Z", endsAt: "2026-12-19T12:00:00Z", status: "imported", venue: "东京国际交流中心三层合作伙伴会议室", coverPath: "/orbit-covers/meeting.jpg", description: "围绕零售合作的现场交流。", organizer: "东京伙伴社区", feeLabel: "免费", stats: { youRsvped: false, attendeeCount: 24 } };
const registration = { registration: null, questionSet: { questions: [{ id: "target_attendees", intent: "target_attendees", optional: true, options: ["日本本地 SaaS 买方", "跨境渠道合作伙伴"], participantProfileField: "targetAttendees", prompt: "这场活动里，你最想认识哪类人？" }] } };
const recommendationMode = new URLSearchParams(location.search).get("recommendations") === "true";
const events = recommendationMode ? [event, { ...event, id: "event:second", title: "第二场东京伙伴交流会" }] : [event];
const recommendations = { state: "success", profile: { calendarFit: "open", goal: "拓展合作", industryPreference: "technology", location: "Tokyo" }, summary: "根据合作目标推荐活动", nextAction: "先看活动再确认安排", recommendations: events.map(e => ({ eventId: e.id, title: e.title, startsAt: e.startsAt, valueScore: 94, scoreBand: "high", venue: e.venue, location: "Tokyo", recommendedAction: "先看活动再确认安排", signals: [{ label: "目标一致", detail: "可以找到日本合作伙伴", weight: 1 }] })) };
const finalInsets = new URLSearchParams(location.search).get("insets") === "true";
const portraitRegistration = { ...registration, questionSet: { questions: [ ...registration.questionSet.questions.map(question => ({ ...question, portraitQuestionToken: "synthetic-formal:target" })), ...(finalInsets ? [{ id: "value_offered", intent: "value_offered", required: true, options: ["采购渠道引荐"], participantProfileField: "valueOffered", prompt: "你能提供什么帮助？", portraitQuestionToken: "synthetic-formal:value" }] : []) ] } };
const attendeeMode = new URLSearchParams(location.search).get("screen") === "attendees";
const signedIn = recommendationMode || finalInsets || attendeeMode || new URLSearchParams(location.search).get("screen") === "registration";
const profile = { profile: { displayName: "林悦", relationshipGoal: "认识日本零售伙伴" } };
const contacts = { contacts: [] };
const attendees = { event: { ...event, name: event.title }, attendees: [{ attendeeId: "participant:sato", displayName: "佐藤 葵", checkInStatus: "registered", organization: "东京零售协会", role: "合作负责人", relationshipContext: "共同关注日本市场", suggestedNextAction: "先当面确认合作时间", attendeeTags: [{ label: "零售合作" }], eligibleRecommendation: { isEligible: true, reasons: ["同样关注零售合作"], recommendationCandidateId: "recommendation:1", blockedByKnownContact: false } }] };
const rolePayload = { event: { eventId: "event:style", title: event.title }, members: [{ assignedAt: null, assignedByActorId: null, eventId: "event:style", reason: null, revision: 0, role: "owner", state: "active", subjectActorId: "actor:owner" }, { assignedAt: "2026-08-19T09:00:00Z", assignedByActorId: "actor:owner", eventId: "event:style", reason: "负责现场签到", revision: 2, role: "check_in", state: "active", subjectActorId: "actor:staff" }] };
const center = [{ endsAt: "2026-08-21T21:00:00+09:00", eventId: "event:style", lifecycleState: "published", migrationPending: false, owner: true, revision: 3, role: "owner", startsAt: "2026-08-21T18:00:00+09:00", title: event.title, venue: event.venue }];
const insetMatches = { matches: [{ matchId: "match:style", participantNames: ["佐藤 葵", "林悦"], successNotice: { title: "可以一起讨论零售合作", message: "双方均希望认识对方。" } }] };
// Retain the complete HTTP contracts while using this screen's event/attendee IDs.
const insetsPayload = payload => JSON.parse(JSON.stringify(payload).replaceAll("event:1", "event:style").replaceAll("attendee:li", "participant:sato"));
const insetReadiness = insetsPayload(readinessPayload);
const insetPeople = insetsPayload(peoplePayload);
const insetReview = insetsPayload(reviewPayload);
function insetData(path) {
  if (path.endsWith("/readiness")) return { ...insetReadiness, goal: { ...insetReadiness.goal, intent: "认识东京采购负责人" }, suggestedGoals: [{ ...insetReadiness.suggestedGoals[0], intent: "确认采购合作需求", label: "先了解采购需求", rationale: "已有零售渠道背景" }], readinessChecklist: [] };
  if (path.includes("/recommendations/event/")) return { ...insetPeople, recommendations: [{ ...insetPeople.recommendations[0], attendee: { ...insetPeople.recommendations[0].attendee, displayName: "佐藤 葵", organization: "东京零售协会", role: "合作负责人" }, score: 90, reasons: ["共同关注零售合作"], openingLine: { ...insetPeople.recommendations[0].openingLine, text: "贵团队今年有哪些采购计划？" }, recommendedAction: "先当面认识" }] };
  if (path.endsWith("/post-event")) return { ...insetReview, contacts: [{ ...insetReview.contacts[0], displayName: "佐藤 葵", summary: { ...insetReview.contacts[0].summary, headline: "现场讨论零售合作", whyNow: "已约好继续交流" }, followUpSuggestion: { ...insetReview.contacts[0].followUpSuggestion, messageDraft: "很高兴现场讨论采购合作。" } }] };
  if (path.includes("matches")) return insetMatches;
  if (path.includes("attendees")) return attendees;
}
export const useApiResource = path => { useFixture(); if (!state.resourcePaths.includes(path)) state.resourcePaths.push(path); return { kind: state.kind, data: (finalInsets ? insetData(path) : undefined) ?? (path.includes("recommendations/events") ? recommendations : path.endsWith("/center") ? center : path.endsWith("/access/roles") ? rolePayload : path.endsWith("/registration/portrait") ? { portrait: null, registrationSource: null } : path.includes("registration") ? portraitRegistration : path.includes("attendees") ? attendees : path.includes("matches") ? { matches: [] } : path.includes("contacts") ? contacts : path.includes("profile") ? profile : path.endsWith("/events/public") || path.endsWith("/events") ? { events } : { event }), error: { message: "当前账号没有权限" }, refreshing: false, refresh() {} }; };
export const useLocalSearchParams = () => ({ id: "event:style", eventId: "event:style", code: "event:style", slug: "event:style" });
export const usePathname = () => attendeeMode ? "/events/event%3Astyle/live" : "/events";
export const useIsFocused = () => true;
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
export const useOrbitAuthSession = () => ({ ready: true, signedIn, actorId: signedIn ? "account:style" : null, user: signedIn ? { id: "actor:style" } : null, cookieHeader: "" });
// Sprint 0131: the screen reads page copies / the device mirror; this harness tests the network path (no mirror).
export const useSyncedCollection = () => ({ status: "unsynced", error: null, lastSyncedAt: null, workspaceId: null, records: [], refresh: async () => null, invalidate: async () => null, currentSession: () => null });
export const useSyncCoordinatorSession = () => null;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture", ready: true });
const record = method => async (path, options) => {
  state.requests.push({ method, path, body: options?.body });
  if (method === "GET" && path.endsWith("/operations")) {
    const workspace = attendeeFixture(); workspace.eventId = "event:style"; workspace.configuration.eventId = "event:style";
    workspace.directory[1].displayName = "佐藤 葵";
    return { success: true, status: 200, data: workspace };
  }
  if (finalInsets && method === "POST") {
    if (path.endsWith("/encounters")) return { success: true, status: 200, data: { participant: { displayName: "佐藤 葵" }, encounter: { encounterId: "encounter:style" }, note: { text: "现场确认采购需求" }, evidenceDraft: {}, nextAction: "先复核现场记录" } };
    if (path.endsWith("/interview")) return { success: true, status: 200, data: { done: false, signedQuestion: { questionToken: "synthetic-signed:target", portraitAdaptiveToken: "synthetic-workspace:target", question: { field: "targetAttendees", prompt: "你想认识哪类采购伙伴？", options: [] } } } };
    if (path.endsWith("/persona")) return { success: true, status: 200, data: { generationToken: "synthetic-generation", answersVersion: "a".repeat(64), sourceRegistrationVersion: null, persona: { tagline: "连接东京采购合作伙伴", tags: ["零售合作"], industryTags: ["零售"], seeking: "采购负责人", offering: "本地渠道经验", openers: ["你正在寻找哪类渠道？"], energyStyle: "先倾听对方需求", provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } } } };
  }
  return { success: false, status: 503, error: { code: "SERVICE_UNAVAILABLE", message: "暂时无法保存，请重试" } };
};
const client = { post: record("POST"), put: record("PUT"), get: record("GET") };
export const useOrbitApiClient = () => client;
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size }} />;
export const useRelationshipInboxBadgeCount = () => 0;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React, { useState } from "react"; import { createRoot } from "react-dom/client";
import { AppScreen } from "./src/components/AppScreen";
import { HomeScreen } from "./src/screens/home/HomeScreen";
import { state, useFixture } from "event-fixture";
const screens = { home: () => <HomeScreen /> };
const Screen = screens[new URLSearchParams(location.search).get("screen")] || screens.home;
createRoot(document.getElementById("root")).render(<Screen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "event-boundaries", setup(plugin) {
      // Optional retrospective replay; never replaces the working production file.
      if (process.env.APP_STYLE_HOME_BASELINE === "1") plugin.onLoad({ filter: /\/src\/screens\/home\/HomeScreen\.tsx$/ }, () => ({ contents: readFileSync("../../.superpowers/sdd/2026-09-08-app-wide-style/baseline-src/screens/home/HomeScreen.tsx", "utf8"), loader: "tsx" }));
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(event-fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useApiResource|useOrbitApiClient|ApiBaseUrlProvider|AuthSessionProvider|useRelationshipInboxBadgeCount|useLocalEventDay|useSyncedCollection)$/ }, () => ({ path: "fixture", namespace: "event-test" }));
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
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.resourcePaths), ["/api/events/public"]);
});

