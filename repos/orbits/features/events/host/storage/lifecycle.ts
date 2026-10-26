/**
 * R17 主办方的活动写入（host/DESIGN.md §2.2、§3.2）。Owner: 甲 (R17).
 * - 建 / 改 / 公开 / 中止 / 归档 / 再发行参加コード：`event_ops_events`、`event_event_versions`、`event_aliases` 同事务写入（写法照 core/backfill.ts）。
 * - 公开：生命周期 published、参加コード（R15 字母表 `XXXX-XXXX`，带横线与不带横线两个 alias）、短链 slug（alias 类型 `public_slug`）、
 *   event-ops 缺省配置（时间取活动时间、tableSize 5、迁移状态 canonical，不配编组也能受付）、定型通知（关注者）——同一事务；幂等。
 * - 中止：只有 owner；删参加コード / 短链 alias（码立即失效）；给申込者与共同运营者写中止通知。
 * - 已公开活动改日時：event-ops 配置同事务换新版本（签到要求配置与 Event Core 起止一致）。
 * - 所有写都先拿 sync 提交顺序锁（event 头表带 sync_revision）。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { participationCodeFromBytes } from "../../../../shared/compute/participation-code";
import type { HostEventFeeKind, HostEventInput, HostEventUpdateInput } from "../../../../shared/contract/host-events";
import { acquireSyncCommitOrderLock } from "../../../sync/commit-order-lock";
import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from "../../event-operations/storage/postgres-client";
import { HostError } from "../service";
import { enqueueHostNotice } from "./admission-hooks";

type Row = Record<string, unknown>;

/** source_payload.host 里的展示字段（不加列，DESIGN §3.1）。 */
export interface HostEventPayload {
  emoji: string | null;
  venueArea: string | null;
  online: boolean;
  feeKind: HostEventFeeKind;
  feeAmountYen: number | null;
  feeUrl: string | null;
  capacity: number | null;
  templateId: string | null;
  /** 归档前的中止时刻（归档时 cancelled_at 必须清空，解除归档时用它恢复）。 */
  cancelledAt?: string | null;
}

export interface HostEventRow {
  eventId: string;
  organizerActorId: string;
  organizerProfileId: string | null;
  createdBy: string | null;
  lifecycle: "draft" | "published" | "cancelled" | "archived";
  title: string;
  description: string | null;
  venue: string | null;
  timezone: string;
  startsAt: string;
  endsAt: string;
  publicCode: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
  version: number;
  payload: HostEventPayload;
}

const DEFAULT_PAYLOAD: HostEventPayload = { capacity: null, emoji: null, feeAmountYen: null, feeKind: "free", feeUrl: null, online: false, templateId: null, venueArea: null };

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value === null || value === undefined ? null : new Date(String(value)).toISOString());

