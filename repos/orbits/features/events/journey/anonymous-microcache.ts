/**
 * 未登录 GET 的实例内微缓存（不走 CDN：Vercel CDN 的缓存键不含 cookie，会把匿名版本发给已登录用户）。
 * Used by: `app/api/events/[id]/overview/route.ts`。
 *
 * - 只缓存「没有 Auth.js 会话 cookie、没有 Authorization、没有示例头」的请求，键 = 完整 URL + 语言 / 平台头。
 * - 只缓存 200；同一键并发请求合并成一次（in-flight 共享）。
 * - 条目上限 500，超出先删最旧的；TTL 到期惰性淘汰。
 * - 对外仍是 `private, no-store`，浏览器 / CDN 行为不变。
 */
import { orbitLanguageCookie } from "../../../shared/compute/request-language";

const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/u;
const MAX_ENTRIES = 500;
// 影响响应内容的请求头（语言 / 平台见 plans/v2 requestContext）。
const VARY_HEADERS = ["x-orbit-lang", "x-orbit-platform", "accept-language"] as const;

interface Entry {
  expiresAt: number;
  body: string;
  status: number;
  headers: [string, string][];
}

export function isAnonymousRequest(request: Request, sampleHeader?: string): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("authorization")) return false;
  if (sampleHeader && request.headers.get(sampleHeader)) return false;
  return !SESSION_COOKIE.test(request.headers.get("cookie") ?? "");
}

export function anonymousMicrocache(options: { ttlMs: number; sampleHeader?: string; now?: () => number }) {
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<{ entry: Entry } | { miss: Response }>>();

  const toResponse = (entry: Entry) => new Response(entry.body, { headers: entry.headers, status: entry.status });

  return async function cached(request: Request, load: () => Promise<Response>): Promise<Response> {
    if (!isAnonymousRequest(request, options.sampleHeader)) return load();
    // 语言也可能只在 orbit-lang cookie 里（requestContext 会读它），键要带上，免得把别的语言的版本发出去。
    const key = [request.url, ...VARY_HEADERS.map((name) => request.headers.get(name) ?? ""), orbitLanguageCookie(request) ?? ""].join("|");
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) return toResponse(hit);
    if (hit) entries.delete(key);

    const shared = inflight.get(key);
    if (shared) {
      // 跟随者：发起者拿到 200 就复用；否则（404 / 出错）自己直接再取一次。
      const result = await shared.catch(() => null);
      return result && "entry" in result ? toResponse(result.entry) : load();
    }
    const pending = (async () => {
      const response = await load();
      if (response.status !== 200) return { miss: response };
      const entry: Entry = { body: await response.text(), expiresAt: now() + options.ttlMs, headers: [...response.headers.entries()], status: 200 };
      if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
      entries.set(key, entry);
      return { entry };
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
    const result = await pending;
    return "entry" in result ? toResponse(result.entry) : result.miss;
  };
}
