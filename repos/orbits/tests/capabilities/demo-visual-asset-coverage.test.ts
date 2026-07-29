import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  demoVisualAssetManifest,
  getDemoEventSceneAsset,
  getDemoPersonAvatarAsset,
} from "../../shared/demo-visual-assets";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { loadAppContactsRouteViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { loadAppEventDetailRoute } from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import {
  eventDetailRouteToOrbitLandingEventView,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { getOrbitLandingViewModel } from "../../app/(app)/app/orbit-landing-route-view-model";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function assertLocalAssetFile(src: string): void {
  assert.match(src, /^\/orbit-demo-assets\//);
  assert.equal(
    existsSync(join(projectRoot, "public", src)),
    true,
    `${src} should exist under public/orbit-demo-assets`,
  );
}

function assertEventAsset(recordId: string): void {
  const asset = getDemoEventSceneAsset(recordId);

  assert.ok(asset, `missing event scene asset for ${recordId}`);
  assert.equal(asset.kind, "event-scene");
  assert.equal(asset.recordType, "event");
  assert.equal(asset.recordId, recordId);
  assert.ok(asset.assetId.startsWith("orbit-demo-event-"));
  assert.ok(asset.alt.trim().length > 12);
  assert.ok(asset.sourceLabel.trim().length > 0);
  assertLocalAssetFile(asset.src);
}

function assertPersonVisualSafety(input: {
  displayName?: string;
  recordId?: string;
}): void {
  const asset = getDemoPersonAvatarAsset(input);

  if (!asset) {
    return;
  }

  assert.equal(asset.kind, "avatar");
  assert.equal(asset.recordType, "person");
  assert.ok(asset.assetId.startsWith("orbit-demo-avatar-"));
  assert.ok(asset.alt.trim().length > 12);
  assert.ok(asset.sourceLabel.trim().length > 0);
  if (input.displayName && asset.displayName) {
    assert.equal(
      asset.displayName.trim().replace(/\s+/g, " ").toLowerCase(),
      input.displayName.trim().replace(/\s+/g, " ").toLowerCase(),
      `avatar ${asset.assetId} must not be reused for a different person`,
    );
  }
  assertLocalAssetFile(asset.src);
}

test("demo visual asset manifest uses stable local event and avatar records", () => {
  assert.equal(demoVisualAssetManifest.version, "sprint-96-demo-visual-assets");
  assert.ok(demoVisualAssetManifest.assets.length > 0);

  const assetIds = new Set<string>();

  for (const asset of demoVisualAssetManifest.assets) {
    assert.equal(assetIds.has(asset.assetId), false, `${asset.assetId} should be unique`);
    assetIds.add(asset.assetId);
    assert.match(asset.assetId, /^orbit-demo-(event|avatar)-[a-z0-9-]+$/);
    assert.ok(asset.recordId.trim().length > 0);
    assertLocalAssetFile(asset.src);
    assert.ok(asset.alt.trim().length > 12);
    assert.ok(asset.sourceLabel.trim().length > 0);
  }
});

test("asset manifest covers every displayed demo event across root, events, and detail surfaces", async () => {
  const rootLanding = getOrbitLandingViewModel();
  const appEvents = await loadAppEventsRouteViewModel();
  const eventDetail = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });

  assert.equal(appEvents.state, "success");
  assert.equal(eventDetail.routeState, "success");

  if (appEvents.state !== "success" || eventDetail.routeState !== "success") {
    return;
  }

  const detailEvent = eventDetailRouteToOrbitLandingEventView(eventDetail);
  const eventIds = new Set([
    ...rootLanding.events.map((event) => event.id),
    ...appEvents.workspace.eventChoices.map((event) => event.id),
    detailEvent.id,
  ]);

  assert.ok(eventIds.size > 0);

  for (const eventId of eventIds) {
    assertEventAsset(eventId);
  }
});

test("displayed people only receive an exact curated avatar; others safely use the initials fallback", async () => {
  const rootLanding = getOrbitLandingViewModel();
  const contacts = await loadAppContactsRouteViewModel();
  const eventDetail = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });
  const contactDetail = await loadAppContactDetailRoute({
    contactId: "demo-contact-1",
    mode: "mock",
  });

  assert.equal(contacts.state, "success");
  assert.equal(eventDetail.routeState, "success");
  assert.equal(contactDetail.routeState, "success");

  if (
    contacts.state !== "success" ||
    eventDetail.routeState !== "success" ||
    contactDetail.routeState !== "success"
  ) {
    return;
  }

  for (const connection of rootLanding.connections) {
    assertPersonVisualSafety({
      displayName: connection.displayName,
      recordId: connection.id,
    });
  }

  for (const contact of contacts.payload.contacts) {
    assertPersonVisualSafety({
      displayName: contact.displayName,
      recordId: contact.id,
    });
  }

  assertPersonVisualSafety({
    displayName: contactDetail.contact.displayName,
    recordId: contactDetail.contact.id,
  });

  for (const attendee of eventDetail.attendeeRoster.attendees) {
    assertPersonVisualSafety({
      displayName: attendee.displayName,
      recordId: attendee.attendeeId,
    });
  }

  for (const recommendation of eventDetail.recommendations.recommendations) {
    assertPersonVisualSafety({
      displayName: recommendation.attendee.displayName,
      recordId: recommendation.attendee.attendeeId,
    });
  }

  assert.equal(
    getDemoPersonAvatarAsset({
      displayName: "佐藤健一",
      recordId: "contact_001",
    }),
    null,
    "a stale record-id avatar must not be shown for a newly generated person",
  );
});
