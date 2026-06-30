import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function readProjectFile(pathFromRoot: string): string {
  return readFileSync(join(projectRoot, pathFromRoot), "utf8");
}

function assertContractHasNoMockFixtures(
  pathFromRoot: string,
  options?: { allowFixtureSourceReference?: boolean },
): void {
  const source = readProjectFile(pathFromRoot);

  assert.doesNotMatch(
    source,
    /\b(?:Maya|Diego)\b/,
    `${pathFromRoot} should not contain demo relationship identities`,
  );
  assert.doesNotMatch(
    source,
    /export\s+const\s+mock[A-Z]/,
    `${pathFromRoot} should not export mock fixture records`,
  );
  assert.doesNotMatch(
    source,
    /const\s+fixtureCollectedAt\b/,
    `${pathFromRoot} should not build fixture provenance`,
  );
  assert.doesNotMatch(
    source,
    /from\s+["'][^"']*fixtures?["']/,
    `${pathFromRoot} should not re-export or import fixture modules`,
  );

  if (!options?.allowFixtureSourceReference) {
    assert.doesNotMatch(
      source,
      /_FIXTURE_SOURCE\b/,
      `${pathFromRoot} should keep fixture source constants with fixture data`,
    );
  }
}

test("Orbit AI live runtime files do not depend directly on mock implementations or demo identities", () => {
  const liveService = readProjectFile(
    "features/orbit-ai/live-conversation-service.ts",
  );
  const liveTrace = readProjectFile("features/orbit-ai/live-conversation-trace.ts");
  const modelProvider = readProjectFile("features/orbit-ai/gemini-provider.ts");

  for (const [label, source] of [
    ["live service", liveService],
    ["live trace", liveTrace],
  ] as const) {
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*mock-[^"']*["']/,
      `${label} should receive mock/demo behavior through an injected contract, not import mock implementations directly`,
    );
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*shared\/mock[^"']*["']/,
      `${label} should not import shared mock fixture data`,
    );
  }

  assert.doesNotMatch(
    liveService,
    /\b(?:Maya|Diego)\b/,
    "live conversation guardrails should not hard-code demo contact names",
  );
  assert.doesNotMatch(
    modelProvider,
    /\b(?:Maya|Diego)\b/,
    "live model provider prompts should use generic routing examples, not demo contact names",
  );
});

test("live conversation and trace share the same AI Agent runtime", () => {
  const liveService = readProjectFile(
    "features/orbit-ai/live-conversation-service.ts",
  );
  const liveTrace = readProjectFile("features/orbit-ai/live-conversation-trace.ts");
  const plannerTraceRoute = readProjectFile("app/api/dev/orbit-agent/trace/route.ts");

  for (const [label, source] of [
    ["live conversation service", liveService],
    ["live trace", liveTrace],
    ["planner trace route", plannerTraceRoute],
  ] as const) {
    assert.match(
      source,
      /runLiveOrbitAgentRuntime/,
      `${label} should delegate planner/tool/artifact/synthesis execution to the shared runtime`,
    );
    assert.doesNotMatch(
      source,
      /createGeminiOrbitAgentPlanner|planner\.plan|planner\.synthesize|function artifactForRequest|function toolRequestsForPlannerResult|function conversationForSuccess|function toolFamilyForToolName|createOrbitAgentLiveArtifactTaskService/,
      `${label} should not duplicate the shared AI Agent runtime execution path`,
    );
  }
});

test("Shared AI provider contract does not carry mock fixture records", () => {
  const providerContract = readProjectFile("shared/ai/provider.ts");

  assert.doesNotMatch(
    providerContract,
    /\b(?:Maya|Diego)\b/,
    "shared AI provider contract should not contain demo relationship identities",
  );
  assert.doesNotMatch(
    providerContract,
    /mockAiProvider(?:Runs|Fixture|Provenance|FailureProvenance|EmptyAiProviderFixture|PendingAiProviderFixture)/,
    "shared AI provider contract should not export mock fixture records",
  );
  assert.doesNotMatch(
    providerContract,
    /createMockInputHash|buildMockAiRunProvenance/,
    "shared AI provider contract should not build mock run provenance",
  );
});

test("Message draft generator contract does not carry mock fixture records", () => {
  assertContractHasNoMockFixtures("features/followups/message-draft-contract.ts");
});

test("Chat agent adjacent contracts do not carry mock fixture records", () => {
  for (const pathFromRoot of [
    "features/chat/contract.ts",
    "features/chat/assist-contract.ts",
    "features/chat/summary-contract.ts",
    "features/chat/privacy-contract.ts",
    "features/followups/contract.ts",
    "features/orbit-ai/artifact-contract.ts",
    "features/orbit-ai/conversation-contract.ts",
  ]) {
    assertContractHasNoMockFixtures(pathFromRoot);
  }
});
