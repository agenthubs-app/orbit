import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPublicEventDetailGetHandler,
} from "../../app/api/events/public/[id]/handler";
import {
  createPublicEventsGetHandler,
} from "../../app/api/events/public/handler";
import type {
  CanonicalPublicEventCatalogue,
  PublicEventCatalogueSnapshot,
} from "../../features/events/core/public-catalogue";
import { canonicalPublicOrganizerLabel } from "../../features/events/core/public-organizer-identity";
import { EventCoreDataError } from "../../features/events/core/contract";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const EVENT_ID = "event:canonical-public";
const ORGANIZER_ID = "actor:canonical-organizer";
const PUBLIC_CODE = "TOKYO-BRIDGE-2026";
const LEGACY_ALIAS = "legacy-tokyo-bridge";

const sourceMetadata = {
  calendarSyncRequested: false as const,
  captureMethod: "organizer_feed" as const,
  externalNetworkRequested: false as const,
  id: `event-core-postgres:${EVENT_ID}:v3`,
  importedAt: "2026-08-01T00:00:00.000Z",
  label: "event-core-postgres",
  liveDatabaseWriteExecuted: false,
  organizerFeedRequested: false as const,
  provider: "event-core-postgres",
  providerRecordId: EVENT_ID,
  type: "event_import" as const,
};

const canonicalRecord: EventRecord = {
  aiProviderRequested: false,
  calendarProviderRequested: false,
  calendarSyncRequested: false,
  description: "Canonical public event description.",
  emailProviderRequested: false,
  endsAt: "2026-09-12T11:00:00.000Z",
  evidence: [{
    capturedAt: "2026-08-01T00:00:00.000Z",
    createdBy: "event-core-postgres",
    evidenceId: "evidence:canonical-public",
    excerpt: "Canonical public event description.",
    source: sourceMetadata,
  }],
  externalNetworkRequested: false,
  id: EVENT_ID,
  liveDatabaseWriteExecuted: false,
  nextAction: "Sign in and register before viewing the attendee list.",
  notificationDelivered: false,
  organizerFeedRequested: false,
  recommendedPreparation: "Review the event details and complete the event-scoped registration profile.",
  relationshipContext: "Canonical public event description.",
  sourceMetadata,
  startsAt: "2026-09-12T09:00:00.000Z",
  status: "imported",
  title: "Canonical Tokyo Bridge",
  venue: "Tokyo",
};

const canonicalSnapshot: PublicEventCatalogueSnapshot = {
  events: [{
    description: "Canonical public event description.",
    endsAt: canonicalRecord.endsAt,
    evidenceIds: ["evidence:canonical-public"],
    id: EVENT_ID,
    location: canonicalRecord.venue,
    name: canonicalRecord.title,
    organizerId: ORGANIZER_ID,
    source: {
      id: sourceMetadata.id,
      label: sourceMetadata.label,
      type: "event_import",
    },
    startsAt: canonicalRecord.startsAt,
  }],
  evidenceSummaries: { [EVENT_ID]: canonicalRecord.description },
  generatedAt: "2026-08-01T00:00:00.000Z",
  participantCounts: { [EVENT_ID]: 12 },
  publicCodes: { [EVENT_ID]: PUBLIC_CODE },
};

