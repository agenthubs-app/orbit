import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { createRelationshipMessageStore, type RelationshipMessageStore } from "../../features/relationship-communication/message-store";
import { createRelationshipCommunicationService, type RelationshipCommunicationContact } from "../../features/relationship-communication/service";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import type { PostgresReadMetricsConfig } from "../../shared/storage/postgres-read-metrics";

/**
 * Sprint 0109: a private schema in the explicit local test database with the
 * real orbit_records + relationship message tables migration, the real
 * Postgres record store (invitations, drafts) and the real message store.
 */
export const relationshipTestDatabaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
export const relationshipPostgresSkip = relationshipTestDatabaseUrl ? false : "Explicit isolated PostgreSQL URL required (ORBIT_LIFECYCLE_TEST_DATABASE_URL)";

export type HarnessActor = { accountId: string; displayName: string; email: string };

export interface RelationshipHarness {
  schema: string;
  workspaceId: string;
  pool: Pool;
  client: TransactionalPostgresClient;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  messages: RelationshipMessageStore;
  service: (actor: HarnessActor, options?: { invitationBaseUrl?: string; now?: () => string; randomToken?: () => string; resolveContact?: (contactId: string, accountId: string) => Promise<RelationshipCommunicationContact | null> }) => ReturnType<typeof createRelationshipCommunicationService>;
  close: () => Promise<void>;
}

export async function createRelationshipHarness(options: {
  prefix: string;
  workspaceId?: string;
  poolSize?: number;
  readMetrics?: PostgresReadMetricsConfig;
  resolveContact?: (contactId: string, accountId: string) => Promise<RelationshipCommunicationContact | null>;
}): Promise<RelationshipHarness> {
  const url = relationshipTestDatabaseUrl!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local PostgreSQL only");
  const schema = `${options.prefix}_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = options.workspaceId ?? `workspace:${schema}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  await admin.end();
  const pool = new Pool({ connectionString: url, max: options.poolSize ?? 4, options: `-c search_path=${schema} -c statement_timeout=30000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool, readMetrics: options.readMetrics });
  await runOrbitRecordsMigration(client);
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  const messages = createRelationshipMessageStore({ client, workspaceId });
  const defaultContact = options.resolveContact ?? (async (contactId: string) => ({ contactId, displayName: "Recipient", organization: "Orbit QA" }));
  let token = 0;
  return {
    schema, workspaceId, pool, client, store, messages,
    service: (actor, serviceOptions = {}) => createRelationshipCommunicationService({
      actor, invitationBaseUrl: serviceOptions.invitationBaseUrl ?? "https://orbit.example/app/invitations", messages, store, workspaceId,
      resolveContact: serviceOptions.resolveContact ?? defaultContact,
      randomToken: serviceOptions.randomToken ?? (() => `${schema}-token-${++token}-with-enough-entropy`),
      ...(serviceOptions.now ? { now: serviceOptions.now } : {}),
    }),
    async close() {
      try { await client.close(); } catch { /* already closed */ }
      const drop = new Pool({ connectionString: url, max: 1 });
      try { await drop.query(`drop schema if exists ${schema} cascade`); } finally { await drop.end(); }
    },
  };
}

/** Invite by the inviter's contact and accept as the invitee; returns the eligibility. */
export async function connect(harness: RelationshipHarness, inviter: HarnessActor, invitee: HarnessActor, contactId: string) {
  const invitation = await harness.service(inviter).createInvitation({ contactId, recipientEmail: invitee.email, recipientName: invitee.displayName });
  const accepted = await harness.service(invitee).acceptInvitation({ confirmed: true, token: invitation.token });
  return { conversationId: accepted.conversationId!, qualificationVersion: accepted.qualificationVersion! };
}
