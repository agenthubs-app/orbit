import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

// R03 contract D: a user-visible string written straight into code instead of the
// dictionaries or the standard copy. Counted per file by walking the TypeScript AST:
// string / template literals and JSX text containing kana or CJK ideographs.
// Comments are not nodes, so they never count. Exempt:
//   - dictionaries and synced copies (src/i18n/<locale>/**, src/api/{contract,schema,domain,compute,design,copy}/**);
//   - testID / nativeID / key props and console.* arguments (not shown to users).
// Kana, CJK ideographs and half-width katakana (R03 review m4).
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const EXEMPT_FILES = [/^src\/i18n\/(?:ja|zh|en)\//, /^src\/api\/(?:contract|schema|domain|compute|design|copy)\//];
const EXEMPT_PROPS = new Set(["testID", "nativeID", "key"]);

export function hardcodedCopyCount(source: string, fileName = "file.tsx"): number {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && EXEMPT_PROPS.has(node.name.getText(file))) return;
    if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText(file))) return;
    if (ts.isTemplateExpression(node)) {
      // One template is one string, however many ${} it has.
      if ([node.head.text, ...node.templateSpans.map((span) => span.literal.text)].some((text) => CJK.test(text))) count += 1;
      node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) && CJK.test(node.text)) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

export function hardcodedCopyByFile(appRoot: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const root of ["src", "app"]) {
    for (const entry of readdirSync(join(appRoot, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
      const path = relative(appRoot, join(entry.parentPath, entry.name));
      if (EXEMPT_FILES.some((pattern) => pattern.test(path))) continue;
      const count = hardcodedCopyCount(readFileSync(join(appRoot, path), "utf8"), path);
      if (count > 0) counts[path] = count;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}