function rowToEvent(row: Row): HostEventRow {
  const source = (typeof row.source_payload === "string" ? JSON.parse(row.source_payload) : row.source_payload ?? {}) as { host?: Partial<HostEventPayload> };
  return {
    archivedAt: iso(row.archived_at),
    cancelledAt: iso(row.cancelled_at),
    createdBy: (row.created_by as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    endsAt: iso(row.ends_at)!,
    eventId: String(row.event_id),
    lifecycle: row.lifecycle_state_v2 as HostEventRow["lifecycle"],
    organizerActorId: String(row.organizer_actor_id),
    organizerProfileId: (row.organizer_profile_id as string | null) ?? null,
    payload: { ...DEFAULT_PAYLOAD, ...(source.host ?? {}) },
    publicCode: (row.public_code as string | null) ?? null,
    startsAt: iso(row.starts_at)!,
    timezone: String(row.timezone ?? "Asia/Tokyo"),
    title: String(row.title ?? ""),
    venue: (row.venue as string | null) ?? null,
    version: Number(row.event_version),
  };
}

const EVENT_COLUMNS = `event_id, organizer_actor_id, organizer_profile_id, created_by, lifecycle_state_v2, title, description, venue, timezone, starts_at, ends_at, public_code, cancelled_at, archived_at, event_version, coalesce(source_payload, '{}'::jsonb) as source_payload`;

export async function readHostEvent(executor: EventOperationsSqlExecutor, workspaceId: string, eventId: string, lock = false): Promise<HostEventRow | null> {
  const result = await executor.query<Row>(`select ${EVENT_COLUMNS} from event_ops_events where workspace_id = $1 and event_id = $2 and lifecycle_state_v2 is not null${lock ? " for update" : ""}`, [workspaceId, eventId]);
  return result.rows[0] ? rowToEvent(result.rows[0]) : null;
}

function contentHash(event: HostEventRow): string {
  const content = { description: event.description, endsAt: event.endsAt, eventId: event.eventId, lifecycle: event.lifecycle, organizerActorId: event.organizerActorId, payload: event.payload, publicCode: event.publicCode, startsAt: event.startsAt, timezone: event.timezone, title: event.title, venue: event.venue };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

async function appendVersion(executor: EventOperationsSqlExecutor, workspaceId: string, event: HostEventRow): Promise<void> {
  await executor.query(
    `insert into event_event_versions (
       workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at,
       lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, content_hash, created_at
     ) select workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at,
              lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, $3, now()
       from event_ops_events where workspace_id = $1 and event_id = $2`,
    [workspaceId, event.eventId, contentHash(event)],
  );
}

async function addAlias(executor: EventOperationsSqlExecutor, workspaceId: string, eventId: string, value: string, type: "event_id" | "public_code" | "public_slug"): Promise<boolean> {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  const result = await executor.query(
    `insert into event_aliases (workspace_id, normalized_alias, alias_value, alias_type, event_id, source_payload)
     values ($1, $2, $3, $4, $5, '{"createdBy":"host"}'::jsonb)
     on conflict (workspace_id, normalized_alias) do nothing`,
    [workspaceId, normalized, value.trim(), type, eventId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function removeAliases(executor: EventOperationsSqlExecutor, workspaceId: string, eventId: string, types: readonly string[]): Promise<void> {
  await executor.query(`delete from event_aliases where workspace_id = $1 and event_id = $2 and alias_type = any($3::text[])`, [workspaceId, eventId, types]);
}

/** 由名称转写的 slug：取 ASCII 部分；不够长就用活动 id 的尾巴。 */
export function slugBase(title: string, eventId: string): string {
  const ascii = title.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40).replace(/-+$/gu, "");
  return ascii.length >= 3 ? ascii : `e-${eventId.replace(/[^a-z0-9]/gu, "").slice(-8)}`;
}

async function issueCode(executor: EventOperationsSqlExecutor, workspaceId: string, eventId: string, bytes: () => Uint8Array, exclude: string | null = null): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = participationCodeFromBytes(bytes());
    if (exclude && code === exclude) continue;
    const taken = await executor.query(`select 1 from event_aliases where workspace_id = $1 and normalized_alias = any($2::text[])
                                        union all select 1 from event_ops_events where workspace_id = $1 and lower(btrim(public_code)) = $3`, [workspaceId, [code.toLowerCase(), code.replace("-", "").toLowerCase()], code.toLowerCase()]);
    if (taken.rows.length > 0) continue;
    await addAlias(executor, workspaceId, eventId, code, "public_code");
    await addAlias(executor, workspaceId, eventId, code.replace("-", ""), "public_code");
    return code;
  }
  throw new HostError("INVALID_STATE", "PARTICIPATION_CODE_EXHAUSTED");
}

async function issueSlug(executor: EventOperationsSqlExecutor, workspaceId: string, event: HostEventRow): Promise<string> {
  const base = slugBase(event.title, event.eventId);
  for (let n = 1; n < 100; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (await addAlias(executor, workspaceId, event.eventId, slug, "public_slug")) return slug;
  }
  throw new HostError("INVALID_STATE", "SLUG_EXHAUSTED");
}

export async function publicSlugOf(executor: EventOperationsSqlExecutor, workspaceId: string, eventId: string): Promise<string | null> {
  const result = await executor.query<{ alias_value: string }>(`select alias_value from event_aliases where workspace_id = $1 and event_id = $2 and alias_type = 'public_slug' order by created_at limit 1`, [workspaceId, eventId]);
  return result.rows[0]?.alias_value ?? null;
}

/** 缺省 event-ops 配置的时间（约束：profile ≤ cutoff ≤ results ≤ r1；start ≤ r1 < r2 ≤ end；check-in opens ≤ end）。 */
export function defaultOperationsSchedule(startsAt: string, endsAt: string, registrationClosesAt: string | null) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!(end - start >= 30 * 60_000)) throw new HostError("VALIDATION", "EVENT_TOO_SHORT");
  const r1 = start + Math.min(20 * 60_000, Math.floor((end - start) / 3));
  const r2 = r1 + Math.floor((end - r1) / 2);
  const cutoff = Math.min(registrationClosesAt ? Date.parse(registrationClosesAt) : start, start);
  const at = (value: number) => new Date(value).toISOString();
  return { checkInOpensAt: at(start - 60 * 60_000), eventEndsAt: at(end), eventStartsAt: at(start), profileEditDeadlineAt: at(cutoff), registrationCutoffAt: at(cutoff), resultsAvailableAt: at(start), roundOneStartsAt: at(r1), roundTwoStartsAt: at(r2) };
}

