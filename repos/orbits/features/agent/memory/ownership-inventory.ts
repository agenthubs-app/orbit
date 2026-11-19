/**
 * agent-design AG14-5 (设计稿 §6 "账号一致性要先验收", "迁移前做只读映射清点"): entries stored before AG14 may sit under the
 * Auth.js user id the settings page used, not under the canonical account the conversation uses.
 *
 * The inventory is read-only: for each old partition it says whose it is, from the stored account and profile records
 * only (profile → account, the same rule as the identity resolver):
 *   - `canonical`  the id is an account: nothing to move;
 *   - `movable`    the id is a profile of exactly one existing account (and is not itself another account's id);
 *   - `ambiguous`  the id is an account and also a profile of a different account, or profiles point at several accounts;
 *   - `unresolved` the id is neither, or its account is gone.
 * Only `movable` partitions are ever moved; the others stay where they are and go on the list to check by hand.
 * Names, display names and e-mail addresses are never compared: two people are never merged because they look alike.
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { AgentMemoryRecordPayload } from "./contract";
import { AGENT_MEMORY_COLLECTION, agentMemoryScopeId } from "./service";

export interface IdentityRows {
  /** Ids of the stored accounts. */
  accountIds: readonly string[];
  /** The stored profiles: their id and the account they belong to. */
  profiles: readonly { id: string; accountId: string }[];
}

export type OwnershipVerdict =
  | { kind: "canonical"; accountId: string }
  | { kind: "movable"; accountId: string }
  | { kind: "ambiguous"; reason: "account_and_other_profile" | "several_accounts" }
  | { kind: "unresolved"; reason: "unknown_id" | "account_missing" };

export function classifyMemoryPartition(partitionId: string, identity: IdentityRows): OwnershipVerdict {
  const accounts = new Set(identity.accountIds);
  const owners = [...new Set(identity.profiles.filter((profile) => profile.id === partitionId).map((profile) => profile.accountId))];
  const isAccount = accounts.has(partitionId);
  if (isAccount) {
    return owners.some((owner) => owner !== partitionId) ? { kind: "ambiguous", reason: "account_and_other_profile" } : { accountId: partitionId, kind: "canonical" };
  }
  if (owners.length > 1) return { kind: "ambiguous", reason: "several_accounts" };
  if (owners.length === 0) return { kind: "unresolved", reason: "unknown_id" };
  return accounts.has(owners[0]) ? { accountId: owners[0], kind: "movable" } : { kind: "unresolved", reason: "account_missing" };
}

export interface MemoryPartitionCount {
  /** The id after `<workspace>:agent-actor:`. */
  partitionId: string;
  entries: number;
  hasSettings: boolean;
}

export interface InventoryRow extends MemoryPartitionCount {
  verdict: OwnershipVerdict;
}

export interface MemoryOwnershipInventory {
  rows: InventoryRow[];
  totals: { partitions: number; entries: number; canonical: number; movable: number; movableEntries: number; toCheck: number; toCheckEntries: number };
}

export function inventoryMemoryOwnership(partitions: readonly MemoryPartitionCount[], identity: IdentityRows): MemoryOwnershipInventory {
  const rows = partitions.map((partition) => ({ ...partition, verdict: classifyMemoryPartition(partition.partitionId, identity) })).sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  const of = (kind: OwnershipVerdict["kind"]) => rows.filter((row) => row.verdict.kind === kind);
  const toCheck = rows.filter((row) => row.verdict.kind === "ambiguous" || row.verdict.kind === "unresolved");
  const sum = (list: readonly InventoryRow[]) => list.reduce((total, row) => total + row.entries, 0);
  return {
    rows,
    totals: { canonical: of("canonical").length, entries: sum(rows), movable: of("movable").length, movableEntries: sum(of("movable")), partitions: rows.length, toCheck: toCheck.length, toCheckEntries: sum(toCheck) },
  };
}

/** An id as a report may show it: its kind of prefix and a short hash, never the id itself. */
export function redactedId(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619) >>> 0;
  const head = /^[a-z_-]{1,16}[:_-]/iu.exec(id)?.[0] ?? "";
  return `${head}#${hash.toString(16).padStart(8, "0")}`;
}

/** At most this many records of one partition are moved in one go (a bounded read; see tests/audits/unbounded-list-reads). */
export const MOVE_LIMIT = 2000;

export interface MoveResult {
  from: string;
  toAccountId: string;
  moved: number;
  /** Entries left in the old partition because the account already holds one with the same id. */
  keptForCheck: string[];
  settingsMoved: boolean;
}

/**
 * Moves one `movable` partition's entries under its account. An entry whose id the account already has stays where it
 * is and is reported; the account's own two switches win over the old partition's. Refuses any other verdict.
 */
export async function moveMemoryPartition(input: {
  store: LiveRecordStoreLike<AgentMemoryRecordPayload>;
  workspaceId: string;
  partitionId: string;
  verdict: OwnershipVerdict;
  now: string;
}): Promise<MoveResult> {
  if (input.verdict.kind !== "movable") throw new Error(`Only a partition whose owner is proven is moved (this one is ${input.verdict.kind}).`);
  const { store } = input;
  const from = agentMemoryScopeId(input.workspaceId, input.partitionId);
  const to = agentMemoryScopeId(input.workspaceId, input.verdict.accountId);
  // One account's entries are few; a partition at the limit is not moved in part: the move stops with an error.
  const records = await store.listRecords({ collectionName: AGENT_MEMORY_COLLECTION, limit: MOVE_LIMIT, workspaceId: from });
  if (records.length >= MOVE_LIMIT) throw new Error(`The partition holds ${MOVE_LIMIT} records or more; it is left where it is to be checked by hand.`);
  const result: MoveResult = { from: input.partitionId, keptForCheck: [], moved: 0, settingsMoved: false, toAccountId: input.verdict.accountId };
  for (const record of records) {
    const existing = await store.getRecord({ collectionName: AGENT_MEMORY_COLLECTION, includeDeleted: true, recordId: record.recordId, workspaceId: to });
    if (existing) {
      if (record.payload.kind === "memory") result.keptForCheck.push(record.recordId);
      continue;
    }
    const moved: LiveRecord<AgentMemoryRecordPayload> = { ...record, ...(record.payload.kind === "memory" ? { userId: input.verdict.accountId } : {}), workspaceId: to };
    await store.upsertRecord(moved);
    await store.deleteRecord({ collectionName: AGENT_MEMORY_COLLECTION, deletedAt: input.now, recordId: record.recordId, workspaceId: from });
    if (record.payload.kind === "memory") result.moved += 1;
    else result.settingsMoved = true;
  }
  return result;
}
