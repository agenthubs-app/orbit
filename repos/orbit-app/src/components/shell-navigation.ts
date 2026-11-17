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

type StackRoute = { key?: string; name: string; params?: object | undefined };
type TabAnimation = "none" | "default" | "slide_from_left";
export type TabSwipeDirection = "next" | "prev";

/**
 * Whether a root-stack route is one of the four tab pages. /home and /task are root routes;
 * /contacts and /events live in the (app) group, whose root route names its page in `screen`.
 */
export function isTabPageRoute(route: StackRoute): boolean {
  if (route.name === "home" || route.name === "task") return true;
  const screen = (route.params as { screen?: unknown } | undefined)?.screen;
  return route.name === "(app)" && (screen === "contacts" || screen === "events");
}

// A swipe asks for the next tab page to slide in; the request is taken by the first tab
// route the stack renders after it and kept for that route (its options are read again later).
let pendingSwipe: TabSwipeDirection | null = null;
const tabAnimations = new Map<string, TabAnimation>();

/**
 * Tapping a tab switches pages at once, like a native tab bar: a tab page always arrives by
 * replacing the bottom page (openMainTab), so it gets no push animation. A swipe between tab
 * pages slides the new page in from the side it came from. Every other page keeps the stack's slide.
 */
export function rootStackScreenOptions(route: StackRoute): { animation?: TabAnimation } {
  if (!isTabPageRoute(route)) return {};
  const known = route.key ? tabAnimations.get(route.key) : undefined;
  if (known) return { animation: known };
  const animation: TabAnimation = pendingSwipe === "next" ? "default" : pendingSwipe === "prev" ? "slide_from_left" : "none";
  pendingSwipe = null;
  if (route.key) {
    if (tabAnimations.size > 50) tabAnimations.clear();
    tabAnimations.set(route.key, animation);
  }
  return { animation };
}

/** The tab page next to `from` in the bar's order (iOrbit is a full-screen page, not a tab page). */
export function adjacentTabPath(from: string, direction: TabSwipeDirection): string | null {
  const index = TAB_PAGE_PATHS.indexOf(from.split(/[?#]/u)[0] ?? "");
  if (index < 0) return null;
  return TAB_PAGE_PATHS[index + (direction === "next" ? 1 : -1)] ?? null;
}

/** A finished sideways pan: far enough (64pt) or fast enough (600pt/s) in one direction picks a neighbour. */
export function swipeDirection(translationX: number, velocityX: number): TabSwipeDirection | null {
  if (translationX <= -64 || (translationX < 0 && velocityX <= -600)) return "next";
  if (translationX >= 64 || (translationX > 0 && velocityX >= 600)) return "prev";
  return null;
}

/** Swiping sideways on a tab page opens the neighbouring tab page with a slide. */
export function swipeToMainTab(router: ResetRouter, from: string, direction: TabSwipeDirection): void {
  const target = adjacentTabPath(from, direction);
  if (!target) return;
  pendingSwipe = direction;
  openMainTab(router, target);
}