/**
 * The registration close after the event moves from beforeStartsAt to afterStartsAt:
 * - a close that would now fall after the new start moves by the same amount (keeping the host's "close N hours before" gap), never past the new start;
 * - a close that was the start itself (the default "until it starts") follows the start, also when the event moves later;
 * - any other close still before the new start stays where the host put it.
 */
export function shiftedRegistrationClose(closesAt: string | null, beforeStartsAt: string, afterStartsAt: string): string | null {
  if (!closesAt) return null;
  const close = Date.parse(closesAt);
  const before = Date.parse(beforeStartsAt);
  const start = Date.parse(afterStartsAt);
  if (close === before) return new Date(start).toISOString();
  if (!(close > start)) return closesAt;
  return new Date(Math.min(close + (start - before), start)).toISOString();
}

// The host's saved registration settings (draft / published) carry the close too; keep them in step so publishing them later
// does not bring back a close after the start. The revision moves so an open editor reloads instead of saving the old time.
async function shiftSavedRegistrationClose(executor: EventOperationsSqlExecutor, workspaceId: string, eventId: string, beforeStartsAt: string, afterStartsAt: string): Promise<void> {
  const result = await executor.query<{ draft: Record<string, unknown> | null; published: Record<string, unknown> | null }>(`select draft, published from event_host_question_sets where workspace_id = $1 and event_id = $2 for update`, [workspaceId, eventId]);
  const row = result.rows[0];
  if (!row) return;
  const moved = (settings: Record<string, unknown> | null) => {
    const closesAt = typeof settings?.registrationClosesAt === "string" ? settings.registrationClosesAt : null;
    const next = shiftedRegistrationClose(closesAt, beforeStartsAt, afterStartsAt);
    return settings && next !== closesAt ? { ...settings, registrationClosesAt: next } : null;
  };
  const draft = moved(row.draft);
  const published = moved(row.published);
  if (!draft && !published) return;
  await executor.query(
    `update event_host_question_sets set draft = coalesce($3::jsonb, draft), published = coalesce($4::jsonb, published), revision = revision + 1 where workspace_id = $1 and event_id = $2`,
    [workspaceId, eventId, draft ? JSON.stringify(draft) : null, published ? JSON.stringify(published) : null],
  );
}

async function writeOperationsConfiguration(executor: EventOperationsSqlExecutor, workspaceId: string, event: HostEventRow, registrationClosesAt: string | null, tableSize = 5): Promise<void> {
  const schedule = defaultOperationsSchedule(event.startsAt, event.endsAt, registrationClosesAt);
  const head = await executor.query<{ configuration_version: string }>(`select configuration_version::text from event_ops_configuration_heads where workspace_id = $1 and event_id = $2 for update`, [workspaceId, event.eventId]);
  const version = Number(head.rows[0]?.configuration_version ?? 0) + 1;
  await executor.query(
    `insert into event_ops_configurations (
       workspace_id, event_id, configuration_version, check_in_opens_at, event_starts_at, event_ends_at,
       profile_edit_deadline_at, registration_cutoff_at, results_available_at, round_one_starts_at, round_two_starts_at,
       recommendation_count, table_size, shard_size, max_attempts_per_task, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 5, $12, 6, 3, now(), now())`,
    [workspaceId, event.eventId, version, schedule.checkInOpensAt, schedule.eventStartsAt, schedule.eventEndsAt, schedule.profileEditDeadlineAt, schedule.registrationCutoffAt, schedule.resultsAvailableAt, schedule.roundOneStartsAt, schedule.roundTwoStartsAt, tableSize],
  );
  await executor.query(
    `insert into event_ops_configuration_heads (workspace_id, event_id, configuration_version, revision, updated_at)
     values ($1, $2, $3, 1, now())
     on conflict (workspace_id, event_id) do update set configuration_version = excluded.configuration_version, revision = event_ops_configuration_heads.revision + 1, updated_at = excluded.updated_at`,
    [workspaceId, event.eventId, version],
  );
}

