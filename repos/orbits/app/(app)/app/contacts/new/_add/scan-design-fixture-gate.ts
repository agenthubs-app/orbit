/** R12 像素门禁只读演示的开关（服务端判断；渲染在 scan-design-fixtures.tsx）。生产环境永远关闭。 */
export const SCAN_DESIGN_FIXTURES = ["design-reading", "design-review", "design-done", "design-missing", "design-expired", "design-cancelled"] as const;
export type ScanDesignFixture = (typeof SCAN_DESIGN_FIXTURES)[number];

/** Non-production with `ORBIT_REDESIGN_MOCK` naming `add-scan` (or `all`). */
export function scanDesignFixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return false;
  const listed = (env.ORBIT_REDESIGN_MOCK ?? "").split(",").map((entry) => entry.trim());
  return listed.includes("all") || listed.includes("add-scan");
}

export function isScanDesignFixture(name: string): name is ScanDesignFixture {
  return (SCAN_DESIGN_FIXTURES as readonly string[]).includes(name);
}
