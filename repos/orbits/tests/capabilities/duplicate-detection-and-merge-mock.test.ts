/**
 * 重复检测与合并 mock 的契约测试。
 *
 * 验证候选重复项、匹配原因、apply merge 和无真实写入的边界。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the duplicate detection and merge mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("duplicate detection and merge contract exposes typed fixtures service interface and errors", async () => {
  const contract = await importProjectModule<{
    DUPLICATE_DETECTION_MERGE_ERROR_CODES: readonly string[];
    DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; recovery: string }
    >;
    DUPLICATE_DETECTION_MERGE_FIXTURE_SOURCE: string;
    DUPLICATE_DETECTION_MATCH_REASONS: readonly string[];
    mockDuplicateMergeSuggestionsFixture: {
      state: string;
      duplicateCandidates: readonly Array<{
        importedDraftId: string;
        importedContactName: string;
        existingContactId: string;
        existingContactName: string;
        matchReasons: readonly string[];
        importedContactWriteExecuted: false;
        externalLookupExecuted: false;
        aiProviderRequested: false;
      }>;
      mergeSuggestions: readonly Array<{
        id: string;
        importedDraftId: string;
        existingContactId: string;
        decision: string;
        destructiveMergeExecuted: false;
        databaseWriteExecuted: false;
        requiresUserConfirmation: true;
      }>;
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        generationMethod: string;
        externalNetworkRequested: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
        emailCalendarReadExecuted: false;
        notificationDelivered: false;
      };
    };
    mockAppliedDuplicateMergeFixture: {
      state: string;
      suggestionId: string;
      confirmedBy: string;
      mergeWriteExecuted: false;
      destructiveMergeExecuted: false;
      databaseWriteExecuted: false;
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        generationMethod: string;
      };
    };
  }>("features/acquisition/merge-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockDuplicateMergeService: () => {
      listMergeSuggestions: (input?: { scenario?: string | null }) => {
        success: boolean;
        data?: typeof contract.mockDuplicateMergeSuggestionsFixture;
        error?: { code: string; appCode: string };
      };
      applyMergeSuggestion: (input: {
        suggestionId: string;
        actorLabel?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockAppliedDuplicateMergeFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/acquisition/mock-merge-service.ts");

  const service = serviceModule.createMockDuplicateMergeService();
  const success = service.listMergeSuggestions();
  const empty = service.listMergeSuggestions({ scenario: "empty" });
  const pending = service.listMergeSuggestions({ scenario: "pending" });
  const failure = service.listMergeSuggestions({ scenario: "failure" });
  const applied = service.applyMergeSuggestion({
    suggestionId: "demo-merge-1",
    actorLabel: "Verifier",
  });
  const missing = service.applyMergeSuggestion({
    suggestionId: "missing-merge",
  });

  assert.deepEqual(contract.DUPLICATE_DETECTION_MATCH_REASONS, [
    "email",
    "name_organization",
    "event_context",
    "referral_context",
  ]);
  assert.deepEqual(contract.DUPLICATE_DETECTION_MERGE_ERROR_CODES, [
    "DUPLICATE_MERGE_SUGGESTION_NOT_FOUND",
    "DUPLICATE_MERGE_PENDING_REVIEW",
    "DUPLICATE_MERGE_CONFIRMATION_BLOCKED",
    "DUPLICATE_DETECTION_MERGE_MOCK_FAILED",
  ]);
  assert.equal(
    contract.DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS
      .DUPLICATE_MERGE_SUGGESTION_NOT_FOUND.appCode,
    "NOT_FOUND",
  );

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.duplicateCandidates.length, 2);
  assert.equal(success.data?.mergeSuggestions.length, 2);
  assert.equal(success.data?.mergeSuggestions[0]?.id, "demo-merge-1");
  assert.equal(
    success.data?.mergeSuggestions[0]?.requiresUserConfirmation,
    true,
  );
  assert.equal(success.data?.mergeSuggestions[0]?.destructiveMergeExecuted, false);
  assert.equal(success.data?.mergeSuggestions[0]?.databaseWriteExecuted, false);
  assert.equal(success.data?.duplicateCandidates[0]?.externalLookupExecuted, false);
  assert.equal(success.data?.duplicateCandidates[0]?.aiProviderRequested, false);
  assert.equal(
    success.data?.provenance.source,
    contract.DUPLICATE_DETECTION_MERGE_FIXTURE_SOURCE,
  );
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.databaseWriteExecuted, false);
  assert.equal(success.data?.provenance.emailCalendarReadExecuted, false);
  assert.equal(success.data?.provenance.notificationDelivered, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.duplicateCandidates.length, 0);
  assert.equal(empty.data?.mergeSuggestions.length, 0);
  assert.equal(
    empty.data?.nextAction,
    "Import more source-backed contact drafts before reviewing duplicate merges.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.mergeSuggestions.length, 0);

  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "DUPLICATE_DETECTION_MERGE_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(applied.success, true);
  assert.equal(applied.data?.state, "confirmed");
  assert.equal(applied.data?.suggestionId, "demo-merge-1");
  assert.equal(applied.data?.confirmedBy, "Verifier");
  assert.equal(applied.data?.mergeWriteExecuted, false);
  assert.equal(applied.data?.destructiveMergeExecuted, false);
  assert.equal(applied.data?.databaseWriteExecuted, false);
  assert.equal(applied.data?.provenance.generationMethod, "rule-based-duplicate-merge");

  assert.equal(missing.success, false);
  assert.equal(missing.error?.code, "DUPLICATE_MERGE_SUGGESTION_NOT_FOUND");
});

test("mock duplicate merge service is deterministic rule-based code with no external provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockDuplicateMergeService: () => {
      listMergeSuggestions: (input?: { scenario?: string | null }) => unknown;
      applyMergeSuggestion: (input: {
        suggestionId: string;
        actorLabel?: string | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/acquisition/mock-merge-service.ts");
  const service = serviceModule.createMockDuplicateMergeService();
  const applyInput = {
    suggestionId: "demo-merge-1",
    actorLabel: "Verifier",
  };

  assert.deepEqual(service.listMergeSuggestions(), service.listMergeSuggestions());
  assert.deepEqual(
    service.listMergeSuggestions({ scenario: "unknown-scenario" }),
    service.listMergeSuggestions(),
  );
  assert.deepEqual(
    service.applyMergeSuggestion(applyInput),
    service.applyMergeSuggestion(applyInput),
  );

  const pendingApply = service.applyMergeSuggestion({
    suggestionId: "demo-merge-1",
    scenario: "pending",
  }) as { success: false; error: { code: string; appCode: string } };
  const blockedApply = service.applyMergeSuggestion({
    suggestionId: "demo-merge-1",
    scenario: "blocked",
  }) as { success: false; error: { code: string; appCode: string } };

  assert.equal(pendingApply.success, false);
  assert.equal(pendingApply.error.code, "DUPLICATE_MERGE_PENDING_REVIEW");
  assert.equal(pendingApply.error.appCode, "CONFLICT");
  assert.equal(blockedApply.success, false);
  assert.equal(blockedApply.error.code, "DUPLICATE_MERGE_CONFIRMATION_BLOCKED");
  assert.equal(blockedApply.error.appCode, "FORBIDDEN");

  for (const filePath of [
    "features/acquisition/merge-contract.ts",
    "features/acquisition/mock-merge-service.ts",
    "app/api/contact-drafts/merge-suggestions/route.ts",
    "app/api/contact-drafts/merge-suggestions/[id]/apply/route.ts",
    "features/acquisition/duplicate-detection-and-merge-mock/debug-view.tsx",
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

test("duplicate merge API routes return stable envelopes with empty and controlled failure paths", async () => {
  const listRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/contact-drafts/merge-suggestions/route.ts");
  const applyRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/contact-drafts/merge-suggestions/[id]/apply/route.ts");
  const fixtures = await importProjectModule<{
    mockDuplicateMergeSuggestionsFixture: unknown;
    mockEmptyDuplicateMergeSuggestionsFixture: unknown;
    mockAppliedDuplicateMergeFixture: unknown;
  }>("features/acquisition/merge-contract.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/contact-drafts/merge-suggestions", {
      method: "GET",
    }),
  );
  const applyResponse = await applyRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/merge-suggestions/demo-merge-1/apply",
      {
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-merge-1" }) },
  );
  const emptyResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/contact-drafts/merge-suggestions?scenario=empty",
      {
        method: "GET",
      },
    ),
  );
  const failureResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/contact-drafts/merge-suggestions?scenario=failure",
      {
        method: "GET",
      },
    ),
  );
  const pendingApplyResponse = await applyRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/merge-suggestions/demo-merge-1/apply?scenario=pending",
      {
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "demo-merge-1" }) },
  );
  const missingApplyResponse = await applyRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/merge-suggestions/missing-merge/apply",
      {
        method: "POST",
      },
    ),
    { params: Promise.resolve({ id: "missing-merge" }) },
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockDuplicateMergeSuggestionsFixture,
  });

  assert.equal(applyResponse.status, 200);
  assert.equal(applyResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await applyResponse.json(), {
    success: true,
    data: fixtures.mockAppliedDuplicateMergeFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyDuplicateMergeSuggestionsFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock duplicate detection and merge boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        duplicateMergeErrorCode: "DUPLICATE_DETECTION_MERGE_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock duplicate merge failure came from deterministic fixture rules.",
        service: "duplicate-detection-and-merge-mock",
      },
    },
  });

  assert.equal(pendingApplyResponse.status, 409);
  assert.deepEqual(await pendingApplyResponse.json(), {
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "The mock duplicate merge suggestion is waiting for local review.",
      context: {
        boundary: "developer-admin",
        duplicateMergeErrorCode: "DUPLICATE_MERGE_PENDING_REVIEW",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock duplicate merge failure came from deterministic fixture rules.",
        service: "duplicate-detection-and-merge-mock",
      },
    },
  });

  assert.equal(missingApplyResponse.status, 404);
  assert.deepEqual(await missingApplyResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock duplicate merge suggestion matches that id.",
      context: {
        boundary: "developer-admin",
        duplicateMergeErrorCode: "DUPLICATE_MERGE_SUGGESTION_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock duplicate merge failure came from deterministic fixture rules.",
        service: "duplicate-detection-and-merge-mock",
      },
    },
  });
});

test("duplicate detection and merge debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    DUPLICATE_DETECTION_AND_MERGE_MOCK_SLUG: string;
    DuplicateDetectionAndMergeMockDemo: () => React.ReactElement;
  }>("features/acquisition/duplicate-detection-and-merge-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.DuplicateDetectionAndMergeMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/duplicate-detection-and-merge-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.DUPLICATE_DETECTION_AND_MERGE_MOCK_SLUG,
    "duplicate-detection-and-merge-mock",
  );
  assert.match(pageSource, /DUPLICATE_DETECTION_AND_MERGE_MOCK_SLUG/);
  assert.match(pageSource, /DuplicateDetectionAndMergeMockDemo/);

  assert.match(html, /Duplicate detection and merge mock/);
  assert.match(html, /aria-label="Duplicate merge operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Duplicate candidates/);
  assert.match(html, /Merge suggestions/);
  assert.match(html, /Ari Lane/);
  assert.match(html, /Omar Rahman/);
  assert.match(html, /demo-merge-1/);
  assert.match(html, /email/);
  assert.match(html, /name_organization/);
  assert.match(html, /destructive merge false/);
  assert.match(html, /database writes false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Applied confirmation/);
  assert.match(html, /DUPLICATE_DETECTION_MERGE_MOCK_FAILED/);
  assert.match(html, /GET \/api\/contact-drafts\/merge-suggestions/);
  assert.match(
    html,
    /POST \/api\/contact-drafts\/merge-suggestions\/demo-merge-1\/apply/,
  );
  assert.match(
    html,
    /GET \/api\/contact-drafts\/merge-suggestions\?scenario=empty/,
  );
  assert.match(
    html,
    /GET \/api\/contact-drafts\/merge-suggestions\?scenario=failure/,
  );
  assert.match(
    html,
    /action="\/api\/contact-drafts\/merge-suggestions" aria-label="Run pending duplicate merge API probe" method="get"><input type="hidden" name="scenario" value="pending"\/><button class="secondary-action" type="submit">Run pending probe/,
  );
  assert.match(
    html,
    /action="\/api\/contact-drafts\/merge-suggestions\/missing-merge\/apply" aria-label="Run missing suggestion duplicate merge API probe" method="post"><button class="secondary-action" type="submit">Run missing suggestion probe/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_DUPLICATE_MERGE_PROVIDER/);
  assert.match(html, /duplicate-merge-workbench/);
  assert.match(
    html,
    /\.duplicate-merge-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/acquisition\/duplicate-detection-and-merge-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/acquisition\/duplicate-detection-and-merge-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_DUPLICATE_MERGE_PROVIDER/);
  assert.match(liveDoc, /Supabase/);
  assert.match(liveDoc, /imported contacts/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /confirmation/);
  assert.match(liveDoc, /replacement tests/);
});