async function hostTransaction<T>(client: EventOperationsPostgresClient, run: (executor: EventOperationsSqlExecutor) => Promise<T>): Promise<T> {
  return client.transaction(async (executor) => {
    await acquireSyncCommitOrderLock(executor);
    return run(executor);
  });
}

function payloadFrom(input: HostEventInput): HostEventPayload {
  return {
    capacity: input.capacity ?? null,
    emoji: input.emoji ?? null,
    feeAmountYen: input.feeKind === "amount" ? input.feeAmountYen ?? null : null,
    feeKind: input.feeKind,
    feeUrl: input.feeKind === "external_link" ? input.feeUrl ?? null : null,
    online: input.online ?? false,
    templateId: input.templateId ?? null,
    venueArea: input.venueArea ?? null,
  };
}

function validTimes(startsAt: string, endsAt: string) {
  if (!(Date.parse(endsAt) > Date.parse(startsAt))) throw new HostError("VALIDATION", "EVENT_TIME_RANGE");
}

export interface HostLifecycleDeps {
  client: EventOperationsPostgresClient;
  workspaceId: string;
  /** 测试注入（参加コード的随机字节）。 */
  randomBytes?: () => Uint8Array;
  newEventId?: () => string;
}

export function createHostLifecycle(deps: HostLifecycleDeps) {
  const { client, workspaceId } = deps;
  const bytes = deps.randomBytes ?? (() => randomBytes(8));
  const newId = deps.newEventId ?? (() => `evt_${randomUUID().replaceAll("-", "").slice(0, 20)}`);

  async function setEvent(executor: EventOperationsSqlExecutor, current: HostEventRow, next: HostEventRow): Promise<HostEventRow> {
    const result = await executor.query<Row>(
      `update event_ops_events set
         lifecycle_state_v2 = $3, title = $4, description = $5, venue = $6, starts_at = $7, ends_at = $8, public_code = $9,
         cancelled_at = $10, archived_at = $11, organizer_profile_id = $12,
         source_payload = jsonb_set(coalesce(source_payload, '{}'::jsonb), '{host}', $13::jsonb),
         event_version = event_version + 1, updated_at = now(), revision = revision + 1
       where workspace_id = $1 and event_id = $2 and event_version = $14
       returning ${EVENT_COLUMNS}`,
      [workspaceId, current.eventId, next.lifecycle, next.title, next.description, next.venue, next.startsAt, next.endsAt, next.publicCode, next.cancelledAt, next.archivedAt, next.organizerProfileId, JSON.stringify(next.payload), current.version],
    );
    if (!result.rows[0]) throw new HostError("VERSION_CONFLICT");
    const saved = rowToEvent(result.rows[0]);
    await appendVersion(executor, workspaceId, saved);
    return saved;
  }

  async function lockedEvent(executor: EventOperationsSqlExecutor, eventId: string, expectedVersion: number | null): Promise<HostEventRow> {
    const current = await readHostEvent(executor, workspaceId, eventId, true);
    if (!current) throw new HostError("NOT_FOUND");
    if (expectedVersion !== null && current.version !== expectedVersion) throw new HostError("VERSION_CONFLICT");
    return current;
  }

  /** 申込者（承認済み + 審査待ち + キャンセル待ち）与共同运营者。 */
  async function recipients(executor: EventOperationsSqlExecutor, eventId: string, statuses: readonly string[]): Promise<string[]> {
    const applicants = await executor.query<{ actor_id: string }>(`select actor_id from event_ops_admission_application_heads where workspace_id = $1 and event_id = $2 and status = any($3::text[])`, [workspaceId, eventId, statuses]);
    const legacy = await executor.query<{ actor_id: string }>(`select actor_id from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and status = 'rsvped'`, [workspaceId, eventId]);
    return [...new Set([...applicants.rows, ...legacy.rows].map((row) => row.actor_id))];
  }

  async function cohostActors(executor: EventOperationsSqlExecutor, eventId: string): Promise<string[]> {
    const result = await executor.query<{ subject_actor_id: string }>(`select subject_actor_id from event_ops_event_role_assignment_heads where workspace_id = $1 and event_id = $2 and state = 'active'`, [workspaceId, eventId]);
    return result.rows.map((row) => row.subject_actor_id);
  }

  return {
    async create(actorId: string, input: HostEventInput): Promise<HostEventRow> {
      validTimes(input.startsAt, input.endsAt);
      return hostTransaction(client, async (executor) => {
        const profile = await executor.query(`select 1 from organizer_profiles where workspace_id = $1 and profile_id = $2 and owner_actor_id = $3`, [workspaceId, input.organizerProfileId, actorId]);
        if (!profile.rows[0]) throw new HostError("FORBIDDEN", "ORGANIZER_PROFILE_NOT_OWNED");
        const eventId = newId();
        const result = await executor.query<Row>(
          `insert into event_ops_events (
             workspace_id, event_id, organizer_actor_id, lifecycle_state, registration_migration_state, revision, created_at, updated_at,
             title, description, venue, timezone, starts_at, ends_at, lifecycle_state_v2, source_payload, event_version, organizer_profile_id, created_by
           ) values ($1, $2, $3, 'active', 'canonical', 1, now(), now(), $4, $5, $6, $7, $8, $9, 'draft', $10::jsonb, 1, $11, 'host')
           returning ${EVENT_COLUMNS}`,
          [workspaceId, eventId, actorId, input.title.trim(), input.description ?? null, input.venueName ?? null, input.timezone ?? "Asia/Tokyo", input.startsAt, input.endsAt, JSON.stringify({ host: payloadFrom(input) }), input.organizerProfileId],
        );
        const event = rowToEvent(result.rows[0]!);
        await appendVersion(executor, workspaceId, event);
        await addAlias(executor, workspaceId, eventId, eventId, "event_id");
        return event;
      });
    },

    /** 改基本情報。已公开且日時 / 会場变了而 `notify` 未给 → 不写，返回 `needsDecision`。 */
    async update(actorId: string, eventId: string, input: HostEventUpdateInput): Promise<{ event: HostEventRow; needsDecision: boolean; notified: number; before: HostEventRow }> {
      return hostTransaction(client, async (executor) => {
        const current = await lockedEvent(executor, eventId, input.expectedVersion);
        if (current.lifecycle === "cancelled" || current.lifecycle === "archived") throw new HostError("INVALID_STATE", "EVENT_READ_ONLY");
        const startsAt = input.startsAt ?? current.startsAt;
        const endsAt = input.endsAt ?? current.endsAt;
        validTimes(startsAt, endsAt);
        const venue = input.venueName !== undefined ? input.venueName : current.venue;
        const timeChanged = Date.parse(startsAt) !== Date.parse(current.startsAt) || Date.parse(endsAt) !== Date.parse(current.endsAt);
        const venueChanged = (venue ?? "") !== (current.venue ?? "");
        if (current.lifecycle === "published" && (timeChanged || venueChanged) && input.notify === undefined) return { before: current, event: current, needsDecision: true, notified: 0 };
        if (input.organizerProfileId && input.organizerProfileId !== current.organizerProfileId) {
          const profile = await executor.query(`select 1 from organizer_profiles where workspace_id = $1 and profile_id = $2 and owner_actor_id = $3`, [workspaceId, input.organizerProfileId, current.organizerActorId]);
          if (!profile.rows[0]) throw new HostError("FORBIDDEN", "ORGANIZER_PROFILE_NOT_OWNED");
        }
        const payload: HostEventPayload = {
          ...current.payload,
          ...(input.emoji !== undefined ? { emoji: input.emoji } : {}),
          ...(input.venueArea !== undefined ? { venueArea: input.venueArea } : {}),
          ...(input.online !== undefined ? { online: input.online } : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.feeKind !== undefined ? { feeKind: input.feeKind } : {}),
          ...(input.feeAmountYen !== undefined ? { feeAmountYen: input.feeAmountYen } : {}),
          ...(input.feeUrl !== undefined ? { feeUrl: input.feeUrl } : {}),
        };
        const saved = await setEvent(executor, current, { ...current, description: input.description !== undefined ? input.description : current.description, endsAt, organizerProfileId: input.organizerProfileId ?? current.organizerProfileId, payload, startsAt, title: input.title?.trim() ?? current.title, venue });
        if (current.lifecycle === "published" && timeChanged) {
          const policy = await executor.query<{ policy_version: string; registration_closes_at: unknown; registration_opens_at: unknown }>(`select v.policy_version::text, v.registration_opens_at, v.registration_closes_at from event_ops_admission_policy_heads h join event_ops_admission_policy_versions v using (workspace_id, event_id, policy_version) where h.workspace_id = $1 and h.event_id = $2`, [workspaceId, eventId]);
          const row = policy.rows[0];
          const closesAt = iso(row?.registration_closes_at) ?? null;
          const nextClosesAt = shiftedRegistrationClose(closesAt, current.startsAt, startsAt);
          if (row && closesAt && nextClosesAt && nextClosesAt !== closesAt) {
            // Moving the event earlier must not leave registration open after it starts: write the moved close as a new policy version
            // (deadline = close, as applyPolicy writes it, so the policy keeps matching the operations configuration below).
            const opensAt = iso(row.registration_opens_at)!;
            const nextOpensAt = Date.parse(opensAt) < Date.parse(nextClosesAt) ? opensAt : new Date(Date.parse(nextClosesAt) - 60_000).toISOString();
            const version = Number(row.policy_version);
            await executor.query(
              `insert into event_ops_admission_policy_versions (workspace_id, event_id, policy_version, capacity, admission_mode, waitlist_enabled, registration_opens_at, registration_closes_at, profile_edit_deadline_at, updated_at)
               select workspace_id, event_id, $4, capacity, admission_mode, waitlist_enabled, $5, $6, $6, clock_timestamp() from event_ops_admission_policy_versions where workspace_id = $1 and event_id = $2 and policy_version = $3`,
              [workspaceId, eventId, version, version + 1, nextOpensAt, nextClosesAt],
            );
            await executor.query(`update event_ops_admission_policy_heads set policy_version = $3, updated_at = clock_timestamp() where workspace_id = $1 and event_id = $2`, [workspaceId, eventId, version + 1]);
          }
          await writeOperationsConfiguration(executor, workspaceId, saved, nextClosesAt);
        }
        if (timeChanged) await shiftSavedRegistrationClose(executor, workspaceId, eventId, current.startsAt, startsAt);
        let notified = 0;
        if (current.lifecycle === "published" && input.notify && (timeChanged || venueChanged)) {
          for (const recipient of await recipients(executor, eventId, ["admitted", "waitlisted"])) {
            if (await enqueueHostNotice(executor, { actorId: recipient, eventId, idempotencyKey: `notice:${eventId}:event_changed:${recipient}:v${saved.version}`, kind: "event_changed", payload: { afterStartsAt: startsAt, afterVenue: venue, beforeStartsAt: current.startsAt, beforeVenue: current.venue }, workspaceId })) notified += 1;
          }
          await executor.query(`insert into event_host_notice_sends (workspace_id, event_id, send_id, kind, recipients, sent_by) values ($1, $2, $3, 'event_changed', $4, $5)`, [workspaceId, eventId, `send_${randomUUID()}`, notified, actorId]);
        }
        return { before: current, event: saved, needsDecision: false, notified };
      });
    },

    async publish(actorId: string, eventId: string, expectedVersion: number, options: { registrationClosesAt?: string | null; followerActorIds?: readonly string[] } = {}): Promise<{ event: HostEventRow; notified: number }> {
      return hostTransaction(client, async (executor) => {
        const current = await lockedEvent(executor, eventId, null);
        if (current.lifecycle === "published") return { event: current, notified: 0 };
        if (current.version !== expectedVersion) throw new HostError("VERSION_CONFLICT");
        if (current.lifecycle !== "draft") throw new HostError("INVALID_STATE", "NOT_DRAFT");
        if (!current.title.trim()) throw new HostError("VALIDATION", "TITLE_REQUIRED");
        const code = await issueCode(executor, workspaceId, eventId, bytes);
        await issueSlug(executor, workspaceId, current);
        const saved = await setEvent(executor, current, { ...current, lifecycle: "published", publicCode: code });
        await writeOperationsConfiguration(executor, workspaceId, saved, options.registrationClosesAt ?? null);
        let notified = 0;
        for (const follower of options.followerActorIds ?? []) {
          if (follower !== actorId && await enqueueHostNotice(executor, { actorId: follower, eventId, kind: "event_published", workspaceId })) notified += 1;
        }
        return { event: saved, notified };
      });
    },

    async cancel(actorId: string, eventId: string, expectedVersion: number, hostNote: string | null): Promise<{ event: HostEventRow; notified: number }> {
      return hostTransaction(client, async (executor) => {
        const current = await lockedEvent(executor, eventId, expectedVersion);
        if (current.organizerActorId !== actorId) throw new HostError("FORBIDDEN", "OWNER_ONLY");
        if (current.lifecycle !== "published") throw new HostError("INVALID_STATE", "NOT_PUBLISHED");
        await removeAliases(executor, workspaceId, eventId, ["public_code", "public_slug"]);
        const saved = await setEvent(executor, current, { ...current, cancelledAt: new Date().toISOString(), lifecycle: "cancelled", publicCode: null });
        let notified = 0;
        for (const recipient of [...await recipients(executor, eventId, ["admitted", "pending_review", "waitlisted"]), ...await cohostActors(executor, eventId)]) {
          if (await enqueueHostNotice(executor, { actorId: recipient, eventId, kind: "event_cancelled", payload: hostNote ? { hostNote } : {}, workspaceId })) notified += 1;
        }
        await executor.query(`insert into event_host_notice_sends (workspace_id, event_id, send_id, kind, recipients, sent_by) values ($1, $2, $3, 'event_cancelled', $4, $5)`, [workspaceId, eventId, `send_${randomUUID()}`, notified, actorId]);
        return { event: saved, notified };
      });
    },

    async archive(eventId: string, expectedVersion: number, archived: boolean, now = new Date()): Promise<HostEventRow> {
      return hostTransaction(client, async (executor) => {
        const current = await lockedEvent(executor, eventId, expectedVersion);
        if (archived) {
          if (current.lifecycle === "archived") return current;
          const ended = Date.parse(current.endsAt) <= now.getTime();
          if (current.lifecycle !== "cancelled" && !(current.lifecycle === "published" && ended)) throw new HostError("INVALID_STATE", "NOT_ARCHIVABLE");
          return setEvent(executor, current, { ...current, archivedAt: now.toISOString(), cancelledAt: null, lifecycle: "archived", payload: { ...current.payload, cancelledAt: current.cancelledAt } });
        }
        if (current.lifecycle !== "archived") return current;
        const wasCancelled = Boolean(current.payload.cancelledAt);
        return setEvent(executor, current, { ...current, archivedAt: null, cancelledAt: wasCancelled ? current.payload.cancelledAt ?? null : null, lifecycle: wasCancelled ? "cancelled" : "published", payload: { ...current.payload, cancelledAt: null } });
      });
    },

    async reissueCode(eventId: string, expectedVersion: number): Promise<HostEventRow> {
      return hostTransaction(client, async (executor) => {
        const current = await lockedEvent(executor, eventId, expectedVersion);
        if (current.lifecycle !== "published") throw new HostError("INVALID_STATE", "NOT_PUBLISHED");
        await removeAliases(executor, workspaceId, eventId, ["public_code"]);
        await executor.query(`update event_ops_events set public_code = null where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
        // 再发行一定换一个码（旧码立即失效）。
        const code = await issueCode(executor, workspaceId, eventId, bytes, current.publicCode);
        return setEvent(executor, { ...current }, { ...current, publicCode: code });
      });
    },

    /** 会后 30 天自动归档（维护任务调用；只动 host 建的活动）。 */
    async archiveEnded(now: Date, graceDays = 30): Promise<number> {
      const due = await client.query<{ event_id: string; event_version: string }>(
        `select event_id, event_version::text from event_ops_events where workspace_id = $1 and created_by = 'host' and lifecycle_state_v2 = 'published' and ends_at < $2`,
        [workspaceId, new Date(now.getTime() - graceDays * 86_400_000).toISOString()],
      );
      let count = 0;
      for (const row of due.rows) {
        try { await this.archive(row.event_id, Number(row.event_version), true, now); count += 1; } catch (error) { if (!(error instanceof HostError)) throw error; }
      }
      return count;
    },
  };
}

export type HostLifecycle = ReturnType<typeof createHostLifecycle>;
