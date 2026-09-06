import assert from "node:assert/strict";
import test from "node:test";
import { createAgentNaturalLanguageActionProposalService } from "../../features/agent/natural-language-actions/service";
import { createAgentCalendarExecutorAdapter } from "../../features/agent/runtime/calendar-executor-adapter";
import { createAgentDomainExecutors, type AgentDomainExecutorDependencies } from "../../features/agent/runtime/domain-executors";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import type { OrbitIntegrationService } from "../../features/integrations/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

for (const provider of ["google_calendar", "microsoft_graph"] as const) {
  test(`${provider} undo uses persisted execution identity after runtime reconstruction and retries failures`, async () => {
    const creates: Parameters<OrbitIntegrationService["createCalendarEvent"]>[0][] = [];
    const deletes: Parameters<OrbitIntegrationService["deleteCalendarEvent"]>[0][] = [];
    let failDelete = true;
    const calendar = createAgentCalendarExecutorAdapter({
      async createCalendarEvent(input) {
        creates.push(input);
        return { providerRecordId: "provider-created/event:123" };
      },
      async deleteCalendarEvent(input) {
        deletes.push(input);
        if (failDelete) throw new Error("temporary provider outage");
      },
    });
    const store = createMemoryLiveRecordStore<{ entity: unknown }>();
    const makeRuntime = () => createAgentRuntimeService({
      repository: createStorageAgentRuntimeRepository({ store, workspaceId: `calendar-test:${provider}:actor:one` }),
      executors: createAgentExecutorRegistry(createAgentDomainExecutors({ calendar } as AgentDomainExecutorDependencies)),
    });
    const runtime = makeRuntime();
    const proposal = await createAgentNaturalLanguageActionProposalService({
      runtime,
      externalCalendarWritesEnabled: true,
      permissionGuard: { async assertPermission() {} },
    }).propose({
      conversationId: `conversation:${provider}`,
      message: "创建项目会议",
      requests: [{
        capabilityId: "calendar.syncEvent",
        requiresUserConfirmation: true,
        arguments: { provider, title: "项目会议", startsAt: "2030-05-20T00:00:00.000Z", endsAt: "2030-05-20T01:00:00.000Z" },
      }],
    });
    const action = proposal.actions[0]!;
    assert.equal(action.compensation.supported, true);
    assert.equal(creates.length, 0);
    await assert.rejects(runtime.undoAction(action.actionId));
    assert.equal(deletes.length, 0);
    await runtime.approveAction({ actionId: action.actionId, actorLabel: "test actor" });
    assert.equal(creates.length, 0);
    assert.equal((await runtime.processOutbox({ actionId: action.actionId })).completed, 1);
    assert.equal(creates.length, 1);
    assert.equal(creates[0].provider, provider);

    const restarted = makeRuntime();
    await assert.rejects(restarted.undoAction(action.actionId), /temporary provider outage/);
    assert.equal((await restarted.getRun(action.runId))?.actions[0].status, "completed");
    failDelete = false;
    assert.equal((await restarted.undoAction(action.actionId)).status, "undone");
    assert.equal((await restarted.undoAction(action.actionId)).status, "undone");
    assert.equal(deletes.length, 2);
    assert.deepEqual(deletes[0], {
      provider,
      providerRecordId: "provider-created/event:123",
      idempotencyKey: `undo:${action.operations[0].idempotencyKey}`,
    });
    assert.deepEqual(deletes[1], deletes[0]);
    assert.equal(creates.length, 1);
  });
}

test("calendar compensation cannot delete a payload-supplied event without a successful receipt", async () => {
  let deletes = 0;
  const calendar = createAgentCalendarExecutorAdapter({
    async createCalendarEvent() { return { providerRecordId: "created" }; },
    async deleteCalendarEvent() { deletes += 1; },
  });
  const executor = createAgentDomainExecutors({ calendar } as AgentDomainExecutorDependencies)
    .find((item) => item.key === "calendar.syncEvent")!;
  for (const resultRef of [undefined, "contacts:unrelated", "calendar:"]) {
    await assert.rejects(executor.compensate!({ providerRecordId: "unrelated-calendar-event" }, {
      actionId: "action", runId: "run", operationId: "operation", idempotencyKey: "undo:key", now: new Date().toISOString(), resultRef,
    }), /cannot be compensated/);
  }
  assert.equal(deletes, 0);
});
