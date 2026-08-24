import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("event center route uses the shared private-route gate", () => {
  const source = readFileSync(
    new URL("../app/events/center.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /EventCenterScreen/u);
  assert.match(source, /withOrbitPrivateRoute/u);
});
