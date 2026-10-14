import assert from "node:assert/strict";
import test from "node:test";

import { addDesignMock } from "../src/screens/add/add-design-mock";
import { densityMarks } from "../src/screens/add/manual-model";

test("addDesignMock: only in a dev build and only for the names listed (or all)", () => {
  assert.equal(addDesignMock("no-keyboard", "add-scan,no-keyboard", true), true);
  assert.equal(addDesignMock("add-scan", " all ", true), true);
  assert.equal(addDesignMock("no-keyboard", "add-scan", true), false);
  assert.equal(addDesignMock("no-keyboard", undefined, true), false);
  assert.equal(addDesignMock("no-keyboard", "no-keyboard", false), false, "never in a release build");
});

test("densityMarks: ●○○ / ●●○ / ●●●", () => {
  assert.equal(densityMarks(1), "●○○");
  assert.equal(densityMarks(2), "●●○");
  assert.equal(densityMarks(3), "●●●");
});
