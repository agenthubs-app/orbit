// R05 review M1: the four tab pages always sit alone at the bottom of the stack
// (NAV-V3: five equal tabs). Opening one — from the tab bar, a shortcut, a
// notification or an old Task address pushed by an old screen — first pops every
// stack on the focused path back to its first page, then replaces that page.
// Pushing a tab page instead would pile tab pages up under each other.
// No expo-router import here: page code (and the tests that bundle pages) can use it.

type NavState = { type?: string; index?: number; routes?: readonly { state?: unknown }[] } | undefined;

let latestRootState: NavState;

/** The four tab pages (same as MAIN_TAB_PATHS in view-models/app-navigation; a test keeps them equal). */
export const TAB_PAGE_PATHS: readonly string[] = ["/home", "/contacts", "/events", "/task"];

export function isTabPageHref(href: string): boolean {
  return TAB_PAGE_PATHS.includes(href.split(/[?#]/u)[0] ?? "");
}

/** How many nested stacks on the focused path still have pages to pop (one POP_TO_TOP each). */
export function poppableLevels(state: unknown): number {
  let levels = 0;
  let node = state as NavState;
  while (node && Array.isArray(node.routes)) {
    if (node.type === "stack" && node.routes.length > 1) levels += 1;
    const index = node.index ?? node.routes.length - 1;
    node = node.routes[index]?.state as NavState;
  }
  return levels;
}

/** The root layout (UiRoot, mounted signed in or out) mirrors the root state here. */
export function trackRootNavigationState(state: unknown): void {
  latestRootState = state as NavState;
}

type ResetRouter = { dismissAll?: () => void; replace: (href: never) => void };

/**
 * Makes `href` the only page: pops every stack on the focused path, then replaces the first page.
 * Used for tab pages and for auth changes (sign-in, sign-up, onboarding done, sign-out), so no
 * page from before the change — or from the previous account — stays underneath to go back to.
 */
export function resetStackTo(router: ResetRouter, href: string): void {
  for (let level = poppableLevels(latestRootState); level > 0; level -= 1) router.dismissAll?.();
  router.replace(href as never);
}

export function openMainTab(router: ResetRouter, href: string): void {
  resetStackTo(router, href);
}

