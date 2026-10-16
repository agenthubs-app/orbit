import { isInviteCodePath } from "../../shared/compute/invite-code-format";

const ORBIT_PRIVATE_APP_PREFIXES = [
  "/app/admin",
  "/app/agent",
  "/app/contacts",
  // R26: assessment results belong to the signed-in person; the イベント list itself stays public.
  "/app/events/assessments",
  // R17: 運営センター（含 /new、/profiles）只给登录的主办方；共同運営への参加 /app/host/join 有未登录预览，不进前缀。
  "/app/events/center",
  "/app/home",
  // R07: the inbox became a page (it was a drawer); signed-out visitors go to sign-in.
  "/app/inbox",
  // R23: plan v2 pages (generation flow, manual edit; R24/R25 add the rest under /app/plans).
  "/app/plans",
  "/app/platform",
  "/app/profile",
  "/app/settings",
  // 2026-09-24：`/app/tasks/relationship/[id]/page.tsx` 整页没有 `auth()`（同目录另外三个页面都有），
  // 而前缀表当时也没覆盖 `/app/tasks`，于是未登录访客拿到的是一个取不到数据的编辑器空壳，
  // 而不是登录跳转。不是数据泄漏（数据全部来自 `/api/connections/<id>/lifecycle`，走代理 401 分支），
  // 但它同时是一个路由探测口子。加在这里而不是改那个页面，是因为该路由归 App 端、「App 端不动」；
  // 且 App 并不加载这个网页——`repos/orbit-app/src/view-models/initial-route.ts` 的
  // `resolveSupportedInitialRouteHref` 把 `/app/tasks/relationship/<id>` 翻译成 App 自己的原生屏
  // `/tasks/relationship/<id>`（见 `repos/orbit-app/tests/relationship-lifecycle.test.ts:12`
  // 与 `repos/orbit-app/app/tasks/relationship/[id].tsx`），所以代理层跳转不会打断 App。
  "/app/tasks",
] as const;

// R27: an event's own pages for the signed-in attendee (参加登録 / 会う準備 / 会場モード / 会後); the detail itself stays public.
// R17：运营台（含 kiosk）、编辑、旧分析跳转页也要登录。
const ORBIT_PRIVATE_EVENT_SUBPAGE = /^\/app\/events\/[^/]+\/(register|prep|live|after|operations|edit|analytics)(\/|$)/;

const ORBIT_AUTH_ENTRY_PREFIX = "/app/account";
const ORBIT_PUBLIC_ADMIN_ENTRY_PATHS = new Set([
  "/app/admin/access",
  "/app/login-admin",
]);
const SAFE_ORIGIN = "https://orbit.local";

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isOrbitPrivateAppPath(pathname: string): boolean {
  if (ORBIT_PUBLIC_ADMIN_ENTRY_PATHS.has(pathname)) {
    return false;
  }

  return ORBIT_PRIVATE_EVENT_SUBPAGE.test(pathname) || ORBIT_PRIVATE_APP_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );
}

export function isOrbitAuthEntryPath(pathname: string): boolean {
  return matchesRoutePrefix(pathname, ORBIT_AUTH_ENTRY_PREFIX);
}

export function normalizeOrbitAuthReturnPath(
  value: string | string[] | null | undefined,
  fallback = "/app/home",
): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return fallback;
  }

  // R15（DESIGN add-and-invite §2.5 第 2 步）：招待页 `/i`、`/i/<码>` 在 /app 之外，只在完全匹配时原样放行；
  // 形如招待路径但不完全匹配的（`/i/../app/admin`、带查询或片段、小写、字母表外、超长）一律回退，不交给下面的分支。
  if (/^\/i(?:[/?#]|$)/u.test(candidate)) {
    return isInviteCodePath(candidate) ? candidate : fallback;
  }

  try {
    const parsed = new URL(candidate, SAFE_ORIGIN);

    if (
      parsed.origin !== SAFE_ORIGIN ||
      (parsed.pathname !== "/app" &&
        parsed.pathname !== "/" &&
        !parsed.pathname.startsWith("/app/")) ||
      isOrbitAuthEntryPath(parsed.pathname)
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
