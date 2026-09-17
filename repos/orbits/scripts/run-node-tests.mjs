import { spawnSync } from "node:child_process";
import { assertLocalTestDatabases } from "./assert-local-test-databases.mjs";

try {
  assertLocalTestDatabases();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const defaultTestPatterns = ["tests/**/*.test.{ts,tsx}"];
const testTargets = process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  ["--test", "--import", "tsx", ...(testTargets.length > 0 ? testTargets : defaultTestPatterns)],
  {
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
