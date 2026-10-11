/**
 * R15 招待：读本人资料里招待用得到的部分（名字、会社・役職、提供できること、求めていること、連絡先、updatedAt）。
 * Owner: 甲 (R15). Used by: `service.ts`（发码 / 预览 / 兑换）、`sync.ts`。
 *
 * live 用资料模块现有的 `createProfileActorPostgresReader`（与 `GET /api/profile` 同一份 `orbit_records` 记录，
 * 同一个事务里读）；资料保存属于 R18，这里只读不写。`offering / seeking` 在 `publicProfile` 里，
 * 邮箱 / 电话在 `handles` 里。资料还没确认名字（`displayNameConfirmed === false`）或没有资料 → null。
 */
import type { TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { createProfileActorPostgresReader } from "../profile/storage/profile-actor-postgres-reader";
import type { InviteProfile } from "./contract";
import { cleanList } from "./invite-fields";

export interface InviteProfileReader {
  read(actorId: string): Promise<InviteProfile | null>;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** `orbit_records` 里 profiles 集合的 payload → 招待资料。 */
export function inviteProfileFromPayload(actorId: string, payload: Record<string, unknown>, fallbackUpdatedAt: string): InviteProfile | null {
  const displayName = payload.displayNameConfirmed === false ? null : text(payload.displayName, 80);
  if (!displayName) return null;
  const publicProfile = (payload.publicProfile ?? {}) as Record<string, unknown>;
  const handles = (payload.handles ?? {}) as Record<string, unknown>;
  return {
    actorId,
    displayName,
    email: text(handles.email, 254),
    offering: cleanList(publicProfile.offering),
    organization: text(payload.organization, 120),
    phone: text(handles.phone, 40),
    role: text(payload.role, 80),
    seeking: cleanList(publicProfile.seeking),
    updatedAt: text(payload.updatedAt, 64) ?? fallbackUpdatedAt,
  };
}

export function createPostgresInviteProfileReader(tx: TransactionalSqlExecutor, workspaceId: string): InviteProfileReader {
  const read = createProfileActorPostgresReader({ client: tx, workspaceId });
  return {
    async read(actorId) {
      const graph = await read(actorId);
      const record = graph.profiles[0];
      if (!record || typeof record.payload !== "object" || record.payload === null) return null;
      return inviteProfileFromPayload(actorId, record.payload as Record<string, unknown>, record.updatedAt);
    },
  };
}

/** 测试与 mock：进程内的资料表。 */
export function createMemoryInviteProfileReader(profiles: Map<string, InviteProfile>): InviteProfileReader {
  return { read: async (actorId) => (profiles.has(actorId) ? structuredClone(profiles.get(actorId)!) : null) };
}
