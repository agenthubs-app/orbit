import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAppContactsRouteViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { resolveAppContactsListSearchAndFilterService } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-service-factory";
import { contactsRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveContacts<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("app contacts route service resolves live contacts search", () => {
  const resolution = resolveAppContactsListSearchAndFilterService("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app contacts route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveContacts(async () => {
    const viewModel = await loadAppContactsRouteViewModel(
      undefined,
      "actor:contacts-page-test",
    );

    assert.equal(viewModel.state, "failure");
    if (viewModel.state === "failure") {
      assert.match(
        viewModel.failure.evidenceIds.join(" "),
        /CONTACTS_LIVE_STORE_UNCONFIGURED|evidence:contacts-live-store-unconfigured/,
      );
    }
  });
});

test("/app/contacts page renders the live-capable product contacts UI", async () => {
  const pageSource = source("app/(app)/app/contacts/page.tsx");

  assert.match(pageSource, /OrbitRealCardsList/);
  assert.match(pageSource, /contactsRouteToOrbitContactsViewModel/);
  assert.match(pageSource, /await auth\(\)/);
  assert.match(pageSource, /redirect\("\/app\/account\/login/);
  assert.match(pageSource, /session\.user\.id/);
  assert.doesNotMatch(pageSource, /AppContactsCommandCenter/);
});

test("captured source-only contacts remain pending, unscored, and are not counted as events", () => {
  const viewModel = contactsRouteToOrbitContactsViewModel({
    state: "success",
    payload: {
      appliedFilters: {
        query: "",
        sourceFilters: [],
        statusFilters: [],
        tagFilters: [],
        valueFilters: [],
      },
      availableFilters: {
        sources: [],
        statuses: [],
        values: [],
      },
      contacts: [
        {
          databaseQueryExecuted: true,
          detailHref: "/app/contacts/contact%3Abusiness-card%3Alist",
          displayName: "林 美咲",
          evidenceIds: ["evidence:business-card:list"],
          externalServicesContacted: false,
          id: "contact:business-card:list",
          location: "Osaka",
          needsAttention: true,
          nextAction: "Review source evidence before follow-up",
          organization: "关西质量协作实验室",
          profileSnippet: "Source-backed contact",
          relationshipContextCopy: "Business card context",
          relationshipValueLabels: [],
          relationshipValueSummary: "No relationship score is recorded.",
          role: "供应链质量负责人",
          searchIndexReadExecuted: false,
          sourceLabel: "Business card OCR",
          sourceType: "business_card_ocr",
          status: "needs_follow_up",
          statusLabel: "Needs follow-up",
          tags: [],
          valueRationale: "No relationship value record is present.",
        },
      ],
      ledger: {
        knownPeople: 1,
        needsAttention: 1,
        sourceFilters: 0,
        valueTags: 0,
      },
      listEvidenceIds: ["evidence:business-card:list"],
      listSummary: "One source-backed contact.",
      reviewActionRequested: false,
    },
  });
  const contact = viewModel.connections[0];

  assert.equal(contact.pipelineStatus, "to_contact");
  assert.equal(contact.strength, "unscored");
  assert.equal(contact.source, "scan");
  assert.equal(contact.lastEventId, "");
  assert.deepEqual(viewModel.events, []);
});
