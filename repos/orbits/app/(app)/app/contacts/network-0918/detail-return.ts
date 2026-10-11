/**
 * W0059 联系人详情「关闭回原页」的纯函数（D53）。
 *
 * - 来路判定用「一次性导航意图」：站内点击（或 iOrbit 的程序化跳转）去 `/app/contacts/<id>` 之前写
 *   `{ from, to, at, nonce }` 到本标签页 `sessionStorage`；详情挂载时只在 `to` 与当前路径（含 query）
 *   精确相等、30 秒内、且当前文档不是对本页的刷新时消费，读后立即删除。否则视为无来路。
 *   这样地址栏直达、新标签页、刷新、过期或目标不符的记录都不会让「关闭」后退到别处。
 * - `returnTo` 只收以单个 `/app/` 开头的相对路径（防开放跳转），且不能是同一联系人详情自身。
 * - 「返回 {来源}」按来源路径最长前缀命名。
 *
 * 读写 storage 一律 try/catch：不可用时视为无来路（不抛错、不影响关闭）。
 */

export const DETAIL_RETURN_STORAGE_KEY = "orbit:contact-detail-return";
export const DETAIL_RETURN_MAX_AGE_MS = 30_000;
export const RETURN_TO_MAX_LENGTH = 512;
export const DEFAULT_DETAIL_CLOSE_HREF = "/app/contacts";

export interface DetailReturnIntent {
  from: string;
  to: string;
  at: number;
  nonce: string;
}

/** 只用到 sessionStorage 的这三个方法，便于测试注入与「不可用」桩。 */
export type DetailReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `/app/contacts/` 下的静态子路由（不是联系人 id）。 */
const CONTACT_STATIC_SEGMENTS = new Set(["new", "pipeline", "dashboard", "analysis"]);

/** 路径（不含 query）是不是某个联系人的详情页 `/app/contacts/<id>`。 */
export function isContactDetailPath(pathname: string): boolean {
  const match = /^\/app\/contacts\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) return false;
  return !CONTACT_STATIC_SEGMENTS.has(match[1]!);
}

