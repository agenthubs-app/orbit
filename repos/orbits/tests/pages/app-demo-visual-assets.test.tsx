import assert from "node:assert/strict";
import test from "node:test";
import { getDemoEventSceneAsset } from "../../shared/demo-visual-assets";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { loadAppEventDetailRoute } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import {
  eventDetailRouteToOrbitLandingEventView,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { eventsRouteToOrbitLandingViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { EventDetail } from "../../app/(app)/app/events/events-0918/event-detail";
import { EventsList } from "../../app/(app)/app/events/events-0918/events-list";
import { PublicTopNav } from "../../app/(app)/app/orbit-public-shell";
import { OrbitStarfieldHome } from "../../app/(app)/app/orbit-starfield-home";

async function renderRootLanding(): Promise<string> {
  return renderToStaticMarkup(<OrbitStarfieldHome authenticated={false} />);
}

async function renderEventsPage(): Promise<string> {
  const routeModel = await loadAppEventsRouteViewModel();
  const unexpectedNavigation = () => assert.fail("Static image rendering must not navigate.");

  assert.equal(routeModel.state, "success");

  if (routeModel.state !== "success") {
    return "";
  }

  return renderToStaticMarkup(
    <AppRouterContext.Provider value={{
      back: unexpectedNavigation, forward: unexpectedNavigation,
      refresh: unexpectedNavigation, push: unexpectedNavigation,
      replace: unexpectedNavigation, prefetch: unexpectedNavigation,
    }}>
      <PathnameContext.Provider value="/app/events">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          {/* 与 events/page.tsx 接线一致：顶栏在页面层、列表在 events-0918 壳内。 */}
          <div data-orbit-real-page="events-0918">
            <PublicTopNav active="events" />
            <EventsList
              registrationAvailabilityByEventId={{}}
              viewModel={eventsRouteToOrbitLandingViewModel(routeModel)}
            />
          </div>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}

async function renderEventDetailPage(): Promise<string> {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState !== "success") {
    return "";
  }

  const artwork = getDemoEventSceneAsset("demo-event-1");
  assert.ok(artwork, "the known-artwork test needs an explicit local cover");
  return renderToStaticMarkup(
    <EventDetail
      event={{ ...eventDetailRouteToOrbitLandingEventView(routeModel), detailLogoUrl: artwork.src }}
    />,
  );
}

function assertImageMarkup(html: string, label: string): void {
  assert.match(
    html,
    /<img[^>]+src="\/orbit-demo-assets\//,
    `${label} should render manifest image URLs`,
  );
  assert.doesNotMatch(
    html,
    /<img(?=[^>]+src="\/orbit-demo-assets\/)[^>]*alt=""/,
    `${label} should not render empty alt text for manifest images`,
  );
  assert.doesNotMatch(
    html,
    /src="https?:\/\//,
    `${label} should not hotlink remote demo images`,
  );

  const assetTags = html.match(/<[^>]+data-demo-visual-asset-id="orbit-demo-[^"]+"[^>]*>/g) ?? [];

  assert.ok(
    assetTags.length > 0,
    `${label} should render manifest asset id markers`,
  );

  for (const tag of assetTags) {
    assert.match(
      tag,
      /data-demo-visual-source-label="Local relationship (?:scene|portrait)"/,
      `${label} should render relationship-specific source labels beside each manifest asset id`,
    );
    assert.doesNotMatch(
      tag,
      /AI-style|generated SVG/,
      `${label} should keep generation mechanics out of rendered asset source labels`,
    );
  }

  assert.doesNotMatch(
    html,
    /alt="[^"]*(?:AI-style|generated SVG)[^"]*"/,
    `${label} should keep generation mechanics out of image alt text`,
  );
}

function assertNamedBrandLink(html: string, label: string): void {
  assert.match(
    html,
    /<a[^>]+aria-label="Orbit"[^>]+class="[^"]*orbit-brand-link[^"]*"[^>]+href="\/"/,
    `${label} should expose an accessible Orbit home link`,
  );
}

test("root landing renders the local desktop and mobile starfield without remote images", async () => {
  const html = await renderRootLanding();

  assert.match(html, /data-orbit-real-page="starfield-home"/);
  assert.match(html, /class="sk-home-desktop"/);
  assert.match(html, /class="sk-home-mobile"/);
  assert.match(html, /<canvas/);
  assert.doesNotMatch(html, /src="https?:\/\//);
});

test("event list and event detail render manifest scene images", async () => {
  const listHtml = await renderEventsPage();
  const detailHtml = await renderEventDetailPage();

  assertImageMarkup(listHtml, "event list");
  assertImageMarkup(detailHtml, "event detail");
  assertNamedBrandLink(listHtml, "event list");
  assert.match(detailHtml, /data-demo-visual-asset-id="orbit-demo-event-/);

  const listImages = listHtml.match(/<img\b[^>]*>/g) ?? [];
  assert.ok(listImages.length > 2, "event list should exercise priority and deferred covers");
  assert.doesNotMatch(listImages[0], /loading="lazy"/);
  assert.doesNotMatch(listImages[1], /loading="lazy"/);
  assert.match(listImages[2], /loading="lazy"/);
  assert.match(listHtml, /data-orbit-progressive-image-lqip=""/);
  assert.match(listHtml, /background-image:url\(data:image\/webp;base64,/);
  assert.match(listHtml, /opacity:0;transition:opacity 220ms/);

  const detailImages: readonly string[] = detailHtml.match(/<img\b[^>]*>/g) ?? [];
  // This manifest cover is SVG: it scales without raster srcset variants.
  const artwork = getDemoEventSceneAsset("demo-event-1")!;
  const coverImages = detailImages.filter((tag) => tag.includes(`src="${artwork.src}"`));
  assert.equal(coverImages.length, 1, "known artwork should render once in the hero cover");
  assert.doesNotMatch(coverImages[0], /loading="lazy"/);
  for (const tag of coverImages) assert.match(tag, /data-nimg="fill"/);
  // The manifest uses SVG artwork, for which Next omits raster sizes/srcset.
  // Verify loading policy in the actual hero slot, not the old rail slot
  // (Orbit_0918: `ev-hero-cover` on the detail, `ev-recap-cover` on the recap state).
  const heroImage = detailHtml.match(/class="cover cover-grain ev-(?:hero|recap)-cover"[\s\S]*?(<img\b[^>]*>)/)?.[1];
  assert.ok(heroImage, "event detail must render responsive hero artwork");
  assert.doesNotMatch(heroImage, /loading="lazy"/);
  assert.match(detailHtml, /data-orbit-progressive-image-lqip=""/);
  assert.doesNotMatch(detailHtml, /background:radial-gradient\(120% 120%/);
});
