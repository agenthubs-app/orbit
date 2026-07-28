import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "admin", "AdminLoginScreen.tsx"),
  "utf8"
);

test("admin login screen uses account auth without simulated mail state", () => {
  assert.match(screenSource, /useOrbitAuthSession/u);
  assert.match(screenSource, /view\.primaryHref/u);
  assert.doesNotMatch(screenSource, /setSent|TextInput|已发送至|mail/u);
  assert.doesNotMatch(screenSource, /directHref|skipLabel/u);
});
