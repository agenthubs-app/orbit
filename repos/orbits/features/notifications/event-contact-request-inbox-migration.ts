import { createHash } from 'node:crypto';

import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import type { EventContactRequestTransition } from '../events/event-operations/contact-request-notification-writer';
import {
  eventContactRequestNotification,
  eventContactRequestRecipientMatches,
  eventContactRequestSemanticKey,
  parseLegacyEventContactRequestNotificationId,
  readEventContactRequestFacts,
} from './event-contact-request-inbox';
import { createInboxRecordUpserter, inboxNotificationId, type InboxNotificationUpsert } from './inbox-record-service';
import { createPostgresInboxRecordTransaction } from './storage/inbox-record-repository';

/**
 * Sprint 0129 — one-off, repeatable migration of the business-card exchange
 * rows the pre-0129 worker wrote to the legacy `notifications` collection.
 *
 * - plan(): read-only inventory (the dry run).
 * - apply(): per row, in one transaction: upsert the typed inbox record (same
 *   semantic key as the live writer) and archive the legacy row with a pointer
 *   to it. The legacy row is kept, not deleted; `lifecycle_state` back to
 *   `active` undoes it.
 * - Read state carries over from `notification_interactions`: read → readAt,
 *   ignored → dismissed. An inbox record that already exists keeps its own state.
 * - Rows whose request no longer exists (or does not name the row's owner as the
 *   recipient) are reported as skipped and left untouched.
 */
export type LegacyExchangeSkipReason = 'unparseable_id' | 'owner_mismatch' | 'source_missing' | 'recipient_mismatch' | 'contact_missing';
export interface LegacyExchangeMigrationItem {
  legacyId: string;
  actorId: string;
  action: 'migrate' | 'skip';
  reason?: LegacyExchangeSkipReason;
  inboxId?: string;
  alreadyInInbox?: boolean;
  readState: 'read' | 'ignored' | null;
}
export interface LegacyExchangeMigrationPlan {
  workspaceId: string;
  candidates: number;
  migrate: number;
  skipped: number;
  alreadyInInbox: number;
  items: LegacyExchangeMigrationItem[];
}

type LegacyRow = { record_id: string; user_id: string | null; payload: Record<string, unknown>; created_at: Date | string };
const PAGE = 200;
const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

function interactionId(actorId: string, notificationId: string): string {
  return `notification-interaction:${createHash('sha256').update(`${actorId}\u0000${notificationId}`).digest('hex')}`;
}

async function readInteraction(executor: TransactionalSqlExecutor, workspaceId: string, actorId: string, legacyId: string) {
  const found = await executor.query<{ state: string; updated_at: string | null }>(`select payload->>'state' as state,payload->>'updatedAt' as updated_at from orbit_records
    where workspace_id=$1 and collection_name='notification_interactions' and record_id=$2 and user_id=$3 and lifecycle_state='active'
      and payload->>'notificationId'=$4`, [workspaceId, interactionId(actorId, legacyId), actorId, legacyId]);
  const row = found.rows[0];
  return row?.state === 'read' || row?.state === 'ignored' ? { state: row.state as 'read' | 'ignored', at: row.updated_at } : null;
}

type Assessment = { item: LegacyExchangeMigrationItem; notification?: InboxNotificationUpsert };
async function assess(executor: TransactionalSqlExecutor, workspaceId: string, row: LegacyRow, now: string): Promise<Assessment> {
  const parsed = parseLegacyEventContactRequestNotificationId(row.record_id);
  const actorId = row.user_id ?? '';
  const skip = (reason: LegacyExchangeSkipReason): Assessment => ({ item: { legacyId: row.record_id, actorId, action: 'skip', reason, readState: null } });
  if (!parsed) return skip('unparseable_id');
  if (parsed.actorId !== actorId) return skip('owner_mismatch');
  const facts = await readEventContactRequestFacts(executor, { workspaceId, requestId: parsed.requestId, actorId });
  if (!facts || facts.revision < parsed.revision) return skip('source_missing');
  if (!eventContactRequestRecipientMatches(facts, actorId, parsed.transition)) return skip('recipient_mismatch');
  if (parsed.transition === 'accepted' && !facts.contactId) return skip('contact_missing');
  const interaction = await readInteraction(executor, workspaceId, actorId, row.record_id);
  const occurredAt = typeof row.payload.createdAt === 'string' && Number.isFinite(Date.parse(row.payload.createdAt)) ? iso(row.payload.createdAt) : iso(row.created_at);
  const readAt = interaction?.at && Number.isFinite(Date.parse(interaction.at)) ? iso(interaction.at) : now;
  const notification = eventContactRequestNotification({
    actorId, facts, revision: parsed.revision, transition: parsed.transition as EventContactRequestTransition, occurredAt, readAt: now,
    contactId: parsed.transition === 'accepted' ? facts.contactId : null, legacyId: row.record_id,
    ...(interaction ? { readState: interaction.state === 'read' ? { readAt } : { readAt, disposition: 'dismissed' as const } } : {}),
  });
  const inboxId = inboxNotificationId(actorId, eventContactRequestSemanticKey(parsed.requestId, parsed.revision, parsed.transition));
  const existing = await executor.query<{ id: string }>(`select record_id as id from orbit_records where workspace_id=$1 and collection_name='inboxNotifications' and record_id=$2`, [workspaceId, inboxId]);
  return { item: { legacyId: row.record_id, actorId, action: 'migrate' as const, inboxId, alreadyInInbox: Boolean(existing.rows[0]), readState: interaction?.state ?? null }, notification };
}

