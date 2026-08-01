import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { loadAppContactsRouteViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { OrbitRealCardsList } from "../../app/(app)/app/contacts/orbit-real-contacts";
import { loadAppEventDetailRoute } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import {
  eventDetailRouteToOrbitLandingEventView,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { eventsRouteToOrbitLandingViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { OrbitRealEventDetail } from "../../app/(app)/app/events/[id]/orbit-real-event-detail";
import { OrbitRealExploreClient } from "../../app/(app)/app/events/orbit-real-explore-client";
import { OrbitStarfieldHome } from "../../app/(app)/app/orbit-starfield-home";

async function renderRootLanding(): Promise<string> {
  return renderToStaticMarkup(<OrbitStarfieldHome authenticated={false} />);
}

async function renderEventsPage(): Promise<string> {
  const routeModel = await loadAppEventsRouteViewModel();

  assert.equal(routeModel.state, "success");

  if (routeModel.state !== "success") {
    return "";
  }

  return renderToStaticMarkup(
    <OrbitRealExploreClient
      viewModel={eventsRouteToOrbitLandingViewModel(routeModel)}
    />,
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

  return renderToStaticMarkup(
    <OrbitRealEventDetail
      event={eventDetailRouteToOrbitLandingEventView(routeModel)}
    />,
  );
}

async function renderContactsPage(): Promise<string> {
  const routeModel = await loadAppContactsRouteViewModel();

  assert.equal(routeModel.state, "success");

  if (routeModel.state !== "success") {
    return "";
  }

  return renderToStaticMarkup(
    <OrbitRealCardsList
      viewModel={contactsRouteToOrbitContactsViewModel(routeModel)}
    />,
  );
}

async function renderContactDetailPage(): Promise<string> {
  const routeModel = await loadAppContactDetailRoute({
    contactId: "demo-contact-1",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState !== "success") {
    return "";
  }

  return renderToStaticMarkup(
    <OrbitRealCardConnection
      contactId="demo-contact-1"
      viewModel={contactDetailRouteToOrbitContactsViewModel(routeModel)}
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

  const detailImages = detailHtml.match(/<img\b[^>]*>/g) ?? [];
  assert.ok(detailImages.length >= 3, "event detail should render its responsive artwork surfaces");
  assert.doesNotMatch(detailImages[0], /loading="lazy"/);
  assert.doesNotMatch(detailImages[1], /loading="lazy"/);
  assert.match(detailImages[2], /loading="lazy"/);
  assert.match(detailHtml, /data-orbit-progressive-image-lqip=""/);
  assert.doesNotMatch(detailHtml, /background:radial-gradient\(120% 120%/);
});

test("contact list and contact detail render manifest avatar images", async () => {
  const listHtml = await renderContactsPage();
  const detailHtml = await renderContactDetailPage();

  assertImageMarkup(listHtml, "contact list");
  assertImageMarkup(detailHtml, "contact detail");
  assertNamedBrandLink(detailHtml, "contact detail");
  assert.match(listHtml, /data-demo-visual-asset-id="orbit-demo-avatar-/);
  assert.match(detailHtml, /data-demo-visual-asset-id="orbit-demo-avatar-/);
  assert.match(listHtml, /data-orbit-progressive-image-lqip=""/);
  assert.match(detailHtml, /data-orbit-progressive-image-lqip=""/);
  assert.match(
    listHtml,
    /data-demo-visual-asset-id="orbit-demo-avatar-[^"]+"[^>]+background:var\(--surface-3\)/,
  );
  assert.match(
    detailHtml,
    /data-demo-visual-asset-id="orbit-demo-avatar-[^"]+"[^>]+background:var\(--surface-3\)/,
  );
});
