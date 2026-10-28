/**
 * 浏览器端读取缓存（全站一套规则，对标 TanStack Query / SWR / Remix 的默认做法）：
 *
 * - 「上次的结果」：页面重新挂载时先把上次读到的内容画出来，后台再读，新结果回来原位替换。
 * - 新鲜期（FRESH）：结果在新鲜期内、且没有被作废时，挂载就不再重读——10 秒前刚读过的列表切回来不再发请求。
 *   过了新鲜期只在后台重读，界面不回骨架。回到前台总是重读（只防 5 秒内重复，FRESH.focus）。
 * - 写后作废：本页任何一次成功的写操作（orbit-write-watch.ts 观察同源 /api 的非 GET 请求）把全部结果标成
 *   「需要重读」（Remix / React Router 的默认：一次写入之后重新验证所有数据）。内容照样先显示，下次挂载或
 *   回到前台时重读；正在显示的读取方可以订阅 onAnswersStale 立刻重读。
 *
 * 数据安全：
 * - 只在内存里（模块变量），不写 localStorage / IndexedDB：刷新页面、登出（整页跳转）就没了，与「浏览器不存
 *   关系数据」的约定一致（R20a / docs/phoneweb/local-mirror-threat-model.md）。
 * - key 含账号（orbit-shared-read 的当前账号，外壳挂载时同步）；账号未知时不记也不给；账号一变，旧账号的全部
 *   结果立刻清掉，而不只是取不到。
 * - 登出前调用 clearAnswers()（orbit-sign-out.ts）。
 * - 最多记 LIMIT 条，最久没用的先丢。
 */
"use client";

import { getSharedReadAccount } from "./orbit-shared-read";

/** 新鲜期：挂载时在这之内就不重读。准实时的数据（收件箱）另有自己的轮询。 */
export const FRESH = {
  /** 列表与概要：人脉、活动、待办、日程、メモ、会话列表。 */
  list: 60_000,
  /** 很少变的：资料、设置、计划目标、字典。 */
  slow: 600_000,
  /**
   * 回到前台（focus / visibilitychange）：总是重读（TanStack Query 默认 staleTime 0 的行为；只靠进行中的请求去重，
   * focus 与 visibilitychange 同时到只发一次）。回到前台正是别的设备可能改过数据的时候，不套用上面的新鲜期。
   */
  focus: 0,
} as const;

const LIMIT = 64;
type Entry = { value: unknown; at: number; stale: boolean };
const answers = new Map<string, Entry>();
const staleListeners = new Set<() => void>();
let owner: string | null = null;

function keyOf(resource: string): string | null {
  const account = getSharedReadAccount();
  if (!account) return null;
  // Another account on this page (sign-in as someone else without a reload): nothing of the last one stays.
  if (owner !== account) { answers.clear(); owner = account; }
  return `${account}\u0000${resource}`;
}

function entryOf(resource: string): Entry | undefined {
  const key = keyOf(resource);
  if (!key) return undefined;
  const entry = answers.get(key);
  if (!entry) return undefined;
  answers.delete(key);
  answers.set(key, entry);
  return entry;
}

/** 这个资源上次的结果（同一账号、本次打开页面以来）；没有就是 undefined。 */
export function lastAnswer<T>(resource: string): T | undefined {
  return entryOf(resource)?.value as T | undefined;
}

/** 上次的结果还新鲜：读到不超过 maxAgeMs，且之后没有写操作作废它。新鲜时挂载不用重读。 */
export function answerFresh(resource: string, maxAgeMs: number): boolean {
  const entry = entryOf(resource);
  return Boolean(entry && !entry.stale && Date.now() - entry.at < maxAgeMs);
}

/** 记下一次成功读取的结果（失败不要记：失败时界面保留上次的内容）。 */
export function rememberAnswer<T>(resource: string, value: T): void {
  const key = keyOf(resource);
  if (!key) return;
  answers.delete(key);
  answers.set(key, { value, at: Date.now(), stale: false });
  while (answers.size > LIMIT) answers.delete(answers.keys().next().value as string);
}

/** 一次写操作之后：全部结果「需要重读」（仍然先显示），并通知订阅者。 */
export function markAllAnswersStale(): void {
  for (const entry of answers.values()) entry.stale = true;
  for (const listener of staleListeners) listener();
}

/** 订阅「全部作废」（正在显示的读取方据此立刻在后台重读）；返回取消订阅。 */
export function onAnswersStale(listener: () => void): () => void {
  staleListeners.add(listener);
  return () => { staleListeners.delete(listener); };
}

/** 登出、换账号：清掉全部结果。 */
export function clearAnswers(): void {
  answers.clear();
  owner = null;
}

/** 测试用。 */
export function resetLastAnswersForTests(): void {
  clearAnswers();
  staleListeners.clear();
}
