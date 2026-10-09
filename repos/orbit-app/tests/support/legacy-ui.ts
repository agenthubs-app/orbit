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

// Counted by symbol, not by spelling (R04 review M4): `Alert` and `Modal` are
// followed through their react-native import, whatever the local name (`Modal as
// Sheet`, `import * as RN` → `RN.Alert`), and every use counts (`Alert.alert(…)`,
// `const { alert } = Alert`, `<Sheet>`). A tab list is `accessibilityRole` or
// `role` set to "tablist" in any form (attribute, expression, props object). Old
// components and design/controls count on import and on re-export.
export function legacyCounts(source: string, fileName: string): LegacyCounts {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const counts: LegacyCounts = {};
  const add = (kind: LegacyKind) => { counts[kind] = (counts[kind] ?? 0) + 1; };
  const locals = new Map<string, "alert" | "modal">();
  const namespaces = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "react-native") continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) namespaces.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        if (imported === "Alert") locals.set(element.name.text, "alert");
        if (imported === "Modal") locals.set(element.name.text, "modal");
      }
    }
  }
  const isTablist = (node: ts.Node | undefined): boolean => {
    if (!node) return false;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text === "tablist";
    if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node)) return isTablist(node.expression);
    if (ts.isConditionalExpression(node)) return isTablist(node.whenTrue) || isTablist(node.whenFalse);
    if (ts.isAsExpression(node)) return isTablist(node.expression);
    return false;
  };
  const roleName = (name: string) => name === "accessibilityRole" || name === "role";
  const visit = (node: ts.Node) => {
    // A use of an imported Alert / Modal binding (not the import itself, not a closing tag).
    if (ts.isIdentifier(node) && locals.has(node.text) && !ts.isImportSpecifier(node.parent) && !ts.isJsxClosingElement(node.parent)
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) add(locals.get(node.text)!);
    // RN.Alert / RN.Modal through a namespace or default import.
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text) && !ts.isJsxClosingElement(node.parent)) {
      if (node.name.text === "Alert") add("alert");
      if (node.name.text === "Modal") add("modal");
    }
    if (ts.isJsxAttribute(node) && roleName(node.name.getText(file)) && isTablist(node.initializer)) add("tablist");
    if (ts.isPropertyAssignment(node) && roleName(node.name.getText(file).replace(/["']/g, "")) && isTablist(node.initializer)) add("tablist");
    const from = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
    if (from !== null) {
      const base = from.split("/").pop() ?? "";
      if (/(^|\/)components\/[A-Za-z]+$|^\.\.?\/[A-Za-z]+$/.test(from) && (OLD_COMPONENTS as readonly string[]).includes(base) && !from.includes("/ui/")) add("oldComponent");
      if (/design\/controls$/.test(from)) add("controls");
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return counts;
}

// The three sanctioned tab lists (and only these files): the library's Segmented /
// SwipeSegments, its CategoryTabs, and the tab bar (R04 review M4 narrowed this).
const TABLIST_OWNERS = [/^src\/components\/ui\/Segmented\.tsx$/, /^src\/components\/ui\/Filters\.tsx$/, /^src\/components\/OrbitTabBar\.tsx$/];

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
