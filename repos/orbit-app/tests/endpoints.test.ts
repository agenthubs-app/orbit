import assert from "node:assert/strict";
import test from "node:test";
import { ORBIT_API_ENDPOINTS } from "../src/api/endpoints";

test("Orbit API endpoints expose the proactive Orbit AI chat turn route", () => {
  assert.equal(ORBIT_API_ENDPOINTS.proactiveTurns, "/api/ai/proactive-turns");
});
