import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { legacyTaskRedirect } from "../src/view-models/app-navigation";

test("legacy personal-task list enters the new calendar instead of showing a Chinese-only old page", () => {
  assert.equal(legacyTaskRedirect("/tasks/personal"), "/task?seg=calendar");
  const route = readFileSync(join(import.meta.dirname, "../app/tasks/personal.tsx"), "utf8");
  assert.match(route, /LegacyTaskRedirect/u);
  assert.doesNotMatch(route, /待办|PersonalScheduleList/u);
});
