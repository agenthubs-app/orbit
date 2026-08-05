import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import {
  createEventOperationsOutboxProjector,
  EventOperationsOutboxProjectionError,
} from "../../features/events/event-operations/outbox-projector";
import type { EventOperationsOutboxMessage } from "../../features/events/event-operations/storage/postgres-outbox-repository";
import {
  PROFILE_CONTRACT_REPAIR_AUDIT_ACTION,
  PROFILE_CONTRACT_REPAIR_EVENT_TYPE,
  parseProfileContractRepairAuditOutboxPayload,
  type ProfileContractRepairAuditOutboxPayload,
} from "../../features/events/registration/profile-contract-repair/audit-outbox-contract";
import {
  PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
  PROFILE_CONTRACT_REPAIR_TYPE,
} from "../../features/events/registration/profile-contract-repair/ledger-contract";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const WORKSPACE_ID = "workspace:profile-repair-audit-outbox-test";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function payload(
  overrides: Partial<ProfileContractRepairAuditOutboxPayload> = {},
): ProfileContractRepairAuditOutboxPayload {
  return {
    activationAuditFingerprint: hash("activation-audit"),
    afterMembershipHash: hash("membership-after"),
    afterProfileHash: hash("profile-after"),
    beforeMembershipHash: hash("membership-before"),
    beforeProfileHash: hash("profile-before"),
    configurationVersion: 3,
    eventContentHash: hash("event-content"),
    eventId: "event:public:tokyo-ai-night",
    eventVersion: 7,
    occurredAt: "2026-08-05T10:00:01.000Z",
    planHash: hash("reviewed-repair-plan"),
    preservedStatus: "rsvped",
    profileEditDeadlineAt: "2026-08-05T09:30:00.000Z",
    removedPaths: ["registrationProfile.answers.industry"],
    repairId: "repair-run:20260805:primary",
    repairType: PROFILE_CONTRACT_REPAIR_TYPE,
    schemaVersion: PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
    sourceMembershipVersion: 11,
    sourceProfileVersion: 4,
    targetMembershipVersion: 12,
    targetProfileVersion: 5,
    targetToken: `profile-target-sha256:${hash("private-target-identity")}`,
    ...overrides,
  };
}

function message(
  value: unknown = payload(),
  overrides: Partial<EventOperationsOutboxMessage> = {},
): EventOperationsOutboxMessage {
  const record =
    value && typeof value === "object"
      ? (value as Readonly<Record<string, unknown>>)
      : {};
  const targetToken =
    typeof record.targetToken === "string"
      ? record.targetToken
      : `profile-target-sha256:${hash("invalid-target-placeholder")}`;
  return {
    aggregateId: targetToken,
    aggregateType: "event_participant_profile",
    attempts: 1,
    eventId: "event:public:tokyo-ai-night",
    eventType: PROFILE_CONTRACT_REPAIR_EVENT_TYPE,
    leaseEpoch: 1,
    leaseExpiresAt: "2026-08-05T10:01:00.000Z",
    leaseToken: "lease:profile-repair:1",
    outboxId: "outbox:profile-repair:public-token:1",
    payload: record,
    workerId: "worker:profile-repair-test",
    ...overrides,
  };
}

function projectorWithMemoryStore() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  return {
    projector: createEventOperationsOutboxProjector({
      contactRequestNotifications: null,
      registrationProvider: createEventRegistrationLiveRecordProvider({
        store,
        workspaceId: WORKSPACE_ID,
      }),
      relationshipProvider: createStorageBusinessCardContactWriteProvider({
        store,
        workspaceId: WORKSPACE_ID,
      }),
    }),
    store,
  };
}

function objectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Readonly<Record<string, unknown>>).flatMap(
    ([key, item]) => [key, ...objectKeys(item)],
  );
}

