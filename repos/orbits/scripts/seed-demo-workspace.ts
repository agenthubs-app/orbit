import {
  createAuthUserService,
} from "../features/auth/auth-user-service";
import {
  createStorageAuthAccountProvisioningProvider,
} from "../features/auth/storage/auth-account-provisioning-provider";
import {
  createStorageAuthUserProvider,
  type StoredAuthUser,
} from "../features/auth/storage/auth-user-live-record-provider";
import {
  EVENT_OPERATIONS_E2E_SEED_ACCOUNTS,
  seedEventOperationsE2E,
} from "../features/events/event-operations/seed";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import type { EventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { buildEventCoreBackfillPlan, applyEventCoreBackfillPlan } from "../features/events/core/backfill";
import { readEventCoreBackfillCandidates } from "../features/events/core/backfill-sources";
import { runEventCoreMigrations } from "../features/events/core/storage/migrations";
import { readPublicEventCatalogue } from "../features/events/public-catalogue";
import {
  applyOrganizerAccountBootstrapPlan,
  buildOrganizerAccountBootstrapPlan,
  XIAOYU_ACCOUNT_ID,
  XIAOYU_AUTH_USER_ID,
} from "../features/events/organizer-accounts/bootstrap";
import {
  applyEventOrganizerOwnerPlan,
  buildEventOrganizerOwnerPlan,
} from "../features/events/organizer-accounts/owner-migration";
import {
  EVENT_ORGANIZER_ACCOUNT_MANIFEST,
  EVENT_ORGANIZER_ASSIGNMENTS,
} from "../features/events/organizer-accounts/manifest";
import { seedEventsMockDataIntoLiveStore } from "../features/events/storage/seed-live-events";
import {
  createStorageContactActorLinkProvider,
} from "../features/contacts/contact-actor-links/storage-provider";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../shared/storage/configured-live-record-store";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../shared/storage/seed-generated-fixtures";
import { MOCK_FIXTURE_COLLECTION_NAMES } from "../shared/mock/fixtures";
import { loadLocalEnv } from "./load-local-env";
import { ensureDemoCanonicalMemberships } from "./demo-canonical-memberships";
import { buildDemoOrganizerProjection } from "./demo-organizer-projection";
import { buildDemoRelationshipProjection } from "./demo-relationship-projection";
import {
  createPostgresOrganizerMembershipWriter,
  createPostgresOrganizerOwnershipWriter,
} from "./bootstrap-event-organizer-accounts";

const DEMO_WORKSPACE_ID = "workspace:orbit-demo-fixtures";
const XIAOYU_EMAIL = "agenthubs.app@gmail.com";
const FIXTURE_TIMESTAMP = "2026-08-19T00:00:00.000Z";
const DEMO_EVENT_CORE_MANIFEST = {
  migrationId: "event-demo-canonical-v1",
  resolutions: [],
  schemaVersion: 1,
} as const;

async function seedCanonicalEventCore(input: {
  client: EventOperationsPostgresClient;
  workspaceId: string;
}): Promise<{
  canonicalMembershipEventCount: number;
  planCount: number;
  planHash: string;
  publicEventCount: number;
  signupActiveParticipantCount: number;
}> {
  const publicEventIds = readPublicEventCatalogue().events.map((event) => event.id);
  const candidates = await readEventCoreBackfillCandidates({
    client: input.client,
    defaultTimezone: "Asia/Tokyo",
    publicOwnerActorId: XIAOYU_ACCOUNT_ID,
    workspaceId: input.workspaceId,
  });
  const plan = buildEventCoreBackfillPlan(candidates, DEMO_EVENT_CORE_MANIFEST);
  const verification = await applyEventCoreBackfillPlan({
    client: input.client,
    now: FIXTURE_TIMESTAMP,
    plan,
    workspaceId: input.workspaceId,
  });
  if (verification.count !== plan.count || verification.hash !== plan.hash) {
    throw new Error("Demo Event Core backfill verification did not match its plan.");
  }

  const canonicalMembershipEventCount = await ensureDemoCanonicalMemberships({
    client: input.client,
    eventIds: publicEventIds,
    workspaceId: input.workspaceId,
  });

  const publicState = await input.client.query<{
    active_registration_count: string;
    alias_count: string;
    event_id: string;
  }>(
    `
      select
        event_row.event_id,
        count(membership_head.actor_id) filter (
          where membership_head.status = 'rsvped'
        )::text as active_registration_count,
        (
          select count(*)::text
            from event_aliases alias
           where alias.workspace_id = event_row.workspace_id
             and alias.event_id = event_row.event_id
        ) as alias_count
        from event_ops_events event_row
       left join event_ops_membership_heads membership_head
         on membership_head.workspace_id = event_row.workspace_id
        and membership_head.event_id = event_row.event_id
       where event_row.workspace_id = $1
         and event_row.event_id = any($2::text[])
         and event_row.lifecycle_state_v2 = 'published'
         and event_row.registration_migration_state = 'canonical'
       group by event_row.workspace_id, event_row.event_id
       order by event_row.event_id
    `,
    [input.workspaceId, publicEventIds],
  );
  if (publicState.rows.length !== publicEventIds.length) {
    throw new Error("Canonical public event state is incomplete after backfill.");
  }
  if (publicState.rows.some((row) => Number(row.alias_count) < 1)) {
    throw new Error("Canonical public events must have at least one alias.");
  }
  const signup = publicState.rows.find((row) => row.event_id === "event_signup_01");
  if (!signup || Number(signup.active_registration_count) !== 64) {
    throw new Error("Canonical event_signup_01 must retain 64 active participants.");
  }

  return {
    canonicalMembershipEventCount,
    planCount: plan.count,
    planHash: plan.hash,
    publicEventCount: publicState.rows.length,
    signupActiveParticipantCount: Number(signup.active_registration_count),
  };
}

async function reconcileDemoOwnerMigrationAudit(input: {
  client: EventOperationsPostgresClient;
  plan: {
    assignments: readonly { accountId: string; eventId: string }[];
    hash: string;
  };
  workspaceId: string;
}): Promise<void> {
  const result = await input.client.query<{ payload: unknown }>(
    `
      select payload
        from orbit_records
       where workspace_id = $1
         and collection_name = 'event_organizer_owner_migrations'
         and record_id = 'event-organizer-owner-migration:event-organizers-v1'
         and lifecycle_state = 'active'
       for update
    `,
    [input.workspaceId],
  );
  const existing = result.rows[0]?.payload;
  if (!existing) return;
  const payload = typeof existing === "string" ? JSON.parse(existing) : existing;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Demo owner migration audit payload is malformed.");
  }
  const actual = payload as Record<string, unknown>;
  const expectedEventIds = input.plan.assignments.map((assignment) => assignment.eventId);
  const expectedActorIds = [...new Set(input.plan.assignments.map((assignment) => assignment.accountId))].sort();
  const actualEventIds = Array.isArray(actual.eventIds) ? actual.eventIds : [];
  const actualActorIds = Array.isArray(actual.actorIds) ? [...actual.actorIds].sort() : [];
  if (
    actual.count !== input.plan.assignments.length ||
    actual.manifestVersion !== "event-organizers-v1" ||
    JSON.stringify(actualEventIds) !== JSON.stringify(expectedEventIds) ||
    JSON.stringify(actualActorIds) !== JSON.stringify(expectedActorIds)
  ) {
    throw new Error("Demo owner migration audit conflicts with the reviewed event/account set.");
  }
  if (actual.planHash === input.plan.hash) return;
  await input.client.query(
    `
      update orbit_records
         set payload = $2::jsonb
       where workspace_id = $1
         and collection_name = 'event_organizer_owner_migrations'
         and record_id = 'event-organizer-owner-migration:event-organizers-v1'
    `,
    [
      input.workspaceId,
      JSON.stringify({
        actorIds: expectedActorIds,
        count: input.plan.assignments.length,
        eventIds: expectedEventIds,
        manifestVersion: "event-organizers-v1",
        planHash: input.plan.hash,
      }),
    ],
  );
}