async function legacyPage(executor: TransactionalSqlExecutor, workspaceId: string, after: string): Promise<readonly LegacyRow[]> {
  return (await executor.query<LegacyRow>(`select record_id,user_id,payload,created_at from orbit_records
    where workspace_id=$1 and collection_name='notifications' and lifecycle_state='active'
      and record_id like 'notification:event-contact-request:%' and record_id>$2
    order by record_id limit ${PAGE}`, [workspaceId, after])).rows;
}

function summarize(workspaceId: string, items: LegacyExchangeMigrationItem[]): LegacyExchangeMigrationPlan {
  const migrate = items.filter((i) => i.action === 'migrate');
  return { workspaceId, candidates: items.length, migrate: migrate.length, skipped: items.length - migrate.length, alreadyInInbox: migrate.filter((i) => i.alreadyInInbox).length, items };
}

export function createLegacyEventContactRequestMigration(input: { client: TransactionalPostgresClient; workspaceId: string; now?: () => string }) {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    /** Dry run: no writes. */
    async plan(): Promise<LegacyExchangeMigrationPlan> {
      const items: LegacyExchangeMigrationItem[] = [];
      for (let after = ''; ;) {
        const rows = await legacyPage(input.client, input.workspaceId, after);
        for (const row of rows) items.push((await assess(input.client, input.workspaceId, row, now())).item);
        if (rows.length < PAGE) break;
        after = rows.at(-1)!.record_id;
      }
      return summarize(input.workspaceId, items);
    },
    async apply(): Promise<LegacyExchangeMigrationPlan & { migrated: number }> {
      const items: LegacyExchangeMigrationItem[] = [];
      let migrated = 0;
      for (let after = ''; ;) {
        const rows = await legacyPage(input.client, input.workspaceId, after);
        for (const row of rows) {
          const item = await input.client.transaction(async (executor) => {
            // Re-read under lock: a concurrent run or a manual change wins cleanly.
            const locked = (await executor.query<LegacyRow>(`select record_id,user_id,payload,created_at from orbit_records
              where workspace_id=$1 and collection_name='notifications' and record_id=$2 and lifecycle_state='active' for update`, [input.workspaceId, row.record_id])).rows[0];
            if (!locked) return null;
            const at = now();
            const result = await assess(executor, input.workspaceId, locked, at);
            if (result.item.action !== 'migrate' || !result.notification) return result.item;
            const upsert = createInboxRecordUpserter({ now, transaction: async (actorId, operation) => operation(await createPostgresInboxRecordTransaction({ executor, workspaceId: input.workspaceId, actorId })) });
            const saved = await upsert(result.notification);
            await executor.query(`update orbit_records set lifecycle_state='archived',
                payload=payload||jsonb_build_object('migratedToInboxId',$3::text,'migratedAt',$4::text), updated_at=$4::timestamptz
              where workspace_id=$1 and collection_name='notifications' and record_id=$2`, [input.workspaceId, locked.record_id, saved.id, at]);
            migrated += 1;
            return result.item;
          });
          if (item) items.push(item);
        }
        if (rows.length < PAGE) break;
        after = rows.at(-1)!.record_id;
      }
      return { ...summarize(input.workspaceId, items), migrated };
    },
  };
}
