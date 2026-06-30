/**
 * 活动后联系人复核 mock 的契约测试。
 *
 * 锁住待复核联系人、confirm 结果和避免自动写联系人图谱的边界。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as eventsPostEventFixtures from "../../features/events/post-event-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the post-event contact review mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("post-event review contract exposes review contacts summaries tags follow-up fixtures and errors", async () => {
  const contract = await importProjectModule<{
    POST_EVENT_REVIEW_ERROR_CODES: readonly string[];
    POST_EVENT_REVIEW_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    POST_EVENT_REVIEW_FIXTURE_SOURCE: string;
    mockPostEventReviewFixture: {
      state: string;
      event: { id: string; title: string; liveDatabaseReadExecuted: false };
      reviewId: string;
      contacts: readonly Array<{
        contactDraftId: string;
        displayName: string;
        status: string;
        summary: {
          headline: string;
          generatedBy: string;
          aiProviderRequested: false;
        };
        tags: readonly Array<{
          label: string;
          generatedBy: string;
          aiProviderRequested: false;
        }>;
        followUpSuggestion: {
          channel: string;
          messageDraft: string;
          externalMessageSendRequested: false;
          notificationDelivered: false;
          aiProviderRequested: false;
        };
        liveDatabaseWriteExecuted: false;
        batchPersistenceExecuted: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        aiProviderRequested: false;
        externalNetworkRequested: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        batchPersistenceExecuted: false;
        calendarProviderRequested: false;
        emailProviderRequested: false;
        notificationDelivered: false;
      };
    };
    mockEmptyPostEventReviewFixture: {
      state: string;
      contacts: readonly unknown[];
      nextAction: string;
    };
    mockPendingPostEventReviewFixture: {
      state: string;
      contacts: readonly unknown[];
      nextAction: string;
    };
    mockPostEventReviewConfirmFixture: {
      state: string;
      eventId: string;
      confirmedContacts: readonly Array<{
        contactId: string;
        contactDraftId: string;
        batchPersistenceExecuted: false;
        liveDatabaseWriteExecuted: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        batchPersistenceExecuted: false;
        liveDatabaseWriteExecuted: false;
      };
    };
  }>("features/events/post-event-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockPostEventContactReviewService: () => {
      getPostEventReview: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof eventsPostEventFixtures.mockPostEventReviewFixture;
        error?: { code: string; appCode: string };
      };
      confirmPostEventContacts: (input?: {
        eventId?: string | null;
        contactDraftIds?: readonly string[] | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof eventsPostEventFixtures.mockPostEventReviewConfirmFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/events/mock-post-event-service.ts");

  const service = serviceModule.createMockPostEventContactReviewService();
  const success = service.getPostEventReview({ eventId: "demo-event-1" });
  const confirmation = service.confirmPostEventContacts({
    contactDraftIds: ["draft:post-event:priya", "draft:post-event:marcus"],
    eventId: "demo-event-1",
  });
  const empty = service.getPostEventReview({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pending = service.getPostEventReview({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failure = service.getPostEventReview({
    eventId: "demo-event-1",
    scenario: "failure",
  });
  const missingEvent = service.getPostEventReview({
    eventId: "missing-event",
  });
  const emptyConfirmation = service.confirmPostEventContacts({
    eventId: "demo-event-1",
    scenario: "empty",
  });

  assert.deepEqual(contract.POST_EVENT_REVIEW_ERROR_CODES, [
    "POST_EVENT_REVIEW_EVENT_ID_REQUIRED",
    "POST_EVENT_REVIEW_EVENT_NOT_FOUND",
    "POST_EVENT_REVIEW_EMPTY",
    "POST_EVENT_REVIEW_PENDING",
    "POST_EVENT_REVIEW_MOCK_FAILED",
  ]);
  assert.equal(
    contract.POST_EVENT_REVIEW_ERROR_DEFINITIONS.POST_EVENT_REVIEW_MOCK_FAILED
      .appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.POST_EVENT_REVIEW_ERROR_DEFINITIONS.POST_EVENT_REVIEW_EMPTY
      .recovery,
    /new-contact review|batch persistence|AI/i,
  );

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.event.id, "demo-event-1");
  assert.equal(success.data?.event.liveDatabaseReadExecuted, false);
  assert.equal(success.data?.contacts.length, 2);
  assert.match(success.data?.contacts[0]?.summary.headline ?? "", /Priya/i);
  assert.equal(success.data?.contacts[0]?.summary.generatedBy, "mock-post-event-rules");
  assert.equal(success.data?.contacts[0]?.summary.aiProviderRequested, false);
  assert.deepEqual(
    success.data?.contacts[0]?.tags.map((tag) => tag.label),
    ["storage pilot", "founder intro"],
  );
  assert.equal(success.data?.contacts[0]?.tags[0]?.generatedBy, "mock-post-event-rules");
  assert.equal(success.data?.contacts[0]?.tags[0]?.aiProviderRequested, false);
  assert.match(
    success.data?.contacts[0]?.followUpSuggestion.messageDraft ?? "",
    /storage pilot/i,
  );
  assert.equal(
    success.data?.contacts[0]?.followUpSuggestion.externalMessageSendRequested,
    false,
  );
  assert.equal(success.data?.contacts[0]?.liveDatabaseWriteExecuted, false);
  assert.equal(success.data?.contacts[0]?.batchPersistenceExecuted, false);
  assert.equal(
    success.data?.provenance.source,
    eventsPostEventFixtures.POST_EVENT_REVIEW_FIXTURE_SOURCE,
  );
  assert.equal(success.data?.provenance.aiProviderRequested, false);
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.liveDatabaseReadExecuted, false);
  assert.equal(success.data?.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(success.data?.provenance.batchPersistenceExecuted, false);
  assert.equal(success.data?.provenance.calendarProviderRequested, false);
  assert.equal(success.data?.provenance.emailProviderRequested, false);
  assert.equal(success.data?.provenance.notificationDelivered, false);

  assert.equal(confirmation.success, true);
  assert.equal(confirmation.data?.state, "confirmed");
  assert.equal(confirmation.data?.eventId, "demo-event-1");
  assert.equal(confirmation.data?.confirmedContacts.length, 2);
  assert.equal(confirmation.data?.confirmedContacts[0]?.contactId, "contact:priya-shah");
  assert.equal(confirmation.data?.confirmedContacts[0]?.batchPersistenceExecuted, false);
  assert.equal(confirmation.data?.confirmedContacts[0]?.liveDatabaseWriteExecuted, false);
  assert.equal(confirmation.data?.provenance.batchPersistenceExecuted, false);
  assert.equal(confirmation.data?.provenance.liveDatabaseWriteExecuted, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.contacts.length, 0);
  assert.match(eventsPostEventFixtures.mockEmptyPostEventReviewFixture.nextAction, /Import/i);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.contacts.length, 0);
  assert.match(eventsPostEventFixtures.mockPendingPostEventReviewFixture.nextAction, /Wait/i);
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "POST_EVENT_REVIEW_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingEvent.success, false);
  assert.equal(missingEvent.error?.code, "POST_EVENT_REVIEW_EVENT_NOT_FOUND");
  assert.equal(emptyConfirmation.success, false);
  assert.equal(emptyConfirmation.error?.code, "POST_EVENT_REVIEW_EMPTY");
});

test("mock post-event contact review service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockPostEventContactReviewService: () => {
      getPostEventReview: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => unknown;
      confirmPostEventContacts: (input?: {
        eventId?: string | null;
        contactDraftIds?: readonly string[] | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/events/mock-post-event-service.ts");
  const service = serviceModule.createMockPostEventContactReviewService();
  const reviewInput = { eventId: "demo-event-1" };
  const confirmInput = {
    contactDraftIds: ["draft:post-event:priya"],
    eventId: "demo-event-1",
  };

  assert.deepEqual(
    service.getPostEventReview(reviewInput),
    service.getPostEventReview(reviewInput),
  );
  assert.deepEqual(
    service.confirmPostEventContacts(confirmInput),
    service.confirmPostEventContacts(confirmInput),
  );
  assert.deepEqual(
    service.getPostEventReview({
      ...reviewInput,
      scenario: "unknown-scenario",
    }),
    service.getPostEventReview(reviewInput),
  );

  for (const filePath of [
    "features/events/post-event-contract.ts",
    "features/events/mock-post-event-service.ts",
    "app/api/events/[id]/post-event/route.ts",
    "app/api/events/[id]/post-event/confirm/route.ts",
    "features/events/post-event-contact-review-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(
      source,
      /from ["']node:(net|http|https)["']|require\(["']node:(net|http|https)["']\)/,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("post-event contact review API routes return stable envelopes with empty and failure paths", async () => {
  const reviewRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/post-event/route.ts");
  const confirmRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/post-event/confirm/route.ts");
  const fixtures = await importProjectModule<{
    mockEmptyPostEventReviewFixture: unknown;
    mockPostEventReviewConfirmFixture: unknown;
    mockPostEventReviewFixture: unknown;
  }>("features/events/post-event-fixtures.ts");

  const reviewResponse = await reviewRoute.GET(
    new Request("https://orbit.local/api/events/demo-event-1/post-event", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const confirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/post-event/confirm",
      {
        body: JSON.stringify({
          contactDraftIds: ["draft:post-event:priya", "draft:post-event:marcus"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyReviewResponse = await reviewRoute.GET(
    new Request(
      "https://orbit.local/api/events/demo-event-1/post-event?scenario=empty",
      {
        method: "GET",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const failureReviewResponse = await reviewRoute.GET(
    new Request(
      "https://orbit.local/api/events/demo-event-1/post-event?scenario=failure",
      {
        method: "GET",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const pendingConfirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/post-event/confirm?scenario=pending",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );

  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewResponse.headers.get("cache-control"), "no-store");
  assert.equal(reviewResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await reviewResponse.json(), {
    success: true,
    data: fixtures.mockPostEventReviewFixture,
  });

  assert.equal(confirmResponse.status, 200);
  assert.equal(confirmResponse.headers.get("cache-control"), "no-store");
  assert.equal(confirmResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await confirmResponse.json(), {
    success: true,
    data: fixtures.mockPostEventReviewConfirmFixture,
  });

  assert.equal(emptyReviewResponse.status, 200);
  assert.deepEqual(await emptyReviewResponse.json(), {
    success: true,
    data: fixtures.mockEmptyPostEventReviewFixture,
  });

  assert.equal(failureReviewResponse.status, 503);
  assert.deepEqual(await failureReviewResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock post-event contact review boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        postEventReviewErrorCode: "POST_EVENT_REVIEW_MOCK_FAILED",
        privacy: "no-relationship-data",
        provenance:
          "Mock post-event review failure came from deterministic fixture rules.",
        service: "post-event-contact-review-mock",
      },
    },
  });

  assert.equal(pendingConfirmResponse.status, 409);
  assert.deepEqual(await pendingConfirmResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock post-event review is waiting for the local attendee import to finish.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        postEventReviewErrorCode: "POST_EVENT_REVIEW_PENDING",
        privacy: "demo-post-event-review-only",
        provenance: "fixture:features/events/post-event-fixtures.ts",
        service: "post-event-contact-review-mock",
      },
    },
  });
});

test("post-event contact review debug route renders all states and the live replacement handoff", async () => {
  const module = await importProjectModule<{
    POST_EVENT_CONTACT_REVIEW_MOCK_SLUG: string;
    PostEventContactReviewMockDemo: () => React.ReactElement;
  }>("features/events/post-event-contact-review-mock/debug-view.tsx");

  assert.equal(
    module.POST_EVENT_CONTACT_REVIEW_MOCK_SLUG,
    "post-event-contact-review-mock",
  );

  const html = renderToStaticMarkup(
    React.createElement(module.PostEventContactReviewMockDemo),
  );

  assert.match(html, /Post-event contact review mock/);
  assert.match(html, /Operator sequence/);
  assert.match(html, /Scan event source context/);
  assert.match(html, /Compare state matrix/);
  assert.match(html, /Confirm preview only/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Priya Shah/);
  assert.match(html, /storage pilot/);
  assert.match(html, /founder intro/);
  assert.match(html, /Follow-up suggestion/);
  assert.match(html, /GET \/api\/events\/demo-event-1\/post-event/);
  assert.match(html, /POST \/api\/events\/demo-event-1\/post-event\/confirm/);
  assert.match(html, /Live handoff evidence excerpts/);
  assert.match(html, /ORBIT_POST_EVENT_REVIEW_PROVIDER/);
  assert.match(
    html,
    /features\/events\/post-event-contact-review-mock\/LIVE_IMPLEMENTATION\.md/,
  );

  const dynamicPageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  assert.match(dynamicPageSource, /POST_EVENT_CONTACT_REVIEW_MOCK_SLUG/);
  assert.match(dynamicPageSource, /PostEventContactReviewMockDemo/);
});

test("post-event contact review live handoff covers replacement requirements", () => {
  const doc = readFileSync(
    join(
      projectRoot,
      "features/events/post-event-contact-review-mock/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/events\/post-event-contact-review-mock\/live-service\.ts/);
  assert.match(doc, /providers\/event-review-provider\.ts/);
  assert.match(doc, /providers\/summary-provider\.ts/);
  assert.match(doc, /providers\/contact-persistence-provider\.ts/);
  assert.match(doc, /ORBIT_POST_EVENT_REVIEW_PROVIDER/);
  assert.match(doc, /ORBIT_EVENT_DATA_PROVIDER/);
  assert.match(doc, /ORBIT_SUMMARY_PROVIDER/);
  assert.match(doc, /ORBIT_CONTACT_PERSISTENCE_PROVIDER/);
  assert.match(doc, /post-event summaries, tags, and follow-up suggestions/i);
  assert.match(doc, /batch persistence/i);
  assert.match(doc, /explicit user permission/i);
  assert.match(doc, /privacy review is pending/i);
  assert.match(doc, /provider failure, privacy review, and confirmation paths/i);
  assert.match(doc, /Live handoff evidence excerpts/i);
});
