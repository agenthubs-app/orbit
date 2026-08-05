import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  CanonicalPublicEventCatalogue,
  PublicEventCatalogueSnapshot,
} from "../../features/events/core/public-catalogue";
import { EventCoreDataError } from "../../features/events/core/contract";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const OWNER_ALPHA = "actor:private-alpha-owner";
const OWNER_BETA = "actor:private-beta-owner";

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

const canonicalSnapshot: PublicEventCatalogueSnapshot = {
  events: [
    {
      description: "Alpha's first canonical event.",
      endsAt: "2026-09-10T11:00:00.000Z",
      evidenceIds: ["evidence:alpha-one"],
      id: "event:alpha-one",
      location: "Tokyo",
      name: "Alpha One",
      organizerId: OWNER_ALPHA,
      source: {
        id: "event-core-postgres:event:alpha-one:v1",
        label: "event-core-postgres",
        type: "event_import",
      },
      startsAt: "2026-09-10T09:00:00.000Z",
    },
    {
      description: "Alpha's second canonical event.",
      endsAt: "2026-09-11T11:00:00.000Z",
      evidenceIds: ["evidence:alpha-two"],
      id: "event:alpha-two",
      location: "Tokyo",
      name: "Alpha Two",
      organizerId: OWNER_ALPHA,
      source: {
        id: "event-core-postgres:event:alpha-two:v1",
        label: "event-core-postgres",
        type: "event_import",
      },
      startsAt: "2026-09-11T09:00:00.000Z",
    },
    {
      description: "Beta's canonical event.",
      endsAt: "2026-09-12T11:00:00.000Z",
      evidenceIds: ["evidence:beta-one"],
      id: "event:beta-one",
      location: "Osaka",
      name: "Beta One",
      organizerId: OWNER_BETA,
      source: {
        id: "event-core-postgres:event:beta-one:v1",
        label: "event-core-postgres",
        type: "event_import",
      },
      startsAt: "2026-09-12T09:00:00.000Z",
    },
  ],
  evidenceSummaries: {
    "event:alpha-one": "Alpha's first canonical event.",
    "event:alpha-two": "Alpha's second canonical event.",
    "event:beta-one": "Beta's canonical event.",
  },
  generatedAt: "2026-08-01T00:00:00.000Z",
  participantCounts: {
    "event:alpha-one": 3,
    "event:alpha-two": 5,
    "event:beta-one": 7,
  },
  publicCodes: {
    "event:alpha-one": "ALPHA-ONE",
    "event:alpha-two": "ALPHA-TWO",
    "event:beta-one": "BETA-ONE",
  },
};

function catalogue(input: {
  readError?: unknown;
  snapshot?: PublicEventCatalogueSnapshot;
} = {}): CanonicalPublicEventCatalogue {
  return {
    async read() {
      if (input.readError) throw input.readError;
      return input.snapshot ?? canonicalSnapshot;
    },
    async readRecords() {
      const snapshot = input.snapshot ?? canonicalSnapshot;
      return {
        generatedAt: snapshot.generatedAt,
        organizerIds: Object.fromEntries(
          snapshot.events.map((event) => [event.id, event.organizerId ?? ""]),
        ),
        publicCodes: snapshot.publicCodes,
        records: [],
      };
    },
    async readRecordEntry() {
      return null;
    },
    async readRecord() {
      return null;
    },
  };
}

async function loadWithCatalogue(
  slug: string,
  injectedCatalogue: CanonicalPublicEventCatalogue | null = catalogue(),
) {
  const { loadAppOrganizerPublicRouteViewModel } = await import(
    "../../app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model"
  );

  return loadAppOrganizerPublicRouteViewModel(
    { slug },
    { createCatalogue: () => injectedCatalogue },
  );
}

