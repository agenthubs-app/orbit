import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createAgentActionQueueService } from "../../features/agent/service-factory";
import { createAppBootstrapService } from "../../features/bootstrap/service-factory";
import { createChatConversationMessageService } from "../../features/chat/service-factory";
import { createContactsListSearchAndFilterService } from "../../features/contacts/service-factory";
import { createDashboardAggregateService } from "../../features/dashboard/service-factory";
import { createEventCrudAndImportService } from "../../features/events/service-factory";
import { createFollowupTaskGenerationService } from "../../features/followups/service-factory";
import { resolveOrbitAiCommandService } from "../../features/orbit-ai/service-factory";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("core service factories expose default mock services and controlled live failures", () => {
  assert.equal(createAppBootstrapService().getAppBootstrap().success, true);
  assert.equal(
    createContactsListSearchAndFilterService().listContacts().success,
    true,
  );
  assert.equal(createEventCrudAndImportService().listEvents().success, true);
  assert.equal(createFollowupTaskGenerationService().listTasks().success, true);
  assert.equal(
    createDashboardAggregateService().getDashboardAggregate().success,
    true,
  );
  assert.equal(createAgentActionQueueService().listActions().success, true);
  assert.equal(
    createChatConversationMessageService().listConversations().success,
    true,
  );

  const liveOrbitAi = resolveOrbitAiCommandService("live");

  assert.equal(liveOrbitAi.success, false);
  if (!liveOrbitAi.success) {
    assert.equal(liveOrbitAi.error.code, "NOT_IMPLEMENTED");
    assert.equal(liveOrbitAi.error.capabilityId, "orbit-ai-command");
    assert.equal(liveOrbitAi.error.requestedMode, "live");
    assert.deepEqual(liveOrbitAi.error.availableModes, ["mock"]);
  }
});

test("product entry and core API routes consume service factories instead of direct mocks", () => {
  const runtimeFiles = [
    "app/(app)/app/orbit-ai-command-center.tsx",
    "app/api/app/bootstrap/route.ts",
    "app/api/contacts/route.ts",
    "app/api/events/route.ts",
    "app/api/tasks/route.ts",
    "app/api/agent/actions/route.ts",
    "app/api/chat/conversations/route.ts",
    "app/api/dashboard/route.ts",
  ];

  for (const path of runtimeFiles) {
    const contents = source(path);

    assert.doesNotMatch(
      contents,
      /from ["'][^"']*mock(?:-[^"']*)?-service["']/,
      `${path} must use a service factory instead of importing a mock service`,
    );
    assert.doesNotMatch(
      contents,
      /createMock[A-Z]\w*Service/,
      `${path} must not instantiate mock services directly`,
    );
  }
});

test("orbit AI mock composition resolves core dependencies through replaceable factories", () => {
  const contents = source("features/orbit-ai/mock-service.ts");

  assert.match(contents, /createAppBootstrapService/);
  assert.match(contents, /createContactsListSearchAndFilterService/);
  assert.match(contents, /createEventCrudAndImportService/);
  assert.match(contents, /createFollowupTaskGenerationService/);
  assert.match(contents, /createDashboardAggregateService/);
  assert.match(contents, /createAgentActionQueueService/);
  assert.doesNotMatch(contents, /from ["']\.\.\/[^"']*\/mock-service["']/);
});