/** 用同一个 URL 解析把 href 归一成 `pathname + search`（不含 hash）；不是同源 `/app/*` 时返回 null。 */
export function normalizeAppPath(href: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (!/^\/app(\/|$)/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * 比较用的路径：去掉 `lang` 参数（语言只影响展示；`preserveHref` 会在英文界面给站内链接补 `?lang=en`，
 * 程序化跳转记下的 href 与最终地址可能只差这一个参数）。其余 query 原样保留、顺序不变。
 */
export function comparableAppPath(path: string): string {
  const hashAt = path.indexOf("#");
  const base = hashAt === -1 ? path : path.slice(0, hashAt);
  const queryAt = base.indexOf("?");
  if (queryAt === -1) return base;
  const params = new URLSearchParams(base.slice(queryAt + 1));
  params.delete("lang");
  const search = params.toString();
  return `${base.slice(0, queryAt)}${search ? `?${search}` : ""}`;
}

function pathOnly(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/**
 * 站内导航到联系人详情前写意图。只在目标是联系人详情、来源是另一个 `/app/*` 路径时写；
 * 返回写入的意图（没写返回 null）。
 */
export function writeDetailReturnIntent(
  storage: DetailReturnStorage | null | undefined,
  input: { from: string; to: string; now: number; nonce: string },
): DetailReturnIntent | null {
  if (!storage) return null;
  if (!isContactDetailPath(pathOnly(input.to))) return null;
  if (!/^\/app(\/|$|\?)/.test(input.from) || comparableAppPath(input.from) === comparableAppPath(input.to)) return null;
  const intent: DetailReturnIntent = { from: input.from, to: input.to, at: input.now, nonce: input.nonce };
  try {
    storage.setItem(DETAIL_RETURN_STORAGE_KEY, JSON.stringify(intent));
    return intent;
  } catch {
    return null;
  }
}

export interface DetailNavigationEntry {
  /** `PerformanceNavigationTiming.type`：navigate / reload / back_forward / prerender。 */
  type: string;
  /** 该文档最初加载的 URL 的 `pathname + search`。 */
  path: string | null;
}

/**
 * 详情挂载时消费意图（读后立即删除，不论是否有效）。有效时返回来源路径，否则 null。
 * 当前文档是「对本详情页的刷新」时一律无效（App Router 软导航不会产生新的 navigation entry，
 * 所以只有文档本身就是这一页且类型为 reload 才算刷新）。
 */
export function consumeDetailReturnIntent(
  storage: DetailReturnStorage | null | undefined,
  input: { current: string; now: number; navigation?: DetailNavigationEntry | null },
): string | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(DETAIL_RETURN_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    storage.removeItem(DETAIL_RETURN_STORAGE_KEY);
  } catch {
    return null;
  }
  let intent: Partial<DetailReturnIntent>;
  try {
    intent = JSON.parse(raw) as Partial<DetailReturnIntent>;
  } catch {
    return null;
  }
  if (!intent || typeof intent.from !== "string" || typeof intent.to !== "string" || typeof intent.at !== "number") return null;
  const current = comparableAppPath(input.current);
  if (comparableAppPath(intent.to) !== current) return null;
  const age = input.now - intent.at;
  if (!(age >= 0 && age <= DETAIL_RETURN_MAX_AGE_MS)) return null;
  if (input.navigation?.type === "reload" && input.navigation.path !== null && comparableAppPath(input.navigation.path) === current) return null;
  if (!/^\/app(\/|$|\?)/.test(intent.from) || comparableAppPath(intent.from) === current) return null;
  return intent.from;
}

/**
 * `returnTo` 校验：只收以单个 `/app/` 开头的相对路径；拒绝 `//`、`/\`、协议、控制字符、
 * 同一联系人详情自身、超过 512 字符。不合法返回 null（调用方回 `/app/contacts`）。
 */
export function sanitizeReturnTo(raw: unknown, contactId: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > RETURN_TO_MAX_LENGTH) return null;
  if (!value.startsWith("/app/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, "https://orbit.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://orbit.invalid" || !url.pathname.startsWith("/app/")) return null;
  const selfPaths = new Set([`/app/contacts/${contactId}`, `/app/contacts/${encodeURIComponent(contactId)}`]);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  let decodedPath = normalizedPath;
  try {
    decodedPath = decodeURIComponent(normalizedPath);
  } catch {
    /* 保留原样比较 */
  }
  if (selfPaths.has(normalizedPath) || selfPaths.has(decodedPath)) return null;
  // 返回解析后的规范形（`/app/a/../b` 之类已在上面按解析结果判定）。
  return `${url.pathname}${url.search}${url.hash}`;
}

type Copy = { zh: string; en: string };

/** 最长前缀优先（按路径段匹配，`/app/contactsX` 不算 `/app/contacts`）。 */
const RETURN_LABELS: readonly { prefix: string; label: Copy }[] = [
  { prefix: "/app/plans", label: { zh: "返回我的计划", en: "Back to My plan" } },
  { prefix: "/app/agent", label: { zh: "返回 iOrbit", en: "Back to iOrbit" } },
  { prefix: "/app/contacts/dashboard", label: { zh: "返回人脉分析", en: "Back to Network analysis" } },
  { prefix: "/app/contacts/analysis", label: { zh: "返回人脉分析", en: "Back to Network analysis" } },
  { prefix: "/app/contacts", label: { zh: "返回人脉", en: "Back to Network" } },
  { prefix: "/app/events", label: { zh: "返回活动", en: "Back to Events" } },
];

const GENERIC_BACK: Copy = { zh: "返回", en: "Back" };

/** 来源路径 → 「返回 {来源}」中英文案；null（无来路且无 returnTo）= 返回人脉。 */
export function detailReturnLabel(path: string | null): Copy {
  if (path === null) return RETURN_LABELS.find((entry) => entry.prefix === "/app/contacts")!.label;
  const pathname = pathOnly(path);
  let best: { prefix: string; label: Copy } | null = null;
  for (const entry of RETURN_LABELS) {
    const hit = pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`);
    if (hit && (!best || entry.prefix.length > best.prefix.length)) best = entry;
  }
  return best ? best.label : GENERIC_BACK;
}
