/** R28 card routes carry only the in-app guide return target. */
export function appGuideReturnTo(value: unknown): "/start" | null {
  return value === "/start" ? "/start" : null;
}

export function appendAppGuideReturnTo(href: string, value: unknown): string {
  const returnTo = appGuideReturnTo(value);
  return returnTo ? `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}` : href;
}
