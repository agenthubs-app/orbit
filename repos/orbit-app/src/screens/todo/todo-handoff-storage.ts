import AsyncStorage from "@react-native-async-storage/async-storage";

import { todoHandoffStorageKey, type TodoHandoffRecord } from "./todo-handoff-state";

interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function validRecord(value: unknown): value is TodoHandoffRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ["sourceId", "handedOffAt", "confirmation"]) ||
    typeof record.sourceId !== "string" || !record.sourceId ||
    typeof record.handedOffAt !== "string" || !Number.isFinite(Date.parse(record.handedOffAt))) return false;
  if (record.confirmation === undefined) return true;
  if (!record.confirmation || typeof record.confirmation !== "object" || Array.isArray(record.confirmation)) return false;
  const confirmation = record.confirmation as Record<string, unknown>;
  return exactKeys(confirmation, ["contactId", "taskId", "idempotencyKey", "observedAt", "taskCompleted"]) &&
    typeof confirmation.contactId === "string" && !!confirmation.contactId &&
    (confirmation.taskId === null || typeof confirmation.taskId === "string" && !!confirmation.taskId) &&
    typeof confirmation.idempotencyKey === "string" && !!confirmation.idempotencyKey &&
    typeof confirmation.observedAt === "string" && Number.isFinite(Date.parse(confirmation.observedAt)) &&
    typeof confirmation.taskCompleted === "boolean";
}

export function createTodoHandoffStorage(adapter: StorageAdapter = AsyncStorage) {
  const writes = new Map<string, Promise<void>>();
  return {
    async load(scope: { actorId: string; serverUrl: string }): Promise<TodoHandoffRecord[]> {
      const key = todoHandoffStorageKey(scope.actorId, scope.serverUrl);
      if (!key) return [];
      const raw = await adapter.getItem(key);
      if (!raw) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length <= 50 && parsed.every(validRecord) &&
          new Set(parsed.map((record: TodoHandoffRecord) => record.sourceId)).size === parsed.length ? parsed : [];
      } catch { return []; }
    },
    async save(scope: { actorId: string; serverUrl: string }, records: readonly TodoHandoffRecord[]): Promise<void> {
      const key = todoHandoffStorageKey(scope.actorId, scope.serverUrl);
      if (!key || records.length > 50 || !records.every(validRecord) ||
        new Set(records.map(record => record.sourceId)).size !== records.length) throw new Error("Todo handoff state is invalid");
      const serialized = JSON.stringify(records);
      const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => adapter.setItem(key, serialized));
      writes.set(key, next);
      try { await next; } finally { if (writes.get(key) === next) writes.delete(key); }
    },
  };
}

export const todoHandoffStorage = createTodoHandoffStorage();
