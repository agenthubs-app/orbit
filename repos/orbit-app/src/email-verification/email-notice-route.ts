// The reception device (visitors touch it), the sign-in pages and the admin console carry no reminder; every other page does.
const HIDDEN = ["/account/login", "/account/signup", "/account/forgot-password", "/account/reset-password", "/account/pending", "/admin", "/login-admin"] as const;
const KIOSK = /^\/events\/[^/]+\/operations\/check-in(?:\/|$)/u;

export function showsEmailNotice(pathname: string): boolean {
  const route = pathname.startsWith("/app/") ? pathname.slice(4) : pathname;
  return route !== "/" && !KIOSK.test(route) && !HIDDEN.some(prefix => route === prefix || route.startsWith(`${prefix}/`));
}