function requireDemoPassword(): string {
  const password = process.env.ORBIT_DEMO_ORGANIZER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "Set ORBIT_DEMO_ORGANIZER_PASSWORD to an existing demo password with at least 8 characters.",
    );
  }
  return password;
}

async function ensureXiaoyuAuthUser(
  provider: ReturnType<typeof createStorageAuthUserProvider>,
): Promise<StoredAuthUser> {
  const existing = await provider.getUserByEmail(XIAOYU_EMAIL);
  if (existing) {
    if (
      existing.id !== XIAOYU_AUTH_USER_ID ||
      existing.displayName !== "agenthubs" ||
      existing.provider !== "google"
    ) {
      throw new Error("The demo workspace already contains a conflicting agenthubs identity.");
    }
    return existing;
  }

  const user: StoredAuthUser = {
    id: XIAOYU_AUTH_USER_ID,
    email: XIAOYU_EMAIL,
    displayName: "agenthubs",
    provider: "google",
    passwordHash: null,
    providerAccountId: "google-agenthubs",
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  };
  return provider.saveUser(user);
}

async function ensureCredentialAccount(input: {
  authService: ReturnType<typeof createAuthUserService>;
  password: string;
  provider: ReturnType<typeof createStorageAuthUserProvider>;
  displayName: string;
  email: string;
}): Promise<StoredAuthUser> {
  const existing = await input.provider.getUserByEmail(input.email);
  if (existing) return existing;

  const registered = await input.authService.registerUser({
    displayName: input.displayName,
    email: input.email,
    password: input.password,
  });
  if (registered.state !== "success") {
    throw new Error(`Could not create demo participant account ${input.email}: ${registered.error.code}.`);
  }
  const created = await input.provider.getUserByEmail(input.email);
  if (!created) throw new Error(`Demo participant account did not persist: ${input.email}.`);
  return created;
}

