const ORBIT_PRIVATE_APP_PREFIXES = [
  "/app/admin",
  "/app/agent",
  "/app/contacts",
  "/app/home",
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

  return ORBIT_PRIVATE_APP_PREFIXES.some((prefix) =>
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
