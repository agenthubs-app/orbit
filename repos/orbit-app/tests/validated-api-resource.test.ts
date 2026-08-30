import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  validateApiResourceState,
  type ValidatedApiResourceInputState
} from "../src/api/validated-resource-state";

const schema = z.object({
  schemaVersion: z.literal(1),
  name: z.string()
});

const meta = {
  featureMode: "live" as const,
  privacy: null,
  runtimeBoundary: null
};

function successState(data: unknown): ValidatedApiResourceInputState {
  return {
    kind: "success",
    data,
    meta,
    status: 200,
    refresh: () => undefined,
    refreshing: false
  };
}

test("validates a successful API resource with the shared schema", () => {
  const state = validateApiResourceState(
    successState({ schemaVersion: 1, name: "小雨" }),
    schema
  );

  assert.equal(state.kind, "success");
  if (state.kind === "success") {
    assert.deepEqual(state.data, { schemaVersion: 1, name: "小雨" });
  }
});

test("turns a contract mismatch into a visible failure state", () => {
  const state = validateApiResourceState(
    successState({ schemaVersion: 2, name: "小雨" }),
    schema
  );

  assert.equal(state.kind, "failure");
  if (state.kind === "failure") {
    assert.equal(state.error.code, "ORBIT_APP_CONTRACT_MISMATCH");
    assert.equal(state.status, 200);
    assert.equal(state.refreshing, false);
  }
});

test("preserves non-data resource states", () => {
  const loading: ValidatedApiResourceInputState = {
    kind: "loading",
    refresh: () => undefined,
    refreshing: true
  };

  assert.equal(validateApiResourceState(loading, schema), loading);
});
