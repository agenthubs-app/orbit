import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const providerSource = readFileSync(
  join(repoRoot, "src", "api", "ApiBaseUrlProvider.tsx"),
  "utf8"
);

test("API base URL provider exposes storage failures in Chinese", () => {
  assert.match(providerSource, /"无法读取已保存的服务器地址。"/u);
  assert.doesNotMatch(providerSource, /"Could not read saved server address\."/u);
});
