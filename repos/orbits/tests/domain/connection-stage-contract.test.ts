import assert from "node:assert/strict";
import test from "node:test";
import { crossClientContractCompatibility } from "../contract-compatibility.typecheck";

import {
  CONNECTION_STAGE_VALUES,
  isConnectionStage,
  isRelationshipStage,
} from "../../shared/domain/source-types";

test("canonical connection stages contain only four relationship stages", () => {
  assert.deepEqual([...CONNECTION_STAGE_VALUES], [
    "needs_follow_up",
    "active",
    "nurture",
    "archived",
  ]);
  for (const stage of CONNECTION_STAGE_VALUES) {
    assert.equal(isConnectionStage(stage), true);
  }
});

test("canonical parsing rejects acquisition states while legacy parsing preserves them", () => {
  for (const stage of ["captured", "reviewing"]) {
    assert.equal(isConnectionStage(stage), false);
    assert.equal(isRelationshipStage(stage), true);
  }
});

test("canonical parsing rejects unknown and non-string input", () => {
  for (const value of [undefined, null, 1, {}, [], "", "ACTIVE", " active", "unknown"]) {
    assert.equal(isConnectionStage(value), false);
  }
});

test("canonical stage compatibility participates in the compile-time assertion", () => {
  assert.equal(crossClientContractCompatibility.connectionStage, true);
});
