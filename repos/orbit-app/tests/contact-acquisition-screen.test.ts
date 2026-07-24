import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "contacts", "ContactAcquisitionScreen.tsx"),
  "utf8"
);

test("contact acquisition opens on business card capture", () => {
  assert.match(
    screenSource,
    /useState<ContactAcquisitionMode>\("businessCard"\)/u
  );
  assert.match(
    screenSource,
    /const modes:[\s\S]*mode: "businessCard"[\s\S]*mode: "qr"[\s\S]*mode: "manual"/u
  );
  assert.match(screenSource, /launchCameraAsync/u);
  assert.match(screenSource, /launchImageLibraryAsync/u);
});
