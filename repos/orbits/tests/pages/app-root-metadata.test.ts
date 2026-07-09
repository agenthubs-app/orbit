import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { metadata } from "../../app/layout";

test("root metadata exposes a browser tab icon", () => {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const iconPath = path.join(projectRoot, "app/icon.svg");

  assert.equal(fs.existsSync(iconPath), true, "expected app/icon.svg to exist");
  assert.deepEqual((metadata as { icons?: unknown }).icons, {
    apple: "/icon.svg",
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  });
});
