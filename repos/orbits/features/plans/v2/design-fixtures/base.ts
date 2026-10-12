/**
 * 设计稿示例 fixture 的构造工具：以演示世界为底（`demoPlanV2State`），按画板改数据。只在本机 mock 模式经开发接口使用。
 */
import { demoPlanV2State } from "../mock-seed";
import type { PlanEventFact } from "../overview";
import type { MemoryPlanV2State } from "../repository";

export type PlanDesignFixture = () => Partial<MemoryPlanV2State>;
/** 可选：同名 fixture 的会える活動事实（不给就用演示世界的 3 场）。 */
export type PlanDesignEventFacts = () => PlanEventFact[];

/** 演示世界的一份深拷贝，各 fixture 在它上面改。 */
export function demoBase(): Partial<MemoryPlanV2State> {
  return structuredClone(demoPlanV2State());
}

/** 以演示世界为底，交给 `edit` 就地修改后返回。 */
export function fromDemo(edit: (state: Partial<MemoryPlanV2State>) => void): PlanDesignFixture {
  return () => {
    const state = demoBase();
    edit(state);
    return state;
  };
}

/** 同名 fixture 在概要上要出「完了しましたか？」的 Step key（示例数据不必真的达标；只在 mock 由 service-factory 加上）。 */
export type PlanDesignStepSuggestions = readonly string[];
