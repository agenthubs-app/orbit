import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppEventDetailRoute } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { eventDetailRouteToOrbitLandingEventView } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { EventDetail } from "../../app/(app)/app/events/events-0918/event-detail";

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
    <EventDetail
      event={eventDetailRouteToOrbitLandingEventView(routeModel)}
    />,
  );
}

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("event detail renders the Orbit_0918 hero and tabbed sections", async () => {
  // demo-event-1 has ended → the recap state (design 521–580) renders by default.
  const recap = await renderEventDetailPage();

  assert.match(recap, /data-events-view="recap"/);
  assert.match(recap, /data-event-journey-state="post"/);
  assert.match(recap, /class="cover cover-grain ev-recap-cover"/);
  assert.match(recap, /class="ev-recap-copy"/);
  assert.match(recap, /class="ev-tabs"/);
  assert.match(recap, /class="btn ev-tab ev-tab-on"/);
  assert.match(recap, /class="ev-recap-card"/);
  assert.match(recap, /Climate founders dinner/);
  assert.match(recap, /回顾|Recap/);
  assert.match(recap, /参会者|Attendees/);
  assert.match(recap, /交流记录|Notes/);
  assert.match(recap, /生成总结|Summary/);
  assert.match(recap, /向 iOrbit 询问这场活动|Ask iOrbit about this event/);
  assert.doesNotMatch(recap, /Event workspace could not load/);
  assert.doesNotMatch(recap, /<details/i);

  // The same event while still upcoming → the detail state (design 141–219).
  const routeModel = await loadAppEventDetailRoute({ eventId: "demo-event-1", mode: "mock" });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") return;
  const event = eventDetailRouteToOrbitLandingEventView(routeModel);
  const detail = renderToStaticMarkup(<EventDetail event={{ ...event, status: "upcoming" }} />);

  assert.match(detail, /data-events-view="detail"/);
  assert.match(detail, /class="cover cover-grain ev-hero-cover"/);
  assert.match(detail, /class="ev-hero-copy"/);
  assert.match(detail, /class="ev-tabs"/);
  assert.match(detail, /class="ev-card-panel/);
  assert.match(detail, /Climate founders dinner/);
  assert.match(detail, /Kanda Founders Table/);
  assert.match(detail, /介绍|About/);
  assert.match(detail, /议程|Agenda/);
  assert.match(detail, /参会者|Attendees/);
  assert.match(detail, /主办方|Organizer/);
  assert.match(detail, /线下活动|In person/);
  assert.match(detail, /已确认|Confirmed/);
  assert.match(detail, /日历已同步|Calendar synced/);
  assert.doesNotMatch(detail, />live<|>confirmed<|>calendar_sync</);
  // Design mock strings must never leak into the real page.
  for (const html of [recap, detail]) {
    assert.doesNotMatch(html, /Tokyo AI Community|Tokyo Innovation Hub|山本健|Robert Chen|Sakana AI/);
  }
});

test("event detail scoped styles own the responsive layout without the retired journey stylesheet", async () => {
  const html = await renderEventDetailPage();
  const detailSource = source("app/(app)/app/events/events-0918/event-detail.tsx");
  // Orbit_0918: one shared stylesheet (EVENTS_STYLES in events-shell.tsx), all `ev-*`.
  const shellSource = source("app/(app)/app/events/events-0918/events-shell.tsx");

  assert.doesNotMatch(html, /orbit-mobile-only/);
  assert.doesNotMatch(html, /orbit-sticky-cta/);
  assert.doesNotMatch(detailSource, /event-journey-green\.css/);
  assert.match(detailSource, /EVENTS_STYLES/);
  assert.match(shellSource, /@media \(max-width: 760px\)/);
  assert.match(shellSource, /prefers-reduced-motion/);
  assert.match(shellSource, /\[data-orbit-real-page="events-0918"\] \.ev-hero /);
  assert.match(shellSource, /\[data-orbit-real-page="events-0918"\] \.ev-recap-grid /);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /已结束|Ended/);
  assert.doesNotMatch(html, /data-collapsed="true"/);
});

