import { createAuthUserService } from "../features/auth/auth-user-service";
import { hash } from "bcryptjs";
import { createStorageAuthAccountProvisioningProvider } from "../features/auth/storage/auth-account-provisioning-provider";
import { createStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import {
  EVENT_OPERATIONS_E2E_EVENT_ID,
  EVENT_OPERATIONS_E2E_ORGANIZER_EMAIL,
  EVENT_OPERATIONS_E2E_PARTICIPANTS,
  EVENT_OPERATIONS_E2E_SEED_ACCOUNTS,
  seedEventOperationsE2E,
} from "../features/events/event-operations/seed";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../features/events/event-operations/storage/postgres-repository";
import { readPublicEventCatalogue } from "../features/events/public-catalogue";

// The seed never embeds or prints a password; credentials come only from the external environment.
async function main(): Promise<void> {
  loadLocalEnv();
  const database = resolveLiveDatabaseConnectionConfig();
  if (!database) {
    throw new Error("Configure ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before seeding.");
  }
  const password = process.env.ORBIT_EVENT_OPERATIONS_SEED_PASSWORD;
  const resetFixturePasswords =
    process.env.ORBIT_EVENT_OPERATIONS_RESET_FIXTURE_PASSWORDS === "1";
  if (resetFixturePasswords && (!password || password.length < 8)) {
    throw new Error(
      "Resetting fixture passwords requires ORBIT_EVENT_OPERATIONS_SEED_PASSWORD with at least 8 characters.",
    );
  }

  const client = createPgLiveRecordSqlClient({ connectionString: database.connectionString });
  const operationsClient = createEventOperationsPostgresClient({
    connectionString: database.connectionString,
  });
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  try {
    await runOrbitRecordsMigration(client);
    const authProvider = createStorageAuthUserProvider({ store, workspaceId: database.workspaceId });
    const authService = createAuthUserService({
      accountProvisioner: createStorageAuthAccountProvisioningProvider({ store, workspaceId: database.workspaceId }),
      provider: authProvider,
    });

    async function ensureCredentialsAccount(input: { displayName: string; email: string }) {
      const existing = await authProvider.getUserByEmail(input.email);
      if (existing) {
        if (resetFixturePasswords && password) {
          await authProvider.saveUser({
            ...existing,
            displayName: input.displayName,
            passwordHash: await hash(password, 12),
            provider: "credentials",
            providerAccountId: null,
            updatedAt: new Date().toISOString(),
          });
        }
        return existing;
      }
      if (!password || password.length < 8) {
        throw new Error(
          `Fixture account ${input.email} does not exist. Set ORBIT_EVENT_OPERATIONS_SEED_PASSWORD to at least 8 characters to create missing accounts.`,
        );
      }
      const registered = await authService.registerUser({
        displayName: input.displayName,
        email: input.email,
        password,
      });
      if (registered.state !== "success") {
        throw new Error(`Could not create fixture account ${input.email}: ${registered.error.message}`);
      }
      return registered.data.user;
    }

    const organizer = await ensureCredentialsAccount({
      displayName: "Orbit Event Ops Organizer",
      email: EVENT_OPERATIONS_E2E_ORGANIZER_EMAIL,
    });
    const participantUsers = [];
    for (const definition of EVENT_OPERATIONS_E2E_SEED_ACCOUNTS) {
      participantUsers.push(await ensureCredentialsAccount(definition));
    }
    const publicEvent = readPublicEventCatalogue().events.find(
      (event) => event.id === EVENT_OPERATIONS_E2E_EVENT_ID,
    );
    if (!publicEvent) {
      throw new Error(
        `Public catalogue event ${EVENT_OPERATIONS_E2E_EVENT_ID} is required for the full-flow fixture.`,
      );
    }
    const result = await seedEventOperationsE2E({
      event: {
        description:
          publicEvent.description ??
          "Curated cross-border business matching for operators, founders, investors, and industry partners.",
        endsAt: publicEvent.endsAt ?? publicEvent.startsAt,
        id: publicEvent.id,
        startsAt: publicEvent.startsAt,
        title: publicEvent.name,
        venue: publicEvent.location ?? "Venue pending",
      },
      operationsRepository: createPostgresEventOperationsRepository({
        client: operationsClient,
        workspaceId: database.workspaceId,
      }),
      organizerActorId: organizer.id,
      participants: EVENT_OPERATIONS_E2E_SEED_ACCOUNTS.map((definition, index) => ({
        ...definition,
        actorId: participantUsers[index]!.id,
      })),
      store,
      workspaceId: database.workspaceId,
    });

    console.log(`Seeded ${result.participantCount} active matching participants for ${result.eventId}.`);
    console.log(`Preserved ${result.registrationHistoryCount} total registration histories, including lifecycle edge cases.`);
    console.log(`Organizer login: ${EVENT_OPERATIONS_E2E_ORGANIZER_EMAIL}`);
    console.log(`Attendee login: ${EVENT_OPERATIONS_E2E_PARTICIPANTS[0]!.email}`);
    console.log(`Second attendee login: ${EVENT_OPERATIONS_E2E_PARTICIPANTS[1]!.email}`);
    console.log(`Public event URL: /app/events/${encodeURIComponent(EVENT_OPERATIONS_E2E_EVENT_ID)}`);
    console.log(`Organizer URL: /app/events/${encodeURIComponent(EVENT_OPERATIONS_E2E_EVENT_ID)}/operations`);
    console.log("No recommendation, table, graph, check-in, or contact-request result was fabricated by the seed.");
  } finally {
    await operationsClient.close();
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
