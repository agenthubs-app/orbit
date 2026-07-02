import assert from "node:assert/strict";
import test from "node:test";
import { createHybridContactsListSearchAndFilterService } from "../../features/contacts/contacts-list-search-and-filter-mock/hybrid-service";
import {
  createContactsListSearchAndFilterService,
  resolveContactsListSearchAndFilterService,
} from "../../features/contacts/service-factory";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
} from "../../shared/local-remote-store/orbit-database";
import { createMemoryStorageAdapter } from "../../shared/local-remote-store/store";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import type { MockRuntimeFixtures } from "../../shared/mock/fixtures";

// hybrid contacts 测试把“UI capability 读取 local-remote database”这条链路锁住：
// 数据源不是静态 mock service，而是可以持久化、将来可替换为远程同步的本地数据库。
function createHybridContactsSeed(): MockRuntimeFixtures {
  const profileId = defaultMockFixtures.profiles[0].id;
  const accountId = defaultMockFixtures.accounts[0].id;

  return {
    ...defaultMockFixtures,
    contacts: [
      ...defaultMockFixtures.contacts,
      {
        id: "contact_local_agent_tester",
        displayName: "Aki Mori",
        organization: "Local Graph Lab",
        role: "Founder",
        primaryEmail: "aki@example.test",
        location: "Tokyo",
        profileSnippet:
          "Founder building localStorage-backed relationship data for agent tests.",
        stage: "needs_follow_up",
        source: {
          type: "manual",
          id: "source:local-remote:aki-note",
          label: "Local remote database seed",
        },
        evidenceIds: ["evidence_local_agent_tester"],
        createdAt: "2026-06-29T09:00:00.000Z",
        updatedAt: "2026-06-29T09:30:00.000Z",
      },
    ],
    connections: [
      ...defaultMockFixtures.connections,
      {
        id: "connection_local_agent_tester",
        accountId,
        contactId: "contact_local_agent_tester",
        stage: "needs_follow_up",
        valueTypes: ["strategic_fit", "knowledge_exchange"],
        summary:
          "Aki is a local remote database contact used to test agent graph retrieval.",
        source: {
          type: "manual",
          id: "source:local-remote:aki-connection",
          label: "Local remote database connection",
        },
        evidenceIds: ["evidence_local_agent_tester"],
        createdAt: "2026-06-29T09:05:00.000Z",
        updatedAt: "2026-06-29T09:30:00.000Z",
      },
    ],
    evidence: [
      ...defaultMockFixtures.evidence,
      {
        id: "evidence_local_agent_tester",
        sourceType: "manual",
        sourceId: "source:local-remote:aki-note",
        summary:
          "Aki's localStorage-backed record exists so the agent can test relationship retrieval without static fixtures.",
        occurredAt: "2026-06-29T09:00:00.000Z",
        confidence: 0.91,
        createdBy: profileId,
      },
    ],
  };
}

// 这条用例证明 contact、connection、evidence 三类关系数据会被组合成 UI contract。
// 断言 provenance 和执行标记，是为了防止实现不小心退回纯 mock fixture。
test("hybrid contacts service reads source-backed contacts from the local remote database", async () => {
  const storage = createMemoryStorageAdapter();
  const database = createOrbitLocalRemoteDatabase({
    seed: createHybridContactsSeed(),
    storage,
  });
  const service = createHybridContactsListSearchAndFilterService({ database });

  const result = await service.searchContacts({
    query: "localStorage-backed",
    sourceFilters: ["manual"],
    statusFilters: ["needs_follow_up"],
    valueFilters: ["strategic_fit"],
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data.contacts.map((contact) => contact.displayName),
    ["Aki Mori"],
  );
  assert.equal(
    result.data.contacts[0]?.profileSnippet,
    "Founder building localStorage-backed relationship data for agent tests.",
  );
  assert.equal(
    result.data.contacts[0]?.relationshipContext,
    "Aki is a local remote database contact used to test agent graph retrieval.",
  );
  assert.equal(result.data.contacts[0]?.databaseQueryExecuted, true);
  assert.equal(result.data.contacts[0]?.searchIndexReadExecuted, false);
  assert.deepEqual(result.data.contacts[0]?.value.valueTypes, [
    "strategic_fit",
    "knowledge_exchange",
  ]);
  assert.deepEqual(result.data.provenance.evidenceIds, [
    "evidence_local_agent_tester",
  ]);
  assert.equal(
    result.data.provenance.source,
    `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`,
  );
  assert.equal(result.data.provenance.databaseQueryExecuted, true);
  assert.equal(result.data.provenance.searchIndexReadExecuted, false);
  assert.equal(result.data.provenance.generationMethod, "local-remote-store-query");
});

// service factory 是 mode 切换入口：hybrid 已可用，live 仍显式关闭。
// 这个边界避免 UI 或 API 在还没有真实联系人服务时误认为 live 可执行。
test("contacts service factory uses hybrid for local remote database mode and registers live fail-closed mode", async () => {
  const hybridResolution = resolveContactsListSearchAndFilterService("hybrid");
  const liveResolution = resolveContactsListSearchAndFilterService("live");
  const hybridService = createContactsListSearchAndFilterService("hybrid");
  const hybridResult = await hybridService.listContacts();

  assert.equal(hybridResolution.success, true);
  assert.equal(liveResolution.success, true);

  assert.equal(hybridResult.success, true);
  assert.equal(hybridResult.data.provenance.databaseQueryExecuted, true);
});
