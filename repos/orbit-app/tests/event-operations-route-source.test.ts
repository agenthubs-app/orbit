import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("event operations route uses the private gate and native screen", () => {
  const source = readFileSync(new URL("../app/events/[id]/operations.tsx", import.meta.url), "utf8");
  assert.match(source, /EventOperationsScreen/u);
  assert.match(source, /withOrbitPrivateRoute/u);
});
