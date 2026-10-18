import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { createSourceFile, forEachChild, isJsxAttribute, isJsxOpeningElement, isJsxSelfClosingElement, isStringLiteral, ScriptKind, ScriptTarget, type Node } from "typescript";

test("R18a replacement App screens use the kit content inset", () => {
  let openings = 0;
  for (const file of readdirSync("src/screens/me").filter(name => name.endsWith(".tsx"))) {
    const path = `src/screens/me/${file}`;
    const source = createSourceFile(path, readFileSync(path, "utf8"), ScriptTarget.Latest, true, ScriptKind.TSX);
    const visit = (node: Node) => {
      if ((isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "AppScreen") {
        openings++;
        const inset = node.attributes.properties.find(attribute => isJsxAttribute(attribute) && attribute.name.getText(source) === "inset");
        assert.ok(inset && isJsxAttribute(inset) && inset.initializer && isStringLiteral(inset.initializer) && inset.initializer.text === "kit", path);
      }
      forEachChild(node, visit);
    };
    visit(source);
  }
  assert.ok(openings >= 10, "R18a AppScreen call sites disappeared from the replacement screens");
});