test("event journey renders unregistered, registered, and ended as exclusive product states", async () => {
  const routeModel = await loadAppEventDetailRoute({ eventId: "demo-event-1", mode: "mock" });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") return;
  const event = eventDetailRouteToOrbitLandingEventView(routeModel);

  const pre = renderToStaticMarkup(<EventDetail event={{ ...event, status: "upcoming", stats: { ...event.stats, youRsvped: false }, youRsvped: false }} registrationAvailability="open" />);
  const joined = renderToStaticMarkup(<EventDetail event={{ ...event, status: "active", stats: { ...event.stats, youRsvped: true }, youRsvped: true }} />);
  const post = renderToStaticMarkup(<EventDetail event={{ ...event, status: "ended", stats: { ...event.stats, youRsvped: true }, youRsvped: true }} />);

  assert.match(pre, /data-event-journey-state="pre"/);
  assert.match(pre, />立即报名<|>Register now</);
  assert.doesNotMatch(pre, /role="tab" type="button">(?:参会者|Attendees)</);
  assert.doesNotMatch(pre, /data-events-panel="people"/);
  assert.doesNotMatch(pre, /data-event-participant-directory/);
  assert.doesNotMatch(pre, /修改报名信息|Edit registration/);
  assert.match(joined, /data-event-journey-state="joined"/);
  assert.match(joined, /进入活动现场|Enter live/);
  assert.match(joined, /修改报名信息|Edit registration/);
  assert.match(joined, /\/live"/);
  assert.match(post, /data-event-journey-state="post"/);
  assert.match(post, /data-events-view="recap"/);
  assert.match(post, /已结束|Ended/);
  assert.doesNotMatch(post, /回答 2 题并报名|Answer 2 questions &amp; register/);
});

test("registered attendees get the edit-registration link before the event starts", async () => {
  // Orbit_0918 (plan CTA table): registered + upcoming → 「修改报名信息」 (design 161) to /register;
  // the live entry only appears once the event is active.
  const routeModel = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") return;
  const event = eventDetailRouteToOrbitLandingEventView(routeModel);
  const html = renderToStaticMarkup(
    <EventDetail
      event={{
        ...event,
        status: "upcoming",
        stats: { ...event.stats, youRsvped: true },
        youRsvped: true,
      }}
      registrationAvailability="open"
    />,
  );

  assert.match(html, /修改报名信息|Edit registration/);
  assert.match(html, /class="btn ev-cta-secondary" data-events-cta="modify" href="\/app\/events\/[^"]+\/register"/);
  assert.doesNotMatch(html, /\/live"/);
  assert.doesNotMatch(html, />未开始<|>Not started</);
});

test("an upcoming event without a window never implies that registration is open", async () => {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") return;
  const event = eventDetailRouteToOrbitLandingEventView(routeModel);
  const html = renderToStaticMarkup(
    <EventDetail
      event={{
        ...event,
        status: "upcoming",
        stats: { ...event.stats, youRsvped: false },
        youRsvped: false,
      }}
    />,
  );

  assert.match(html, /报名|Register/);
  assert.match(html, /暂时无法确认报名状态|Registration status unavailable/);
  assert.match(html, /aria-disabled="true" class="btn ev-cta-primary ev-cta-disabled" data-events-cta="closed"/);
  assert.doesNotMatch(html, /立即报名|Register now|报名中|Registration open/);
  assert.doesNotMatch(html, /报名暂不可用|Registration unavailable/);
  assert.doesNotMatch(html, /开放报名时提醒我|Remind me when registration opens/);
  assert.doesNotMatch(html, /查看其他可报名活动|View other events accepting registration/);
});

test("event detail renders independent nullable count and capacity facts", async () => {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") return;
  const base = eventDetailRouteToOrbitLandingEventView(routeModel);
  const render = (
    participantCount: number | null,
    cap: number | null | undefined,
  ) =>
    renderToStaticMarkup(
      <EventDetail
        event={{
          ...base,
          cap,
          participantCount,
          stats: { ...base.stats, count: participantCount, youRsvped: false },
          status: "upcoming",
          youRsvped: false,
        }}
        registrationAvailability="open"
      />,
    );

  // Orbit_0918 hero (design 157 「{n} {nLabel}」): an unknown count omits the row instead of
  // implying 0; capacity is an independent tag (design has no seats-left badge → omitted).
  const unknownCount = render(null, 8);
  assert.doesNotMatch(unknownCount, /ev-info-icon">◌/);
  assert.match(unknownCount, /限 8 人/);
  assert.match(unknownCount, /立即报名/);
  assert.doesNotMatch(unknownCount, /null|剩 8 席|人已报名/);

  const realZero = render(0, 8);
  assert.match(realZero, /0 \/ 8 人已报名/);

  const unlimited = render(3, null);
  assert.match(unlimited, /3 人已报名/);
  assert.match(unlimited, /不设人数上限/);
  assert.doesNotMatch(unlimited, /null|剩/);

  const zeroCapacity = render(0, 0);
  assert.match(zeroCapacity, /0 \/ 0 人已报名/);
  assert.match(zeroCapacity, /限 0 人/);

  const unknownCapacity = render(0, undefined);
  assert.match(unknownCapacity, /0 人已报名/);
  assert.doesNotMatch(unknownCapacity, /限 \d+ 人|不设人数上限|剩 \d+ 席/);
});

