/**
 * R11a（代定 9）：联系人软删除 + 30 天内恢复。只改联系人那一条 orbit_records（lifecycle_state / deleted_at / updated_at），
 * 每次写都会推进 sync_revision，所以 App 镜像里这个人变成 tombstone、恢复后再出现（features/sync/contact-domain-reader.ts）。
 * 关系、详情状态（含メモ）、任务等其他记录不动：读取侧都以联系人在不在为准，所以删除期间一起隐藏，恢复后照旧。
 * 「最近削除した項目」一览与到期清除 → 下一期（DEFERRED）。
 */
import { AppError } from "../../../shared/errors/app-error";
import type { ContactDeleteResult, ContactRestoreResult } from "../../../shared/contract/contact-delete";

export const CONTACT_RESTORE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface ContactDeleteSqlClient {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

/** 归属谓词与 completion/repository.ts 的 OWNED_CONTACTS 一致：本人的、accountId 为空或是本人。 */
const OWNED = `workspace_id = $1 and collection_name = 'contacts' and record_id = $2 and user_id = $3
  and (payload->'accountId' is null or payload->'accountId' = 'null'::jsonb or payload->'accountId' = to_jsonb($3::text))`;

export const CONTACT_SOFT_DELETE_SQL = `update orbit_records
  set lifecycle_state = 'deleted', deleted_at = $4::timestamptz, updated_at = $4::timestamptz
  where ${OWNED} and lifecycle_state <> 'deleted'
  returning record_id, deleted_at`;
export const CONTACT_DELETED_STATE_SQL = `select record_id, lifecycle_state, deleted_at from orbit_records where ${OWNED}`;
export const CONTACT_RESTORE_SQL = `update orbit_records
  set lifecycle_state = 'active', deleted_at = null, updated_at = $4::timestamptz
  where ${OWNED} and lifecycle_state = 'deleted' and deleted_at is not null and deleted_at > $5::timestamptz
  returning record_id`;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export interface ContactDeleteService {
  remove(actorId: string, contactId: string): Promise<ContactDeleteResult>;
  restore(actorId: string, contactId: string): Promise<ContactRestoreResult>;
}

export function createContactDeleteService(input: { client: ContactDeleteSqlClient; workspaceId: string; now?: () => Date }): ContactDeleteService {
  const now = input.now ?? (() => new Date());
  const notFound = () => new AppError("NOT_FOUND", "Contact not found.");
  const result = (contactId: string, deletedAt: string): ContactDeleteResult => ({
    contactId, deletedAt, restorableUntil: new Date(Date.parse(deletedAt) + CONTACT_RESTORE_WINDOW_DAYS * DAY_MS).toISOString(),
  });
  return {
    async remove(actorId, contactId) {
      if (!contactId.trim() || contactId.length > 512) throw notFound();
      const at = now().toISOString();
      const updated = await input.client.query<{ record_id: string; deleted_at: unknown }>(CONTACT_SOFT_DELETE_SQL, [input.workspaceId, contactId, actorId, at]);
      if (updated.rows[0]) return result(contactId, iso(updated.rows[0].deleted_at));
      // 已经删过（例如离线队列重放）：幂等返回第一次的删除时间；别人的 / 不存在的一律 NOT_FOUND。
      const existing = (await input.client.query<{ lifecycle_state: string; deleted_at: unknown }>(CONTACT_DELETED_STATE_SQL, [input.workspaceId, contactId, actorId])).rows[0];
      if (existing?.lifecycle_state === "deleted" && existing.deleted_at) return result(contactId, iso(existing.deleted_at));
      throw notFound();
    },
    async restore(actorId, contactId) {
      if (!contactId.trim() || contactId.length > 512) throw notFound();
      const at = now();
      const floor = new Date(at.getTime() - CONTACT_RESTORE_WINDOW_DAYS * DAY_MS).toISOString();
      const updated = await input.client.query(CONTACT_RESTORE_SQL, [input.workspaceId, contactId, actorId, at.toISOString(), floor]);
      if (updated.rows[0]) return { contactId, restoredAt: at.toISOString() };
      const existing = (await input.client.query<{ lifecycle_state: string }>(CONTACT_DELETED_STATE_SQL, [input.workspaceId, contactId, actorId])).rows[0];
      // 没删过（例如 Toast 重放）：幂等成功；过期或不存在：NOT_FOUND（原契约错误）。
      if (existing && existing.lifecycle_state !== "deleted") return { contactId, restoredAt: at.toISOString() };
      throw notFound();
    },
  };
}
