import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import config from "../app.config";

test("the native app allows both system appearances instead of forcing light", () => {
  assert.equal(config.userInterfaceStyle, "automatic");
});

// Whole-screen imports include native camera, notification and router modules,
// so this one wiring guard complements theme-render.test.tsx. A renderer that
// imports the fixed light palette bypasses live appearance updates entirely.
test("native renderers cannot bypass system appearance with the static light palette", () => {
  const sourceRoot = join(process.cwd(), "src");
  const offenders: string[] = [];
  for (const entry of readdirSync(sourceRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    const path = join(entry.parentPath, entry.name);
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (!statement.moduleSpecifier.text.endsWith("design/tokens")) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.some((item) =>
        !item.isTypeOnly && (item.propertyName ?? item.name).text === "colors"
      )) offenders.push(path.slice(sourceRoot.length + 1));
    }
  }
  assert.deepEqual(offenders, [], "these renderers would stay light after an OS theme change");
});
