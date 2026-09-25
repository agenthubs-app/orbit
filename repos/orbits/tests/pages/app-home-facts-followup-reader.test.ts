import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import {
  loadHomeFacts,
  type HomeFactsRouteDependencies,
} from "../../app/(app)/app/agent/home-facts-route-service";
import {
  loadRelationshipLifecycleTasks,
  relationshipLifecycleTasksFromGraph,
} from "../../app/(app)/app/tasks/relationship-lifecycle-tasks";
import {
  createRelationshipLifecycleFactsReader,
  RELATIONSHIP_LIFECYCLE_FACTS_SQL,
  type RelationshipLifecycleFacts,
  type RelationshipLifecycleFactsReader,
} from "../../features/followups/storage/relationship-lifecycle-facts-reader";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { LIFECYCLE_HOME_SUMMARY_SQL } from "../../features/followups/storage/lifecycle-home-summary";

const actorId = "actor:w5-f";
const workspaceId = "workspace:w5-f";
const at = "2026-09-17T00:00:00.000Z";
const source = { type: "manual" as const, id: "source:w5-f", label: "W5 fixture" };
const evidenceIds = ["evidence:w5-f"] as const;

type RowMetadata = {
  workspaceId: string;
  collectionName: "tasks" | "connections" | "contacts";
  recordId: string;
  userId: string | null;
  lifecycleState: "active" | "archived";
  occurredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Authorization = {
  actorOwned: boolean;
  connectionAuthorized: boolean;
};

type TaskRow = {
  kind: "task";
  metadata: RowMetadata;
  authorization: Authorization;
  id: unknown;
  title: unknown;
  status: unknown;
  contactId: unknown;
  connectionId: unknown;
  dueAt: unknown;
  source: unknown;
  evidenceIds: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

type ConnectionRow = {
  kind: "connection";
  metadata: RowMetadata;
  authorization: Authorization;
  id: unknown;
  accountId: unknown;
  contactId: unknown;
  stage: unknown;
  summary: unknown;
  source: unknown;
  evidenceIds: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

type ContactRow = {
  kind: "contact";
  metadata: RowMetadata;
  authorization: Authorization;
  id: unknown;
  displayName: unknown;
  organization: unknown;
  stage: unknown;
  source: unknown;
  evidenceIds: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

type FactsEnvelope = {
  version: 1;
  workspaceId: string;
  actorId: string;
  tasks: readonly TaskRow[];
  connections: readonly ConnectionRow[];
  contacts: readonly ContactRow[];
};

function metadata(
  collectionName: RowMetadata["collectionName"],
  recordId: string,
  userId: string | null = actorId,
  overrides: Partial<RowMetadata> = {},
): RowMetadata {
  return {
    workspaceId,
    collectionName,
    recordId,
    userId,
    lifecycleState: "active",
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    kind: "task",
    metadata: metadata("tasks", "storage:task:current"),
    authorization: { actorOwned: true, connectionAuthorized: false },
    id: "task:current",
    title: "确认后续资料",
    status: "open",
    contactId: "contact:ren",
    connectionId: "connection:ren",
    dueAt: "2026-09-18T01:00:00.000Z",
    source,
    evidenceIds,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function connectionRow(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    kind: "connection",
    metadata: metadata("connections", "storage:connection:ren"),
    authorization: { actorOwned: true, connectionAuthorized: false },
    id: "connection:ren",
    accountId: actorId,
    contactId: "contact:ren",
    stage: "active",
    summary: "关系上下文",
    source,
    evidenceIds,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function contactRow(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    kind: "contact",
    metadata: metadata("contacts", "storage:contact:ren", null),
    authorization: { actorOwned: false, connectionAuthorized: true },
    id: "contact:ren",
    displayName: "Ren Ito",
    organization: "Orbit Labs",
    stage: "active",
    source,
    evidenceIds,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function envelope(overrides: Partial<FactsEnvelope> = {}): FactsEnvelope {
  return {
    version: 1,
    workspaceId,
    actorId,
    tasks: [taskRow()],
    connections: [connectionRow()],
    contacts: [contactRow()],
    ...overrides,
  };
}

function fakeSqlClient(
  value: unknown,
): LiveRecordSqlClient & { calls: { text: string; values?: readonly unknown[] }[] } {
  const calls: { text: string; values?: readonly unknown[] }[] = [];
  return {
    calls,
    async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      calls.push({ text, values });
      return { rows: [{ envelope: value } as TRow] };
    },
  };
}

function memoryReader(
  facts: RelationshipLifecycleFacts,
  options: { sourceLabel?: string; calls?: string[] } = {},
): RelationshipLifecycleFactsReader {
  return {
    sourceLabel: options.sourceLabel ?? "Memory relationship facts",
    async readRelationshipLifecycleFacts(requestedActorId) {
      options.calls?.push(requestedActorId);
      return facts;
    },
  };
}

function factsFromRows(value: FactsEnvelope): RelationshipLifecycleFacts {
  return {
    tasks: value.tasks.map((row) => {
      const contactId = typeof row.contactId === "string" && row.contactId.trim() ? row.contactId : undefined;
      const connectionId = typeof row.connectionId === "string" && row.connectionId.trim() ? row.connectionId : undefined;
      const dueAt = typeof row.dueAt === "string" && row.dueAt.trim() ? row.dueAt : undefined;
      return {
        kind: row.kind,
        metadata: row.metadata,
        authorization: row.authorization,
        id: row.id,
        title: row.title,
        status: row.status,
        ...(contactId === undefined ? {} : { contactId }),
        ...(connectionId === undefined ? {} : { connectionId }),
        ...(dueAt === undefined ? {} : { dueAt }),
        source: row.source,
        evidenceIds: row.evidenceIds,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }) as never,
    connections: value.connections.map((row) => ({
      kind: row.kind,
      metadata: row.metadata,
      authorization: row.authorization,
      id: row.id,
      accountId: row.accountId,
      contactId: row.contactId,
      stage: row.stage,
      summary: row.summary,
      source: row.source,
      evidenceIds: row.evidenceIds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })) as never,
    contacts: value.contacts.map((row) => {
      const organization = typeof row.organization === "string" && row.organization.trim() ? row.organization : undefined;
      return {
        kind: row.kind,
        metadata: row.metadata,
        authorization: row.authorization,
        id: row.id,
        displayName: row.displayName,
        ...(organization === undefined ? {} : { organization }),
        stage: row.stage,
        source: row.source,
        evidenceIds: row.evidenceIds,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }) as never,
  };
}

const emptyTaskReader = { async list() { return []; } };
const emptyPersonalReader = { async list() { return []; } };
const emptyAppointmentReader = { async list() { return []; } };

function homeDependencies(
  followupReaderFactory: () => RelationshipLifecycleFactsReader | null,
): HomeFactsRouteDependencies {
  return {
    taskService: emptyTaskReader,
    personalScheduleService: emptyPersonalReader,
    appointmentService: emptyAppointmentReader,
    followupReaderFactory,
  };
}

test("configured facts reader uses one strict projected SQL statement and preserves domain ids", async () => {
  const client = fakeSqlClient(envelope());
  const reader = createRelationshipLifecycleFactsReader({
    client,
    workspaceId,
    sourceLabel: "F facts",
  });

  const facts = await reader.readRelationshipLifecycleFacts(actorId);

  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0]?.values, [workspaceId, actorId]);
  assert.match(client.calls[0]?.text ?? "", /jsonb_typeof\s*\(/u);
  assert.match(
    client.calls[0]?.text ?? "",
    /payload\s*->\s*'accountId'\s*=\s*to_jsonb\(\$2::text\)/u,
  );
  assert.doesNotMatch(client.calls[0]?.text ?? "", /->>/u);
  assert.deepEqual(facts.tasks.map((item) => [item.id, item.metadata.recordId]), [
    ["task:current", "storage:task:current"],
  ]);
  assert.deepEqual(facts.connections.map((item) => [item.id, item.metadata.recordId]), [
    ["connection:ren", "storage:connection:ren"],
  ]);
  assert.equal(facts.contacts[0]?.displayName, "Ren Ito");
});

test("decoder keeps legacy optional/evidence behavior but drops invalid business rows", async () => {
  const valid = taskRow({
    contactId: "",
    connectionId: null,
    dueAt: "",
    source: { type: "manual", id: "source:kept", label: " " },
    evidenceIds: [1, " evidence:kept", " "] as unknown as readonly string[],
  });
  const invalid = taskRow({ id: "task:invalid", status: "not-a-status" });
  const client = fakeSqlClient(envelope({ tasks: [valid, invalid] }));
  const reader = createRelationshipLifecycleFactsReader({ client, workspaceId });

  const facts = await reader.readRelationshipLifecycleFacts(actorId);

  assert.equal(facts.tasks.length, 1);
  assert.equal(facts.tasks[0]?.id, "task:current");
  assert.equal(facts.tasks[0]?.contactId, undefined);
  assert.equal(facts.tasks[0]?.connectionId, undefined);
  assert.equal(facts.tasks[0]?.dueAt, undefined);
  assert.deepEqual(facts.tasks[0]?.source, { type: "manual", id: "source:kept" });
  assert.deepEqual(facts.tasks[0]?.evidenceIds, [" evidence:kept"]);
});

test("raw SQL rows require every projected key, including null-capable keys", async () => {
  const missingTaskKey = { ...taskRow() } as Record<string, unknown>;
  delete missingTaskKey.dueAt;
  const missingSourceLabel = taskRow({
    source: { type: "manual", id: "source:missing-label" },
  });
  const missingOrganization = { ...contactRow() } as Record<string, unknown>;
  delete missingOrganization.organization;

  for (const tasks of [
    [missingTaskKey as never],
    [taskRow({ source: missingSourceLabel.source })],
  ]) {
    const reader = createRelationshipLifecycleFactsReader({
      client: fakeSqlClient(envelope({ tasks })),
      workspaceId,
    });
    await assert.rejects(reader.readRelationshipLifecycleFacts(actorId), /shape|source/i);
  }
  const contactReader = createRelationshipLifecycleFactsReader({
    client: fakeSqlClient(envelope({ contacts: [missingOrganization as never] })),
    workspaceId,
  });
  await assert.rejects(contactReader.readRelationshipLifecycleFacts(actorId), /shape/i);
});

test("decoder rejects missing followup owners and an impossible row kind", async () => {
  const legacy = taskRow({
    id: "task:legacy-empty-user",
    metadata: metadata("tasks", "storage:task:legacy-empty-user", ""),
  });
  const validReader = createRelationshipLifecycleFactsReader({
    client: fakeSqlClient(envelope({ tasks: [legacy] })),
    workspaceId,
  });
  await assert.rejects(validReader.readRelationshipLifecycleFacts(actorId), /owner scope/i);

  const nullProofReader = createRelationshipLifecycleFactsReader({
    client: fakeSqlClient(envelope({
      tasks: [taskRow({
        authorization: { actorOwned: null as never, connectionAuthorized: false },
      })],
    })),
    workspaceId,
  });
  await assert.rejects(
    nullProofReader.readRelationshipLifecycleFacts(actorId),
    /authorization|proof/i,
  );

  const wrongKindReader = createRelationshipLifecycleFactsReader({
    client: fakeSqlClient(envelope({ tasks: [taskRow({ kind: "connection" as never })] })),
    workspaceId,
  });
  await assert.rejects(wrongKindReader.readRelationshipLifecycleFacts(actorId), /kind/i);
});

test("duplicate domain identities fail closed instead of last-wins", async () => {
  const client = fakeSqlClient(
    envelope({ tasks: [taskRow(), taskRow({ metadata: metadata("tasks", "storage:task:duplicate"), title: "冲突内容" })] }),
  );
  const reader = createRelationshipLifecycleFactsReader({ client, workspaceId });

  await assert.rejects(
    reader.readRelationshipLifecycleFacts(actorId),
    /duplicate|identity|conflict/i,
  );
});

test("equivalent duplicate identity policy is stable and conflicts fail closed for every domain", async () => {
  const conflictingConnections = createRelationshipLifecycleFactsReader({
    client: fakeSqlClient(envelope({
      connections: [
        connectionRow(),
        connectionRow({ metadata: metadata("connections", "storage:connection:conflict"), summary: "冲突连接" }),
      ],
    })),
    workspaceId,
  });
  await assert.rejects(conflictingConnections.readRelationshipLifecycleFacts(actorId), /duplicate|identity|conflict/i);

  const conflictingContacts = createRelationshipLifecycleFactsReader({
    client: fakeSqlClient(envelope({
      contacts: [
        contactRow(),
        contactRow({ metadata: metadata("contacts", "storage:contact:conflict", null), displayName: "冲突联系人" }),
      ],
    })),
    workspaceId,
  });
  await assert.rejects(conflictingContacts.readRelationshipLifecycleFacts(actorId), /duplicate|identity|conflict/i);
});

test("a large equivalent duplicate task group preserves every task without changing identity", async () => {
  const duplicates = Array.from({ length: 1000 }, (_, index) => taskRow({
    metadata: metadata("tasks", `storage:task:equivalent:${index}`),
  }));
  const reader = createRelationshipLifecycleFactsReader({
    client: fakeSqlClient(envelope({ tasks: duplicates, connections: [], contacts: [] })),
    workspaceId,
  });

  const facts = await reader.readRelationshipLifecycleFacts(actorId);

  assert.equal(facts.tasks.length, 1000);
  assert.equal(new Set(facts.tasks.map((item) => item.id)).size, 1);
});

test("home default followup loader explicitly binds facts reader and never calls the legacy graph provider", async () => {
  const calls: string[] = [];
  const facts = factsFromRows(envelope());
  const result = await loadHomeFacts(
    {
      actorId,
      snapshotAt: at,
      dependencies: homeDependencies(() => {
        calls.push("factory");
        return memoryReader(facts, { calls });
      }),
    },
  );

  assert.deepEqual(calls, ["factory", actorId]);
  assert.equal(result.followups.state, "ready");
  assert.equal(result.followups.count, 1);
  assert.equal(result.followups.items[0]?.operationHref, "/app/contacts/contact%3Aren");
  assert.equal(result.followups.items[0]?.connectionId, "connection:ren");
});

test("home default uses bounded summary SQL while the legacy loader uses the scoped graph query", async () => {
  const syntheticDatabaseUrl = "postgresql://w5-f-mock@127.0.0.1:1/orbit_w5_f_test";
  const previous = {
    eventUrl: process.env.ORBIT_EVENT_DATABASE_URL,
    workspace: process.env.ORBIT_WORKSPACE_ID,
  };
  const originalPoolQuery = Pool.prototype.query;
  let factsCalls = 0;
  let legacyCalls = 0;
  Pool.prototype.query = (async function(
    this: Pool,
    text: unknown,
    values?: readonly unknown[],
  ) {
    const options = (this as unknown as { options?: { connectionString?: string } }).options;
    if (options?.connectionString !== syntheticDatabaseUrl) {
      return Reflect.apply(originalPoolQuery as unknown as (...args: unknown[]) => unknown, this, [text, values]);
    }
    if (text === LIFECYCLE_HOME_SUMMARY_SQL) {
      factsCalls += 1;
      assert.deepEqual(values?.slice(0, 3), [workspaceId, actorId, at]);
      return { rows: [{ result: {
        ok: true,
        runtime: { pg: "160012", encoding: "UTF8", catalog: "153.136", actual: "153.136", provider: "i", deterministic: true },
        counts: { current: 40, history: 2, orphan: 0 }, groups: { overdue: 40, recent: 0, undated: 0 },
        items: [{ id: "task:current", recordId: "storage:current", dueKey: "2026-09-16T00:00:00Z", titlePreview: "Current task", status: "open",
          dueAt: "2026-09-16T00:00:00Z", updatedAt: at, contactId: "contact:ren", connectionId: "connection:ren",
          contactNamePreview: "Ren", organizationPreview: "Orbit", relationshipStage: "active", issue: null, group: "overdue" }],
      } }] };
    }
    legacyCalls += 1;
    assert.deepEqual(values, [workspaceId, actorId, "followups"]);
    return {
      rows: [{
        workspace_id: workspaceId,
        collection_name: "tasks",
        record_id: "storage:legacy-task",
        user_id: actorId,
        source_type: "manual",
        source_id: source.id,
        source_label: source.label,
        provider: "w5-test",
        provider_record_id: "storage:legacy-task",
        evidence_ids: ["evidence:w5-f"],
        target_type: null,
        target_id: null,
        occurred_at: at,
        lifecycle_state: "active",
        search_text: "legacy private storage",
        payload: {
          id: "task:legacy-default",
          title: "Legacy default task",
          status: "open",
          source,
          evidenceIds,
          createdAt: at,
          updatedAt: at,
        },
        created_at: at,
        updated_at: at,
        deleted_at: null,
      }],
    };
  }) as never;
  process.env.ORBIT_EVENT_DATABASE_URL = syntheticDatabaseUrl;
  process.env.ORBIT_WORKSPACE_ID = workspaceId;
  try {
    const home = await loadHomeFacts({
      actorId,
      snapshotAt: at,
      dependencies: {
        appointmentService: null,
        personalScheduleService: null,
        taskService: null,
      },
    });
    assert.equal(factsCalls, 1);
    assert.equal(home.followups.state, "ready");
    assert.equal(home.followups.sourceLabel, "关系跟进");
    assert.equal(home.followups.count, 40);
    assert.equal(home.followups.items[0]?.id, "task:current");

    const legacy = await loadRelationshipLifecycleTasks({ actorId });
    assert.equal(legacy.sourceLabel, "Followup Postgres live storage");
    assert.equal(legacy.state, "success");
    assert.equal(legacyCalls, 1);
    assert.equal(legacy.orphanTasks[0]?.id, "task:legacy-default");
  } finally {
    Pool.prototype.query = originalPoolQuery;
    if (previous.eventUrl === undefined) delete process.env.ORBIT_EVENT_DATABASE_URL;
    else process.env.ORBIT_EVENT_DATABASE_URL = previous.eventUrl;
    if (previous.workspace === undefined) delete process.env.ORBIT_WORKSPACE_ID;
    else process.env.ORBIT_WORKSPACE_ID = previous.workspace;
  }
});

test("reader and provider are mutually exclusive at runtime, including explicit null", async () => {
  let readerCalls = 0;
  let providerCalls = 0;
  const reader = memoryReader(factsFromRows(envelope()), {
    calls: ["unused"],
  });
  const provider = {
    source: "legacy:test",
    sourceLabel: "Legacy test provider",
    async readFollowupGraph() {
      providerCalls += 1;
      return { tasks: [], contacts: [], connections: [], evidence: [], generatedAt: at };
    },
  };
  const countingReader: RelationshipLifecycleFactsReader = {
    sourceLabel: reader.sourceLabel,
    async readRelationshipLifecycleFacts(id) {
      readerCalls += 1;
      return reader.readRelationshipLifecycleFacts(id);
    },
  };

  const both = await loadRelationshipLifecycleTasks({
    actorId,
    reader: countingReader,
    provider,
  } as never);
  const nullReader = await loadRelationshipLifecycleTasks({ actorId, reader: null });

  assert.equal(both.state, "unavailable");
  assert.equal(nullReader.state, "unavailable");
  assert.equal(readerCalls, 0);
  assert.equal(providerCalls, 0);
});

test("malformed reader result is unavailable rather than an empty success", async () => {
  const malformed: RelationshipLifecycleFactsReader = {
    sourceLabel: "Malformed facts",
    async readRelationshipLifecycleFacts() {
      return { tasks: [], contacts: [], connections: [{ bad: true }] } as never;
    },
  };

  const result = await loadRelationshipLifecycleTasks({ actorId, reader: malformed });

  assert.equal(result.state, "unavailable");
  assert.equal(result.currentTasks.length, 0);

  const home = await loadHomeFacts({
    actorId,
    snapshotAt: at,
    dependencies: homeDependencies(() => malformed),
  });
  assert.equal(home.followups.count, null);
});

test("invalid normalized rows fail closed instead of being filtered into empty success", async () => {
  for (const invalidTask of [
    taskRow({ status: "not-a-status" }),
    taskRow({ source: { type: "bad", id: "source:bad", label: "bad" } }),
    taskRow({ evidenceIds: [] }),
  ]) {
    const result = await loadRelationshipLifecycleTasks({
      actorId,
      reader: memoryReader(factsFromRows(envelope({ tasks: [invalidTask] }))),
    });
    assert.equal(result.state, "unavailable");
    const home = await loadHomeFacts({
      actorId,
      snapshotAt: at,
      dependencies: homeDependencies(() => memoryReader(factsFromRows(envelope({ tasks: [invalidTask] })))),
    });
    assert.equal(home.followups.state, "unavailable");
    assert.equal(home.followups.count, null);
  }
});

test("normalized metadata requires non-empty workspace scope while empty facts stay valid", async () => {
  const emptyFacts: RelationshipLifecycleFacts = { tasks: [], connections: [], contacts: [] };
  const empty = await loadRelationshipLifecycleTasks({
    actorId,
    reader: memoryReader(emptyFacts),
  });
  assert.equal(empty.state, "empty");
  assert.equal(empty.currentCount, 0);

  const emptyWorkspace = taskRow({
    id: "task:empty-workspace",
    metadata: metadata("tasks", "storage:task:empty-workspace", actorId, { workspaceId: "" }),
  });
  const mixedWorkspace = taskRow({
    id: "task:mixed-empty-workspace",
    metadata: metadata("tasks", "storage:task:mixed-empty-workspace", actorId, { workspaceId: "" }),
  });
  const invalidFacts = [
    factsFromRows(envelope({ tasks: [emptyWorkspace], connections: [], contacts: [] })),
    factsFromRows(envelope({ tasks: [taskRow(), mixedWorkspace], connections: [], contacts: [] })),
  ];

  for (const facts of invalidFacts) {
    const result = await loadRelationshipLifecycleTasks({ actorId, reader: memoryReader(facts) });
    assert.equal(result.state, "unavailable");

    const home = await loadHomeFacts({
      actorId,
      snapshotAt: at,
      dependencies: homeDependencies(() => memoryReader(facts)),
    });
    assert.equal(home.followups.state, "unavailable");
    assert.equal(home.followups.count, null);
  }
});

test("no actor returns before reader/provider factories and queries", async () => {
  let readerFactoryCalls = 0;
  let readerCalls = 0;
  let taskFactoryCalls = 0;
  const result = await loadHomeFacts({
    actorId: "   ",
    snapshotAt: at,
    dependencies: {
      followupReaderFactory: () => {
        readerFactoryCalls += 1;
        return {
          sourceLabel: "should not run",
          async readRelationshipLifecycleFacts() {
            readerCalls += 1;
            return factsFromRows(envelope());
          },
        };
      },
      taskServiceFactory: () => {
        taskFactoryCalls += 1;
        return emptyTaskReader;
      },
      personalScheduleServiceFactory: () => emptyPersonalReader,
      appointmentServiceFactory: () => emptyAppointmentReader,
    },
  });

  assert.equal(result.tasks.state, "unavailable");
  assert.equal(readerFactoryCalls, 0);
  assert.equal(readerCalls, 0);
  assert.equal(taskFactoryCalls, 0);
});

test("legacy provider path remains available when no reader is supplied", async () => {
  let providerCalls = 0;
  const result = await loadRelationshipLifecycleTasks({
    actorId,
    provider: {
      source: "legacy:test",
      sourceLabel: "",
      async readFollowupGraph(requestedActorId) {
        providerCalls += 1;
        assert.equal(requestedActorId, actorId);
        return {
          tasks: [
            {
              id: "legacy:task",
              title: "Legacy task",
              status: "open",
              contactId: "contact:legacy",
              connectionId: "connection:legacy",
              source,
              evidenceIds,
              createdAt: at,
              updatedAt: at,
            },
          ],
          contacts: [
            {
              id: "contact:legacy",
              displayName: "Legacy Contact",
              stage: "active",
              source,
              evidenceIds,
              createdAt: at,
              updatedAt: at,
            },
          ],
          connections: [
            {
              id: "connection:legacy",
              accountId: actorId,
              contactId: "contact:legacy",
              stage: "active",
              valueTypes: [],
              summary: "Legacy relationship",
              source,
              evidenceIds,
              createdAt: at,
              updatedAt: at,
            },
          ],
          evidence: [],
          generatedAt: at,
        };
      },
    },
  });

  assert.equal(result.state, "success");
  assert.equal(result.sourceLabel, "");
  assert.equal(providerCalls, 1);
  assert.equal(result.currentTasks[0]?.id, "legacy:task");
});

test("facts reader and legacy provider use the same task classification mapper", async () => {
  const facts = factsFromRows(envelope({
    tasks: [
      taskRow({ id: "task:current", metadata: metadata("tasks", "storage:task:current") }),
      taskRow({ id: "task:history", status: "completed", metadata: metadata("tasks", "storage:task:history") }),
      taskRow({ id: "task:orphan", connectionId: "connection:missing", contactId: null, metadata: metadata("tasks", "storage:task:orphan") }),
    ],
  }));
  const readerResult = await loadRelationshipLifecycleTasks({ actorId, reader: memoryReader(facts) });
  const legacyGraph = {
    tasks: [
      { id: "task:current", title: "确认后续资料", status: "open" as const, contactId: "contact:ren", connectionId: "connection:ren", source, evidenceIds, createdAt: at, updatedAt: at },
      { id: "task:history", title: "确认后续资料", status: "completed" as const, contactId: "contact:ren", connectionId: "connection:ren", source, evidenceIds, createdAt: at, updatedAt: at },
      { id: "task:orphan", title: "确认后续资料", status: "open" as const, connectionId: "connection:missing", source, evidenceIds, createdAt: at, updatedAt: at },
    ],
    contacts: [{ id: "contact:ren", displayName: "Ren Ito", organization: "Orbit Labs", stage: "active" as const, source, evidenceIds, createdAt: at, updatedAt: at }],
    connections: [{ id: "connection:ren", accountId: actorId, contactId: "contact:ren", stage: "active" as const, valueTypes: [], summary: "关系上下文", source, evidenceIds, createdAt: at, updatedAt: at }],
    evidence: [],
    generatedAt: at,
  };
  const legacyCollections = relationshipLifecycleTasksFromGraph(legacyGraph);

  assert.equal(readerResult.state, "success");
  assert.deepEqual(readerResult.currentTasks.map((item) => item.id), legacyCollections.currentTasks.map((item) => item.id));
  assert.deepEqual(readerResult.historyTasks.map((item) => item.id), legacyCollections.historyTasks.map((item) => item.id));
  assert.deepEqual(readerResult.orphanTasks.map((item) => item.id), legacyCollections.orphanTasks.map((item) => item.id));
});

test("memory reader preserves current/history/orphan distinctions for the existing task mapper", async () => {
  const facts = factsFromRows(
    envelope({
      tasks: [
        taskRow({ id: "task:current", metadata: metadata("tasks", "storage:task:current") }),
        taskRow({ id: "task:history", status: "completed", dueAt: null, metadata: metadata("tasks", "storage:task:history") }),
        taskRow({ id: "task:orphan", connectionId: "connection:missing", contactId: null, metadata: metadata("tasks", "storage:task:orphan") }),
      ],
    }),
  );
  const result = await loadRelationshipLifecycleTasks({
    actorId,
    reader: memoryReader(facts),
  });

  assert.equal(result.state, "success");
  assert.equal(result.currentCount, 1);
  assert.equal(result.historyCount, 1);
  assert.equal(result.orphanCount, 1);
  assert.deepEqual(result.currentTasks.map((item) => item.id), ["task:current"]);
  assert.equal(result.historyTasks[0]?.id, "task:history");
  assert.equal(result.orphanTasks[0]?.id, "task:orphan");
});

test("home followups cap current display globally while retaining history/orphan metadata", async () => {
  const current = Array.from({ length: 5 }, (_, index) => taskRow({
    id: `task:current:${index}`,
    metadata: metadata("tasks", `storage:task:current:${index}`),
  }));
  const facts = factsFromRows(envelope({
    tasks: [
      ...current,
      taskRow({ id: "task:history-only", status: "completed", metadata: metadata("tasks", "storage:task:history-only") }),
      taskRow({ id: "task:orphan-only", connectionId: "connection:missing", contactId: null, metadata: metadata("tasks", "storage:task:orphan-only") }),
    ],
  }));
  const home = await loadHomeFacts({
    actorId,
    snapshotAt: at,
    dependencies: homeDependencies(() => memoryReader(facts)),
  });

  assert.equal(home.followups.state, "ready");
  assert.equal(home.followups.count, 5);
  assert.equal(home.followups.items.length, 3);
  assert.equal(home.followups.current.count, 5);
  assert.equal(home.followups.current.items.length, 3);
  assert.equal(home.followups.history.count, 1);
  assert.deepEqual(home.followups.history.items, []);
  assert.equal(home.followups.orphan.count, 1);
  assert.deepEqual(home.followups.orphan.items, []);
  assert.match(home.followups.orphan.warning ?? "", /失联/);
});

test("reader loader trims only the validated actor boundary and does not invoke a null factory", async () => {
  const requestedActors: string[] = [];
  const result = await loadRelationshipLifecycleTasks({
    actorId: `  ${actorId}  `,
    reader: memoryReader(factsFromRows(envelope()), { calls: requestedActors }),
  });
  assert.equal(result.state, "success");
  assert.deepEqual(requestedActors, [actorId]);

  const unconfigured = await loadRelationshipLifecycleTasks({ actorId, reader: null });
  assert.equal(unconfigured.state, "unavailable");
  assert.equal(unconfigured.currentCount, 0);
});

test("equivalent task duplicates are preserved while equivalent contacts and connections choose a stable record", async () => {
  const equalTask = taskRow({ metadata: metadata("tasks", "storage:task:equal-b") });
  const equalConnection = connectionRow({ metadata: metadata("connections", "storage:connection:z") });
  const equalContact = contactRow({ metadata: metadata("contacts", "storage:contact:z", null) });
  const client = fakeSqlClient(envelope({
    tasks: [taskRow({ metadata: metadata("tasks", "storage:task:equal-a") }), equalTask],
    connections: [connectionRow({ metadata: metadata("connections", "storage:connection:a") }), equalConnection],
    contacts: [contactRow({ metadata: metadata("contacts", "storage:contact:a", null) }), equalContact],
  }));
  const reader = createRelationshipLifecycleFactsReader({ client, workspaceId });

  const facts = await reader.readRelationshipLifecycleFacts(actorId);

  assert.equal(facts.tasks.length, 2);
  assert.equal(facts.connections.length, 1);
  assert.equal(facts.connections[0]?.metadata.recordId, "storage:connection:a");
  assert.equal(facts.contacts.length, 1);
  assert.equal(facts.contacts[0]?.metadata.recordId, "storage:contact:a");
});

test("query rejection, bad envelope, unsupported reader and factory null all remain unavailable", async () => {
  const rejectedClient: LiveRecordSqlClient = {
    async query() {
      throw new Error("query rejected");
    },
  };
  const rejectedReader = createRelationshipLifecycleFactsReader({ client: rejectedClient, workspaceId });
  const rejected = await loadRelationshipLifecycleTasks({ actorId, reader: rejectedReader });
  const badEnvelopeReader = createRelationshipLifecycleFactsReader({ client: fakeSqlClient(null), workspaceId });
  const badEnvelope = await loadRelationshipLifecycleTasks({ actorId, reader: badEnvelopeReader });
  const unsupported = await loadRelationshipLifecycleTasks({ actorId, reader: { sourceLabel: "unsupported" } as never });

  assert.equal(rejected.state, "unavailable");
  assert.equal(badEnvelope.state, "unavailable");
  assert.equal(unsupported.state, "unavailable");
  const nullHome = await loadHomeFacts({
    actorId,
    snapshotAt: at,
    dependencies: homeDependencies(() => null),
  });
  assert.equal(nullHome.followups.state, "unavailable");
  assert.equal(nullHome.followups.count, null);
});

test("configured reader source failure is isolated as unavailable", async () => {
  const reader: RelationshipLifecycleFactsReader = {
    sourceLabel: "Failing facts",
    async readRelationshipLifecycleFacts() {
      throw new Error("database unavailable");
    },
  };
  const result = await loadRelationshipLifecycleTasks({ actorId, reader });

  assert.equal(result.state, "unavailable");
  assert.equal(result.sourceLabel, "Failing facts");
  assert.equal(result.currentCount, 0);
});

test("loader validates an already decoded narrow reader result without requiring omitted optionals", async () => {
  const client = fakeSqlClient(envelope({
    tasks: [taskRow({ contactId: null, connectionId: null, dueAt: null })],
  }));
  const configured = createRelationshipLifecycleFactsReader({ client, workspaceId });
  const decoded = await configured.readRelationshipLifecycleFacts(actorId);
  const result = await loadRelationshipLifecycleTasks({
    actorId,
    reader: memoryReader(decoded),
  });

  assert.equal(result.state, "success");
  assert.equal(result.currentCount, 0);
  assert.equal(result.orphanCount, 1);
});
