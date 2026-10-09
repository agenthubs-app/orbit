// RD-15: component and icon showcases are visible locally and on Vercel preview /
// staging, hidden in production. A production build outside Vercel (no
// VERCEL_ENV) is treated as production: the showcase fails closed.
export function shouldHideShowcase(env: { NODE_ENV?: string; VERCEL_ENV?: string }) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}
