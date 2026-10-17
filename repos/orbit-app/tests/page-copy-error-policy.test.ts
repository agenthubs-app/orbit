import assert from "node:assert/strict";
import test from "node:test";

import { shouldRetainPageCopy } from "../src/data/sync/page-copies";

test("To-do NOT_IMPLEMENTED does not fall back to an old page copy", () => {
  assert.equal(shouldRetainPageCopy({ kind: "failure", error: { code: "NOT_IMPLEMENTED" } }, ["NOT_IMPLEMENTED"]), false);
  assert.equal(shouldRetainPageCopy({ kind: "failure", error: { code: "SERVICE_UNAVAILABLE" } }, ["NOT_IMPLEMENTED"]), true);
  assert.equal(shouldRetainPageCopy({ kind: "offline", error: { code: "ORBIT_APP_NETWORK_ERROR" } }, ["NOT_IMPLEMENTED"]), true);
});
