/**
 * W0021：浏览器端读取的 in-flight 共享（按账号隔离）。
 *
 * 只共享「正在进行」的请求，不缓存结果：
 * - 同一账号、同一资源的并发读取只发一次请求，所有调用方拿到同一个结果；
 * - 某个调用方卸载／abort 只让它自己的 promise 以 AbortError 结束，不取消其他调用方；最后一个调用方离开后
 *   才在下一个宏任务里真正 abort 请求——React StrictMode 开发模式「卸载后立即重新挂载」的第二次 effect
 *   会接上同一个请求，不重复发；
 * - 请求结束（成功或失败）就从表里移除：失败不会被缓存，之后的读取重新请求；
 * - 写操作之后调用 `invalidateSharedRead`：之后的读取一定发新请求；此刻还在进行中的同一资源读取会在
 *   返回后再读一次，调用方拿到的是写之后的值（不会把写之前的旧值交给界面）；
 * - key 含账号：`setSharedReadAccount` 换账号或登出（null）时 abort 并清掉所有进行中的读取。
 *
 * 模块级状态只在浏览器里使用（服务端组件不 import 本文件）；服务端没有跨请求、跨账号的缓存。
 * 账号从 next-auth 的会话同步：`orbit-shared-read-account.ts` 的 `useSharedReadAccount`（分开放，
 * 这样只用读取函数的模块不会把 next-auth 客户端打进包里）。
 */
"use client";

interface Entry {
  account: string;
  consumers: number;
  controller: AbortController;
  /** 写操作在请求进行中使之失效：返回后要再读一次。 */
  stale: boolean;
  result: Promise<unknown>;
}

const entries = new Map<string, Entry>();
let account: string | null = null;

function keyOf(resource: string): string {
  return `${account ?? "anonymous"}\u0000${resource}`;
}

function abortError(): Error {
  try {
    return new DOMException("The read was aborted.", "AbortError");
  } catch {
    const error = new Error("The read was aborted.");
    error.name = "AbortError";
    return error;
  }
}

/** 当前账号（登录用户 id）；换账号或登出时清掉所有进行中的读取。 */
export function setSharedReadAccount(next: string | null): void {
  const normalized = next?.trim() ? next.trim() : null;
  if (normalized === account) return;
  account = normalized;
  for (const entry of entries.values()) entry.controller.abort();
  entries.clear();
}

export function getSharedReadAccount(): string | null {
  return account;
}

/**
 * 读取 `resource`：同账号同资源正在进行的请求直接共享。`load` 收到的 signal 只在所有调用方都离开后才 abort。
 */
export function sharedRead<T>(resource: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  const key = keyOf(resource);
  let entry = entries.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: Entry = { account: account ?? "anonymous", consumers: 0, controller, result: Promise.resolve(), stale: false };
    created.result = (async () => {
      try {
        let value = await load(controller.signal);
        while (created.stale && !controller.signal.aborted) {
          created.stale = false;
          value = await load(controller.signal);
        }
        return value;
      } finally {
        if (entries.get(key) === created) entries.delete(key);
      }
    })();
    // 所有调用方都离开时 result 可能以 AbortError 结束，不留未处理的 rejection。
    created.result.catch(() => undefined);
    entries.set(key, created);
    entry = created;
  }
  const joined = entry;
  joined.consumers += 1;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const leave = () => {
      joined.consumers -= 1;
      if (joined.consumers > 0) return;
      // 下一个宏任务再判断：StrictMode 的重新挂载会在这之前接上。
      setTimeout(() => {
        if (joined.consumers === 0 && entries.get(key) === joined) {
          entries.delete(key);
          joined.controller.abort();
        }
      }, 0);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      leave();
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    joined.result.then(
      (value) => {
        signal?.removeEventListener("abort", onAbort);
        if (settled) return;
        settled = true;
        joined.consumers -= 1;
        resolve(value as T);
      },
      (error: unknown) => {
        signal?.removeEventListener("abort", onAbort);
        if (settled) return;
        settled = true;
        joined.consumers -= 1;
        reject(error);
      },
    );
  });
}

/** 写操作之后：这些资源之后的读取一定是新请求；正在进行的读取返回后再读一次。 */
export function invalidateSharedRead(...resources: string[]): void {
  for (const resource of resources) {
    const entry = entries.get(keyOf(resource));
    if (entry) entry.stale = true;
  }
}

/** 测试用：清空全部状态。 */
export function resetSharedReadForTests(): void {
  for (const entry of entries.values()) entry.controller.abort();
  entries.clear();
  account = null;
}
