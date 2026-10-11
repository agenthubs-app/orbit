/**
 * R15 招待连接的资料同步与计数清理（DESIGN add-and-invite §2.6、§3.2、§6）。Owner: 甲 (R15).
 * Used by: `features/operations/maintenance/configured-tasks.ts`（维护心跳的 `invite_profile_sync`、`invite_attempts_cleanup`）。
 *
 * 同步规则（复核 M5）：对每条生效连接的两边，比较对方资料的 `updatedAt` 与共享键是否和上次同步时一样；变了才处理：
 * - 只改对方共享的字段；我这边的值 ≠ 上次同步的值 = 我自己改过 → 该字段停止同步（详情的 `pausedFields`）；
 * - 被关掉的共享键 → 清掉招待写过的对应字段（清空也记历史）；资料里删掉的值同样清掉；
 * - 名字永远不清空；备注、笔记、招待从没写过的字段永远不动；解除后的连接不在列表里，不再同步。
 * 每条连接一个写单元（live：一个事务 + 这对人的 advisory 锁）。
 */
import type { MaintenanceTask } from "../operations/maintenance/pass";
import { perspectiveOf, type InviteConnectionRow, type InviteSide, type InviteSyncedState, type InviteSyncField } from "./contract";
import { contactFieldValue, fieldsForKeys, profileFieldValue, readContactValues, writeInviteFields } from "./invite-fields";
import type { InviteAttemptStore } from "./rate-limit";
import type { InviteCodeStorage, InviteCodeUnit } from "./service";

export const INVITE_PROFILE_SYNC_TASK = "invite_profile_sync";
export const INVITE_ATTEMPTS_CLEANUP_TASK = "invite_attempts_cleanup";
/** 计数窗口保留 2 天（最长的窗口是 1 天）。 */
export const INVITE_ATTEMPT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_CONNECTIONS_PER_PASS = 500;

export interface InviteSyncResult {
  examined: number;
  updated: number;
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

/** 同步一条连接的一边（`side` 是联系人主人的那一边）。返回是否写了联系人。 */
async function syncSide(unit: InviteCodeUnit, workspaceId: string, row: InviteConnectionRow, side: InviteSide, now: () => Date): Promise<boolean> {
  const view = perspectiveOf(row, side === "inviter" ? row.inviterActorId : row.redeemerActorId)!;
  const synced = view.mySynced;
  const keys = view.sharedByPeer;
  const profile = await unit.profiles.read(view.peerActorId);
  if (!profile) return false;
  if (synced.profileUpdatedAt === profile.updatedAt && sameKeys(synced.keys, keys)) return false;
  const record = await readContactValues(unit.contacts, workspaceId, view.myActorId, view.myContactId);
  if (!record) return false;

  const shared = new Set<InviteSyncField>(fieldsForKeys(keys));
  const owned = Object.keys(synced.values) as InviteSyncField[];
  const nextValues: InviteSyncedState["values"] = {};
  const writes: Partial<Record<InviteSyncField, string | null>> = {};
  for (const field of new Set<InviteSyncField>([...shared, ...owned])) {
    const current = contactFieldValue(record.payload, field);
    const last = synced.values[field];
    if (last !== undefined && current !== last) {
      // 我自己改过：停止同步这个字段（保留上次同步值，详情据此显示「本人の情報と違います」）。
      if (shared.has(field)) nextValues[field] = last;
      continue;
    }
    const target = shared.has(field) ? profileFieldValue(profile, field) : null;
    if (target === null) {
      // 名字不清空；招待从没写过的字段不碰。
      if (field === "displayName" || last === undefined) continue;
      if (current !== null) writes[field] = null;
      continue;
    }
    if (target !== current) writes[field] = target;
    nextValues[field] = target;
  }
  const changed = Object.keys(writes).length > 0;
  if (changed) {
    await writeInviteFields({ actorId: view.myActorId, contactId: view.myContactId, now, source: "invite_sync", store: unit.contacts, values: writes, workspaceId });
  }
  await unit.repo.updateSynced(row.id, side, { at: now().toISOString(), keys: [...keys], profileUpdatedAt: profile.updatedAt, values: nextValues });
  return changed;
}

/** 一轮同步：按连接 id 顺序处理，最多 `MAX_CONNECTIONS_PER_PASS` 条或到 `deadline` 为止。 */
export async function runInviteProfileSync(input: {
  storage: InviteCodeStorage;
  now?: () => Date;
  deadline?: number;
  log?: (line: string) => void;
}): Promise<InviteSyncResult> {
  const now = input.now ?? (() => new Date());
  const log = input.log ?? ((line: string) => console.warn(line));
  let afterId: string | null = null;
  let examined = 0;
  let updated = 0;
  while (examined < MAX_CONNECTIONS_PER_PASS) {
    const page: InviteConnectionRow[] = await input.storage.read((unit) => unit.repo.listActiveConnections({ afterId, limit: PAGE_SIZE }));
    if (!page.length) break;
    for (const listed of page) {
      if (input.deadline !== undefined && Date.now() >= input.deadline) return { examined, updated };
      examined += 1;
      try {
        updated += await input.storage.write(async (unit) => {
          await unit.repo.lockPair(listed.inviterActorId, listed.redeemerActorId);
          const row = await unit.repo.findConnection(listed.id);
          // 列出之后被解除了：不再同步。
          if (!row || row.unlinkedAt !== null) return 0;
          let count = 0;
          for (const side of ["inviter", "redeemer"] as const) if (await syncSide(unit, input.storage.workspaceId, row, side, now)) count += 1;
          return count;
        });
      } catch (error) {
        // 一条失败不影响其余（下一轮再试）；日志不带名字与码。
        log(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "invite_profile_sync_failed" }));
      }
    }
    afterId = page[page.length - 1]!.id;
    if (page.length < PAGE_SIZE) break;
  }
  return { examined, updated };
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export function createInviteProfileSyncMaintenanceTask(input: { resolve: () => Promise<InviteCodeStorage | null> | InviteCodeStorage | null }): MaintenanceTask {
  return {
    name: INVITE_PROFILE_SYNC_TASK,
    async run({ deadline, now }) {
      const storage = await input.resolve();
      if (!storage) return { skipped: "database_unconfigured" };
      try {
        const result = await runInviteProfileSync({ deadline, now, storage });
        return { examined: result.examined, updated: result.updated };
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}

export function createInviteAttemptsCleanupMaintenanceTask(input: { resolve: () => Promise<InviteAttemptStore | null> | InviteAttemptStore | null }): MaintenanceTask {
  return {
    name: INVITE_ATTEMPTS_CLEANUP_TASK,
    async run({ now }) {
      const store = await input.resolve();
      if (!store) return { skipped: "database_unconfigured" };
      try {
        return { deleted: await store.purgeBefore(new Date(now().getTime() - INVITE_ATTEMPT_RETENTION_MS)) };
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
