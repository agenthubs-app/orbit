import type { InboxNotificationSource } from '../../shared/contract/inbox-notifications';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../shared/storage/transactional-postgres';
import type {
  EventContactRequestNotificationInput,
  EventContactRequestNotificationWriter,
  EventContactRequestTransition,
} from '../events/event-operations/contact-request-notification-writer';
import { EventOperationsOutboxProjectionError } from '../events/event-operations/outbox-projector';
import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from '../events/event-operations/storage/postgres-client';
import { createInboxRecordUpserter, type InboxNotificationUpsert } from './inbox-record-service';
import { createPostgresInboxRecordTransaction } from './storage/inbox-record-repository';

/**
 * Sprint 0129 — business-card exchange notifications live in the typed inbox
 * (`inboxNotifications`), the only notification store the App, the web inbox,
 * the unread badge and the AI read. The event-operations worker is the single
 * writer; nothing is written to the legacy `notifications` collection.
 *
 * Identity: one notification per (recipient, request, revision, transition).
 * The semantic key is shared by the live writer and the legacy migration, so an
 * outbox replay, a retry or a migrated legacy row all land on the same record.
 */
export const EVENT_CONTACT_REQUEST_SOURCE_KIND = 'event_contact_request' as const;

const TRANSITIONS: readonly EventContactRequestTransition[] = ['created', 'accepted', 'declined', 'withdrawn'];

/** The side that did not act receives the notification. */
export function eventContactRequestRecipientRole(transition: EventContactRequestTransition): 'requester' | 'target' {
  return transition === 'created' || transition === 'withdrawn' ? 'target' : 'requester';
}

export function eventContactRequestSemanticKey(requestId: string, revision: number, transition: EventContactRequestTransition): string {
  return `event-contact-request:${requestId}:${revision}:${transition}`;
}

/** The record id the pre-0129 writer used in the legacy `notifications` collection. */
export function legacyEventContactRequestNotificationId(input: { requestId: string; revision: number; transition: EventContactRequestTransition; actorId: string }): string {
  return `notification:event-contact-request:${encodeURIComponent(input.requestId)}:${input.revision}:${input.transition}:${encodeURIComponent(input.actorId)}`;
}

export function parseLegacyEventContactRequestNotificationId(id: string): { requestId: string; revision: number; transition: EventContactRequestTransition; actorId: string } | null {
  const prefix = 'notification:event-contact-request:';
  if (!id.startsWith(prefix)) return null;
  const parts = id.slice(prefix.length).split(':');
  if (parts.length !== 4) return null;
  const [rawRequest, rawRevision, rawTransition, rawActor] = parts as [string, string, string, string];
  const revision = Number(rawRevision);
  if (!Number.isSafeInteger(revision) || revision < 1 || !TRANSITIONS.includes(rawTransition as EventContactRequestTransition)) return null;
  try {
    const requestId = decodeURIComponent(rawRequest), actorId = decodeURIComponent(rawActor);
    if (!requestId.trim() || !actorId.trim()) return null;
    return { requestId, revision, transition: rawTransition as EventContactRequestTransition, actorId };
  } catch {
    return null;
  }
}

export interface EventContactRequestFacts {
  requestId: string;
  eventId: string;
  revision: number;
  requesterActorId: string;
  targetActorId: string;
  requesterParticipantId: string;
  targetParticipantId: string;
  /** The other participant's event display name, as the attendee directory shows it. */
  counterpartName: string | null;
  /** The recipient's own relationship-side contact, once the exchange created it. */
  contactId: string | null;
  contactActive: boolean;
}

/**
 * Point lookup by primary key, scoped to a party of the request. Returns null
 * for a missing request or a caller who is neither requester nor target.
 */
