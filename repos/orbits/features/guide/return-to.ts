/** R28 card flows carry only the guide's internal return target. */
export function webGuideReturnTo(value: unknown): "/app/start" | null {
  return value === "/app/start" ? "/app/start" : null;
}

export function appendWebGuideReturnTo(href: string, value: unknown): string {
  const returnTo = webGuideReturnTo(value);
  return returnTo ? `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}` : href;
}
