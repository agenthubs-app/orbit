/** R28 card routes carry only exact guide or fifth-screen return targets. */
export type AppGuideReturnTo = "/start" | "/profile/onboarding?screen=5";

export function appGuideReturnTo(value: unknown): AppGuideReturnTo | null {
  return value === "/start" || value === "/profile/onboarding?screen=5" ? value : null;
}

export function appendAppGuideReturnTo(href: string, value: unknown): string {
  const returnTo = appGuideReturnTo(value);
  return returnTo ? `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}` : href;
}
