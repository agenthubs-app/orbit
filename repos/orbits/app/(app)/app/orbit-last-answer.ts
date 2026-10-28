/**
 * 一级页来回切换时的「上次的结果」（SWR 的 stale-while-revalidate）：页面重新挂载时先把上次读到的内容
 * 画出来，同时照常发新请求，新结果回来再替换——回到页面不再先看到骨架再等内容。
 *
 * - 只在内存里（模块变量），不写 localStorage / IndexedDB：刷新页面、登出（next-auth 整页跳转）就没了，
 *   与「浏览器不存关系数据」的约定一致（R20a / docs/phoneweb/local-mirror-threat-model.md）。
 * - key 含账号（orbit-shared-read 的当前账号）；账号未知时不记也不给，换账号后旧账号的内容取不到。
 * - 最多记 LIMIT 条，最久没用的先丢。
 */
"use client";

import { getSharedReadAccount } from "./orbit-shared-read";

const LIMIT = 48;
const answers = new Map<string, unknown>();

function keyOf(resource: string): string | null {
  const account = getSharedReadAccount();
  return account ? `${account}\u0000${resource}` : null;
}

/** 这个资源上次的结果（同一账号、本次打开页面以来）；没有就是 undefined。 */
export function lastAnswer<T>(resource: string): T | undefined {
  const key = keyOf(resource);
  if (!key || !answers.has(key)) return undefined;
  const value = answers.get(key);
  answers.delete(key);
  answers.set(key, value);
  return value as T;
}

/** 记下一次成功读取的结果（失败不要记：失败时界面保留上次的内容）。 */
export function rememberAnswer<T>(resource: string, value: T): void {
  const key = keyOf(resource);
  if (!key) return;
  answers.delete(key);
  answers.set(key, value);
  while (answers.size > LIMIT) answers.delete(answers.keys().next().value as string);
}

/** 测试用。 */
export function resetLastAnswersForTests(): void {
  answers.clear();
}
