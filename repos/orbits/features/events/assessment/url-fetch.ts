/**
 * R26 外部活动页抓取（events DESIGN §5「URL 抓取（SSRF 防护）」，SC-R26-04）。Owner: 甲 (R26).
 *
 * - 只允许 http / https、默认端口（80 / 443），拒绝带用户名 / 密码的 URL；
 * - DNS 解析后逐个校验地址，拒绝私网 / 环回 / 链路本地 / 元数据 / 组播 / 保留段（含 IPv6 与 IPv4 映射，复核 m3）；
 * - 连接时钉住已校验的 IP（`lookup` 只回已校验地址），防 DNS rebinding；
 * - 5 秒超时、解压后 2 MB 上限、只收 text/html / application/xhtml+xml、不带 cookie / 认证头、固定 UA；
 * - 最多跟随 3 次重定向，每一跳重新解析、重新校验；
 * - 结果只在内存里交给抽取，不落库（DESIGN §9 #9）。
 * 失败映射：地址被拒 → blocked_host；超时 / 连接失败 / 4xx 以外的错误 → fetch_failed；超大 → too_large；非 HTML → not_event_page；
 * 401 / 403 → login_required（登录页判定第一条）。
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import zlib from "node:zlib";

export const URL_FETCH_TIMEOUT_MS = 5_000;
export const URL_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const URL_FETCH_MAX_REDIRECTS = 3;
export const URL_FETCH_USER_AGENT = "OrbitEventReader/1.0 (+https://orbit.app/bot)";

export type UrlFetchFailure = "blocked_host" | "fetch_failed" | "too_large" | "not_event_page" | "login_required";

export type UrlFetchResult =
  | { ok: true; finalUrl: string; status: number; html: string; contentType: string }
  | { ok: false; reason: UrlFetchFailure; status?: number; finalUrl?: string };

export type HostLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface UrlFetchOptions {
  lookup?: HostLookup;
  timeoutMs?: number;
  maxBytes?: number;
  /** 测试注入：用它代替真实 http(s).request（拿到已钉住的地址）。 */
  request?: (target: PinnedRequest) => Promise<RawResponse>;
}

export interface PinnedRequest {
  url: URL;
  address: string;
  family: number;
  timeoutMs: number;
  maxBytes: number;
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
  /** 解压后超过上限、已中断。 */
  tooLarge?: boolean;
}

// ── 地址校验 ─────────────────────────────────────────────────────────────

