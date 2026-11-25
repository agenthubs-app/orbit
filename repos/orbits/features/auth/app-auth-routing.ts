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
  // 2026-11-26：引导页 /app/start 也在代理层拦，登录后带着 ?step= 回来。
  "/app/start",
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
const ORBIT_PRIVATE_EVENT_SUBPAGE = /^\/app\/events\/[^/]+\/(register|prep|live|after|operations|edit|analytics|people)(\/|$)/;

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

/**
 * 登录 / 注册 / 引导这些「流程页」自身不能当回跳目标；它们带的 `?next=` 才是原来的页面。
 * 作为目标出现时解包取里层 next（嵌套多层也一路解到最里层），没有里层 next 才回退。
 */
const ORBIT_AUTH_FLOW_PATHS = new Set([
  "/app/account/login",
  "/app/account/signup",
  "/app/account/forgot-password",
  "/app/account/reset-password",
  "/app/profile/continue",
  "/app/profile/onboarding",
]);
/** 站点外层（不在 /app 下）可回跳的公开页：帮助 / 条款 / 隐私、主办方页 `/o/<slug>`、申込短链 `/e/<slug>`。 */
const ORBIT_PUBLIC_RETURN_PATHS = new Set(["/help", "/terms", "/privacy"]);
const ORBIT_PUBLIC_RETURN_PATTERN = /^\/(?:o|e)\/[^/]+$/u;
const MAX_RETURN_PATH_UNWRAP = 5;

function decodedPathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isAuthFlowWrapper(pathname: string, search: URLSearchParams): boolean {
  // 旧的资料引导入口 `/app/profile?onboarding=1&next=…` 也是流程页（会转去 /app/profile/onboarding）。
  return ORBIT_AUTH_FLOW_PATHS.has(pathname) || (pathname === "/app/profile" && search.has("onboarding"));
}

function isAllowedReturnPathname(pathname: string): boolean {
  if (
    pathname === "/" ||
    pathname === "/app" ||
    isOrbitPublicReturnPath(pathname)
  ) {
    return true;
  }
  return pathname.startsWith("/app/") && !isOrbitAuthEntryPath(pathname);
}

/** 站点外层（不在 /app 下）可以回跳的路径。 */
export function isOrbitPublicReturnPath(pathname: string): boolean {
  return ORBIT_PUBLIC_RETURN_PATHS.has(pathname) || ORBIT_PUBLIC_RETURN_PATTERN.test(pathname);
}

/**
 * 登录 / 注册 / 引导完成后回到哪里：只接受本站路径（含查询与片段）。
 * 拒绝外部地址、`//` 协议相对、反斜杠变体；流程页自身解包取里层 next；其余回退到 `fallback`。
 */
export function normalizeOrbitAuthReturnPath(
  value: string | string[] | null | undefined,
  fallback = "/app/home",
): string {
  let candidate = Array.isArray(value) ? value[0] : value;

  for (let depth = 0; depth <= MAX_RETURN_PATH_UNWRAP; depth += 1) {
    if (
      !candidate ||
      !candidate.startsWith("/") ||
      candidate.startsWith("//") ||
      candidate.includes("\\") ||
      // 控制字符（含会被 URL 解析器吞掉的 tab / 换行，`/\t/evil.example` 之类）一律不收。
      /[\u0000-\u001f\u007f]/u.test(candidate)
    ) {
      return fallback;
    }

    // R15（DESIGN add-and-invite §2.5 第 2 步）：招待页 `/i`、`/i/<码>` 在 /app 之外，只在完全匹配时原样放行；
    // 形如招待路径但不完全匹配的（`/i/../app/admin`、带查询或片段、小写、字母表外、超长）一律回退，不交给下面的分支。
    if (/^\/i(?:[/?#]|$)/u.test(candidate)) {
      return isInviteCodePath(candidate) ? candidate : fallback;
    }

    let parsed: URL;
    try {
      parsed = new URL(candidate, SAFE_ORIGIN);
    } catch {
      return fallback;
    }
    const pathname = decodedPathname(parsed.pathname);
    if (parsed.origin !== SAFE_ORIGIN || !pathname || pathname.includes("\\") || pathname.startsWith("//")) {
      return fallback;
    }

    if (isAuthFlowWrapper(pathname, parsed.searchParams)) {
      const inner = parsed.searchParams.get("next");
      if (!inner) return fallback;
      candidate = inner;
      continue;
    }

    if (!isAllowedReturnPathname(pathname)) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  return fallback;
}
