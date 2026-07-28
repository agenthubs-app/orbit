import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const appScreenSource = readFileSync(
  join(repoRoot, "src", "components", "AppScreen.tsx"),
  "utf8"
);
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

test("shared mobile back navigation keeps a 44 by 44 touch target", () => {
  assert.match(
    appScreenSource,
    /backButton:[\s\S]*height: 44[\s\S]*width: 44/u
  );
});

test("contact acquisition controls keep the 44 point touch baseline", () => {
  for (const styleName of [
    "modeButton",
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
