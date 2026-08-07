/**
 * 全局 iOrbit 提问入口的路由门禁与页面上下文标签。
 *
 * 纯函数、无 React 依赖：路由白名单是这个特性最容易悄悄出错的地方（漏一个
 * kiosk 页面就会在签到大屏上弹出一个 AI 球），所以单独成文件、单独测。
 */

import type { OrbitLanguage } from "../orbit-language-core";

/** iOrbit 工作台自身的路由。进这一页时输入框默认展开。 */
export const ORBIT_ASK_HOME = "/app/agent";

/**
 * 不挂提问入口的路由前缀。
 *
 * - account / login-admin：未登录或正在登录，没有人脉上下文可问。
 * - admin：平台后台是运营工具，不是会员产品面。
 * - o：组织者公开主页，访客可见。
 * - party/checkin、operations/check-in、operations/admission：签到与入场审核是
 *   「手上有事、旁边有人排队」的操作场景，浮层只会碍事。
 */
const EXCLUDED_PREFIXES = [
  "/app/account",
  "/app/login-admin",
  "/app/admin",
  "/app/o",
  "/app/party/checkin",
] as const;

/** 活动运营下的 kiosk 子路由（`/app/events/[id]/operations/...`）。 */
const EXCLUDED_SEGMENTS = ["/operations/check-in", "/operations/admission"] as const;

/** 去掉查询串、哈希和结尾斜杠，让前缀比较不受书写差异影响。 */
function normalizePath(pathname: string): string {
  const path = (pathname || "").split("?")[0].split("#")[0];

  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** 前缀匹配，但只在路径边界处匹配：`/app/o` 不应命中 `/app/orbits`。 */
function hasPathPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isOrbitAskHome(pathname: string): boolean {
  return normalizePath(pathname) === ORBIT_ASK_HOME;
}

export function allowsOrbitAsk(pathname: string): boolean {
  const path = normalizePath(pathname);

  if (!hasPathPrefix(path, "/app")) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => hasPathPrefix(path, prefix))) return false;

  return !EXCLUDED_SEGMENTS.some((segment) => path.includes(segment));
}

/**
 * 当前页面能给 iOrbit 的上下文标签。
 *
 * 只用路由推导，不读页面数据：这是给用户看的「我会带走什么」的说明，宁可粗一点
 * 也不要让用户以为我们在页面上抓了更多东西。返回 null 表示这页没有值得带走的
 * 上下文，界面上就不显示那枚 chip。
 */
const PAGE_CONTEXTS: readonly {
  copy: { en: string; zh: string };
  match: (path: string) => boolean;
}[] = [
  {
    copy: { en: "this event", zh: "这场活动" },
    match: (path) => /^\/app\/events\/[^/]+$/.test(path),
  },
  {
    copy: { en: "this contact", zh: "这位人脉" },
    match: (path) => /^\/app\/contacts\/[^/]+$/.test(path),
  },
  {
    copy: { en: "the event list", zh: "活动列表" },
    match: (path) => hasPathPrefix(path, "/app/events"),
  },
  {
    copy: { en: "my contacts", zh: "我的人脉" },
    match: (path) => hasPathPrefix(path, "/app/contacts"),
  },
  {
    copy: { en: "my schedule", zh: "我的日程" },
    match: (path) => hasPathPrefix(path, "/app/today") || hasPathPrefix(path, "/app/schedule"),
  },
  {
    copy: { en: "my follow-ups", zh: "我的待办" },
    match: (path) => hasPathPrefix(path, "/app/followups"),
  },
  {
    copy: { en: "my inbox", zh: "我的收件箱" },
    match: (path) => hasPathPrefix(path, "/app/inbox"),
  },
];

export function orbitAskPageContext(
  pathname: string,
  language: OrbitLanguage,
): string | null {
  const path = normalizePath(pathname);
  const hit = PAGE_CONTEXTS.find((entry) => entry.match(path));

  if (!hit) return null;

  return language === "zh" ? hit.copy.zh : hit.copy.en;
}
