/** R28 card flows carry only exact internal guide or fifth-screen return targets. */
export type WebGuideReturnTo = "/app/start" | "/app/profile/onboarding?screen=5";

export function webGuideReturnTo(value: unknown): WebGuideReturnTo | null {
  return value === "/app/start" || value === "/app/profile/onboarding?screen=5" ? value : null;
}

export function appendWebGuideReturnTo(href: string, value: unknown): string {
  const returnTo = webGuideReturnTo(value);
  return returnTo ? `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}` : href;
}