function catalogue(input: {
  readError?: unknown;
  readRecord?: (routeId: string) => Promise<EventRecord | null>;
  snapshot?: PublicEventCatalogueSnapshot;
} = {}): CanonicalPublicEventCatalogue {
  return {
    async read() {
      if (input.readError) throw input.readError;
      return input.snapshot ?? canonicalSnapshot;
    },
    async readRecords() {
      if (input.readError) throw input.readError;
      const snapshot = input.snapshot ?? canonicalSnapshot;
      return {
        generatedAt: snapshot.generatedAt,
        organizerIds: Object.fromEntries(
          snapshot.events.map((event) => [event.id, event.organizerId ?? ""]),
        ),
        publicCodes: snapshot.publicCodes,
        records: [canonicalRecord],
      };
    },
    async readRecordEntry(routeId) {
      const record = input.readRecord
        ? await input.readRecord(routeId)
        : routeId === EVENT_ID
          ? canonicalRecord
          : null;
      return record ? { organizerId: ORGANIZER_ID, record } : null;
    },
    async readRecord(routeId) {
      if (input.readRecord) return input.readRecord(routeId);
      return routeId === EVENT_ID ? canonicalRecord : null;
    },
  };
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test("public events list keeps the envelope and event fields while using canonical public codes", async () => {
  const handler = createPublicEventsGetHandler({
    createCatalogue: () => catalogue(),
  });
  const response = await handler();
  const body = (await responseBody(response)) as {
    data?: {
      events?: Array<EventRecord & { code?: string; organizer?: string }>;
      generatedAt?: string;
      organizer?: { name?: string };
    };
    success?: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.generatedAt, canonicalSnapshot.generatedAt);
  assert.equal(body.data?.organizer, null);
  assert.deepEqual(body.data?.events, [{
    ...canonicalRecord,
    code: PUBLIC_CODE,
    organizer: canonicalPublicOrganizerLabel(ORGANIZER_ID),
  }]);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("public event detail resolves canonical IDs, public codes, and registered aliases", async () => {
  const observed: string[] = [];
  const handler = createPublicEventDetailGetHandler({
    createCatalogue: () => catalogue({
      readRecord: async (routeId) => {
        observed.push(routeId);
        return [EVENT_ID, PUBLIC_CODE, LEGACY_ALIAS].includes(routeId)
          ? canonicalRecord
          : null;
      },
    }),
  });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  for (const id of [EVENT_ID, PUBLIC_CODE, LEGACY_ALIAS]) {
    const response = await handler(
      new Request(`http://localhost/api/events/public/${encodeURIComponent(id)}`),
      context(id),
    );
    const body = (await responseBody(response)) as {
      data?: { event?: EventRecord & { organizer?: string } };
      success?: boolean;
    };
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data?.event, {
      ...canonicalRecord,
      organizer: canonicalPublicOrganizerLabel(ORGANIZER_ID),
    });
  }
  assert.deepEqual(observed, [EVENT_ID, PUBLIC_CODE, LEGACY_ALIAS]);
});

test("public event detail returns 404 only for a canonical miss", async () => {
  const handler = createPublicEventDetailGetHandler({
    createCatalogue: () => catalogue(),
  });
  const response = await handler(
    new Request("http://localhost/api/events/public/missing"),
    { params: Promise.resolve({ id: "missing" }) },
  );
  const body = (await responseBody(response)) as {
    error?: { code?: string };
    success?: boolean;
  };

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error?.code, "NOT_FOUND");
});

test("unconfigured or invalid canonical catalogue returns a safe 503 without a fixture fallback", async () => {
  const unavailable = createPublicEventsGetHandler({
    createCatalogue: () => null,
  });
  const unavailableResponse = await unavailable();
  const unavailableBody = (await responseBody(unavailableResponse)) as {
    error?: { code?: string; message?: string };
    success?: boolean;
  };
  assert.equal(unavailableResponse.status, 503);
  assert.equal(unavailableBody.success, false);
  assert.equal(unavailableBody.error?.code, "SERVICE_UNAVAILABLE");

  const invalidList = createPublicEventsGetHandler({
    createCatalogue: () => catalogue({
      readError: new EventCoreDataError(
        "EVENT_CORE_INVALID_PUBLISHED_EVENT",
        "private canonical list validation detail",
      ),
    }),
  });
  const invalidListResponse = await invalidList();
  const invalidListBody = (await responseBody(invalidListResponse)) as {
    error?: { code?: string; message?: string };
    success?: boolean;
  };
  assert.equal(invalidListResponse.status, 503);
  assert.equal(invalidListBody.success, false);
  assert.equal(invalidListBody.error?.code, "SERVICE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(invalidListBody), /private canonical list validation detail/u);

  const invalid = createPublicEventDetailGetHandler({
    createCatalogue: () => catalogue({
      readRecord: async () => {
        throw new EventCoreDataError(
          "EVENT_CORE_INVALID_PUBLISHED_EVENT",
          "private canonical validation detail",
        );
      },
    }),
  });
  const invalidResponse = await invalid(
    new Request(`http://localhost/api/events/public/${EVENT_ID}`),
    { params: Promise.resolve({ id: EVENT_ID }) },
  );
  const invalidBody = (await responseBody(invalidResponse)) as {
    error?: { code?: string; message?: string };
    success?: boolean;
  };
  assert.equal(invalidResponse.status, 503);
  assert.equal(invalidBody.success, false);
  assert.equal(invalidBody.error?.code, "SERVICE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(invalidBody), /private canonical validation detail/u);
});

test("public event API routes have no legacy catalogue import path", () => {
  const sourceByFile = Object.fromEntries([
    "app/api/events/public/route.ts",
    "app/api/events/public/handler.ts",
    "app/api/events/public/[id]/route.ts",
    "app/api/events/public/[id]/handler.ts",
  ].map((file) => [file, readFileSync(join(projectRoot, file), "utf8")]));
  const source = Object.values(sourceByFile).join("\n");
  const listHandler = sourceByFile["app/api/events/public/handler.ts"] ?? "";

  assert.match(source, /createConfiguredCanonicalPublicEventCatalogue/u);
  assert.doesNotMatch(source, /readPublicEventCatalogue/u);
  assert.doesNotMatch(source, /publicEventCatalogueRecord/u);
  assert.match(source, /\.readRecordEntry\(/u);
  assert.match(listHandler, /\.readRecords\(\)/u);
  assert.doesNotMatch(listHandler, /\.readRecord(?:Entry)?\(/u);
});
