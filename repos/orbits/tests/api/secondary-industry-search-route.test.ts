import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import * as accountStorage from "../../features/account/storage/account-live-record-provider";
import * as liveSearch from "../../features/search/live-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

// Evaluate the complete production modules, replacing only session I/O and
// configured storage assembly. Parsing, membership resolution and search stay real.
function loadWithBoundaries<T>(url: URL, boundaries: Record<string, unknown>): T {
  const require = createRequire(url);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (id: string) => Object.hasOwn(boundaries, id) ? boundaries[id] : require(id), module, module.exports,
  );
  return module.exports as T;
}

async function fixture(t: TestContext) {
  const previous = { ORBIT_FEATURE_MODE: process.env.ORBIT_FEATURE_MODE, ORBIT_MODULE_MODE: process.env.ORBIT_MODULE_MODE };
  process.env.ORBIT_FEATURE_MODE = "live";
  process.env.ORBIT_MODULE_MODE = "live";
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:secondary-search-route";
  const actorId = "secondary-search-owner";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of store.listRecords({ workspaceId, collectionName })) {
      store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  for (const [recordId, secondaryIndustryId] of [
    ["contact_001", "technology_internet.ai_data"], ["contact_003", "technology_internet.cybersecurity"],
  ]) {
    const record = store.getRecord({ workspaceId, collectionName: "contacts", recordId });
    assert.ok(record);
    store.upsertRecord({ ...record, payload: { ...record.payload, primaryIndustryId: "technology_internet", secondaryIndustryId } });
  }
  for (const id of [actorId, "secondary-search-foreign"]) {
    const timestamp = "2026-09-14T00:00:00.000Z";
    for (const [collectionName, payload] of [
      ["accounts", { id, name: id, createdAt: timestamp, updatedAt: timestamp }],
      ["profiles", { id: `profile:${id}`, accountId: id, displayName: id, createdAt: timestamp, updatedAt: timestamp }],
    ] as const) store.upsertRecord({ workspaceId, collectionName, recordId: payload.id, sourceType: "manual", sourceId: payload.id,
      evidenceIds: [], createdAt: timestamp, updatedAt: timestamp, lifecycleState: "active", payload });
  }
  const session = { userId: `profile:${actorId}` as string | null };
  const actorModule = loadWithBoundaries(new URL("../../app/api/_shared/authenticated-actor.ts", import.meta.url), {
    "../../../auth": { auth: async () => session.userId ? { user: { id: session.userId } } : null },
    "../../../features/account/storage/account-live-record-provider": {
      ...accountStorage, createConfiguredStorageAccountSessionProvider: () => accountStorage.createStorageAccountSessionProvider({ store, workspaceId }),
    },
  });
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  const route = loadWithBoundaries<{ GET?: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> }>(
    new URL("../../app/api/search/relationships/route.ts", import.meta.url), {
      "../../_shared/authenticated-actor": actorModule,
      "../../../../features/search/live-service": {
        ...liveSearch, createConfiguredActorScopedLiveRelationshipNaturalSearchService: (id: string) =>
          liveSearch.createActorScopedLiveRelationshipNaturalSearchService({ actorId: id, provider }),
      },
    },
  );
  return { route, session };
}

for (const encoding of ["GET", "JSON", "form"] as const) {
  test(`${encoding} search filters actual owned records by secondary industry, preserving legacy and empty filters`, async t => {
    const { route, session } = await fixture(t);
    const send = async (filters: Record<string, string[]>) => {
      const query = new URLSearchParams();
      for (const [key, values] of Object.entries(filters)) {
        const field = encoding !== "JSON" && key === "industryFilters" ? "industries" : key;
        for (const value of values) query.append(field, value);
      }
      const endpoint = "http://localhost/api/search/relationships";
      if (encoding === "GET") {
        assert.equal(typeof route.GET, "function", "the real search route must expose GET");
        return route.GET!(new Request(`${endpoint}?${query}`));
      }
      return route.POST(new Request(endpoint, { method: "POST",
        headers: { "content-type": encoding === "JSON" ? "application/json" : "application/x-www-form-urlencoded" },
        body: encoding === "JSON" ? JSON.stringify(filters) : query,
      }));
    };
    const exact = await send({ primaryIndustryIds: ["technology_internet"], secondaryIndustryIds: ["technology_internet.ai_data"] });
    assert.equal(exact.status, 200);
    const payload = await exact.json();
    assert.deepEqual(payload.data.results.map((item: { contactId: string }) => item.contactId), ["contact_001"]);
    assert.equal(payload.data.results[0].secondaryIndustryId, "technology_internet.ai_data");
    const siblings = await send({ secondaryIndustryIds: ["technology_internet.ai_data", "technology_internet.cybersecurity"] });
    assert.deepEqual((await siblings.json()).data.results.map((item: { contactId: string }) => item.contactId).sort(), ["contact_001", "contact_003"]);
    const mismatch = await send({ primaryIndustryIds: ["finance_investment"], secondaryIndustryIds: ["technology_internet.ai_data"] });
    assert.deepEqual((await mismatch.json()).data.results, []);
    const empty = await send({ primaryIndustryIds: [], secondaryIndustryIds: [] });
    assert.equal(empty.status, 200);
    assert.ok((await empty.json()).data.results.length > 1);
    const legacy = await send({ industryFilters: ["enterprise_saas"] });
    assert.equal(legacy.status, 200);
    const legacyPayload = await legacy.json();
    assert.ok(legacyPayload.data.results.length > 0);
    assert.ok(legacyPayload.data.results.every((item: { industry: string }) => item.industry === "enterprise_saas"));
    const invalid = await send({ secondaryIndustryIds: ["unknown-industry"] });
    assert.equal(invalid.status, 400);
    session.userId = "profile:secondary-search-foreign";
    const foreign = await send({ secondaryIndustryIds: ["technology_internet.ai_data"] });
    assert.equal(foreign.status, 200);
    assert.deepEqual((await foreign.json()).data.results, []);
    session.userId = null;
    assert.equal((await send({})).status, 401);
  });
}
