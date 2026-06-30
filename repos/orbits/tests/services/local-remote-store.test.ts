import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryStorageAdapter,
  createVersionedLocalRemoteStore,
} from "../../shared/local-remote-store/store";
import {
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION,
  createOrbitLocalRemoteDatabase,
} from "../../shared/local-remote-store/orbit-database";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

// 这组测试锁住 local-remote store 的底层契约：
// 数据以“远程数据库形状”存在本地 storage 中，读取/更新时必须 clone，
// 并且 schemaVersion/storageKind 要稳定，方便未来替换成真实远程同步层。
test("versioned local remote store persists cloned state in storage-shaped records", () => {
  const storage = createMemoryStorageAdapter();
  const store = createVersionedLocalRemoteStore({
    initialState: {
      records: [
        {
          id: "record_1",
          count: 1,
        },
      ],
    },
    schemaVersion: 7,
    storage,
    storageKey: "test.local-remote-store",
  });

  assert.deepEqual(store.getState(), {
    records: [
      {
        id: "record_1",
        count: 1,
      },
    ],
  });

  const persistedSeed = JSON.parse(
    storage.getItem("test.local-remote-store") ?? "{}",
  );

  assert.equal(persistedSeed.schemaVersion, 7);
  assert.equal(persistedSeed.storageKind, "local-remote-database");
  assert.deepEqual(persistedSeed.state.records, [{ id: "record_1", count: 1 }]);

  const updated = store.updateState((draft) => {
    draft.records[0].count = 2;
  });

  updated.records[0].count = 999;

  assert.equal(store.getState().records[0].count, 2);

  const secondStore = createVersionedLocalRemoteStore({
    initialState: {
      records: [],
    },
    schemaVersion: 7,
    storage,
    storageKey: "test.local-remote-store",
  });

  assert.deepEqual(secondStore.getState(), {
    records: [
      {
        id: "record_1",
        count: 2,
      },
    ],
  });

  secondStore.reset();

  assert.deepEqual(secondStore.getState(), {
    records: [],
  });
});

// Orbit 默认数据库要从 mock fixtures 生成完整关系图集合。
// 这个测试确保 accounts/profiles/contacts/events/evidence 等集合都能被 seed，
// 且写入后重新创建 database 仍能读回同一份本地持久化状态。
test("orbit local remote database seeds the future remote-shaped relationship collections", () => {
  const storage = createMemoryStorageAdapter();
  const database = createOrbitLocalRemoteDatabase({ storage });
  const state = database.getState();

  assert.equal(database.storageKey, ORBIT_LOCAL_REMOTE_DATABASE_KEY);
  assert.equal(database.schemaVersion, ORBIT_LOCAL_REMOTE_DATABASE_SCHEMA_VERSION);
  assert.equal(state.id, defaultMockFixtures.id);
  assert.ok(state.accounts.length > 0);
  assert.ok(state.profiles.length > 0);
  assert.ok(state.networkPeople.length > 0);
  assert.ok(state.personRelationshipEdges.length > 0);
  assert.ok(state.contacts.length > 0);
  assert.ok(state.events.length > 0);
  assert.ok(state.attendees.length > 0);
  assert.ok(state.connections.length > 0);
  assert.ok(state.evidence.length > 0);
  assert.ok(state.eventParticipantIntents.length > 0);
  assert.ok(state.aiAnalyses.length > 0);
  assert.ok(state.matchRecommendations.length > 0);
  assert.ok(state.interactionMemories.length > 0);
  assert.ok(state.recommendationTests.length > 0);

  database.updateState((draft) => {
    draft.contacts.push({
      ...draft.contacts[0],
      id: "contact_local_remote_test",
      displayName: "Local Remote Test Contact",
      evidenceIds: draft.contacts[0].evidenceIds,
    });
  });

  const reloaded = createOrbitLocalRemoteDatabase({ storage });

  assert.equal(
    reloaded
      .getState()
      .contacts.some(
        (contact) => contact.displayName === "Local Remote Test Contact",
      ),
    true,
  );
});
