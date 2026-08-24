import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("event roles route uses the private gate and real screen", () => {
  const source = readFileSync(
    new URL("../app/events/[id]/operations/roles.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /EventRolesScreen/u);
  assert.match(source, /withOrbitPrivateRoute/u);
});
