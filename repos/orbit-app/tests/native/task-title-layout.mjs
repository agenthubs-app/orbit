import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Read-only Simulator regression. Capture `idb ui describe-all` after opening a
// task whose title is known to wrap at the chosen device width and system size.
// Arguments: AX JSON path, expected full title, minimum rendered height in pt.
// It deliberately does not create or edit a task to manufacture a native sample.
const [capturePath, expectedTitle, minimumHeight] = process.argv.slice(2);
assert.ok(capturePath && expectedTitle && Number(minimumHeight) > 0,
  "Usage: node tests/native/task-title-layout.mjs capture.json 'full title' minimumHeight");
const nodes = JSON.parse(readFileSync(capturePath, "utf8"));
const title = nodes.find(node => node.type === "TextArea" && node.AXLabel === "待办标题" && node.frame.x >= 0);
assert.ok(title, "task title is present on the current native screen");
assert.equal(title.AXValue, expectedTitle, "the complete task title reaches the editor");
assert.ok(title.frame.height >= Number(minimumHeight),
  `native multiline title is clipped: expected at least ${minimumHeight}pt, got ${title.frame.height}pt`);
console.log(`Native task title: full value, ${title.frame.height}pt height; minimum ${minimumHeight}pt.`);
