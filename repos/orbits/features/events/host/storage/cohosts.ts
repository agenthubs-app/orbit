/**
 * R17 共同運営者（host/DESIGN.md §2.8）。Owner: 甲 (R17).
 * - 只有 owner（`roles.manage`）能发邀请、改角色、移除；owner 自己不可移除。改角色 / 移除要写理由（1–100 字），进现有版本表。
 * - 招待リンク：32 字节随机令牌（256 bit），库里只存 SHA-256；单次使用；7 天过期；可撤回。
 * - 招待コード `H-XXXX-XXXX`：同字母表；预览 / 接受按客户端键限流（失败 10 次锁 15 分钟），对标 R15 防枚举。
 * - 指定了邮箱 / Orbit ID 时，接受者必须是同一账号；界面反馈与邮箱是否注册无关（不暴露）。
 * - 站内通知只写给已有账号的被邀请人；不给陌生地址发邮件。
 * - 接受：服务端以邀请为凭证，代 owner 授予角色（不要求接受者有 `roles.manage`）。
 */
import { createHash, randomBytes } from "node:crypto";

import { normalizeAuthEmail } from "../../../auth/contract";
import { cohostCodeFromBytes, normalizeCohostCode } from "../../../../shared/compute/participation-code";
import type { HostCohostHistoryItem, HostCohostRole } from "../../../../shared/contract/host-cohosts";
import type { EventAccessRepository } from "../../event-access/repository";
import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from "../../event-operations/storage/postgres-client";
import { HostError } from "../service";
import { enqueueHostNotice } from "./admission-hooks";

