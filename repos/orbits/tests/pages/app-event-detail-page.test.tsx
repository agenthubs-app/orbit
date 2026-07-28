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

test("event detail component renders the restored desktop hierarchy from one exact event identity", async () => {
  const html = await renderEventDetailPage();

  assert.match(html, /data-orbit-real-page="event-detail"/);
  assert.match(html, /class="orbit-desktop-only"/);
  assert.match(html, /class="orbit-detail-layout"/);
  assert.match(html, /class="orbit-detail-rail orbit-desktop-only"/);
  assert.match(html, /class="orbit-detail-main"/);
  assert.match(html, /class="orbit-info-grid"/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Kanda Founders Table/);
  assert.match(html, /Aiko Mori|Luis Ortega|Priya Shah/);
  assert.match(html, /报名|Registration/);
  assert.match(html, /参会者|Attendees/);
  assert.match(html, /当晚议程|Agenda/);
  assert.doesNotMatch(html, /Event workspace could not load/);
  assert.doesNotMatch(html, /<details/i);
});

test("event detail component keeps mobile detail content reachable without collapsed defaults", async () => {
  const html = await renderEventDetailPage();

  assert.match(html, /class="orbit-mobile-only"/);
  assert.match(html, /class="orbit-mobile-only orbit-sticky-cta"/);
  assert.match(html, /position:fixed/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Kanda Founders Table/);
  assert.match(html, /已结束|Ended/);
  assert.doesNotMatch(html, /hidden=""/);
  assert.doesNotMatch(html, /data-collapsed="true"/);
});

test("/app/events/[id] serves public catalogue first and protects only private fallback", () => {
  const pageSource = source("app/(app)/app/events/[id]/page.tsx");

  assert.match(pageSource, /getOrbitLandingViewModel/);
  assert.match(pageSource, /if \(catalogueEvent\)/);
  assert.match(pageSource, /attendees: registered \?/);
  assert.match(
    pageSource,
    /const \[\{ id: routeId \}, query, session\] = await Promise\.all/,
  );
  assert.match(pageSource, /auth\(\)/);
  assert.match(pageSource, /if \(!session\?\.user\?\.id\)/);
  assert.match(pageSource, /actorId: session\.user\.id/);
  assert.match(pageSource, /const routeMode = undefined/);
  assert.doesNotMatch(pageSource, /readSearchParam\(query, "mode"\)/);
  assert.doesNotMatch(pageSource, /action: readSearchParam/);
  assert.doesNotMatch(pageSource, /targetContactId: readSearchParam/);
});
