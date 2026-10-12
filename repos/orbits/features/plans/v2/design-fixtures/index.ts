/**
 * 计划 v2 设计稿示例 fixture 汇总（见同目录 README）。只被 `app/api/dev/plan-design-fixture/route.dev.ts` 引用。
 */
import { eventFactsA, fixturesA, stepSuggestionsA } from "./a";
import { eventFactsB, fixturesB } from "./b";
import { eventFactsC, fixturesC } from "./c";
import type { PlanDesignEventFacts, PlanDesignFixture, PlanDesignStepSuggestions } from "./base";

export const PLAN_DESIGN_FIXTURES: Readonly<Record<string, PlanDesignFixture>> = { ...fixturesA, ...fixturesB, ...fixturesC };

export const PLAN_DESIGN_EVENT_FACTS: Readonly<Record<string, PlanDesignEventFacts>> = { ...eventFactsA, ...eventFactsB, ...eventFactsC };

export const PLAN_DESIGN_STEP_SUGGESTIONS: Readonly<Record<string, PlanDesignStepSuggestions>> = { ...stepSuggestionsA };
