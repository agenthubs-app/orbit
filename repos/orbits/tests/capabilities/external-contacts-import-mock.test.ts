/**
 * 外部联系人导入 mock 的契约测试。
 *
 * 锁住外部候选、草稿生成、权限边界和 debug-view 表达。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as acquisitionExternalImportFixtures from "../../features/acquisition/external-import-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the external contacts import mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("external contacts import contract exposes phone google csv and customer-list fixtures with errors", async () => {
  const contract = await importProjectModule<{
    EXTERNAL_CONTACTS_IMPORT_ERROR_CODES: readonly string[];
    EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; recovery: string }
    >;
    EXTERNAL_CONTACTS_IMPORT_FIXTURE_SOURCE: string;
    EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS: readonly string[];
    mockExternalContactsCandidatesFixture: {
      state: string;
      sources: ReadonlyArray<{
        kind: string;
        label: string;
        providerSyncRequested: false;
      }>;
      candidates: ReadonlyArray<{
        candidateId: string;
        displayName: string;
        sourceKind: string;
        relationshipContext: string;
        providerSyncRequested: false;
        contactWriteExecuted: false;
        productionImportJobEnqueued: false;
      }>;
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        phoneAddressBookReadExecuted: false;
        googleContactsSyncExecuted: false;
        csvParsedAtScale: false;
        customerListJobExecuted: false;
        externalNetworkRequested: false;
      };
    };
    mockExternalContactsImportFixture: {
      state: string;
      contactDrafts: ReadonlyArray<{
        id: string;
        candidateId: string;
        displayName: string;
        sourceKind: string;
        readyForReview: true;
        contactWriteExecuted: false;
        providerSyncRequested: false;
        databaseWriteExecuted: false;
      }>;
      provenance: { source: string; evidenceIds: readonly string[] };
    };
  }>("features/acquisition/external-import-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockExternalContactsImportService: () => {
      listExternalContactCandidates: (input?: {
        sourceKind?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof acquisitionExternalImportFixtures.mockExternalContactsCandidatesFixture;
        error?: { code: string; appCode: string };
      };
      importExternalContacts: (input?: {
        sourceKind?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof acquisitionExternalImportFixtures.mockExternalContactsImportFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/acquisition/mock-external-import-service.ts");

  const service = serviceModule.createMockExternalContactsImportService();
  const candidates = service.listExternalContactCandidates();
  const success = service.importExternalContacts();
  const empty = service.importExternalContacts({ scenario: "empty" });
  const pending = service.importExternalContacts({ scenario: "pending" });
  const failure = service.importExternalContacts({ scenario: "failure" });

  assert.deepEqual(contract.EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS, [
    "phone",
    "google_contacts",
    "csv",
    "existing_customer_list",
  ]);
  assert.deepEqual(contract.EXTERNAL_CONTACTS_IMPORT_ERROR_CODES, [
    "EXTERNAL_CONTACTS_IMPORT_SOURCE_REQUIRED",
    "EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED",
    "EXTERNAL_CONTACTS_IMPORT_PENDING",
    "EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED",
    "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED",
    "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_FAILED",
  ]);
  assert.equal(
    contract.EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS
      .EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED.appCode,
    "VALIDATION_ERROR",
  );

  assert.equal(candidates.success, true);
  assert.equal(candidates.data?.state, "success");
  assert.equal(candidates.data?.sources.length, 4);
  assert.deepEqual(
    candidates.data?.sources.map((source) => source.kind),
    ["phone", "google_contacts", "csv", "existing_customer_list"],
  );
  assert.equal(candidates.data?.sources[0]?.providerSyncRequested, false);
  assert.equal(candidates.data?.candidates.length, 4);
  assert.deepEqual(
    candidates.data?.candidates.map((candidate) => candidate.sourceKind),
    ["phone", "google_contacts", "csv", "existing_customer_list"],
  );
  assert.equal(candidates.data?.candidates[0]?.providerSyncRequested, false);
  assert.equal(candidates.data?.candidates[0]?.contactWriteExecuted, false);
  assert.equal(
    candidates.data?.candidates[0]?.productionImportJobEnqueued,
    false,
  );
  assert.equal(
    candidates.data?.provenance.source,
    acquisitionExternalImportFixtures.EXTERNAL_CONTACTS_IMPORT_FIXTURE_SOURCE,
  );
  assert.equal(
    candidates.data?.provenance.phoneAddressBookReadExecuted,
    false,
  );
  assert.equal(candidates.data?.provenance.googleContactsSyncExecuted, false);
  assert.equal(candidates.data?.provenance.csvParsedAtScale, false);
  assert.equal(candidates.data?.provenance.customerListJobExecuted, false);
  assert.equal(candidates.data?.provenance.externalNetworkRequested, false);

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.contactDrafts.length, 4);
  assert.equal(success.data?.contactDrafts[0]?.id, "external-draft:phone-1");
  assert.equal(success.data?.contactDrafts[0]?.readyForReview, true);
  assert.equal(success.data?.contactDrafts[0]?.contactWriteExecuted, false);
  assert.equal(success.data?.contactDrafts[0]?.providerSyncRequested, false);
  assert.equal(success.data?.contactDrafts[0]?.databaseWriteExecuted, false);
  assert.deepEqual(success.data?.provenance.evidenceIds, [
    "evidence:external-import-phone",
    "evidence:external-import-google",
    "evidence:external-import-csv",
    "evidence:external-import-customer-list",
  ]);

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.contactDrafts.length, 0);
  assert.equal(
    empty.data?.nextAction,
    "Connect a mock source fixture before staging external contact drafts.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.contactDrafts.length, 0);

  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
});

test("mock external contacts import service is deterministic rule-based code with no external provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockExternalContactsImportService: () => {
      listExternalContactCandidates: (input?: {
        sourceKind?: string | null;
        scenario?: string | null;
      }) => unknown;
      importExternalContacts: (input?: {
        sourceKind?: string | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/acquisition/mock-external-import-service.ts");
  const service = serviceModule.createMockExternalContactsImportService();
  const filterInput = { sourceKind: "csv" };

  assert.deepEqual(
    service.listExternalContactCandidates(),
    service.listExternalContactCandidates(),
  );
  assert.deepEqual(
    service.importExternalContacts(),
    service.importExternalContacts(),
  );
  assert.deepEqual(
    service.importExternalContacts({ scenario: "unknown-scenario" }),
    service.importExternalContacts(),
  );
  assert.deepEqual(
    service.importExternalContacts(filterInput),
    service.importExternalContacts(filterInput),
  );

  const filtered = service.importExternalContacts(filterInput) as {
    success: true;
    data: {
      contactDrafts: ReadonlyArray<{
        sourceKind: string;
        displayName: string;
      }>;
      provenance: { generationMethod: string };
    };
  };
  const unsupported = service.importExternalContacts({
    sourceKind: "linkedin",
  }) as { success: false; error: { code: string } };

  assert.equal(filtered.success, true);
  assert.equal(
    filtered.data.provenance.generationMethod,
    "rule-based-external-contacts-import",
  );
  assert.deepEqual(
    filtered.data.contactDrafts.map((draft) => draft.sourceKind),
    ["csv"],
  );
  assert.deepEqual(
    filtered.data.contactDrafts.map((draft) => draft.displayName),
    ["Mina Tan"],
  );
  assert.equal(unsupported.success, false);
  assert.equal(
    unsupported.error.code,
    "EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED",
  );

  for (const filePath of [
    "features/acquisition/external-import-contract.ts",
    "features/acquisition/mock-external-import-service.ts",
    "app/api/contact-drafts/external/import/route.ts",
    "app/api/contact-drafts/external/candidates/route.ts",
    "features/acquisition/external-contacts-import-mock/debug-view.tsx",
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

test("external contacts import API routes return stable envelopes with empty and failure paths", async () => {
  const importRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/contact-drafts/external/import/route.ts");
  const candidatesRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/contact-drafts/external/candidates/route.ts");
  const fixtures = await importProjectModule<{
    mockExternalContactsCandidatesFixture: unknown;
    mockExternalContactsImportFixture: unknown;
    mockEmptyExternalContactsCandidatesFixture: unknown;
    mockEmptyExternalContactsImportFixture: unknown;
  }>("features/acquisition/external-import-fixtures.ts");

  const importResponse = await importRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/external/import", {
      method: "POST",
    }),
  );
  const candidatesResponse = await candidatesRoute.GET(
    new Request("https://orbit.local/api/contact-drafts/external/candidates", {
      method: "GET",
    }),
  );
  const emptyResponse = await importRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/external/import?scenario=empty",
      {
        method: "POST",
      },
    ),
  );
  const failureResponse = await importRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/external/import?scenario=failure",
      {
        method: "POST",
      },
    ),
  );
  const emptyCandidatesResponse = await candidatesRoute.GET(
    new Request(
      "https://orbit.local/api/contact-drafts/external/candidates?scenario=empty",
      {
        method: "GET",
      },
    ),
  );
  const failureCandidatesResponse = await candidatesRoute.GET(
    new Request(
      "https://orbit.local/api/contact-drafts/external/candidates?scenario=failure",
      {
        method: "GET",
      },
    ),
  );
  const unsupportedResponse = await candidatesRoute.GET(
    new Request(
      "https://orbit.local/api/contact-drafts/external/candidates?sourceKind=linkedin",
      {
        method: "GET",
      },
    ),
  );

  assert.equal(importResponse.status, 200);
  assert.equal(importResponse.headers.get("cache-control"), "no-store");
  assert.equal(importResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await importResponse.json(), {
    success: true,
    data: fixtures.mockExternalContactsImportFixture,
  });

  assert.equal(candidatesResponse.status, 200);
  assert.equal(candidatesResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await candidatesResponse.json(), {
    success: true,
    data: fixtures.mockExternalContactsCandidatesFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyExternalContactsImportFixture,
  });

  assert.equal(emptyCandidatesResponse.status, 200);
  assert.deepEqual(await emptyCandidatesResponse.json(), {
    success: true,
    data: fixtures.mockEmptyExternalContactsCandidatesFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock external contacts import boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        externalContactsImportErrorCode:
          "EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock external contacts import failure came from deterministic fixture rules.",
        service: "external-contacts-import-mock",
      },
    },
  });

  assert.equal(failureCandidatesResponse.status, 503);
  assert.deepEqual(await failureCandidatesResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock external contacts import boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        externalContactsImportErrorCode:
          "EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock external contacts import failure came from deterministic fixture rules.",
        service: "external-contacts-import-mock",
      },
    },
  });

  assert.equal(unsupportedResponse.status, 400);
  assert.deepEqual(await unsupportedResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "That mock external contacts import source is not supported by this sprint boundary.",
      context: {
        boundary: "developer-admin",
        externalContactsImportErrorCode:
          "EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock external contacts import failure came from deterministic fixture rules.",
        service: "external-contacts-import-mock",
      },
    },
  });
});

test("external contacts import debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EXTERNAL_CONTACTS_IMPORT_MOCK_SLUG: string;
    ExternalContactsImportMockDemo: () => React.ReactElement;
  }>("features/acquisition/external-contacts-import-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ExternalContactsImportMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/external-contacts-import-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EXTERNAL_CONTACTS_IMPORT_MOCK_SLUG,
    "external-contacts-import-mock",
  );
  assert.match(pageSource, /EXTERNAL_CONTACTS_IMPORT_MOCK_SLUG/);
  assert.match(pageSource, /ExternalContactsImportMockDemo/);

  assert.match(html, /External contacts import mock/);
  assert.match(html, /aria-label="External contacts operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Drafts staged/);
  assert.match(html, /Phone contacts/);
  assert.match(html, /Google Contacts/);
  assert.match(html, /CSV upload/);
  assert.match(html, /Existing customer list/);
  assert.match(html, /provider sync false/);
  assert.match(html, /contact writes false/);
  assert.match(html, /production jobs false/);
  assert.match(html, /Phone address book fixture/);
  assert.match(html, /Source coverage/);
  assert.match(html, /Potential contact drafts/);
  assert.match(html, /aria-label="Mock-only execution checks"/);
  assert.match(html, /Phone address book read/);
  assert.match(html, /Google Contacts sync/);
  assert.match(html, /CSV scale parse/);
  assert.match(html, /Customer-list job/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Hana Sato/);
  assert.match(html, /Mina Tan/);
  assert.match(html, /EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED/);
  assert.match(html, /POST \/api\/contact-drafts\/external\/import/);
  assert.match(html, /GET \/api\/contact-drafts\/external\/candidates/);
  assert.match(
    html,
    /GET \/api\/contact-drafts\/external\/candidates\?scenario=empty/,
  );
  assert.match(
    html,
    /GET \/api\/contact-drafts\/external\/candidates\?scenario=failure/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EXTERNAL_CONTACTS_IMPORT_PROVIDER/);
  assert.match(html, /external-contacts-import-workbench/);
  assert.match(
    html,
    /\.external-contacts-import-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/acquisition\/live-external-import-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/acquisition\/storage\/external-import-live-record-provider\.ts/,
  );
  assert.match(liveDoc, /ORBIT_MODULE_MODE=live/);
  assert.match(liveDoc, /phone address book/);
  assert.match(liveDoc, /Google Contacts/);
  assert.match(liveDoc, /CSV/);
  assert.match(liveDoc, /existing customer-list/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
