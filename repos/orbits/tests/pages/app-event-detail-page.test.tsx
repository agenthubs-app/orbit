import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppEventDetailRoute } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { eventDetailRouteToOrbitLandingEventView } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { OrbitRealEventDetail } from "../../app/(app)/app/events/[id]/orbit-real-event-detail";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function renderEventDetailPage(): Promise<string> {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") {
    return "";
  }

  return renderToStaticMarkup(
    <OrbitRealEventDetail
      event={eventDetailRouteToOrbitLandingEventView(routeModel)}
    />,
  );
}

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("event detail replaces the legacy surface with the green three-card journey", async () => {
  const html = await renderEventDetailPage();

  assert.match(html, /data-orbit-real-page="event-detail"/);
  assert.match(html, /data-event-journey-state="post"/);
  assert.match(html, /href="\/event-journey-green\.css"/);
  assert.match(html, /class="orbit-detail-layout"/);
  assert.match(html, /class="orbit-detail-rail"/);
  assert.match(html, /class="orbit-detail-main"/);
  assert.match(html, /class="card cardA"/);
  assert.match(html, /class="cardB"/);
  assert.match(html, /class="card cardC"/);
  assert.match(html, /class="rail-stage"/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Kanda Founders Table/);
  assert.match(html, /活动现场|Event floor/);
  assert.match(html, /会后中心|Post-event center/);
  assert.match(html, /向 iOrbit 询问这场活动|Ask iOrbit about this event/);
  assert.doesNotMatch(html, /Event workspace could not load/);
  assert.doesNotMatch(html, /<details/i);
});

test("event journey stylesheet owns responsive layout without the retired mobile composition", async () => {
  const html = await renderEventDetailPage();
  const css = source("public/event-journey-green.css");

  assert.doesNotMatch(html, /orbit-mobile-only/);
  assert.doesNotMatch(html, /orbit-sticky-cta/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Kanda Founders Table/);
  assert.match(html, /已结束|Ended/);
  assert.doesNotMatch(html, /data-collapsed="true"/);
});

test("event journey renders unregistered, registered, and ended as exclusive product states", async () => {
  const routeModel = await loadAppEventDetailRoute({ eventId: "demo-event-1", mode: "mock" });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") return;
  const event = eventDetailRouteToOrbitLandingEventView(routeModel);

  const pre = renderToStaticMarkup(<OrbitRealEventDetail event={{ ...event, status: "upcoming", stats: { ...event.stats, youRsvped: false }, youRsvped: false }} />);
  const joined = renderToStaticMarkup(<OrbitRealEventDetail event={{ ...event, status: "active", stats: { ...event.stats, youRsvped: true }, youRsvped: true }} workspaceAvailable />);
  const post = renderToStaticMarkup(<OrbitRealEventDetail event={{ ...event, status: "ended", stats: { ...event.stats, youRsvped: true }, youRsvped: true }} workspaceAvailable />);

  assert.match(pre, /data-event-journey-state="pre"/);
  assert.match(pre, /回答 2 题并报名|Answer 2 questions &amp; register/);
  assert.match(pre, /AI 示例|AI sample/);
  assert.match(joined, /data-event-journey-state="joined"/);
  assert.match(joined, /已报名|Registered/);
  assert.match(joined, /查看活动准备|进入活动|View event preparation|Enter event/);
  assert.match(post, /data-event-journey-state="post"/);
  assert.match(post, /已结束|Ended/);
  assert.doesNotMatch(post, /回答 2 题并报名|Answer 2 questions &amp; register/);
});

test("registered attendees can open the normal preparation workspace before the event starts", async () => {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") return;
  const event = eventDetailRouteToOrbitLandingEventView(routeModel);
  const html = renderToStaticMarkup(
    <OrbitRealEventDetail
      event={{
        ...event,
        status: "upcoming",
        stats: { ...event.stats, youRsvped: true },
        youRsvped: true,
      }}
      workspaceAvailable
    />,
  );

  assert.match(html, /查看活动准备|View event preparation/);
  assert.match(html, /class="btn btn-ghost"/);
  assert.doesNotMatch(html, />未开始<|>Not started</);
});

test("/app/events/[id] resolves public and authorized private details through canonical Event Core", () => {
  const pageSource = source("app/(app)/app/events/[id]/page.tsx");
  const matchmakingSource = source("app/(app)/app/events/[id]/orbit-event-matchmaking.tsx");

  assert.match(pageSource, /resolveConfiguredCanonicalEventDetailView/);
  assert.doesNotMatch(pageSource, /getOrbitLandingViewModel\(/);
  assert.doesNotMatch(pageSource, /resolveCanonicalPublicEventView/);
  assert.doesNotMatch(pageSource, /createEventCrudAndImportService/);
  assert.doesNotMatch(pageSource, /loadAppEventDetailRoute/);
  assert.doesNotMatch(pageSource, /loadAppEventsRouteViewModel/);
  assert.match(pageSource, /resolution\.state === "success"/);
  assert.doesNotMatch(pageSource, /Open organizer operations/);
  assert.match(matchmakingSource, /data-event-participant-directory/);
  assert.match(matchmakingSource, /所有已确认报名的人都在这里/);
  assert.match(matchmakingSource, /contactRequestsOpen/);
  assert.match(pageSource, /attendees: resolution\.registered \?/);
  assert.match(
    pageSource,
    /const \[\{ id: routeId \}, query, session\] = await Promise\.all/,
  );
  assert.match(pageSource, /auth\(\)/);
  assert.match(pageSource, /resolution\.state === "authentication_required"/);
  assert.match(pageSource, /actorId: session\?\.user\?\.id/);
  assert.doesNotMatch(pageSource, /readSearchParam\(query, "mode"\)/);
  assert.doesNotMatch(pageSource, /action: readSearchParam/);
  assert.doesNotMatch(pageSource, /targetContactId: readSearchParam/);
});
