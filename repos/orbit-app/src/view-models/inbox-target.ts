/** Server notifications may use the Web `/app` prefix; Expo routes do not. */
export function inboxAppTargetHref(href: string | null): string | null {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  return href.startsWith('/app/') ? href.slice(4) : href;
}
