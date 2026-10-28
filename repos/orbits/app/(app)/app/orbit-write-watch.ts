/**
 * 写后作废的统一入口：观察本页发出的同源 `/api/` 写请求（非 GET / HEAD / OPTIONS），成功后把浏览器端读取
 * 缓存全部标成「需要重读」（orbit-last-answer.ts markAllAnswersStale），各页面不用各自记住「写了哪里要刷新什么」。
 *
 * 只观察、不改请求和响应：原样调用原来的 fetch，把同一个 Response 交回去。登录、登出这类认证请求不算数据写入。
 * 由外壳（Orbit2026Shell）挂载时安装一次；服务端与没有 window 的测试环境不安装。
 */
"use client";

import { adoptNextChanges } from "./orbit-change-watch";
import { markAllAnswersStale } from "./orbit-last-answer";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);
let installed = false;

function isDataWrite(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (READS.has(method)) return false;
  const raw = input instanceof Request ? input.url : String(input);
  let url: URL;
  try { url = new URL(raw, window.location.href); } catch { return false; }
  return url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/");
}

export function installWriteWatch(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    if (response.ok && isDataWrite(input, init)) { markAllAnswersStale(); adoptNextChanges(); }
    return response;
  };
}
