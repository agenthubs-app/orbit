// 2026-11-21 参加者の詳細（AttendeeSheet）的内存缓存：同一人在同一活动里再打开时先显示上次的资料，5 分钟内不再请求；
// 超过 5 分钟先显示旧的、后台再读一次（内容相同就不闪）。弹层里的交换 / 承認 / メモ 直接改缓存，不再整页重读。
// 只在内存里，换账号或换服务器（identity 变了）整个清空，不落盘（参加者资料不做离线副本）。
import type { EventAttendeeProfile } from "../../../api/contract/event-attendee-profile";

export const ATTENDEE_FRESH_MS = 5 * 60_000;
const MAX_ENTRIES = 200;

type Entry = { at: number; data: EventAttendeeProfile };
const entries = new Map<string, Entry>();
let owner: string | null = null;

function scoped(identity: string): Map<string, Entry> {
  if (owner !== identity) { entries.clear(); owner = identity; }
  return entries;
}
const keyOf = (eventId: string, attendeeId: string) => `${eventId}\n${attendeeId}`;

export function readAttendee(identity: string, eventId: string, attendeeId: string, now = Date.now()): { data: EventAttendeeProfile; fresh: boolean } | null {
  const entry = scoped(identity).get(keyOf(eventId, attendeeId));
  return entry ? { data: entry.data, fresh: now - entry.at < ATTENDEE_FRESH_MS } : null;
}

export function writeAttendee(identity: string, eventId: string, data: EventAttendeeProfile, now = Date.now()): void {
  const map = scoped(identity);
  const key = keyOf(eventId, data.attendeeId);
  map.delete(key);
  map.set(key, { at: now, data });
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value!);
}

/** A local change (request sent / accepted / memo): keep the entry's age, change only what we know changed. */
export function patchAttendee(identity: string, eventId: string, attendeeId: string, patch: Partial<EventAttendeeProfile>): void {
  const map = scoped(identity);
  const entry = map.get(keyOf(eventId, attendeeId));
  if (entry) entry.data = { ...entry.data, ...patch };
}

export function clearAttendeeCache(): void { entries.clear(); owner = null; }
