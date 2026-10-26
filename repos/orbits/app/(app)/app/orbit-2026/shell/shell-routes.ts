// R07: which signed-in pages the new shell frames, and which rail item is current.
// Pure (no React) so the route rules are tested on their own.
import { allowsOrbitAsk } from "../../orbit-global-ask/orbit-ask-routes";
export type ShellNavKey = "home" | "network" | "iorbit" | "events" | "task" | "inbox" | "host" | "settings" | "me";

// Pages with their own frame: the public landing, sign-in, the admin host console,
// the public organizer page, registration hand-offs and the profile onboarding (b1 A3 draws its own header).
const NO_SHELL_EXACT = new Set(["/app", "/app/platform", "/app/profile/onboarding"]);
const NO_SHELL_PREFIXES = ["/app/account", "/app/login-admin", "/app/admin", "/app/o", "/app/register"];

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/**
 * The shell (and with it ⌘K) also keeps the exclusions of the old floating ask
 * (orbit-ask-routes): check-in and admission are kiosk screens — hands busy, a
 * queue waiting — where a rail or a search panel only gets in the way.
 */
export function shellAppliesTo(pathname: string, signedIn: boolean): boolean {
  if (!signedIn) return false;
  const path = pathname.replace(/\/+$/u, "") || "/";
  if (!matches(path, "/app") || NO_SHELL_EXACT.has(path)) return false;
  // R28: the guide uses the shell, while the separate floating Ask remains excluded.
  if (path === "/app/start") return true;
  return !NO_SHELL_PREFIXES.some((prefix) => matches(path, prefix)) && allowsOrbitAsk(path);
}

/** R28: card import opened from onboarding step 5 keeps the onboarding header in place of the rail nav. */
export function onboardingImportFocus(pathname: string, returnTo: string | null): boolean {
  const path = pathname.replace(/\/+$/u, "");
  return returnTo === "/app/profile/onboarding?screen=5" && (matches(path, "/app/contacts/new/scan") || matches(path, "/app/contacts/new/import"));
}

/** The rail item a page belongs to (deep pages highlight their section). */
export function shellNavKeyFor(pathname: string): ShellNavKey | null {
  const path = pathname.replace(/\/+$/u, "");
  if (path === "/app/start") return "home";
  if (matches(path, "/app/home")) return "home";
  if (matches(path, "/app/contacts")) return "network";
  if (matches(path, "/app/agent")) return "iorbit";
  // R27：会場モード（/live）是参加者自己的页面，左栏高亮イベント（b2 #36）；主催侧仍是 operations / analytics。
  // R17 第 4 段：编辑基本情報（/edit）与共同運営に参加（/app/host/join）也归主催。
  if (matches(path, "/app/events/center") || matches(path, "/app/host") || /^\/app\/events\/[^/]+\/(operations|analytics|edit)(\/|$)/u.test(path)) return "host";
  if (matches(path, "/app/events")) return "events";
  if (matches(path, "/app/tasks")) return "task";
  // 计划页像素返工（2026-10-12，主会话拍板）：生成流程与見直し在设计稿里是 iOrbit 页内的对话，左栏高亮 iOrbit；
  // 其余计划页（概要、人物类型、手動編集草稿——b10 #21 左栏高亮 Task、完了、以前のプラン）属于 Task › プラン（DESIGN §7）。
  if (matches(path, "/app/plans/flow") || /^\/app\/plans\/[^/]+\/review(\/|$)/u.test(path)) return "iorbit";
  if (matches(path, "/app/plans")) return "task";
  if (matches(path, "/app/inbox")) return "inbox";
  if (matches(path, "/app/settings")) return "settings";
  if (matches(path, "/app/profile/continue") || matches(path, "/app/profile/onboarding")) return "me";
  if (matches(path, "/app/profile")) return "settings";
  return null;
}

/** iOrbit is a workspace of its own: no right rail there (web.html). */
export function shellShowsRail(pathname: string): boolean {
  return !matches(pathname.replace(/\/+$/u, ""), "/app/agent");
}

export const SHELL_NAV: readonly { key: Exclude<ShellNavKey, "host" | "settings" | "me">; href: string; icon: "home" | "users" | "sparkle" | "calendar" | "task" | "inbox" }[] = [
  { key: "home", href: "/app/home", icon: "home" },
  { key: "network", href: "/app/contacts", icon: "users" },
  { key: "iorbit", href: "/app/agent", icon: "sparkle" },
  { key: "events", href: "/app/events", icon: "calendar" },
  { key: "task", href: "/app/tasks", icon: "task" },
  { key: "inbox", href: "/app/inbox", icon: "inbox" },
];
