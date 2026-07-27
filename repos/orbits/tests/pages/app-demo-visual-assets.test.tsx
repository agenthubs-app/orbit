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
  eventDetailRouteToRelationshipContextView,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { eventsRouteToOrbitLandingViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { OrbitRealEventDetail } from "../../app/(app)/app/events/[id]/orbit-real-event-detail";
import { OrbitRealExploreClient } from "../../app/(app)/app/events/orbit-real-explore-client";

async function renderRootLanding(): Promise<string> {
  const Page = (await import("../../app/page")).default as (props: {
    searchParams?: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;

  return renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({ language: "en" }),
    }),
  );
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
      relationshipContext={eventDetailRouteToRelationshipContextView(routeModel)}
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
    /<a[^>]+class="[^"]*orbit-brand-link[^"]*"[^>]*>[\s\S]*?(?:Back to Orbit home|返回 Orbit 首页|返回应用首页)[\s\S]*?<\/a>/,
    `${label} should include hidden text in icon-only brand links`,
  );
}

test("root landing activity and event cards render manifest images with alt text", async () => {
  const html = await renderRootLanding();

  assertImageMarkup(html, "root landing");
  assert.match(html, /data-demo-visual-asset-id="orbit-demo-event-/);
  assert.match(html, /data-demo-visual-asset-id="orbit-demo-avatar-/);
});

test("event list and event detail render manifest scene and avatar images", async () => {
  const listHtml = await renderEventsPage();
  const detailHtml = await renderEventDetailPage();

  assertImageMarkup(listHtml, "event list");
  assertImageMarkup(detailHtml, "event detail");
  assertNamedBrandLink(listHtml, "event list");
  assert.match(detailHtml, /data-demo-visual-asset-id="orbit-demo-event-/);
  assert.match(detailHtml, /data-demo-visual-asset-id="orbit-demo-avatar-/);
});

test("contact list and contact detail render manifest avatar images", async () => {
  const listHtml = await renderContactsPage();
  const detailHtml = await renderContactDetailPage();

  assertImageMarkup(listHtml, "contact list");
  assertImageMarkup(detailHtml, "contact detail");
  assertNamedBrandLink(detailHtml, "contact detail");
  assert.match(listHtml, /data-demo-visual-asset-id="orbit-demo-avatar-/);
  assert.match(detailHtml, /data-demo-visual-asset-id="orbit-demo-avatar-/);
});
