import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const apiResourceSource = readFileSync(
  join(repoRoot, "src", "hooks", "useApiResource.ts"),
  "utf8"
);

test("useApiResource unexpected error fallback is Chinese", () => {
  assert.match(apiResourceSource, /请求暂时无法完成，请稍后重试。/u);
  assert.doesNotMatch(apiResourceSource, /Unexpected request error/u);
});
