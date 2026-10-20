import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

import { TaskPlanDemoNotice } from "../src/screens/task/TaskPlanDemoNotice";
import { renderedText } from "./helpers/render";

const base = { completed: 2, confirmedContacts: 3, nextStep: "plan" as const,
  steps: { contacts: true, goal: true, plan: false } };
const actions = { busy: false, error: "", intercept: false, onToggle: () => {}, onContinue: () => {}, onClose: () => {} };

test("Task plan demo has an expanded guide entry and a persisted pill state", () => {
  const expanded = renderedText(<TaskPlanDemoNotice view={{ ...base, bannerCollapsed: false }} {...actions} />);
  assert.match(expanded, /2\s*\/\s*3/u);
  assert.match(expanded, /继续引导/u);
  const pill = renderedText(<TaskPlanDemoNotice view={{ ...base, bannerCollapsed: true }} {...actions} />);
  assert.match(pill, /展开示例/u);
  assert.doesNotMatch(pill, /完成引导后/u);
});