export async function readEventContactRequestFacts(executor: Pick<TransactionalSqlExecutor, 'query'>, input: { workspaceId: string; requestId: string; actorId: string }): Promise<EventContactRequestFacts | null> {
  const result = await executor.query<{
    request_id: string; event_id: string; revision: string | number; requester_actor_id: string; target_actor_id: string;
    requester_participant_id: string; target_participant_id: string; counterpart_name: string | null; contact_id: string | null; contact_active: boolean;
  }>(`select r.request_id,r.event_id,r.revision,r.requester_actor_id,r.target_actor_id,r.requester_participant_id,r.target_participant_id,
      nullif(btrim(p.profile_payload->'participant'->>'displayName'),'') as counterpart_name,
      side.contact_id,
      exists(select 1 from orbit_records c where c.workspace_id=r.workspace_id and c.collection_name='contacts'
        and c.record_id=side.contact_id and c.user_id=$3 and c.lifecycle_state='active') as contact_active
    from event_ops_contact_requests r
    left join event_ops_membership_heads m on m.workspace_id=r.workspace_id and m.event_id=r.event_id
      and m.participant_id=case when r.target_actor_id=$3 then r.requester_participant_id else r.target_participant_id end
    left join event_ops_profile_versions p on p.workspace_id=m.workspace_id and p.event_id=m.event_id
      and p.participant_id=m.participant_id and p.profile_version=m.profile_version
    left join event_ops_relationship_sides side on side.workspace_id=r.workspace_id
      and side.relationship_pair_id=r.relationship_pair_id and side.owner_actor_id=$3
    where r.workspace_id=$1 and r.request_id=$2 and (r.requester_actor_id=$3 or r.target_actor_id=$3)`,
  [input.workspaceId, input.requestId, input.actorId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    requestId: row.request_id, eventId: row.event_id, revision: Number(row.revision),
    requesterActorId: row.requester_actor_id, targetActorId: row.target_actor_id,
    requesterParticipantId: row.requester_participant_id, targetParticipantId: row.target_participant_id,
    counterpartName: row.counterpart_name, contactId: row.contact_id, contactActive: row.contact_active === true,
  };
}

type Copy = Readonly<Record<'zh' | 'en' | 'ja', { title: string; reason: string }>>;
type Texts = readonly [title: string, reason: string];
/**
 * Keys are emitted in PostgreSQL jsonb order (en, ja, zh; title before reason):
 * the producer merge compares JSON.stringify of the stored copy with the new
 * one, so any other order would bump the revision on every outbox replay.
 */
function copy(en: Texts, ja: Texts, zh: Texts): Copy {
  return { en: { title: en[0], reason: en[1] }, ja: { title: ja[0], reason: ja[1] }, zh: { title: zh[0], reason: zh[1] } };
}
function copyFor(transition: EventContactRequestTransition, name: string | null): Copy {
  const zh = name ?? '一位参会者', en = name ?? 'An attendee', ja = name ? `${name}さん` : '参加者';
  switch (transition) {
    case 'created': return copy(
      [`${en} wants to exchange business cards`, 'A business-card request from the event. Open their profile to accept or decline.'],
      [`${ja}から名刺交換の申請が届きました`, 'イベント会場からの名刺交換の申請です。プロフィールを開いて承認するか選べます。'],
      [`${zh} 想和你交换名片`, '来自活动现场的名片交换申请。打开对方资料，选择是否交换。'],
    );
    case 'accepted': return copy(
      [`${en} accepted your business-card exchange`, 'They are now in your contacts. Open to view.'],
      [`${ja}が名刺交換を承認しました`, '連絡先に追加されました。開いて確認できます。'],
      [`${zh} 接受了你的名片交换`, '对方已加入你的联系人，打开即可查看。'],
    );
    case 'declined': return copy(
      [`${en} did not accept your business-card request`, 'You can still meet other attendees at the event.'],
      [`${ja}は名刺交換の申請を承認しませんでした`, 'イベント会場でほかの参加者とも出会えます。'],
      [`${zh} 暂未接受你的名片交换申请`, '你仍可以在活动现场认识其他参会者。'],
    );
    case 'withdrawn': return copy(
      [`${en} withdrew their business-card request`, 'No action is needed.'],
      [`${ja}が名刺交換の申請を取り下げました`, '対応は不要です。'],
      [`${zh} 撤回了名片交换申请`, '这条申请已不需要处理。'],
    );
  }
}

/**
 * Pure mapping from verified facts to a typed inbox record. The acceptance
 * points at the contact the exchange created; every other transition opens the
 * counterpart's profile sheet on the live page (`?participant=` is the
 * parameter both the App live screen and the web live page read).
 */
export function eventContactRequestNotification(input: {
  actorId: string;
  facts: EventContactRequestFacts;
  revision: number;
  transition: EventContactRequestTransition;
  occurredAt: string;
  readAt: string;
  contactId: string | null;
  legacyId?: string;
  readState?: { readAt?: string; disposition?: 'dismissed' };
}): InboxNotificationUpsert {
  const { facts, transition } = input;
  const counterpartParticipantId = input.actorId === facts.targetActorId ? facts.requesterParticipantId : facts.targetParticipantId;
  const texts = copyFor(transition, facts.counterpartName);
  if (transition === 'accepted' && !input.contactId) throw new Error('An acceptance notification requires the recipient-owned contact.');
  const href = transition === 'accepted'
    ? `/contacts/${encodeURIComponent(input.contactId!)}?eventId=${encodeURIComponent(facts.eventId)}`
    : `/events/${encodeURIComponent(facts.eventId)}/live?participant=${encodeURIComponent(counterpartParticipantId)}`;
  return {
    actorId: input.actorId,
    semanticKey: eventContactRequestSemanticKey(facts.requestId, input.revision, transition),
    kind: 'update',
    origin: 'business',
    ...texts.zh,
    copy: texts,
    ...(facts.counterpartName ? { object: { id: transition === 'accepted' ? input.contactId! : counterpartParticipantId, name: facts.counterpartName } } : {}),
    occurredAt: input.occurredAt,
    sources: [{
      sourceKind: EVENT_CONTACT_REQUEST_SOURCE_KIND, sourceId: facts.requestId, sourceRevision: `${input.revision}:${transition}`,
      objectId: facts.eventId, occurredAt: input.occurredAt, readAt: input.readAt,
    }],
    target: { kind: 'event', id: facts.eventId, href, status: 'available' },
    actions: ['read', 'dismiss', 'handle'],
    ...(input.legacyId ? { legacyId: input.legacyId } : {}),
    ...(input.readState?.readAt ? { readAt: input.readState.readAt } : {}),
    ...(input.readState?.disposition ? { disposition: input.readState.disposition } : {}),
  };
}

export function eventContactRequestRecipientMatches(facts: EventContactRequestFacts, actorId: string, transition: EventContactRequestTransition): boolean {
  return eventContactRequestRecipientRole(transition) === 'target' ? facts.targetActorId === actorId : facts.requesterActorId === actorId;
}

/**
 * Read-time authorization for the inbox (list, detail, unread count, actions).
 * Available while the request exists, the caller is its recipient for that
 * transition, and — for an acceptance — the caller's exchange contact is still
 * active. Later request transitions do not invalidate earlier notifications;
 * they are history, and each transition has its own record.
 */
export async function eventContactRequestSourceState(executor: Pick<TransactionalSqlExecutor, 'query'>, workspaceId: string, actorId: string, source: InboxNotificationSource): Promise<'available' | 'unavailable'> {
  const [rawRevision, rawTransition] = source.sourceRevision.split(':');
  const revision = Number(rawRevision), transition = rawTransition as EventContactRequestTransition;
  if (!Number.isSafeInteger(revision) || revision < 1 || !TRANSITIONS.includes(transition)) return 'unavailable';
  const facts = await readEventContactRequestFacts(executor, { workspaceId, requestId: source.sourceId, actorId });
  if (!facts || (source.objectId && source.objectId !== facts.eventId) || facts.revision < revision || !eventContactRequestRecipientMatches(facts, actorId, transition)) return 'unavailable';
  if (transition === 'accepted' && !facts.contactActive) return 'unavailable';
  return 'available';
}

/** Adapts the event-operations pool (same database) to the inbox transaction API. */
export function inboxClientFromEventOperations(client: EventOperationsPostgresClient): TransactionalPostgresClient {
  const executor = (value: EventOperationsSqlExecutor): TransactionalSqlExecutor => ({
    async query<TRow>(text: string, values?: readonly unknown[]) {
      const result = await value.query<TRow>(text, values);
      return { rows: result.rows };
    },
  });
  return {
    ...executor(client),
    transaction: (operation) => client.transaction((transaction) => operation(executor(transaction)), { isolation: 'read committed' }),
    async close() {},
  };
}

/**
 * The event-operations outbox writer. It re-reads the request (the outbox
 * payload names the recipient, the database decides whether that is true),
 * requires the recipient-owned contact before publishing an acceptance, and
 * upserts through the shared inbox producer merge — replays keep reading state.
 */
export function createInboxEventContactRequestNotificationWriter(input: {
  client: EventOperationsPostgresClient;
  workspaceId: string;
  now?: () => string;
}): EventContactRequestNotificationWriter {
  const now = input.now ?? (() => new Date().toISOString());
  const client = inboxClientFromEventOperations(input.client);
  const upsert = createInboxRecordUpserter({
    now,
    transaction: (actorId, operation) => client.transaction(async (executor) => operation(await createPostgresInboxRecordTransaction({ executor, workspaceId: input.workspaceId, actorId }))),
  });
  return {
    async createNotification(notification: EventContactRequestNotificationInput) {
      const facts = await readEventContactRequestFacts(client, { workspaceId: input.workspaceId, requestId: notification.requestId, actorId: notification.actorId });
      if (!facts || facts.eventId !== notification.eventId || !eventContactRequestRecipientMatches(facts, notification.actorId, notification.transition)) {
        // Permanent: retrying cannot make a forged or stale recipient a party.
        throw new EventOperationsOutboxProjectionError('EVENT_OPERATIONS_OUTBOX_PAYLOAD_INVALID', 'The contact-request notification recipient is not a party to this request transition.', false);
      }
      if (notification.transition === 'accepted') {
        const owned = await client.query<{ ok: boolean }>(`select true as ok from orbit_records where workspace_id=$1 and collection_name='contacts'
          and record_id=$2 and user_id=$3 and lifecycle_state='active'`, [input.workspaceId, notification.contactId, notification.actorId]);
        if (!notification.contactId || !owned.rows[0]) throw new Error('The actor-owned contact must be projected before its notification deep link is published.');
      }
      const saved = await upsert(eventContactRequestNotification({
        actorId: notification.actorId,
        facts,
        revision: notification.revision,
        transition: notification.transition,
        occurredAt: notification.occurredAt,
        readAt: now(),
        contactId: notification.contactId,
      }));
      // Sprint 0118 (from 0129, P2): an acceptance or a decline means the target
      // answered, usually on the live page without opening the notification. Their
      // "wants to exchange" notice for this request is then handled and read, so it
      // leaves the unread count and the default list (history keeps it).
      if (notification.transition === 'accepted' || notification.transition === 'declined') {
        await client.transaction(async (executor) => {
          const inbox = await createPostgresInboxRecordTransaction({ executor, workspaceId: input.workspaceId, actorId: facts.targetActorId });
          const found = await executor.query<{ record_id: string }>(`select record_id from orbit_records
            where workspace_id=$1 and collection_name='inboxNotifications' and user_id=$2 and lifecycle_state='active'
              and payload->'notification'->>'semanticKey' like $3
              and payload->'notification'->>'disposition'='open'
            order by record_id limit 20`, [input.workspaceId, facts.targetActorId, `event-contact-request:${facts.requestId.replace(/[\\%_]/g, (c) => `\\${c}`)}:%:created`]);
          for (const row of found.rows) {
            const stored = await inbox.get(row.record_id);
            if (!stored || stored.notification.disposition !== 'open') continue;
            const at = now();
            await inbox.save({ ...stored, notification: { ...stored.notification, disposition: 'handled', readAt: stored.notification.readAt ?? at, revision: stored.notification.revision + 1, updatedAt: at } });
          }
        });
      }
      return { recordId: saved.id };
    },
  };
}
