/**
 * 联系人详情标签/状态 mock 的契约测试。
 *
 * 锁住详情读取、标签状态更新、非法输入和 debug-view 展示。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as contactsDetailFixtures from "../../features/contacts/detail-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the contact detail tag and status mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("contact detail tag and status contract exposes detail tags status notes last interaction fixtures and errors", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/contacts/detail-contract")
  >("features/contacts/detail-contract.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/contacts/mock-detail-service")
  >("features/contacts/mock-detail-service.ts");

  const service = serviceModule.createMockContactDetailTagStatusService();
  const success = service.getContactDetail({ contactId: "demo-contact-1" });
  const updated = service.updateContactDetail({
    addTags: ["topic:venture-ecosystem"],
    contactId: "demo-contact-1",
    lastInteraction: {
      channel: "manual_note",
      occurredAt: "2026-06-25T18:45:00.000Z",
      summary: "Operator confirmed the venture ecosystem follow-up path.",
    },
    note: {
      authorLabel: "Orbit operator",
      body: "Confirmed partner review context before changing status.",
    },
    removeTags: ["event:climate-founders-dinner"],
    status: "active",
  });
  const empty = service.getContactDetail({
    contactId: "demo-contact-1",
    scenario: "empty",
  });
  const pending = service.getContactDetail({
    contactId: "demo-contact-1",
    scenario: "pending",
  });
  const failure = service.getContactDetail({
    contactId: "demo-contact-1",
    scenario: "failure",
  });
  const invalidPatchBody = service.invalidPatchBody();
  const pendingUpdate = service.updateContactDetail({
    contactId: "demo-contact-1",
    scenario: "pending",
  });
  const unsupportedStatus = service.updateContactDetail({
    contactId: "demo-contact-1",
    status: "blocked",
  });
  const unsupportedTag = service.updateContactDetail({
    addTags: ["topic:unverified"],
    contactId: "demo-contact-1",
  });
  const missing = service.getContactDetail({ contactId: "missing-contact" });

  assert.deepEqual(contract.CONTACT_DETAIL_TAG_STATUS_ERROR_CODES, [
    "CONTACT_DETAIL_NOT_FOUND",
    "CONTACT_DETAIL_INVALID_PATCH_BODY",
    "CONTACT_DETAIL_TAG_NOT_SUPPORTED",
    "CONTACT_DETAIL_STATUS_NOT_SUPPORTED",
    "CONTACT_DETAIL_UPDATE_PENDING",
    "CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED",
  ]);
  assert.equal(
    contract.CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS
      .CONTACT_DETAIL_NOT_FOUND.appCode,
    "NOT_FOUND",
  );
  assert.equal(
    contract.CONTACT_DETAIL_TAG_STATUS_ERROR_DEFINITIONS
      .CONTACT_DETAIL_TAG_NOT_SUPPORTED.appCode,
    "VALIDATION_ERROR",
  );
  assert.deepEqual(contract.CONTACT_DETAIL_STATUS_OPTIONS, [
    "active",
    "needs_follow_up",
    "nurture",
    "archived",
  ]);
  assert.ok(
    contract.CONTACT_DETAIL_TAG_OPTIONS.includes("topic:venture-ecosystem"),
  );
  assert.equal(
    contactsDetailFixtures.CONTACT_DETAIL_TAG_STATUS_FIXTURE_SOURCE,
    "fixture:features/contacts/detail-fixtures.ts",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.contact?.id, "demo-contact-1");
  assert.equal(success.data.contact?.displayName, "Kenji Watanabe");
  assert.deepEqual(success.data.contact?.publicProfile, {
    bio: "Founder at Aster Grid focused on storage pilot partnerships.",
    conversationPrompts: [
      "Which operator profile makes a storage pilot credible?",
      "Where do climate founders lose momentum after an event?",
    ],
    industry: "climate infrastructure",
    offering: ["storage pilot operator access", "founder diligence context"],
    seeking: ["operator introductions", "commercial pilot partners"],
    selfIntroduction:
      "I help climate infrastructure teams turn early storage pilots into operator-backed partnerships.",
    topics: ["storage pilots", "operator partnerships", "climate infrastructure"],
    source: contactsDetailFixtures.mockContactDetailSource,
    evidenceIds: ["evidence:contact-detail-public-profile"],
  });
  assert.equal(success.data.contact?.status, "needs_follow_up");
  assert.deepEqual(success.data.contact?.tags, [
    "event:climate-founders-dinner",
    "topic:storage-pilots",
    "priority:warm-follow-up",
  ]);
  assert.equal(success.data.contact?.notes.length, 2);
  assert.equal(
    success.data.contact?.notes[0]?.evidenceIds[0],
    "evidence:contact-detail-intro-request",
  );
  assert.equal(
    success.data.contact?.lastInteraction.summary,
    "Kenji asked for an operator introduction after the climate founders dinner.",
  );
  assert.equal(success.data.contact?.lastInteraction.channel, "event_note");
  assert.equal(success.data.contact?.tagWriteExecuted, false);
  assert.equal(success.data.contact?.statusWriteExecuted, false);
  assert.equal(success.data.contact?.noteWriteExecuted, false);
  assert.equal(success.data.contact?.productionAuditLogWriteExecuted, false);
  assert.equal(success.data.contact?.databaseWriteExecuted, false);
  assert.equal(success.data.provenance.databaseReadExecuted, false);
  assert.equal(success.data.provenance.databaseWriteExecuted, false);
  assert.equal(success.data.provenance.productionAuditLogWriteExecuted, false);
  assert.equal(success.data.provenance.externalNetworkRequested, false);
  assert.equal(success.data.provenance.aiProviderRequested, false);
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:contact-detail-intro-request",
    "evidence:contact-detail-status",
    "evidence:contact-detail-note",
    "evidence:contact-detail-public-profile",
  ]);

  assert.equal(updated.success, true);
  assert.equal(updated.data.state, "success");
  assert.equal(updated.data.contact?.status, "active");
  assert.deepEqual(updated.data.contact?.tags, [
    "topic:storage-pilots",
    "priority:warm-follow-up",
    "topic:venture-ecosystem",
  ]);
  assert.equal(updated.data.contact?.notes.length, 3);
  assert.equal(
    updated.data.contact?.notes[2]?.body,
    "Confirmed partner review context before changing status.",
  );
  assert.equal(
    updated.data.contact?.lastInteraction.summary,
    "Operator confirmed the venture ecosystem follow-up path.",
  );
  assert.equal(
    updated.data.updateSummary,
    "Mock update changed Kenji Watanabe to active with 3 tags and 3 notes.",
  );
  assert.equal(
    updated.data.provenance.generationMethod,
    "rule-based-contact-detail-tag-status",
  );
  assert.equal(updated.data.provenance.productionAuditLogWriteExecuted, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.contact, null);
  assert.equal(
    empty.data.nextAction,
    "Select a different mock contact or keep the detail panel in its empty state.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.contact, null);

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(invalidPatchBody.success, false);
  assert.equal(invalidPatchBody.error.code, "CONTACT_DETAIL_INVALID_PATCH_BODY");
  assert.equal(invalidPatchBody.error.appCode, "VALIDATION_ERROR");
  assert.equal(pendingUpdate.success, false);
  assert.equal(pendingUpdate.error.code, "CONTACT_DETAIL_UPDATE_PENDING");
  assert.equal(pendingUpdate.error.appCode, "CONFLICT");

  assert.equal(unsupportedStatus.success, false);
  assert.equal(
    unsupportedStatus.error.code,
    "CONTACT_DETAIL_STATUS_NOT_SUPPORTED",
  );
  assert.equal(unsupportedTag.success, false);
  assert.equal(unsupportedTag.error.code, "CONTACT_DETAIL_TAG_NOT_SUPPORTED");
  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "CONTACT_DETAIL_NOT_FOUND");

  assert.deepEqual(contactsDetailFixtures.mockContactDetailFixture, success.data);
  assert.deepEqual(contactsDetailFixtures.mockUpdatedContactDetailFixture, updated.data);
});

test("mock contact detail tag and status service is deterministic with no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/contacts/mock-detail-service")
  >("features/contacts/mock-detail-service.ts");
  const service = serviceModule.createMockContactDetailTagStatusService();
  const updateInput = {
    addTags: ["topic:venture-ecosystem"],
    contactId: "demo-contact-1",
    note: {
      body: "Confirmed partner review context before changing status.",
    },
    removeTags: ["event:climate-founders-dinner"],
    status: "active",
  };

  assert.deepEqual(
    service.getContactDetail({ contactId: "demo-contact-1" }),
    service.getContactDetail({ contactId: "demo-contact-1" }),
  );
  assert.deepEqual(
    service.updateContactDetail(updateInput),
    service.updateContactDetail(updateInput),
  );
  assert.deepEqual(
    service.getContactDetail({
      contactId: "demo-contact-1",
      scenario: "unknown-scenario",
    }),
    service.getContactDetail({ contactId: "demo-contact-1" }),
  );

  const updated = service.updateContactDetail(updateInput);

  assert.equal(updated.success, true);
  assert.equal(updated.data.contact?.status, "active");
  assert.equal(updated.data.contact?.productionAuditLogWriteExecuted, false);
  assert.equal(updated.data.provenance.databaseWriteExecuted, false);
  assert.equal(updated.data.provenance.externalNetworkRequested, false);

  for (const filePath of [
    "features/contacts/detail-contract.ts",
    "features/contacts/mock-detail-service.ts",
    "app/api/contacts/[id]/route.ts",
    "features/contacts/contact-detail-tag-and-status-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("contact detail tag and status API route returns stable envelopes with empty and failure paths", async () => {
  const detailRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
    PATCH: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/contacts/[id]/route.ts");
  const contract = await importProjectModule<
    typeof import("../../features/contacts/detail-contract")
  >("features/contacts/detail-contract.ts");

  const routeContext = { params: Promise.resolve({ id: "demo-contact-1" }) };
  const getResponse = await detailRoute.GET(
    new Request("https://orbit.local/api/contacts/demo-contact-1"),
    routeContext,
  );
  const patchResponse = await detailRoute.PATCH(
    new Request("https://orbit.local/api/contacts/demo-contact-1", {
      body: JSON.stringify({
        addTags: ["topic:venture-ecosystem"],
        lastInteraction: {
          channel: "manual_note",
          occurredAt: "2026-06-25T18:45:00.000Z",
          summary: "Operator confirmed the venture ecosystem follow-up path.",
        },
        note: {
          authorLabel: "Orbit operator",
          body: "Confirmed partner review context before changing status.",
        },
        removeTags: ["event:climate-founders-dinner"],
        status: "active",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    routeContext,
  );
  const emptyResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/contacts/demo-contact-1?scenario=empty",
    ),
    routeContext,
  );
  const failureResponse = await detailRoute.GET(
    new Request(
      "https://orbit.local/api/contacts/demo-contact-1?scenario=failure",
    ),
    routeContext,
  );
  const unsupportedResponse = await detailRoute.PATCH(
    new Request("https://orbit.local/api/contacts/demo-contact-1", {
      body: JSON.stringify({ status: "blocked" }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    routeContext,
  );
  const pendingPatchResponse = await detailRoute.PATCH(
    new Request(
      "https://orbit.local/api/contacts/demo-contact-1?scenario=pending",
      {
        body: JSON.stringify({ status: "active" }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    ),
    routeContext,
  );
  const malformedPatchResponse = await detailRoute.PATCH(
    new Request("https://orbit.local/api/contacts/demo-contact-1", {
      body: "{",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    routeContext,
  );

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("cache-control"), "no-store");
  assert.equal(getResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await getResponse.json(), {
    success: true,
    data: contactsDetailFixtures.mockContactDetailFixture,
  });

  assert.equal(patchResponse.status, 200);
  assert.deepEqual(await patchResponse.json(), {
    success: true,
    data: contactsDetailFixtures.mockUpdatedContactDetailFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contactsDetailFixtures.mockEmptyContactDetailFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock contact detail tag and status boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        contactDetailTagStatusErrorCode:
          "CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contact detail tag and status failure came from deterministic fixture rules.",
        service: "contact-detail-tag-and-status-mock",
      },
    },
  });

  assert.equal(unsupportedResponse.status, 400);
  assert.deepEqual(await unsupportedResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "That mock contact status is not supported by this sprint boundary.",
      context: {
        boundary: "developer-admin",
        contactDetailTagStatusErrorCode: "CONTACT_DETAIL_STATUS_NOT_SUPPORTED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contact detail tag and status failure came from deterministic fixture rules.",
        service: "contact-detail-tag-and-status-mock",
      },
    },
  });

  assert.equal(pendingPatchResponse.status, 409);
  assert.deepEqual(await pendingPatchResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock contact detail tag and status update is waiting for fixture review.",
      context: {
        boundary: "developer-admin",
        contactDetailTagStatusErrorCode: "CONTACT_DETAIL_UPDATE_PENDING",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contact detail tag and status failure came from deterministic fixture rules.",
        service: "contact-detail-tag-and-status-mock",
      },
    },
  });

  assert.equal(malformedPatchResponse.status, 400);
  assert.deepEqual(await malformedPatchResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "The mock contact detail update request body must be valid JSON.",
      context: {
        boundary: "developer-admin",
        contactDetailTagStatusErrorCode: "CONTACT_DETAIL_INVALID_PATCH_BODY",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock contact detail tag and status failure came from deterministic fixture rules.",
        service: "contact-detail-tag-and-status-mock",
      },
    },
  });
});

test("contact detail tag and status debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/contacts/contact-detail-tag-and-status-mock/debug-view")
  >("features/contacts/contact-detail-tag-and-status-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ContactDetailTagAndStatusMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/contacts/contact-detail-tag-and-status-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.CONTACT_DETAIL_TAG_AND_STATUS_MOCK_SLUG,
    "contact-detail-tag-and-status-mock",
  );
  assert.match(pageSource, /CONTACT_DETAIL_TAG_AND_STATUS_MOCK_SLUG/);
  assert.match(pageSource, /ContactDetailTagAndStatusMockDemo/);

  assert.match(html, /Contact detail tag and status mock/);
  assert.match(html, /aria-label="Contact detail operator checkpoint"/);
  assert.match(html, /Detail edits stay fixture-backed/);
  assert.match(html, /Contact represented/);
  assert.match(html, /Mock execution/);
  assert.match(html, /database reads false; audit log writes false/);
  assert.match(html, /aria-label="Contact detail evidence for Kenji Watanabe"/);
  assert.match(html, />Contact detail evidence for Kenji Watanabe</);
  assert.match(html, /Source: Manual note/);
  assert.match(html, /Evidence: evidence:contact-detail-intro-request/);
  assert.match(html, /Status: needs_follow_up/);
  assert.match(html, /Last interaction: Kenji asked for an operator introduction/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /topic:storage-pilots/);
  assert.match(html, /topic:venture-ecosystem/);
  assert.match(html, /CONTACT_DETAIL_TAG_STATUS_MOCK_FAILED/);
  assert.match(html, /GET \/api\/contacts\/demo-contact-1/);
  assert.match(html, /PATCH \/api\/contacts\/demo-contact-1/);
  assert.match(html, /GET \/api\/contacts\/demo-contact-1\?scenario=empty/);
  assert.match(
    html,
    /GET \/api\/contacts\/demo-contact-1\?scenario=failure/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_CONTACT_DETAIL_PROVIDER/);
  assert.match(html, /contact-detail-tag-status-workbench/);
  assert.match(html, /malformed update bodies/);
  assert.match(
    html,
    /\.contact-detail-tag-status-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/contacts\/contact-detail-tag-and-status-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/contacts\/contact-detail-tag-and-status-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_CONTACT_DETAIL_PROVIDER/);
  assert.match(liveDoc, /contact persistence service/);
  assert.match(liveDoc, /production audit log/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