async function main(): Promise<void> {
  loadLocalEnv();
  if (process.env.NODE_ENV === "production") {
    throw new Error("The demo workspace seed refuses NODE_ENV=production.");
  }
  const password = requireDemoPassword();
  const database = resolveLiveDatabaseConnectionConfig();
  if (!database) throw new Error("Configure the demo Neon database before seeding.");
  const configured = createConfiguredPostgresLiveRecordStore({ max: 1 });
  if (!configured) throw new Error("Configure the demo Neon database before seeding.");
  if (configured.workspaceId !== DEMO_WORKSPACE_ID) {
    throw new Error(`This seed only accepts ${DEMO_WORKSPACE_ID}.`);
  }

  const { client, store, workspaceId } = configured;
  const operationsClient = createEventOperationsPostgresClient({
    connectionString: database.connectionString,
  });

  try {
    await runOrbitRecordsMigration(client);
    await runEventCoreMigrations(operationsClient);
    const authProvider = createStorageAuthUserProvider({ store, workspaceId });
    const accountProvisioner = createStorageAuthAccountProvisioningProvider({ store, workspaceId });
    const authService = createAuthUserService({
      accountProvisioner,
      provider: authProvider,
    });

    const existingEvents = await store.listRecords({
      limit: "unbounded",
      collectionName: "events",
      workspaceId,
    });
    const generatedSeed = await seedGeneratedRelationshipFixturesIntoLiveStore({
      collectionNames: existingEvents.length === 0
        ? MOCK_FIXTURE_COLLECTION_NAMES
        : ["accounts", "profiles", "organizers"],
      store,
      workspaceId,
    });
    await ensureXiaoyuAuthUser(authProvider);

    const organizerDependencies = {
      accountProvisioner,
      authUserProvider: authProvider,
      authUserService: authService,
      contactActorLinkProvider: createStorageContactActorLinkProvider({ store, workspaceId }),
      membershipWriter: createPostgresOrganizerMembershipWriter({ client }),
      ownershipWriter: createPostgresOrganizerOwnershipWriter({ client }),
      store,
      workspaceId,
    };
    const organizerPlan = await buildOrganizerAccountBootstrapPlan({
      dependencies: organizerDependencies,
      xiaoyuAuthUserId: XIAOYU_AUTH_USER_ID,
    });
    await client.query("BEGIN");
    try {
      await applyOrganizerAccountBootstrapPlan({
        expectedCount: 28,
        expectedPlanHash: organizerPlan.hash,
        password,
        plan: organizerPlan,
      }, organizerDependencies);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const organizerByKey = new Map(
      EVENT_ORGANIZER_ACCOUNT_MANIFEST.map((definition) => [definition.key, definition]),
    );
    const eventOwnerById = new Map<string, string>();
    for (const assignment of EVENT_ORGANIZER_ASSIGNMENTS) {
      if (assignment.organizerKey === "xiaoyu") {
        eventOwnerById.set(assignment.eventId, XIAOYU_ACCOUNT_ID);
        continue;
      }
      const definition = organizerByKey.get(assignment.organizerKey);
      if (!definition) throw new Error(`Missing organizer definition for ${assignment.organizerKey}.`);
      const user = await authProvider.getUserByEmail(definition.email);
      if (!user) throw new Error(`Missing organizer auth user for ${definition.email}.`);
      eventOwnerById.set(assignment.eventId, user.id);
    }
    const existingReviewedEvents = await store.listRecords({
      limit: "unbounded",
      collectionName: "events",
      recordIds: [...eventOwnerById.keys()],
      workspaceId,
    });
    const eventSeedIsComplete =
      existingReviewedEvents.length === eventOwnerById.size &&
      existingReviewedEvents.every((record) =>
        typeof record.payload.name === "string" &&
        typeof record.payload.organizerId === "string",
      );
    if (!eventSeedIsComplete) {
      await seedEventsMockDataIntoLiveStore({
        actorId: XIAOYU_ACCOUNT_ID,
        store,
        workspaceId,
      });
      const resetOwners = await client.query<{ record_id: string }>(
        `
          update orbit_records
          set user_id = null
          where workspace_id = $1
            and collection_name = $2
            and record_id = any($3::text[])
          returning record_id
        `,
        [workspaceId, "events", [...eventOwnerById.keys()]],
      );
      if (resetOwners.rows.length !== eventOwnerById.size) {
        throw new Error("Demo event seed did not reset exactly the reviewed event owners.");
      }
    }

    const ownerPlan = await buildEventOrganizerOwnerPlan({
      client: {
        query: async <TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) => ({
          rows: [...(await client.query<TRow>(text, values)).rows],
        }),
      },
      workspaceId,
      xiaoyuActorId: XIAOYU_ACCOUNT_ID,
    });
    await reconcileDemoOwnerMigrationAudit({
      client: operationsClient,
      plan: ownerPlan,
      workspaceId,
    });
    const ownerVerification = await applyEventOrganizerOwnerPlan({
      client: {
        query: async <TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) => ({
          rows: [...(await client.query<TRow>(text, values)).rows],
        }),
      },
      expectedCount: 16,
      expectedPlanHash: ownerPlan.hash,
      plan: ownerPlan,
      workspaceId,
      xiaoyuActorId: XIAOYU_ACCOUNT_ID,
    });

    const event = readPublicEventCatalogue().events.find(
      (candidate) => candidate.id === "event_signup_01",
    );
    if (!event) throw new Error("The canonical event_signup_01 fixture is missing.");
    const naoki = await authProvider.getUserByEmail("naoki-yamamoto@organizers.orbit.example.test");
    if (!naoki) throw new Error("The canonical event_signup_01 organizer account is missing.");
    const existingRegistrations = await store.listRecords({
      limit: "unbounded",
      collectionName: "event_registrations",
      targetId: event.id,
      targetType: "event",
      workspaceId,
    });
    let operationsResult: {
      eventId: string;
      organizerActorId: string;
      participantCount: number;
      registrationHistoryCount: number;
    };
    if (existingRegistrations.length === 70) {
      operationsResult = {
        eventId: event.id,
        organizerActorId: naoki.id,
        participantCount: 64,
        registrationHistoryCount: 70,
      };
    } else {
      const participantUsers = [];
      for (const definition of EVENT_OPERATIONS_E2E_SEED_ACCOUNTS) {
        participantUsers.push(await ensureCredentialAccount({
          authService,
          displayName: definition.displayName,
          email: definition.email,
          password,
          provider: authProvider,
        }));
      }
      const seededOperations = await seedEventOperationsE2E({
        event: {
          description: event.description ?? "Curated cross-border business matching.",
          endsAt: event.endsAt ?? event.startsAt,
          id: event.id,
          startsAt: event.startsAt,
          title: event.name,
          venue: event.location ?? "Venue pending",
        },
        operationsRepository: createPostgresEventOperationsRepository({
          client: operationsClient,
          workspaceId,
        }),
        organizerActorId: naoki.id,
        participants: EVENT_OPERATIONS_E2E_SEED_ACCOUNTS.map((definition, index) => ({
          ...definition,
          actorId: participantUsers[index]!.id,
        })),
        store,
        workspaceId,
      });
      operationsResult = {
        eventId: seededOperations.eventId,
        organizerActorId: seededOperations.organizerActorId,
        participantCount: seededOperations.participantCount,
        registrationHistoryCount: seededOperations.registrationHistoryCount,
      };
    }

    const eventCoreResult = await seedCanonicalEventCore({
      client: operationsClient,
      workspaceId,
    });

    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const records = await store.listRecords({ limit: "unbounded", workspaceId, includeDeleted: true });
      const projection = buildDemoOrganizerProjection({ records, workspaceId, now: new Date().toISOString() });
      for (const record of projection) await store.upsertRecord(record);
      const relationships = buildDemoRelationshipProjection({ records, workspaceId, now: new Date().toISOString() });
      for (const record of relationships) await store.upsertRecord(record);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log(JSON.stringify({
      workspaceId,
      generatedFixtureRecords: generatedSeed.totalRecords,
      organizerPlanHash: organizerPlan.hash,
      organizerOwnerCount: ownerVerification.count,
      organizerOwnerPlanHash: ownerPlan.hash,
      eventOperations: {
        eventId: operationsResult.eventId,
        organizerActorId: operationsResult.organizerActorId,
        activeParticipantCount: operationsResult.participantCount,
        registrationHistoryCount: operationsResult.registrationHistoryCount,
      },
      eventCore: eventCoreResult,
    }, null, 2));
  } finally {
    await operationsClient.close();
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
