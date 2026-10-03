import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const contactAcquisitionSource = readFileSync(
  join(
    repoRoot,
    "src",
    "screens",
    "contacts",
    "ContactAcquisitionScreen.tsx"
  ),
  "utf8"
);

// AppScreen's back target is measured and clicked in app-wide-primitives.test.ts.
// The old literal-height source assertion rejected shared tokens and minHeight.

test("contact acquisition controls keep the 44 point touch baseline", () => {
  // Sprint 0140: the source tabs became full-width entry rows (64 pt).
  assert.match(contactAcquisitionSource, /entryRow: \{[^}]*minHeight: 64/u);
  for (const styleName of [
    "primaryButton",
    "secondaryButton",
    "scannerCloseButton"
  ]) {
    assert.match(
      contactAcquisitionSource,
      new RegExp(`${styleName}:[\\s\\S]*?minHeight: 44`, "u")
    );
  }
});
