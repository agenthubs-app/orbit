import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("event admission review route uses the private gate and real screen", () => {
  const source = readFileSync(
    new URL("../app/events/[id]/operations/admission.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /EventAdmissionReviewScreen/u);
  assert.match(source, /withOrbitPrivateRoute/u);
});
