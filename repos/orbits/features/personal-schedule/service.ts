import { createHash } from "node:crypto";
import { personalScheduleSchema, personalScheduleCreateSchema, personalScheduleUpdateSchema, personalScheduleDeleteSchema, type PersonalScheduleCreate, type PersonalScheduleUpdate, type PersonalScheduleDelete } from "../../shared/api-schema/personal-schedule";
import type { PersonalScheduleContract } from "../../shared/contract/tasks";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { AppError } from "../../shared/errors/app-error";

const collectionName = "personal_schedule_items";
const locks = new WeakMap<object, Map<string, Promise<void>>>();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function publicItem(item: PersonalScheduleContract, now: string): PersonalScheduleContract {
  const time = Date.parse(now);
  return { ...item, state: item.state === "cancelled" ? "cancelled" : time < Date.parse(item.startsAt) ? "upcoming" : item.endsAt && time < Date.parse(item.endsAt) ? "ongoing" : "ended" };
}

export function createPersonalScheduleService(input: { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string; client?: TransactionalPostgresClient; now?: () => string }) {
  const now = input.now ?? (() => new Date().toISOString());
  async function read(store: typeof input.store, actorId: string, id: string) {
    const record = await store.getRecord({ workspaceId: input.workspaceId, collectionName, recordId: id });
    if (!record || record.userId !== actorId) throw new AppError("NOT_FOUND", "Personal schedule not found.");
    const item = personalScheduleSchema.parse(record.payload) as PersonalScheduleContract;
    if (item.accountId !== actorId || item.ownerUserId !== actorId || item.id !== id) throw new AppError("NOT_FOUND", "Personal schedule not found.");
    return item;
  }
  async function mutate(action: "create" | "update" | "delete", actorId: string, id: string, body: PersonalScheduleCreate | PersonalScheduleUpdate | PersonalScheduleDelete) {
    const fingerprint = hash({ action, id, body }); const receiptId = hash([actorId, body.idempotencyKey]); const at = now();
    const execute = async (store: typeof input.store) => {
      const receiptQuery = { workspaceId: input.workspaceId, collectionName: "personal_schedule_mutations", recordId: receiptId };
      const receipt = await store.getRecord({ ...receiptQuery, includeDeleted: true });
      if (receipt) {
        if (receipt.userId !== actorId || receipt.payload.fingerprint !== fingerprint) throw new AppError("CONFLICT", "Idempotency key has different content.");
        const result = receipt.payload.result as { scheduleItem: PersonalScheduleContract; deleted?: boolean };
        if (result?.scheduleItem?.ownerUserId !== actorId) throw new Error("Invalid personal schedule receipt");
        return result;
      }
      let item: PersonalScheduleContract;
      if (action === "create") {
        const fields = personalScheduleCreateSchema.parse(body);
        item = { id, sourceId: id, ownerUserId: actorId, accountId: actorId, kind: "personal", category: "personal", state: "upcoming", title: fields.title, startsAt: fields.startsAt,
          ...(fields.endsAt ? { endsAt: fields.endsAt } : {}), ...(fields.location ? { location: fields.location } : {}), createdAt: at, updatedAt: at };
      } else {
        item = await read(store, actorId, id);
        const command = action === "update" ? personalScheduleUpdateSchema.parse(body) : personalScheduleDeleteSchema.parse(body);
        if (item.updatedAt !== command.expectedUpdatedAt) throw new AppError("CONFLICT", "Schedule changed. Reload before saving.");
        if (action === "update") {
          const patch = (command as PersonalScheduleUpdate).patch;
          item = { ...item, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)) };
          for (const key of ["location", "endsAt"] as const) if (patch[key] === null) delete item[key];
        }
        item.updatedAt = new Date(Math.max(Date.parse(at), Date.parse(item.updatedAt) + 1)).toISOString();
      }
      if (item.endsAt && Date.parse(item.endsAt) <= Date.parse(item.startsAt)) throw new AppError("VALIDATION_ERROR", "End time must be after start time.");
      item = publicItem({ ...item, ...(action === "delete" ? { state: "cancelled" as const } : {}) }, at);
      personalScheduleSchema.parse(item);
      await store.upsertRecord({ workspaceId: input.workspaceId, collectionName, recordId: id, userId: actorId, sourceType: "manual", sourceId: id, evidenceIds: [],
        createdAt: item.createdAt, updatedAt: item.updatedAt, lifecycleState: action === "delete" ? "deleted" : "active", ...(action === "delete" ? { deletedAt: item.updatedAt } : {}), payload: { ...item } });
      const result = { scheduleItem: item, ...(action === "delete" ? { deleted: true } : {}) };
      await store.upsertRecord({ ...receiptQuery, userId: actorId, sourceType: "manual", sourceId: receiptId, evidenceIds: [], createdAt: at, updatedAt: at, lifecycleState: "active", payload: { fingerprint, result } });
      return result;
    };
    if (input.client) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { return await input.client.transaction(async tx => {
          await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["personal-schedule", input.workspaceId, actorId])]);
          return execute(createPostgresLiveRecordStore({ client: tx }));
        }); } catch (error) { const code = error && typeof error === "object" && "code" in error ? error.code : null; if ((code === "40001" || code === "40P01") && attempt < 2) continue; throw error; }
      }
      throw new Error("Personal schedule retry limit reached");
    }
    let queue = locks.get(input.store); if (!queue) { queue = new Map(); locks.set(input.store, queue); }
    const key = JSON.stringify([input.workspaceId, actorId]); const previous = queue.get(key) ?? Promise.resolve(); let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); queue.set(key, held); await previous;
    try { return await execute(input.store); } finally { release(); if (queue.get(key) === held) queue.delete(key); }
  }
  return {
    async get({ actorId, id }: { actorId: string; id: string }) { return publicItem(await read(input.store, actorId, id), now()); },
    async list({ actorId }: { actorId: string }) {
      const records = await input.store.listRecords({ workspaceId: input.workspaceId, collectionName, userId: actorId });
      return records.map(record => { const item = personalScheduleSchema.parse(record.payload) as PersonalScheduleContract; if (item.ownerUserId !== actorId || item.accountId !== actorId) throw new Error("Personal schedule ownership mismatch"); return publicItem(item, now()); });
    },
    create: (actorId: string, body: PersonalScheduleCreate) => mutate("create", actorId, `personal:${hash([actorId, body.idempotencyKey]).slice(0, 24)}`, personalScheduleCreateSchema.parse(body)),
    update: (actorId: string, id: string, body: PersonalScheduleUpdate) => mutate("update", actorId, id, personalScheduleUpdateSchema.parse(body)),
    remove: (actorId: string, id: string, body: PersonalScheduleDelete) => mutate("delete", actorId, id, personalScheduleDeleteSchema.parse(body)),
  };
}
export type PersonalScheduleService = ReturnType<typeof createPersonalScheduleService>;