test("profile repair audit/outbox contract is canonical, redacted, and exact", () => {
  assert.equal(
    PROFILE_CONTRACT_REPAIR_AUDIT_ACTION,
    "event.registration.profile_contract_repaired",
  );
  assert.equal(PROFILE_CONTRACT_REPAIR_EVENT_TYPE, PROFILE_CONTRACT_REPAIR_AUDIT_ACTION);

  const registrationOnly = payload();
  const registrationOnlyResult =
    parseProfileContractRepairAuditOutboxPayload(registrationOnly);
  assert.equal(registrationOnlyResult.ok, true);

  const participantMirror = payload({
    preservedStatus: "cancelled",
    removedPaths: [
      "participant.profileAnswers.industry",
      "registrationProfile.answers.industry",
    ],
  });
  assert.equal(parseProfileContractRepairAuditOutboxPayload(participantMirror).ok, true);
  assert.equal(
    parseProfileContractRepairAuditOutboxPayload(
      payload({ eventId: "活动:東京✨" }),
    ).ok,
    true,
  );

  const keys = objectKeys([registrationOnly, participantMirror]);
  for (const forbidden of [
    "actorId",
    "participantId",
    "userId",
    "displayName",
    "answers",
    "profilePayload",
  ]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
  const serialized = JSON.stringify([registrationOnly, participantMirror]);
  for (const privateValue of [
    "actor:private",
    "participant:private",
    "private.person@example.com",
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
});

test("profile repair parser is total and snapshots successful input without aliases", () => {
  const mutable = payload() as ProfileContractRepairAuditOutboxPayload & {
    removedPaths: ProfileContractRepairAuditOutboxPayload["removedPaths"];
  };
  const parsed = parseProfileContractRepairAuditOutboxPayload(mutable);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.ok);
  assert.notEqual(parsed.value, mutable);
  assert.notEqual(parsed.value.removedPaths, mutable.removedPaths);
  assert.equal(Object.isFrozen(parsed.value), true);
  assert.equal(Object.isFrozen(parsed.value.removedPaths), true);
  const originalEventId = parsed.value.eventId;
  mutable.eventId = "event:mutated-after-parse";
  mutable.removedPaths = ["registrationProfile.answers.desiredOutcome"];
  assert.equal(parsed.value.eventId, originalEventId);
  assert.deepEqual(parsed.value.removedPaths, ["registrationProfile.answers.industry"]);

  const getter = payload() as unknown as Record<string, unknown>;
  Object.defineProperty(getter, "targetToken", {
    enumerable: true,
    get() {
      throw new Error("private getter value must not escape");
    },
  });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const throwingProxy = new Proxy(payload(), {
    ownKeys() {
      throw new Error("private proxy value must not escape");
    },
  });
  const { proxy: revokedProxy, revoke } = Proxy.revocable(payload(), {});
  revoke();

  for (const candidate of [getter, cyclic, throwingProxy, revokedProxy]) {
    assert.doesNotThrow(() =>
      parseProfileContractRepairAuditOutboxPayload(candidate),
    );
    assert.equal(parseProfileContractRepairAuditOutboxPayload(candidate).ok, false);
  }
});

test("profile repair parser rejects malformed, extra, noncanonical, and identifying values", () => {
  const valid = payload();
  const cases: readonly Readonly<Record<string, unknown>>[] = [
    { ...valid, unexpected: "field" },
    { ...valid, targetToken: "participant:private.person@example.com" },
    { ...valid, repairId: "private.person@example.com" },
    { ...valid, planHash: valid.planHash.toUpperCase() },
    { ...valid, occurredAt: "2026-08-05T10:00:01Z" },
    { ...valid, profileEditDeadlineAt: "2026-08-05 09:30:00Z" },
    { ...valid, preservedStatus: "pending" },
    { ...valid, targetProfileVersion: valid.sourceProfileVersion + 2 },
    { ...valid, afterMembershipHash: valid.beforeMembershipHash },
    {
      ...valid,
      removedPaths: ["participant.profileAnswers.industry"],
    },
    {
      ...valid,
      removedPaths: [
        "registrationProfile.answers.industry",
        "participant.profileAnswers.industry",
      ],
    },
    {
      ...valid,
      removedPaths: [
        "registrationProfile.answers.industry",
        "registrationProfile.answers.industry",
      ],
    },
  ];

  for (const candidate of cases) {
    assert.deepEqual(parseProfileContractRepairAuditOutboxPayload(candidate), {
      code: "EVENT_OPERATIONS_PROFILE_REPAIR_PAYLOAD_INVALID",
      message: "The profile repair outbox payload is invalid.",
      ok: false,
    });
  }
});

test("profile repair outbox projection is explicit canonical-only and replay-safe", async () => {
  const { projector, store } = projectorWithMemoryStore();
  for (const preservedStatus of ["rsvped", "cancelled"] as const) {
    const current = message(payload({ preservedStatus }));
    for (let replay = 0; replay < 10; replay += 1) {
      assert.deepEqual(await projector.project(current), {
        policy: "canonical_only",
        projectedIds: [],
        projection: "none",
      });
    }
  }
  assert.deepEqual(await store.listRecords({ workspaceId: WORKSPACE_ID }), []);
});

test("profile repair projector fails closed without echoing payload or unknown event values", async () => {
  const { projector } = projectorWithMemoryStore();
  const privateValue = "participant:private.person@example.com";

  await assert.rejects(
    projector.project(message({ ...payload(), targetToken: privateValue })),
    (error: unknown) => {
      assert.ok(error instanceof EventOperationsOutboxProjectionError);
      assert.equal(error.code, "EVENT_OPERATIONS_PROFILE_REPAIR_PAYLOAD_INVALID");
      assert.equal(error.retryable, false);
      assert.equal(error.message.includes(privateValue), false);
      return true;
    },
  );
  await assert.rejects(
    projector.project(
      message(payload(), {
        eventType: `event.registration.profile_contract_repaired.${privateValue}`,
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof EventOperationsOutboxProjectionError);
      assert.equal(error.code, "EVENT_OPERATIONS_OUTBOX_EVENT_UNSUPPORTED");
      assert.equal(error.retryable, false);
      assert.equal(error.message.includes(privateValue), false);
      return true;
    },
  );
  await assert.rejects(
    projector.project(message(payload(), { eventId: "event:public:mismatch" })),
    (error: unknown) =>
      error instanceof EventOperationsOutboxProjectionError &&
      error.code === "EVENT_OPERATIONS_PROFILE_REPAIR_PAYLOAD_INVALID" &&
      error.retryable === false,
  );
  for (const aggregateOverrides of [
    { aggregateType: "event_registration" },
    { aggregateId: `profile-target-sha256:${hash("wrong-target")}` },
  ]) {
    await assert.rejects(
      projector.project(message(payload(), aggregateOverrides)),
      (error: unknown) =>
        error instanceof EventOperationsOutboxProjectionError &&
        error.code === "EVENT_OPERATIONS_PROFILE_REPAIR_PAYLOAD_INVALID" &&
        error.retryable === false,
    );
  }
});

test(
  "profile repair canonical-only projection leaves the real legacy repository byte-for-byte unchanged",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 30_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const schema = `profile_repair_outbox_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${randomUUID()}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      options: `-c search_path=${schema}`,
    });

    try {
      await admin.query(`create schema ${schema}`);
      await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
      const store = createPostgresLiveRecordStore<Record<string, unknown>>({
        client: {
          async query(text, values) {
            const result = await pool.query(
              text,
              values === undefined ? undefined : [...values],
            );
            return { rows: result.rows };
          },
        },
      });
      await store.upsertRecord({
        collectionName: "sentinel",
        createdAt: "2026-08-05T09:00:00.000Z",
        evidenceIds: [],
        lifecycleState: "active",
        payload: { invariant: "legacy repository must not change" },
        recordId: "sentinel:profile-repair",
        sourceId: "source:sentinel",
        sourceType: "manual",
        updatedAt: "2026-08-05T09:00:00.000Z",
        workspaceId,
      });
      const projector = createEventOperationsOutboxProjector({
        contactRequestNotifications: null,
        registrationProvider: createEventRegistrationLiveRecordProvider({
          store,
          workspaceId,
        }),
        relationshipProvider: createStorageBusinessCardContactWriteProvider({
          store,
          workspaceId,
        }),
      });
      const snapshot = async () =>
        JSON.stringify(
          (
            await pool.query(
              `select workspace_id, collection_name, record_id, user_id,
                      source_type, source_id, source_label, provider,
                      provider_record_id, evidence_ids, target_type, target_id,
                      occurred_at, lifecycle_state, search_text, payload,
                      created_at, updated_at, deleted_at
                 from orbit_records
                order by workspace_id, collection_name, record_id`,
            )
          ).rows,
        );
      const before = await snapshot();

      const values = [
        payload({ preservedStatus: "rsvped" }),
        payload({
          preservedStatus: "cancelled",
          removedPaths: [
            "participant.profileAnswers.industry",
            "registrationProfile.answers.industry",
          ],
          targetToken: `profile-target-sha256:${hash("cancelled-target")}`,
        }),
      ];
      for (const value of values) {
        for (let replay = 0; replay < 3; replay += 1) {
          assert.deepEqual(await projector.project(message(value)), {
            policy: "canonical_only",
            projectedIds: [],
            projection: "none",
          });
        }
      }

      assert.equal(await snapshot(), before);
      const forbiddenLegacy = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from orbit_records
          where workspace_id = $1
            and collection_name = any($2::text[])`,
        [
          workspaceId,
          ["event_registrations", "evidence", "contacts", "connections"],
        ],
      );
      assert.equal(forbiddenLegacy.rows[0]?.count, "0");
    } finally {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
