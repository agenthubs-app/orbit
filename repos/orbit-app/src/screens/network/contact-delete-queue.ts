// R11a（代定 9，SC-10）：联系人删除的写入队列。人脈是只读镜像（同步域不收设备写入），所以删除先进本机队列：
// 列表与详情立刻隐藏这个人；联网后按顺序调 DELETE /api/contacts/:id（服务端软删，幂等），成功或「已不存在」出队，
// 网络失败留在队里下次再试。离线时点「元に戻す」直接出队（服务端从未删过）；已经发出的删除用恢复接口撤回。
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { OrbitApiClient } from "../../api/client";

export const CONTACT_DELETE_QUEUE_PREFIX = "orbit.network.pendingDeletes.v1:";

export interface QueuedContactDelete { contactId: string; queuedAt: string }

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeContactDeleteQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => { for (const listener of listeners) listener(); };

function key(actorId: string): string { return `${CONTACT_DELETE_QUEUE_PREFIX}${actorId}`; }

export async function readContactDeleteQueue(actorId: string): Promise<QueuedContactDelete[]> {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(key(actorId))) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is QueuedContactDelete => typeof item?.contactId === "string" && typeof item?.queuedAt === "string") : [];
  } catch {
    return [];
  }
}

async function write(actorId: string, items: readonly QueuedContactDelete[]): Promise<void> {
  await AsyncStorage.setItem(key(actorId), JSON.stringify(items));
  notify();
}

export async function queueContactDelete(actorId: string, contactId: string, queuedAt: string): Promise<void> {
  const items = await readContactDeleteQueue(actorId);
  if (!items.some((item) => item.contactId === contactId)) await write(actorId, [...items, { contactId, queuedAt }]);
}

/** Undo before the delete reached the server: drop it from the queue. Returns whether it was still queued. */
export async function cancelQueuedContactDelete(actorId: string, contactId: string): Promise<boolean> {
  const items = await readContactDeleteQueue(actorId);
  if (!items.some((item) => item.contactId === contactId)) return false;
  await write(actorId, items.filter((item) => item.contactId !== contactId));
  return true;
}

export type ContactDeleteFlushResult = { sent: string[]; kept: string[]; dropped: string[] };

/** Sends queued deletes in order. 2xx / 404 leave the queue; a network failure (status 0) or 5xx stays; other refusals are dropped. */
export async function flushContactDeleteQueue(actorId: string, client: Pick<OrbitApiClient, "delete">): Promise<ContactDeleteFlushResult> {
  const items = await readContactDeleteQueue(actorId);
  const result: ContactDeleteFlushResult = { sent: [], kept: [], dropped: [] };
  const remaining: QueuedContactDelete[] = [];
  for (const item of items) {
    const response = await client.delete<unknown>(`/api/contacts/${encodeURIComponent(item.contactId)}`).catch(() => ({ success: false as const, status: 0 }));
    const status = (response as { status?: number }).status ?? 0;
    if (response.success || status === 404) result.sent.push(item.contactId);
    else if (status === 0 || status >= 500) { result.kept.push(item.contactId); remaining.push(item); }
    else result.dropped.push(item.contactId);
  }
  if (remaining.length !== items.length) await write(actorId, remaining);
  return result;
}

/** Contacts deleted on this device whose tombstone has not reached the mirror yet (hidden from the list until then). */
const hidden = new Set<string>();
export function hiddenDeletedContactIds(): ReadonlySet<string> { return hidden; }
export function unhideDeletedContact(contactId: string): void { hidden.delete(contactId); notify(); }

/** One-shot signal from the detail page to the list: show 「削除しました · 元に戻す」 there (the detail unmounts). */
let lastDeleted: { contactId: string; name: string; queued: boolean } | null = null;
export function announceContactDeleted(value: { contactId: string; name: string; queued: boolean }): void { lastDeleted = value; hidden.add(value.contactId); notify(); }
export function takeAnnouncedContactDelete(): { contactId: string; name: string; queued: boolean } | null {
  const value = lastDeleted;
  lastDeleted = null;
  return value;
}
