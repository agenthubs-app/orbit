import { cloneMockState } from "../mock/state-store";

export type DebugActionStatus = "mock-completed";

// debug-action-runner 是 dev-only 的本地动作记录器。
// 它模拟“点击调试动作后产生结果”的流程，但只写入进程内存，不触发外部 provider。
export interface DebugActionInput {
  capabilitySlug: string;
  actionId: string;
  label: string;
  payload: Record<string, unknown>;
  evidence?: string[];
}

export interface DebugActionResult {
  id: string;
  capabilitySlug: string;
  actionId: string;
  label: string;
  status: DebugActionStatus;
  summary: string;
  evidence: string[];
  payload: Record<string, unknown>;
}

let debugResults: DebugActionResult[] = [];

function resultIdFor(input: DebugActionInput): string {
  // capability + action 构成幂等 key；重复执行同一动作会覆盖旧结果。
  return `${input.capabilitySlug}:${input.actionId}`;
}

export function runDebugAction(input: DebugActionInput): DebugActionResult {
  // payload clone 后存储，避免 debug 面板持有同一对象引用造成后续展示漂移。
  const result: DebugActionResult = {
    id: resultIdFor(input),
    capabilitySlug: input.capabilitySlug,
    actionId: input.actionId,
    label: input.label,
    status: "mock-completed",
    summary: `${input.label} completed for ${input.capabilitySlug} and stayed inside local runtime memory.`,
    evidence:
      input.evidence && input.evidence.length > 0
        ? [...input.evidence]
        : ["local-debug-memory"],
    payload: cloneMockState(input.payload),
  };

  const existingResultIndex = debugResults.findIndex(
    (existingResult) => existingResult.id === result.id,
  );

  debugResults =
    existingResultIndex === -1
      ? [...debugResults, result]
      : debugResults.map((existingResult, index) =>
          index === existingResultIndex ? result : existingResult,
        );

  return cloneMockState(result);
}

export function listDebugActionResults(
  capabilitySlug?: string,
): DebugActionResult[] {
  // 不传 capabilitySlug 时列出全部；传入时只返回该 capability 的调试动作。
  const results =
    capabilitySlug === undefined
      ? debugResults
      : debugResults.filter(
          (result) => result.capabilitySlug === capabilitySlug,
        );

  return cloneMockState(results);
}

export function resetDebugActionResults(): DebugActionResult[] {
  // reset 只清空内存记录，和 mock data reset/scenario reset 是两个不同层级。
  debugResults = [];

  return [];
}
