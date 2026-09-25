import { createHash } from "node:crypto";
import { personalScheduleSchema, personalScheduleCreateSchema, personalScheduleUpdateSchema, personalScheduleDeleteSchema, type PersonalScheduleCreate, type PersonalScheduleUpdate, type PersonalScheduleDelete } from "../../shared/api-schema/personal-schedule";
import type { PersonalScheduleContract } from "../../shared/contract/tasks";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { AppError } from "../../shared/errors/app-error";
import { canonicalScheduleItemSchema } from "./authority-contract";
import { calendarDate, localParts } from "../tasks/local-date-time";
import type { PersonalScheduleAssociationReader } from "./association-reader";
import { expandPersonalScheduleOccurrences } from "./recurrence";
import { PERSONAL_SCHEDULE_EXCEPTION_COLLECTION, readPersonalScheduleOccurrenceExceptions } from "./occurrence-exceptions";
import { reconcilePersonalScheduleReminderPlans } from "./reminder-plans";
import { createPersonalScheduleReminderRepository, createMemoryPersonalScheduleReminderRepository } from "./reminder-plan-storage";

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

export function createPersonalScheduleService(input: { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string; client?: TransactionalPostgresClient; now?: () => string; associationReader?: PersonalScheduleAssociationReader; associationReaderForStore?: (store: LiveRecordStoreLike<Record<string, unknown>>) => PersonalScheduleAssociationReader }) {
  const now = input.now ?? (() => new Date().toISOString());
  async function read(store: typeof input.store, actorId: string, id: string) {
    const record = await store.getRecord({ workspaceId: input.workspaceId, collectionName, recordId: id });
    if (!record || record.userId !== actorId) throw new AppError("NOT_FOUND", "Personal schedule not found.");
    const item = personalScheduleSchema.parse(record.payload) as PersonalScheduleContract;
    if (item.accountId !== actorId || item.ownerUserId !== actorId || item.id !== id) throw new AppError("NOT_FOUND", "Personal schedule not found.");
    return item;
  }
  function patchPersonalScheduleFields(item: PersonalScheduleContract, patch: PersonalScheduleUpdate["patch"]) {
    const result = { ...item, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null)) };
    for (const key of ["location", "endsAt", "allDay", "timeZone", "meetingMethod", "meetingUrl", "contactIds", "noteIds", "recurrence", "reminderMinutes"] as const) if (patch[key] === null) delete result[key];
    return result;
  }
  async function personalScheduleOccurrences(store: typeof input.store, actorId: string, item: PersonalScheduleContract, window: { from: string; to: string }, date?: string): Promise<PersonalScheduleContract[]> {
    if (!item.recurrence) return [publicItem(item, now())];
    if (!item.timeZone) throw new AppError("VALIDATION_ERROR", "Repeating schedules require a time zone.");
    const exceptions = await readPersonalScheduleOccurrenceExceptions({ store, workspaceId: input.workspaceId, actorId, seriesId: item.id });
    const series = { ...item, timeZone: item.timeZone, recurrence: item.recurrence };
    const anchors = new Map(expandPersonalScheduleOccurrences(series, window, date).map(occurrence => [occurrence.occurrenceDate, occurrence]));
    for (const exception of exceptions) {
      if (exception.cancelled || (date !== undefined && exception.occurrenceDate !== date) || anchors.has(exception.occurrenceDate)) continue;
      // An exception may move an anchor from outside this window into it.
      const day = calendarDate(exception.occurrenceDate)!.getTime();
      const anchor = expandPersonalScheduleOccurrences(series, { from: new Date(day - 2 * 86_400_000).toISOString(), to: new Date(day + 2 * 86_400_000).toISOString() }, exception.occurrenceDate)[0];
      if (anchor) anchors.set(exception.occurrenceDate, anchor);
    }
    const result: PersonalScheduleContract[] = [];
    for (const anchor of anchors.values()) {
      const exception = exceptions.find(value => value.occurrenceDate === anchor.occurrenceDate);
      if (exception?.cancelled) continue;
      const instance = patchPersonalScheduleFields({ ...item, ...anchor, sourceId: item.id }, exception?.patch ?? {});
      personalScheduleSchema.parse(instance);
      const time = Date.parse(instance.startsAt);
      if (time >= Date.parse(window.from) && time < Date.parse(window.to)) result.push(publicItem(instance, now()));
    }
    return result.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  }
  async function readPersonalScheduleOccurrence(store: typeof input.store, actorId: string, id: string) {
    const match = /^(.*):occurrence:(\d{4}-\d{2}-\d{2})$/.exec(id);
    if (!match || !calendarDate(match[2]!)) return read(store, actorId, id);
    const collision = await store.getRecord({ workspaceId: input.workspaceId, collectionName, recordId: id, includeDeleted: true });
    if (collision) throw new AppError(collision.userId === actorId ? "CONFLICT" : "NOT_FOUND", "Schedule occurrence identity is unavailable.");
    const base = await read(store, actorId, match[1]!);
    if (!base.recurrence) throw new AppError("NOT_FOUND", "Personal schedule occurrence not found.");
    const exceptions = await readPersonalScheduleOccurrenceExceptions({ store, workspaceId: input.workspaceId, actorId, seriesId: base.id });
    const exception = exceptions.find(value => value.occurrenceDate === match[2]);
    const day = exception?.patch.startsAt ? Date.parse(exception.patch.startsAt) : calendarDate(match[2]!)!.getTime();
    const instances = await personalScheduleOccurrences(store, actorId, base, { from: new Date(day - 2 * 86_400_000).toISOString(), to: new Date(day + 2 * 86_400_000).toISOString() }, match[2]);
    const item = instances.find(value => value.id === id);
    if (!item) throw new AppError("NOT_FOUND", "Personal schedule occurrence not found.");
    return item;
  }
  async function syncPersonalScheduleReminderPlans(store: typeof input.store, actorId: string, saved: PersonalScheduleContract, at: string, executor?: TransactionalSqlExecutor) {
    const window = { from: at, to: new Date(Date.parse(at) + 90 * 86_400_000).toISOString() };
    const instances = saved.state === "cancelled" ? [] : await personalScheduleOccurrences(store, actorId, saved, window);
    const repository = executor ? createPersonalScheduleReminderRepository({ store, workspaceId: input.workspaceId, executor }) : createMemoryPersonalScheduleReminderRepository({ store, workspaceId: input.workspaceId });
    await reconcilePersonalScheduleReminderPlans({ repository, actorId, seriesId: saved.id, revision: saved.updatedAt, title: saved.title, timeZone: saved.timeZone ?? "UTC", now: at, reminderMinutes: saved.state === "cancelled" ? null : saved.reminderMinutes ?? null, occurrences: instances });
  }
  async function withScheduleTransaction<T>(actorId: string, operation: (store: typeof input.store, executor?: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
    if (input.client) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { return await input.client.transaction(async tx => {
          await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["personal-schedule", input.workspaceId, actorId])]);
          return operation(createPostgresLiveRecordStore({ client: tx }), tx);
        }); } catch (error) { const code = error && typeof error === "object" && "code" in error ? error.code : null; if ((code === "40001" || code === "40P01") && attempt < 2) continue; throw error; }
      }
      throw new Error("Personal schedule retry limit reached");
    }
    let queue = locks.get(input.store); if (!queue) { queue = new Map(); locks.set(input.store, queue); }
    const key = JSON.stringify([input.workspaceId, actorId]); const previous = queue.get(key) ?? Promise.resolve(); let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); queue.set(key, held); await previous;
    try { return await operation(input.store); } finally { release(); if (queue.get(key) === held) queue.delete(key); }
  }
  async function mutate(action: "create" | "update" | "delete", actorId: string, id: string, body: PersonalScheduleCreate | PersonalScheduleUpdate | PersonalScheduleDelete) {
    const fingerprint = hash({ action, id, body }); const receiptId = hash([actorId, body.idempotencyKey]); const at = now();
    const execute = async (store: typeof input.store, executor?: TransactionalSqlExecutor) => {
      const receiptQuery = { workspaceId: input.workspaceId, collectionName: "personal_schedule_mutations", recordId: receiptId };
      const receipt = await store.getRecord({ ...receiptQuery, includeDeleted: true });
      if (receipt) {
        if (receipt.userId !== actorId || receipt.payload.fingerprint !== fingerprint) throw new AppError("CONFLICT", "Idempotency key has different content.");
        const result = receipt.payload.result as { scheduleItem: PersonalScheduleContract; deleted?: boolean };
        if (result?.scheduleItem?.ownerUserId !== actorId) throw new Error("Invalid personal schedule receipt");
        return result;
      }
      let item: PersonalScheduleContract;
      let base: PersonalScheduleContract | undefined;
      let occurrenceScope = false;
      let exceptionPatch: PersonalScheduleUpdate["patch"] = {};
      if (action === "create") {
        const fields = personalScheduleCreateSchema.parse(body);
        item = { id, sourceId: id, ownerUserId: actorId, accountId: actorId, kind: "personal", category: "personal", state: "upcoming", title: fields.title, startsAt: fields.startsAt,
          ...(fields.endsAt ? { endsAt: fields.endsAt } : {}), ...(fields.location ? { location: fields.location } : {}),
          ...Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== null && ["allDay", "timeZone", "meetingMethod", "meetingUrl", "contactIds", "noteIds", "recurrence", "reminderMinutes"].includes(key))), createdAt: at, updatedAt: at };
      } else {
        item = await readPersonalScheduleOccurrence(store, actorId, id);
        base = item.seriesId ? await read(store, actorId, item.seriesId) : item;
        const command = action === "update" ? personalScheduleUpdateSchema.parse(body) : personalScheduleDeleteSchema.parse(body);
        if (base.recurrence && !command.scope) throw new AppError("VALIDATION_ERROR", "Choose this occurrence or the entire series.");
        occurrenceScope = command.scope === "occurrence";
        if (occurrenceScope && !item.occurrenceDate) throw new AppError("VALIDATION_ERROR", "An occurrence identity is required.");
        if (command.scope === "series" && item.seriesId) throw new AppError("VALIDATION_ERROR", "Use the series identity to edit the entire series.");
        if (item.updatedAt !== command.expectedUpdatedAt) throw new AppError("CONFLICT", "Schedule changed. Reload before saving.");
        if (action === "update") {
          const patch = (command as PersonalScheduleUpdate).patch;
          if (occurrenceScope && (Object.hasOwn(patch, "recurrence") || Object.hasOwn(patch, "reminderMinutes"))) throw new AppError("VALIDATION_ERROR", "Change reminder/repeat rules on the entire series.");
          if (occurrenceScope) {
            const exceptions = await readPersonalScheduleOccurrenceExceptions({ store, workspaceId: input.workspaceId, actorId, seriesId: base.id });
            exceptionPatch = { ...exceptions.find(value => value.occurrenceDate === item.occurrenceDate)?.patch, ...patch };
          }
          item = patchPersonalScheduleFields(item, patch);
        }
        item.updatedAt = new Date(Math.max(Date.parse(at), Date.parse(item.updatedAt) + 1)).toISOString();
      }
      if (item.endsAt && Date.parse(item.endsAt) <= Date.parse(item.startsAt)) throw new AppError("VALIDATION_ERROR", "End time must be after start time.");
      if ((item.recurrence || item.reminderMinutes !== undefined) && !item.timeZone) throw new AppError("VALIDATION_ERROR", "Reminder and repeat settings require a time zone.");
      if (action !== "delete") {
        const associationReader = input.associationReaderForStore?.(store) ?? input.associationReader;
        for (const [kind, ids] of [["contact", item.contactIds], ["note", item.noteIds]] as const) {
          if (!ids?.length) continue;
          const accessible = associationReader ? await associationReader.accessibleIds({ actorId, kind, ids }) : [];
          if (accessible.length !== ids.length || ids.some(id => !accessible.includes(id))) throw new AppError("VALIDATION_ERROR", "A schedule association is unavailable. Remove it before saving.");
        }
      }
      if (item.allDay) {
        if (!item.timeZone || !item.endsAt) throw new AppError("VALIDATION_ERROR", "All-day schedules require a time zone and end date.");
        const start = localParts(item.startsAt, item.timeZone);
        const end = localParts(item.endsAt, item.timeZone);
        const beforeStart = localParts(Date.parse(item.startsAt) - 1, item.timeZone);
        const beforeEnd = localParts(Date.parse(item.endsAt) - 1, item.timeZone);
        if (beforeStart.date === start.date || beforeEnd.date === end.date || start.date >= end.date) throw new AppError("VALIDATION_ERROR", "All-day schedules require local day boundaries.");
      }
      item = publicItem({ ...item, ...(action === "delete" ? { state: "cancelled" as const } : {}) }, at);
      personalScheduleSchema.parse(item);
      const saved = occurrenceScope ? { ...base!, updatedAt: item.updatedAt } : item;
      if (!occurrenceScope && saved.recurrence && saved.state !== "cancelled") {
        try { expandPersonalScheduleOccurrences({ ...saved, timeZone: saved.timeZone!, recurrence: saved.recurrence }, { from: at, to: new Date(Date.parse(at) + 90 * 86_400_000).toISOString() }); }
        catch (error) { throw new AppError("VALIDATION_ERROR", error instanceof Error ? error.message : "Invalid repeated local time."); }
      }
      if (occurrenceScope) await store.upsertRecord({ workspaceId: input.workspaceId, collectionName: PERSONAL_SCHEDULE_EXCEPTION_COLLECTION, recordId: item.id, userId: actorId, sourceType: "manual", sourceId: base!.id, evidenceIds: [], createdAt: base!.createdAt, updatedAt: item.updatedAt, lifecycleState: "active", payload: { seriesId: base!.id, occurrenceDate: item.occurrenceDate, cancelled: action === "delete", patch: exceptionPatch, updatedAt: item.updatedAt } });
      await store.upsertRecord({ workspaceId: input.workspaceId, collectionName, recordId: saved.id, userId: actorId, sourceType: "manual", sourceId: saved.id, evidenceIds: [],
        createdAt: saved.createdAt, updatedAt: saved.updatedAt, lifecycleState: action === "delete" && !occurrenceScope ? "deleted" : "active", ...(action === "delete" && !occurrenceScope ? { deletedAt: saved.updatedAt } : {}), payload: { ...saved } });
      await syncPersonalScheduleReminderPlans(store, actorId, saved, at, executor);
      const result = { scheduleItem: item, ...(action === "delete" ? { deleted: true } : {}) };
      await store.upsertRecord({ ...receiptQuery, userId: actorId, sourceType: "manual", sourceId: receiptId, evidenceIds: [], createdAt: at, updatedAt: at, lifecycleState: "active", payload: { fingerprint, result } });
      return result;
    };
    return withScheduleTransaction(actorId, execute);
  }
  return {
    async refreshReminderPlans({ actorId }: { actorId: string }) {
      return withScheduleTransaction(actorId, async (store, executor) => {
        const records = await store.listRecords({ limit: "unbounded", workspaceId: input.workspaceId, collectionName, userId: actorId });
        for (const record of records) {
          const canonical = canonicalScheduleItemSchema.parse(record.payload);
          if (canonical.kind !== "personal") continue;
          const item = await read(store, actorId, record.recordId);
          if (item.sourceId !== item.id || record.sourceId !== item.id) throw new Error("Personal schedule source mismatch");
          await syncPersonalScheduleReminderPlans(store, actorId, item, now(), executor);
        }
      });
    },
    async get({ actorId, id }: { actorId: string; id: string }) { return publicItem(await readPersonalScheduleOccurrence(input.store, actorId, id), now()); },
    async list({ actorId, from, to }: { actorId: string; from?: string; to?: string }) {
      const records = await input.store.listRecords({ limit: "unbounded", workspaceId: input.workspaceId, collectionName, userId: actorId });
      const ids = new Set<string>();
      const items = records.flatMap(record => {
        const item = canonicalScheduleItemSchema.parse(record.payload);
        if (!actorId || record.userId !== actorId || item.ownerUserId !== actorId || item.accountId !== actorId || record.workspaceId !== input.workspaceId || record.collectionName !== collectionName || item.id !== record.recordId || item.sourceId !== record.sourceId || Date.parse(item.updatedAt) !== Date.parse(record.updatedAt) || Date.parse(item.createdAt) !== Date.parse(record.createdAt) || ids.has(item.id)) throw new Error("Personal schedule collection integrity mismatch");
        ids.add(item.id);
        // The authority collection also owns event/meeting schedules. Validate
        // them before selecting only the strict, editable personal DTOs.
        if (item.kind !== "personal") return [];
        const personal = personalScheduleSchema.parse(record.payload) as PersonalScheduleContract;
        if (personal.sourceId !== personal.id) throw new Error("Personal schedule source mismatch");
        return personal.state === "cancelled" ? [] : [publicItem(personal, now())];
      });
      const at = now();
      const window = { from: from ?? at, to: to ?? new Date(Date.parse(at) + 90 * 86_400_000).toISOString() };
      if (!!from !== !!to || !Number.isFinite(Date.parse(window.from)) || !Number.isFinite(Date.parse(window.to)) || Date.parse(window.to) <= Date.parse(window.from) || Date.parse(window.to) - Date.parse(window.from) > 366 * 86_400_000) throw new AppError("VALIDATION_ERROR", "Schedule window must include valid from/to within 366 days.");
      const instances = (await Promise.all(items.map(async item => {
        if (from !== undefined || !item.recurrence) return personalScheduleOccurrences(input.store, actorId, item, window);
        const zone = item.timeZone!;
        const today = localParts(at, zone).date;
        const startDate = calendarDate(localParts(item.startsAt, zone).date)!.getTime();
        const endDate = item.endsAt ? calendarDate(localParts(item.endsAt, zone).date)!.getTime() : startDate;
        // Windowless Today/legacy callers need the whole local day, including
        // carry-over instances. Two boundary days cover zone/DST offsets;
        // the existing finite expansion budget still fails visibly if exceeded.
        const dayWindow = { from: new Date(calendarDate(today)!.getTime() - (endDate - startDate) - 2 * 86_400_000).toISOString(), to: window.to };
        const occurrences = await personalScheduleOccurrences(input.store, actorId, item, dayWindow);
        return occurrences.filter(instance => localParts(instance.startsAt, zone).date >= today || (Date.parse(instance.startsAt) <= Date.parse(at) && instance.endsAt !== undefined && Date.parse(instance.endsAt) > Date.parse(at)));
      }))).flat();
      if (new Set(instances.map(item => item.id)).size !== instances.length) throw new Error("Schedule occurrence identity collision.");
      return from === undefined ? instances : instances.filter(item => Date.parse(item.startsAt) >= Date.parse(window.from) && Date.parse(item.startsAt) < Date.parse(window.to));
    },
    create: (actorId: string, body: PersonalScheduleCreate) => mutate("create", actorId, `personal:${hash([actorId, body.idempotencyKey]).slice(0, 24)}`, personalScheduleCreateSchema.parse(body)),
    update: (actorId: string, id: string, body: PersonalScheduleUpdate) => mutate("update", actorId, id, personalScheduleUpdateSchema.parse(body)),
    remove: (actorId: string, id: string, body: PersonalScheduleDelete) => mutate("delete", actorId, id, personalScheduleDeleteSchema.parse(body)),
  };
}
export type PersonalScheduleService = ReturnType<typeof createPersonalScheduleService>;