test("/app/o/[slug] uses only the canonical public Event Core catalogue", () => {
  const pageSource = source("app/(app)/app/o/[slug]/page.tsx");
  const routeModelSource = source(
    "app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model.ts",
  );
  const organizerSource = source("app/(app)/app/o/orbit-real-organizer-public.tsx");
  const organizerModelSource = source(
    "app/(app)/app/orbit-organizer-route-view-model.ts",
  );

  assert.match(pageSource, /loadAppOrganizerPublicRouteViewModel/);
  assert.match(pageSource, /StateView/);
  assert.match(pageSource, /OrbitRealOrganizerPublic/);
  assert.doesNotMatch(pageSource, /searchParams/);
  assert.match(
    routeModelSource,
    /createConfiguredCanonicalPublicEventCatalogue/,
  );
  assert.match(routeModelSource, /organizerId/);
  assert.match(routeModelSource, /getOrbitLandingEventView/);
  assert.doesNotMatch(routeModelSource, /getOrbitLandingViewModel\(/);
  assert.doesNotMatch(routeModelSource, /readPublicEventCatalogue/);
  assert.doesNotMatch(routeModelSource, /resolveEventCrudAndImportService/);
  assert.doesNotMatch(organizerModelSource, /getOrbitOrganizerPublicViewModel/);
  assert.match(organizerSource, /PublicTopNav active="events"/);
  assert.match(organizerSource, /Canonical organizer/);
  assert.doesNotMatch(organizerSource, /Verified host/);
  assert.doesNotMatch(organizerSource, /badge badge-live[^\n]*Canonical organizer/);
});

test("canonical organizer ownership groups only by organizerActorId and never labels every owner Orbit", async () => {
  const routeModel = await loadWithCatalogue("ALPHA-ONE");

  assert.equal(routeModel.state, "success");
  if (routeModel.state === "success") {
    assert.match(routeModel.organizer.name, /^Organizer #[A-Z0-9]+$/);
    assert.doesNotMatch(routeModel.organizer.name, /Orbit|alpha|beta/i);
    assert.deepEqual(
      routeModel.organizer.events.map((event) => event.id),
      ["event:alpha-one", "event:alpha-two"],
    );
    assert.equal(routeModel.organizer.events.length, 2);
    assert.equal(
      routeModel.organizer.events.reduce(
        (sum, event) => sum + event.participantCount,
        0,
      ),
      8,
    );
    assert.ok(
      routeModel.organizer.events.every(
        (event) =>
          event.organizer === routeModel.organizer.name &&
          event.host === routeModel.organizer.name &&
          event.stats.attendees.length === 0 &&
          event.stats.authed === false &&
          event.stats.youRsvped === false &&
          event.youRsvped === false,
      ),
    );

    const { OrbitRealOrganizerPublic } = await import(
      "../../app/(app)/app/o/orbit-real-organizer-public"
    );
    const html = renderToStaticMarkup(
      createElement(OrbitRealOrganizerPublic, {
        language: "en",
        viewModel: routeModel.organizer,
      }),
    );

    assert.match(html, /Canonical organizer/);
    assert.doesNotMatch(html, /Verified host|private-alpha-owner|private-beta-owner/);
  }
});

test("canonical ids and public codes each resolve the matched event's canonical owner", async () => {
  for (const slug of ["event:beta-one", "BETA-ONE", "eventbetaone"]) {
    const routeModel = await loadWithCatalogue(slug);

    assert.equal(routeModel.state, "success", slug);
    if (routeModel.state === "success") {
      assert.deepEqual(
        routeModel.organizer.events.map((event) => event.id),
        ["event:beta-one"],
      );
      assert.doesNotMatch(routeModel.organizer.name, /Orbit|beta/i);
    }
  }
});

test("empty and unknown organizer slugs preserve the public 404-style route state", async () => {
  let readCalls = 0;
  const countingCatalogue: CanonicalPublicEventCatalogue = {
    ...catalogue(),
    async read() {
      readCalls += 1;
      return canonicalSnapshot;
    },
  };

  const empty = await loadWithCatalogue("   ", countingCatalogue);
  assert.equal(empty.state, "route-state");
  if (empty.state === "route-state") {
    assert.equal(empty.routeState.scenario, "empty");
    assert.equal(empty.routeState.errorCode, "PUBLIC_ORGANIZER_NOT_FOUND");
    assert.deepEqual(empty.routeState.evidenceIds, [
      "PUBLIC_ORGANIZER_NOT_FOUND",
      "public-catalogue-organizer-not-found",
    ]);
  }
  assert.equal(readCalls, 0);

  const unknown = await loadWithCatalogue("unknown-organizer", countingCatalogue);
  assert.equal(unknown.state, "route-state");
  if (unknown.state === "route-state") {
    assert.equal(unknown.routeState.scenario, "empty");
    assert.equal(unknown.routeState.errorCode, "PUBLIC_ORGANIZER_NOT_FOUND");
    assert.equal(unknown.routeState.copy.title, "Organizer not found");
  }
  assert.equal(readCalls, 1);
});

test("unavailable and invalid canonical organizer catalogues are explicit failures without a fallback", async () => {
  const unavailable = await loadWithCatalogue("ALPHA-ONE", null);
  assert.equal(unavailable.state, "route-state");
  if (unavailable.state === "route-state") {
    assert.equal(unavailable.routeState.scenario, "failure");
    assert.equal(
      unavailable.routeState.errorCode,
      "CANONICAL_PUBLIC_ORGANIZER_UNAVAILABLE",
    );
  }

  const invalidRead = await loadWithCatalogue(
    "ALPHA-ONE",
    catalogue({
      readError: new EventCoreDataError(
        "EVENT_CORE_INVALID_PUBLISHED_EVENT",
        "private canonical validation details",
      ),
    }),
  );
  assert.equal(invalidRead.state, "route-state");
  if (invalidRead.state === "route-state") {
    assert.equal(invalidRead.routeState.scenario, "failure");
    assert.equal(
      invalidRead.routeState.errorCode,
      "CANONICAL_PUBLIC_ORGANIZER_INVALID",
    );
    assert.doesNotMatch(
      JSON.stringify(invalidRead),
      /private canonical validation details/,
    );
  }

  const invalidOwner = await loadWithCatalogue(
    "ALPHA-ONE",
    catalogue({
      snapshot: {
        ...canonicalSnapshot,
        events: [
          { ...canonicalSnapshot.events[0]!, organizerId: " " },
        ],
      },
    }),
  );
  assert.equal(invalidOwner.state, "route-state");
  if (invalidOwner.state === "route-state") {
    assert.equal(invalidOwner.routeState.scenario, "failure");
    assert.equal(
      invalidOwner.routeState.errorCode,
      "CANONICAL_PUBLIC_ORGANIZER_INVALID",
    );
  }
});

test("app organizer public route state presents the active language without changing its boundary", async () => {
  const {
    presentAppOrganizerPublicRouteState,
  } = await import(
    "../../app/(app)/app/o/compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model"
  );
  const routeModel = await loadWithCatalogue("unknown-organizer");

  assert.equal(routeModel.state, "route-state");
  if (routeModel.state === "route-state") {
    const zh = presentAppOrganizerPublicRouteState(
      routeModel.routeState,
      "zh",
    );
    const en = presentAppOrganizerPublicRouteState(
      routeModel.routeState,
      "en",
    );

    assert.equal(zh.scenario, "empty");
    assert.equal(zh.errorCode, "PUBLIC_ORGANIZER_NOT_FOUND");
    assert.equal(zh.copy.title, "未找到该主办方");
    assert.equal(zh.recoveryActions[0]?.label, "返回活动");
    assert.equal(en.copy.title, "Organizer not found");
    assert.equal(en.recoveryActions[0]?.label, "Return to events");
  }
});
