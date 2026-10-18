import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createSourceFile, forEachChild, isJsxAttribute, isJsxOpeningElement, isJsxSelfClosingElement, isStringLiteral, ScriptKind, ScriptTarget, type Node } from "typescript";

test("R20a replacement Todo and Calendar screens use the kit content inset", () => {
  for (const path of ["src/screens/todo/TodoScreen.tsx", "src/screens/calendar/CalendarScreen.tsx"]) {
    const source = createSourceFile(path, readFileSync(path, "utf8"), ScriptTarget.Latest, true, ScriptKind.TSX);
    let openings = 0;
    const visit = (node: Node) => {
      if ((isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "AppScreen") {
        openings++;
        const inset = node.attributes.properties.find(attribute => isJsxAttribute(attribute) && attribute.name.getText(source) === "inset");
        assert.ok(inset && isJsxAttribute(inset) && inset.initializer && isStringLiteral(inset.initializer) && inset.initializer.text === "kit", path);
      }
      forEachChild(node, visit);
    };
    visit(source);
    assert.ok(openings > 0, `${path} has no AppScreen`);
  }
});