const IPV4_BLOCKS: readonly [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function ipv4ToInt(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function inIpv4Block(address: string, [base, bits]: readonly [string, number]): boolean {
  const value = ipv4ToInt(address);
  const start = ipv4ToInt(base);
  if (value === null || start === null) return false;
  const size = 2 ** (32 - bits);
  return value >= start && value < start + size;
}

/** IPv6 → 8 个 16 位组；IPv4 尾部（::ffff:1.2.3.4）展开。认不出返回 null。 */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0]!;
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4Tail) {
    const v4 = ipv4ToInt(v4Tail[1]!);
    if (v4 === null) return null;
    text = `${text.slice(0, text.length - v4Tail[1]!.length)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return groups.length === 8 && groups.every((group) => Number.isFinite(group)) ? groups : null;
}

/** 这个地址能不能连（公网单播才行）。 */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !IPV4_BLOCKS.some((block) => inIpv4Block(address, block));
  if (version !== 6) return false;
  const g = ipv6Groups(address);
  if (!g) return false;
  const allZero = g.every((group) => group === 0);
  if (allZero) return false; // ::/128
  if (g.slice(0, 7).every((group) => group === 0) && g[7] === 1) return false; // ::1
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // fc00::/7
  if ((g[0]! & 0xffc0) === 0xfe80) return false; // fe80::/10
  if ((g[0]! & 0xff00) === 0xff00) return false; // ff00::/8
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((group) => group === 0)) return false; // 64:ff9b::/96
  if (g[0] === 0x2002) return false; // 2002::/16
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return false; // 64:ff9b:1::/48
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return false; // 2001::/32 Teredo、2001:db8::/32 文档段
  if (g.slice(0, 5).every((group) => group === 0) && g[5] === 0xffff) {
    // ::ffff:0:0/96 → 按映射出的 IPv4 再判。
    const v4 = `${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`;
    return isPublicAddress(v4);
  }
  if (g.slice(0, 6).every((group) => group === 0)) return false; // 旧式 IPv4 兼容 ::a.b.c.d
  return true;
}

/** URL 本身合不合规（协议、端口、凭据）。 */
export function checkUrlShape(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) return null;
  if (!url.hostname) return null;
  return url;
}

/** 规范化（幂等摘要用）：小写主机、去 hash、去默认端口、去末尾斜杠、去常见追踪参数。 */
export function normalizeUrl(raw: string): string | null {
  const url = checkUrlShape(raw);
  if (!url) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$|ref_src$)/i.test(key)) url.searchParams.delete(key);
  let text = url.toString();
  if (text.endsWith("/") && url.pathname !== "/") text = text.slice(0, -1);
  return text;
}

async function defaultLookup(hostname: string) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function resolvePublic(url: URL, lookup: HostLookup): Promise<{ address: string; family: number } | null> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicAddress(host) ? { address: host, family: isIP(host) } : null;
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) return null;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(host);
  } catch {
    return null;
  }
  // 任何一个解析结果是内网就整个拒绝（防「一公一私」的 rebinding）。
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) return null;
  return addresses[0]!;
}

// ── 真实请求（钉住地址）─────────────────────────────────────────────────

function nodeRequest(target: PinnedRequest): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = target.url.protocol === "https:" ? https : http;
    const req = mod.request(
      target.url,
      {
        headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-encoding": "gzip, deflate, br", "accept-language": "ja,en;q=0.8", "user-agent": URL_FETCH_USER_AGENT },
        lookup: (_hostname, _options, callback) => {
          // 钉住：只回已校验的地址（Node 18+ 的 lookup 可能要求 all 形式）。
          const opts = _options as { all?: boolean };
          if (opts && opts.all) (callback as unknown as (error: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address: target.address, family: target.family }]);
          else (callback as (error: null, address: string, family: number) => void)(null, target.address, target.family);
        },
        method: "GET",
        timeout: target.timeoutMs,
      },
      (res) => {
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream = encoding.includes("br") ? res.pipe(zlib.createBrotliDecompress()) : encoding.includes("gzip") ? res.pipe(zlib.createGunzip()) : encoding.includes("deflate") ? res.pipe(zlib.createInflate()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const headers = Object.fromEntries(Object.entries(res.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]));
        const status = res.statusCode ?? 0;
        // 重定向与错误码不读正文。
        if (status >= 300 && status < 400) { res.resume(); resolve({ body: "", headers, status }); return; }
        stream.on("data", (chunk: Buffer) => {
          if (done) return;
          size += chunk.length;
          if (size > target.maxBytes) {
            done = true;
            req.destroy();
            resolve({ body: "", headers, status, tooLarge: true });
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => { if (!done) { done = true; resolve({ body: Buffer.concat(chunks).toString("utf8"), headers, status }); } });
        stream.on("error", (error) => { if (!done) { done = true; reject(error); } });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    // 复核 M2：`timeout` 只是 socket 空闲超时；再加一个按剩余时间的总计时器，慢速滴流也会在到点时断开。
    const total = setTimeout(() => req.destroy(new Error("timeout")), target.timeoutMs);
    req.on("close", () => clearTimeout(total));
    req.on("error", reject);
    req.end();
  });
}

const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)\b/i;

/** 抓一个外部活动页（SSRF 防护见文件头）。不抛错：失败都映射成 `reason`。 */
export async function fetchEventPage(rawUrl: string, options: UrlFetchOptions = {}): Promise<UrlFetchResult> {
  const lookup = options.lookup ?? defaultLookup;
  const send = options.request ?? nodeRequest;
  const timeoutMs = options.timeoutMs ?? URL_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? URL_FETCH_MAX_BYTES;
  let url = checkUrlShape(rawUrl);
  if (!url) return { ok: false, reason: "blocked_host" };
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; hop <= URL_FETCH_MAX_REDIRECTS; hop += 1) {
    const pinned = await resolvePublic(url, lookup);
    if (!pinned) return { finalUrl: url.toString(), ok: false, reason: "blocked_host" };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { finalUrl: url.toString(), ok: false, reason: "fetch_failed" };
    let response: RawResponse;
    try {
      response = await send({ address: pinned.address, family: pinned.family, maxBytes, timeoutMs: remaining, url });
    } catch {
      return { finalUrl: url.toString(), ok: false, reason: "fetch_failed" };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) return { finalUrl: url.toString(), ok: false, reason: "fetch_failed", status: response.status };
      let resolved: string;
      try { resolved = new URL(location, url).toString(); } catch { return { finalUrl: url.toString(), ok: false, reason: "fetch_failed", status: response.status }; }
      const next = checkUrlShape(resolved);
      if (!next) return { finalUrl: url.toString(), ok: false, reason: "blocked_host" };
      url = next;
      continue;
    }
    if (response.tooLarge) return { finalUrl: url.toString(), ok: false, reason: "too_large", status: response.status };
    if (response.status === 401 || response.status === 403) return { finalUrl: url.toString(), ok: false, reason: "login_required", status: response.status };
    if (response.status < 200 || response.status >= 300) return { finalUrl: url.toString(), ok: false, reason: "fetch_failed", status: response.status };
    const contentType = response.headers["content-type"] ?? "";
    if (!HTML_TYPES.test(contentType)) return { finalUrl: url.toString(), ok: false, reason: "not_event_page", status: response.status };
    return { contentType, finalUrl: url.toString(), html: response.body, ok: true, status: response.status };
  }
  return { finalUrl: url.toString(), ok: false, reason: "fetch_failed" };
}
