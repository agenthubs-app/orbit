// New-user onboarding cannot be skipped (2026-11-25): a signed-in account that still has to go through it sees
// only onboarding, wherever the App opens — cold start, a deep link, a notification, or back from the background.
// The answer is per account and server, kept in AsyncStorage so a set-up account never waits for it again.
import type { OnboardingVerdict } from "../storage/profile-onboarding-storage";

/** `open`: an account from before this gate whose first check could not reach the server; asked again on return. */
export type OnboardingGateStatus = "off" | "unknown" | "required" | "clear" | "open";

const PUBLIC_PREFIXES = ["/profile/onboarding", "/profile/continue", "/account", "/legal", "/help", "/showcase", "/i", "/force-update", "/maintenance"] as const;

/** Pages an unfinished account may still open: onboarding itself (and the route that hands over to it), account rights, the legal texts, an invite's own public page. */
export function onboardingExemptRoute(pathname: string): boolean {
  const route = pathname.startsWith("/app/") ? pathname.slice(4) : pathname;
  return route === "/" || PUBLIC_PREFIXES.some(prefix => route === prefix || route.startsWith(`${prefix}/`)) ||
    route === "/settings/terms" || route === "/settings/privacy" || route === "/settings/help";
}

/** Where a blocked page is sent; it comes back through `next` once onboarding is done. */
export function onboardingGateHref(returnHref: string): string {
  return `/profile/onboarding?next=${encodeURIComponent(returnHref)}`;
}

/** A first check that takes longer than this lets the person in and asks again later. */
export const ONBOARDING_GATE_WAIT_MS = 5000;

export async function resolveOnboardingGate(input: {
  stored: () => Promise<OnboardingVerdict | null>;
  /** True / false from the server, null when it could not be read. */
  required: () => Promise<boolean | null>;
  remember: (verdict: OnboardingVerdict) => Promise<void>;
  waitMs?: number;
}): Promise<Exclude<OnboardingGateStatus, "off" | "unknown">> {
  const stored = await input.stored();
  if (stored) return stored;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), input.waitMs ?? ONBOARDING_GATE_WAIT_MS); });
  const required = await Promise.race([input.required().catch(() => null), late]).finally(() => clearTimeout(timer));
  if (required === null) return "open";
  const verdict = required ? "required" : "clear";
  await input.remember(verdict);
  return verdict;
}
