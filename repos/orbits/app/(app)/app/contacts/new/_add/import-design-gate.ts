/** R16 像素门禁只读演示的开关（服务端判断；渲染在 import-design-demo.tsx）。生产环境永远关闭。 */
export const IMPORT_DESIGN_FIXTURES = [
  "design-linkedin-upload",
  "design-vcard-upload",
  "design-linkedin-mapping",
  "design-csv-mapping",
  "design-linkedin-review",
  "design-event",
] as const;
export type ImportDesignFixture = (typeof IMPORT_DESIGN_FIXTURES)[number];

/** Non-production with `ORBIT_REDESIGN_MOCK` naming `add-import`, `add-scan` (the same local gate server) or `all`. */
export function importDesignFixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return false;
  const listed = (env.ORBIT_REDESIGN_MOCK ?? "").split(",").map((entry) => entry.trim());
  return listed.includes("all") || listed.includes("add-import") || listed.includes("add-scan");
}

export function isImportDesignFixture(name: string): name is ImportDesignFixture {
  return (IMPORT_DESIGN_FIXTURES as readonly string[]).includes(name);
}