export const COHOST_INVITE_TTL_MS = 7 * 86_400_000;
export const COHOST_ATTEMPT_LIMIT = 10;
export const COHOST_LOCK_MS = 15 * 60_000;

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** 打码显示：`ta***@example.com`；Orbit ID 原样。 */
export function maskInvitee(target: string): string {
  const at = target.indexOf("@");
  if (at < 0) return target;
  const local = target.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${target.slice(at)}`;
}

export async function actorNames(executor: EventOperationsSqlExecutor, workspaceId: string, actorIds: readonly string[]): Promise<Map<string, string>> {
  if (actorIds.length === 0) return new Map();
  const result = await executor.query<{ id: string; name: string }>(
    `select payload ->> 'id' as id, payload ->> 'displayName' as name from orbit_records
      where workspace_id = $1 and collection_name = 'auth_users' and payload ->> 'id' = any($2::text[])`,
    [workspaceId, [...new Set(actorIds)]],
  );
  return new Map(result.rows.map((row) => [row.id, row.name]));
}

async function actorForEmail(executor: EventOperationsSqlExecutor, workspaceId: string, email: string): Promise<string | null> {
  const result = await executor.query<{ id: string }>(`select payload ->> 'id' as id from orbit_records where workspace_id = $1 and collection_name = 'auth_users' and record_id = $2`, [workspaceId, `auth_user:${normalizeAuthEmail(email)}`]);
  return result.rows[0]?.id ?? null;
}

async function emailOf(executor: EventOperationsSqlExecutor, workspaceId: string, actorId: string): Promise<string | null> {
  const result = await executor.query<{ email: string }>(`select payload ->> 'email' as email from orbit_records where workspace_id = $1 and collection_name = 'auth_users' and payload ->> 'id' = $2 limit 1`, [workspaceId, actorId]);
  return result.rows[0]?.email ?? null;
}

export interface HostCohostDeps {
  client: EventOperationsPostgresClient;
  workspaceId: string;
  access: Pick<EventAccessRepository, "get" | "grant" | "revoke">;
  now?: () => Date;
  randomBytes?: (size: number) => Uint8Array;
}

interface InviteRow { inviteId: string; eventId: string; role: HostCohostRole; invitedEmailHash: string | null; invitedActorId: string | null; invitedBy: string; expiresAt: string; usedAt: string | null; revokedAt: string | null }

export function createHostCohosts(deps: HostCohostDeps) {
  const { client, workspaceId } = deps;
  const now = deps.now ?? (() => new Date());
  const bytes = deps.randomBytes ?? ((size: number) => randomBytes(size));

  async function organizerOf(eventId: string): Promise<string> {
    const result = await client.query<{ organizer_actor_id: string }>(`select organizer_actor_id from event_ops_events where workspace_id = $1 and event_id = $2 and lifecycle_state_v2 is not null`, [workspaceId, eventId]);
    const owner = result.rows[0]?.organizer_actor_id;
    if (!owner) throw new HostError("NOT_FOUND");
    return owner;
  }

  async function requireOwner(actorId: string, eventId: string): Promise<string> {
    const owner = await organizerOf(eventId);
    if (owner !== actorId) throw new HostError("FORBIDDEN", "OWNER_ONLY");
    return owner;
  }

  /** 失败计数与锁定（按客户端键）；成功不重置窗口（防止交替试探）。 */
  async function guardAttempt(clientKey: string): Promise<void> {
    const result = await client.query<{ locked_until: unknown }>(`select locked_until from event_cohost_invite_attempts where workspace_id = $1 and client_key_hash = $2`, [workspaceId, sha(clientKey)]);
    const locked = result.rows[0]?.locked_until;
    if (locked && new Date(String(locked instanceof Date ? locked.toISOString() : locked)).getTime() > now().getTime()) throw new HostError("RATE_LIMITED");
  }

  async function recordFailure(clientKey: string): Promise<void> {
    await client.query(
      `insert into event_cohost_invite_attempts (workspace_id, client_key_hash, window_started_at, failures) values ($1, $2, $3, 1)
       on conflict (workspace_id, client_key_hash) do update set
         failures = case when event_cohost_invite_attempts.window_started_at < $3::timestamptz - interval '15 minutes' then 1 else event_cohost_invite_attempts.failures + 1 end,
         window_started_at = case when event_cohost_invite_attempts.window_started_at < $3::timestamptz - interval '15 minutes' then $3::timestamptz else event_cohost_invite_attempts.window_started_at end,
         locked_until = case when (case when event_cohost_invite_attempts.window_started_at < $3::timestamptz - interval '15 minutes' then 1 else event_cohost_invite_attempts.failures + 1 end) >= $4 then $3::timestamptz + interval '15 minutes' else event_cohost_invite_attempts.locked_until end`,
      [workspaceId, sha(clientKey), now().toISOString(), COHOST_ATTEMPT_LIMIT],
    );
  }

  async function findInvite(executor: EventOperationsSqlExecutor, code: string, lock: boolean): Promise<InviteRow | null> {
    const short = normalizeCohostCode(code);
    const result = await executor.query<Record<string, unknown>>(
      `select invite_id, event_id, role, invited_email_hash, invited_actor_id, invited_by, expires_at, used_at, revoked_at from event_cohost_invites
        where workspace_id = $1 and (token_hash = $2 or short_code = $3)${lock ? " for update" : ""}`,
      [workspaceId, sha(code.trim()), short ?? "-"],
    );
    const row = result.rows[0];
    if (!row) return null;
    const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value instanceof Date ? value : String(value)).toISOString());
    return { eventId: String(row.event_id), expiresAt: iso(row.expires_at)!, invitedActorId: (row.invited_actor_id as string | null) ?? null, invitedBy: String(row.invited_by), invitedEmailHash: (row.invited_email_hash as string | null) ?? null, inviteId: String(row.invite_id), revokedAt: iso(row.revoked_at), role: row.role as HostCohostRole, usedAt: iso(row.used_at) };
  }

  const usable = (invite: InviteRow | null): invite is InviteRow => Boolean(invite && !invite.usedAt && !invite.revokedAt && Date.parse(invite.expiresAt) > now().getTime());

  return {
    async invite(actorId: string, eventId: string, input: { role: HostCohostRole; target?: string | null; idempotencyKey: string }) {
      await requireOwner(actorId, eventId);
      const target = input.target?.trim() || null;
      const inviteId = `inv_${sha(`${eventId}|${actorId}|${input.idempotencyKey}`).slice(0, 24)}`;
      const token = Buffer.from(bytes(32)).toString("base64url");
      const expiresAt = new Date(now().getTime() + COHOST_INVITE_TTL_MS).toISOString();
      const isEmail = target?.includes("@") ?? false;
      const inviteeActor = target ? (isEmail ? await actorForEmail(client, workspaceId, target) : /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u.test(target) ? target : null) : null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const shortCode = cohostCodeFromBytes(bytes(8));
        try {
          const inserted = await client.transaction(async (executor) => {
            const result = await executor.query(
              `insert into event_cohost_invites (workspace_id, invite_id, event_id, token_hash, short_code, role, invited_email_hash, invited_actor_id, invitee_label, invited_by, expires_at)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (workspace_id, invite_id) do nothing`,
              [workspaceId, inviteId, eventId, sha(token), shortCode, input.role, isEmail && target ? sha(normalizeAuthEmail(target)) : null, isEmail ? null : target, target ? maskInvitee(target) : null, actorId, expiresAt],
            );
            if ((result.rowCount ?? 0) === 0) return false;
            // 只给已有账号的被邀请人写站内通知（邮箱对不上账号时什么都不写，界面反馈一样）。
            // 通知链接用短码（邀请绑定了被邀请人，短码给别人也用不了）；令牌只存哈希，不写进 outbox。
            if (inviteeActor) await enqueueHostNotice(executor, { actorId: inviteeActor, eventId, idempotencyKey: `notice:${eventId}:cohost_invite:${inviteeActor}:${inviteId}`, kind: "cohost_invite", payload: { href: `/app/host/join/${encodeURIComponent(shortCode)}`, role: input.role }, workspaceId });
            return true;
          });
          if (!inserted) throw new HostError("INVALID_STATE", "INVITE_REPLAYED");
          return { expiresAt, inviteId, link: `/app/host/join/${token}`, shortCode };
        } catch (error) {
          if ((error as { code?: string }).code === "23505" && String((error as { constraint?: string }).constraint ?? "").includes("short_code")) continue;
          throw error;
        }
      }
      throw new HostError("INVALID_STATE", "SHORT_CODE_EXHAUSTED");
    },

    async revoke(actorId: string, eventId: string, inviteId: string): Promise<void> {
      await requireOwner(actorId, eventId);
      await client.query(`update event_cohost_invites set revoked_at = $4 where workspace_id = $1 and event_id = $2 and invite_id = $3 and used_at is null and revoked_at is null`, [workspaceId, eventId, inviteId, now().toISOString()]);
    },

    /** 预览：无效 / 过期 / 已用 / 已撤回一律 `null`（不区分原因）。 */
    async preview(code: string, clientKey: string): Promise<{ eventId: string; role: HostCohostRole; invitedBy: string; expiresAt: string } | null> {
      await guardAttempt(clientKey);
      const invite = await findInvite(client, code, false);
      if (!usable(invite)) {
        await recordFailure(clientKey);
        return null;
      }
      return { eventId: invite.eventId, expiresAt: invite.expiresAt, invitedBy: invite.invitedBy, role: invite.role };
    },

    async accept(actorId: string, code: string, clientKey: string): Promise<{ eventId: string; role: HostCohostRole }> {
      await guardAttempt(clientKey);
      const accepted = await client.transaction(async (executor) => {
        const invite = await findInvite(executor, code, true);
        if (!usable(invite)) return null;
        if (invite.invitedActorId && invite.invitedActorId !== actorId) return null;
        if (invite.invitedEmailHash) {
          const email = await emailOf(executor, workspaceId, actorId);
          if (!email || sha(normalizeAuthEmail(email)) !== invite.invitedEmailHash) return null;
        }
        const owner = await organizerOf(invite.eventId);
        if (owner === actorId) throw new HostError("INVALID_STATE", "ALREADY_OWNER");
        // 已中止 / 已归档的活动不再接受共同运营（R17 复核）。
        const state = await executor.query<{ lifecycle_state_v2: string }>(`select lifecycle_state_v2 from event_ops_events where workspace_id = $1 and event_id = $2`, [workspaceId, invite.eventId]);
        if (["cancelled", "archived"].includes(state.rows[0]?.lifecycle_state_v2 ?? "")) throw new HostError("INVALID_STATE", "EVENT_CLOSED");
        await executor.query(`update event_cohost_invites set used_by = $3, used_at = $4 where workspace_id = $1 and invite_id = $2`, [workspaceId, invite.inviteId, actorId, now().toISOString()]);
        return { invite, owner };
      });
      if (!accepted) {
        await recordFailure(clientKey);
        throw new HostError("TOKEN_INVALID");
      }
      // 角色授予在 event-access 自己的事务里；失败时把邀请恢复成未使用（否则邀请作废、角色却没给上）。
      try {
        const current = await deps.access.get({ eventId: accepted.invite.eventId, subjectActorId: actorId });
        await deps.access.grant({ actingActorId: accepted.owner, eventId: accepted.invite.eventId, expectedRevision: current.revision, reason: "招待リンクから参加", role: accepted.invite.role, subjectActorId: actorId });
      } catch (error) {
        await client.query(`update event_cohost_invites set used_by = null, used_at = null where workspace_id = $1 and invite_id = $2 and used_by = $3`, [workspaceId, accepted.invite.inviteId, actorId]).catch(() => undefined);
        throw error;
      }
      return { eventId: accepted.invite.eventId, role: accepted.invite.role };
    },

    async changeRole(actorId: string, eventId: string, subjectActorId: string, input: { role: HostCohostRole; reason: string; expectedRevision: number }): Promise<void> {
      const owner = await requireOwner(actorId, eventId);
      if (subjectActorId === owner) throw new HostError("FORBIDDEN", "OWNER_IMMUTABLE");
      if (!input.reason.trim()) throw new HostError("VALIDATION", "REASON_REQUIRED");
      await deps.access.grant({ actingActorId: actorId, eventId, expectedRevision: input.expectedRevision, reason: input.reason.trim(), role: input.role, subjectActorId });
    },

    async remove(actorId: string, eventId: string, subjectActorId: string, input: { reason: string; expectedRevision: number }): Promise<void> {
      const owner = await requireOwner(actorId, eventId);
      if (subjectActorId === owner) throw new HostError("FORBIDDEN", "OWNER_IMMUTABLE");
      if (!input.reason.trim()) throw new HostError("VALIDATION", "REASON_REQUIRED");
      await deps.access.revoke({ actingActorId: actorId, eventId, expectedRevision: input.expectedRevision, reason: input.reason.trim(), subjectActorId });
    },

    async members(eventId: string): Promise<Array<{ actorId: string; role: "owner" | HostCohostRole | string; revision: number }>> {
      const owner = await organizerOf(eventId);
      const result = await client.query<{ subject_actor_id: string; role: string; revision: string }>(`select subject_actor_id, role, revision::text from event_ops_event_role_assignment_heads where workspace_id = $1 and event_id = $2 and state = 'active' order by updated_at`, [workspaceId, eventId]);
      return [{ actorId: owner, revision: 0, role: "owner" }, ...result.rows.map((row) => ({ actorId: row.subject_actor_id, revision: Number(row.revision), role: row.role }))];
    },

    async history(eventId: string): Promise<Array<Omit<HostCohostHistoryItem, "subjectName" | "byName"> & { subjectActorId: string; byActorId: string }>> {
      const result = await client.query<{ subject_actor_id: string; assignment_version: string; role: string; state: string; assigned_by_actor_id: string; reason: string; created_at: unknown }>(
        `select subject_actor_id, assignment_version::text, role, state, assigned_by_actor_id, reason, created_at from event_ops_event_role_assignment_versions where workspace_id = $1 and event_id = $2 order by created_at desc limit 20`,
        [workspaceId, eventId],
      );
      return result.rows.map((row) => ({ action: row.state === "revoked" ? "revoked" as const : Number(row.assignment_version) === 1 ? "granted" as const : "changed" as const, at: new Date(row.created_at instanceof Date ? row.created_at : String(row.created_at)).toISOString(), byActorId: row.assigned_by_actor_id, reason: row.reason, role: (row.role as HostCohostRole) ?? null, subjectActorId: row.subject_actor_id }));
    },

    async pendingInvites(eventId: string) {
      const result = await client.query<{ invite_id: string; role: HostCohostRole; invitee_label: string | null; expires_at: unknown }>(`select invite_id, role, invitee_label, expires_at from event_cohost_invites where workspace_id = $1 and event_id = $2 and used_at is null and revoked_at is null and expires_at > $3 order by created_at desc`, [workspaceId, eventId, now().toISOString()]);
      return result.rows.map((row) => ({ expiresAt: new Date(row.expires_at instanceof Date ? row.expires_at : String(row.expires_at)).toISOString(), inviteId: row.invite_id, inviteeLabel: row.invitee_label, role: row.role }));
    },

    /** 「受付だけ担当」：我有 check_in 的活动。 */
    async checkInEvents(actorId: string) {
      const result = await client.query<{ event_id: string; title: string | null; starts_at: unknown; venue: string | null; source_payload: { host?: { emoji?: string | null } } | null }>(
        `select e.event_id, e.title, e.starts_at, e.venue, e.source_payload from event_ops_event_role_assignment_heads h
           join event_ops_events e on e.workspace_id = h.workspace_id and e.event_id = h.event_id
          where h.workspace_id = $1 and h.subject_actor_id = $2 and h.state = 'active' and h.role = 'check_in' and e.lifecycle_state_v2 = 'published'
          order by e.starts_at`,
        [workspaceId, actorId],
      );
      return result.rows.map((row) => ({ emoji: row.source_payload?.host?.emoji ?? null, eventId: row.event_id, startsAt: row.starts_at ? new Date(row.starts_at instanceof Date ? row.starts_at : String(row.starts_at)).toISOString() : null, title: row.title ?? "", venue: row.venue }));
    },
  };
}

export type HostCohosts = ReturnType<typeof createHostCohosts>;
