import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const providerSource = readFileSync(
  join(repoRoot, "src", "api", "ApiBaseUrlProvider.tsx"),
  "utf8"
);

// 2026-11-21 language audit: the storage failure is shown in the screen language.
test("API base URL provider exposes storage failures through the dictionary", () => {
  assert.match(providerSource, /"common\.serverUrlReadFailed"/u);
  assert.doesNotMatch(providerSource, /"Could not read saved server address\."/u);
});
