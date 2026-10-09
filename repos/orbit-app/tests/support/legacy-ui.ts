import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

// R04 legacy-ui ratchet: the old ways of drawing UI that the component library
// replaces, counted per file over the TypeScript AST.
export const LEGACY_KINDS = ["alert", "modal", "tablist", "oldComponent", "controls"] as const;
export type LegacyKind = (typeof LEGACY_KINDS)[number];
export type LegacyCounts = Partial<Record<LegacyKind, number>>;

// Old shared components (src/components/<Name>.tsx), replaced by src/components/ui.
export const OLD_COMPONENTS = ["DataCard", "EmptyState", "ErrorState", "LoadingState", "OfflineNotice", "NeedsNetworkState", "SectionHeader", "MetricPill"] as const;

export function legacyCounts(source: string, fileName: string): LegacyCounts {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const counts: LegacyCounts = {};
  const add = (kind: LegacyKind) => { counts[kind] = (counts[kind] ?? 0) + 1; };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "Alert.alert") add("alert");
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === "Modal") add("modal");
    if (ts.isJsxAttribute(node) && node.name.getText(file) === "accessibilityRole" && node.initializer && ts.isStringLiteral(node.initializer) && node.initializer.text === "tablist") add("tablist");
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const from = node.moduleSpecifier.text;
      const base = from.split("/").pop() ?? "";
      if (/(^|\/)components\/[A-Za-z]+$|^\.\.?\/[A-Za-z]+$/.test(from) && (OLD_COMPONENTS as readonly string[]).includes(base) && !from.includes("/ui/")) add("oldComponent");
      if (/design\/controls$/.test(from)) add("controls");
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return counts;
}

const TABLIST_OWNERS = [/^src\/components\/ui\//, /^src\/components\/OrbitTabBar\.tsx$/];

export function legacyByFile(appRoot: string): Record<string, LegacyCounts> {
  const result: Record<string, LegacyCounts> = {};
  for (const root of ["src", "app"]) {
    for (const entry of readdirSync(join(appRoot, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const path = relative(appRoot, join(entry.parentPath, entry.name));
      // The old components' own files and the controls module are what is counted, not users.
      if ((OLD_COMPONENTS as readonly string[]).some((name) => path === `src/components/${name}.tsx`) || path === "src/design/controls.ts") continue;
      const counts = legacyCounts(readFileSync(join(appRoot, path), "utf8"), path);
      // The sanctioned tab lists: the library's Segmented / CategoryTabs and the tab bar.
      if (TABLIST_OWNERS.some((pattern) => pattern.test(path))) delete counts.tablist;
      if (Object.keys(counts).length) result[path] = counts;
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : 1)));
}
