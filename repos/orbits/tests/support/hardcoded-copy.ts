import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// R03 contract D (Web): user-visible text written straight into code under
// app/(app)/app. Counted per file over the TypeScript AST:
//   - hardcoded: string / template literals and JSX text with kana or CJK ideographs,
//     except values inside a translation object ({ zh, ja, en } — the t({...}) form
//     and the copy tables), testID-like props and console.* arguments;
//   - missingJa: translation objects that have zh and en but no non-empty ja.
// Kana, CJK ideographs and half-width katakana (R03 review m4).
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const LANGS = new Set(["zh", "ja", "en"]);
const EXEMPT_PROPS = new Set(["data-testid", "key", "id"]);

function propertyName(node: ts.ObjectLiteralElementLike, file: ts.SourceFile) {
  return node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : node.name?.getText(file);
}

function isTranslationObject(node: ts.Node, file: ts.SourceFile): node is ts.ObjectLiteralExpression {
  if (!ts.isObjectLiteralExpression(node)) return false;
  const names = node.properties.map((p) => propertyName(p, file));
  return names.includes("zh") && names.includes("en") && names.every((n) => n !== undefined && (LANGS.has(n) || n === "kind"));
}

export function scanCopy(source: string, fileName = "file.tsx") {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let hardcoded = 0;
  let missingJa = 0;
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && EXEMPT_PROPS.has(node.name.getText(file))) return;
    if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText(file))) return;
    if (isTranslationObject(node, file)) {
      const ja = node.properties.find((p) => propertyName(p, file) === "ja");
      const jaText = ja && ts.isPropertyAssignment(ja) && (ts.isStringLiteral(ja.initializer) || ts.isNoSubstitutionTemplateLiteral(ja.initializer)) ? ja.initializer.text : ja ? "dynamic" : "";
      if (!jaText.trim()) missingJa += 1;
      return;
    }
    if (ts.isTemplateExpression(node)) {
      // One template is one string, however many ${} it has.
      if ([node.head.text, ...node.templateSpans.map((span) => span.literal.text)].some((text) => CJK.test(text))) hardcoded += 1;
      node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) && CJK.test(node.text)) hardcoded += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { hardcoded, missingJa };
}

export function scanWebCopy(projectRoot: string) {
  const root = join(projectRoot, "app/(app)/app");
  const result: Record<string, { hardcoded: number; missingJa: number }> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const path = join(entry.parentPath, entry.name).slice(projectRoot.length + 1);
    if (path.startsWith("app/(app)/app/orbit-2026/copy/")) continue;
    const counts = scanCopy(readFileSync(join(projectRoot, path), "utf8"), path);
    if (counts.hardcoded || counts.missingJa) result[path] = counts;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : 1)));
}
