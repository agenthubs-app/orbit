import { cloneMockState } from "../mock/state-store";

export type DebugActionStatus = "mock-completed";

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
  return `${input.capabilitySlug}:${input.actionId}`;
}

export function runDebugAction(input: DebugActionInput): DebugActionResult {
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
  const results =
    capabilitySlug === undefined
      ? debugResults
      : debugResults.filter(
          (result) => result.capabilitySlug === capabilitySlug,
        );

  return cloneMockState(results);
}

export function resetDebugActionResults(): DebugActionResult[] {
  debugResults = [];

  return [];
}
