import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the Orbit AI proactive agent`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

function assertNoDeliveryOrProviderCalls(filePath: string): void {
  const source = readFileSync(join(projectRoot, filePath), "utf8");

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(source, /APNs|FCM|firebase|pushManager|showNotification/i);
  assert.doesNotMatch(source, /sendgrid|postmark|gmail|calendar\.google/i);
  assert.doesNotMatch(source, /OpenAI|Anthropic|DeepSeek|Gemini|Pinecone|Weaviate|Qdrant/);
  assert.doesNotMatch(source, /createClient|Supabase/i);
}

test("Orbit AI proactive agent contract exposes chat-window delivery boundaries", async () => {
  const contract = await importProjectModule<{
    ORBIT_AI_PROACTIVE_AGENT_DELIVERY_SURFACES: readonly string[];
    ORBIT_AI_PROACTIVE_AGENT_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    ORBIT_AI_PROACTIVE_AGENT_SIGNAL_TYPES: readonly string[];
  }>("features/orbit-ai/proactive-contract.ts");

  assert.deepEqual(contract.ORBIT_AI_PROACTIVE_AGENT_SIGNAL_TYPES, [
    "calendar_event_upcoming",
    "calendar_event_changed",
    "followup_due",
    "relationship_opportunity",
    "system_status",
  ]);
  assert.deepEqual(contract.ORBIT_AI_PROACTIVE_AGENT_DELIVERY_SURFACES, [
    "orbit_ai_chat",
  ]);
  assert.equal(
    contract.ORBIT_AI_PROACTIVE_AGENT_ERROR_DEFINITIONS
      .ORBIT_AI_PROACTIVE_AGENT_SIGNAL_REQUIRED.appCode,
    "VALIDATION_ERROR",
  );
});

test("mock Orbit AI proactive agent turns a calendar signal into an assistant chat message", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAiProactiveAgentService: () => {
      createProactiveTurn: (input: {
        signal?: {
          body?: string;
          evidenceIds?: readonly string[];
          occursAt?: string;
          severity?: string;
          signalId?: string;
          sourceModule?: string;
          sourceRef?: { id: string; label: string; type: string };
          title?: string;
          type?: string;
        } | null;
      }) => {
        success: boolean;
        data?: {
          message: {
            content: string;
            deliverySurface: string;
            role: string;
            sourceSignalId: string;
            turnKind: string;
          };
          nextAction: string;
          provenance: {
            evidenceIds: readonly string[];
            safety: {
              aiProviderRequested: false;
              calendarProviderRequested: false;
              emailProviderRequested: false;
              externalNetworkRequested: false;
              externalSideEffectsExecuted: false;
              liveDatabaseWriteExecuted: false;
              notificationDelivered: false;
              pushProviderRequested: false;
            };
          };
          suggestedActions: readonly {
            actionId: string;
            requiresConfirmation: boolean;
          }[];
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/orbit-ai/mock-proactive-service.ts");

  const service = serviceModule.createMockOrbitAiProactiveAgentService();
  const result = service.createProactiveTurn({
    signal: {
      body: "Sarah wants to discuss climate fintech partnerships.",
      evidenceIds: ["evidence:calendar:sarah-breakfast"],
      occursAt: "2026-07-02T10:00:00.000Z",
      severity: "high",
      signalId: "signal:calendar:sarah-breakfast",
      sourceModule: "calendar",
      sourceRef: {
        id: "calendar-event:sarah-breakfast",
        label: "Breakfast with Sarah",
        type: "calendar_event",
      },
      title: "Breakfast with Sarah tomorrow",
      type: "calendar_event_upcoming",
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.message.role, "assistant");
  assert.equal(result.data?.message.turnKind, "proactive");
  assert.equal(result.data?.message.deliverySurface, "orbit_ai_chat");
  assert.equal(
    result.data?.message.sourceSignalId,
    "signal:calendar:sarah-breakfast",
  );
  assert.match(result.data?.message.content ?? "", /Sarah|明天|准备|关系/);
  assert.equal(result.data?.suggestedActions.length, 3);
  assert.equal(
    result.data?.suggestedActions.every((action) => action.requiresConfirmation),
    true,
  );
  assert.equal(
    result.data?.provenance.evidenceIds.includes(
      "evidence:calendar:sarah-breakfast",
    ),
    true,
  );
  assert.equal(
    result.data?.provenance.safety.externalSideEffectsExecuted,
    false,
  );
  assert.equal(result.data?.provenance.safety.notificationDelivered, false);
  assert.equal(result.data?.provenance.safety.pushProviderRequested, false);
  assert.equal(result.data?.provenance.safety.aiProviderRequested, false);
  assert.equal(result.data?.provenance.safety.liveDatabaseWriteExecuted, false);
  assert.match(result.data?.nextAction ?? "", /Orbit AI|chat|确认/);

  assertNoDeliveryOrProviderCalls("features/orbit-ai/mock-proactive-service.ts");
});

test("mock Orbit AI proactive agent fails closed for missing or unsupported signals", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAiProactiveAgentService: () => {
      createProactiveTurn: (input: {
        signal?: { signalId?: string | null; type?: string | null } | null;
      }) => {
        success: boolean;
        error?: { appCode: string; code: string };
      };
    };
  }>("features/orbit-ai/mock-proactive-service.ts");

  const service = serviceModule.createMockOrbitAiProactiveAgentService();
  const missingSignal = service.createProactiveTurn({});
  const unsupportedType = service.createProactiveTurn({
    signal: {
      signalId: "signal:unknown",
      type: "external_news_alert",
    },
  });

  assert.equal(missingSignal.success, false);
  assert.equal(
    missingSignal.error?.code,
    "ORBIT_AI_PROACTIVE_AGENT_SIGNAL_REQUIRED",
  );
  assert.equal(missingSignal.error?.appCode, "VALIDATION_ERROR");
  assert.equal(unsupportedType.success, false);
  assert.equal(
    unsupportedType.error?.code,
    "ORBIT_AI_PROACTIVE_AGENT_UNSUPPORTED_SIGNAL_TYPE",
  );
  assert.equal(unsupportedType.error?.appCode, "VALIDATION_ERROR");
});
