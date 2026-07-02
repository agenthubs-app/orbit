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
    `${pathFromRoot} must exist for the Orbit Agent artifact task mock`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

function assertNoLiveProviderCalls(filePath: string): void {
  const source = readFileSync(join(projectRoot, filePath), "utf8");

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
  assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
  assert.doesNotMatch(source, /Anthropic|DeepSeek|OpenAI|Pinecone|Weaviate|Qdrant/);
  assert.doesNotMatch(source, /sendgrid|postmark|gmail|calendar\.google/i);
}

function countJsonStringifyCalls<TValue>(
  run: () => TValue,
): { count: number; value: TValue } {
  const originalStringify = JSON.stringify;
  let count = 0;

  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    count += 1;
    return originalStringify(...args);
  }) as typeof JSON.stringify;

  try {
    const value = run();

    return { count, value };
  } finally {
    JSON.stringify = originalStringify;
  }
}

test("Orbit Agent artifact task service is registered behind the module factory", async () => {
  const factoryModule = await importProjectModule<{
    createOrbitAgentArtifactTaskService: (mode?: string) => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
      }) => { success: boolean };
      getArtifactTask: (input: { artifactId: string }) => { success: boolean };
    };
    orbitAgentArtifactTaskServiceFactory: {
      availableModes: readonly string[];
      capabilityId: string;
    };
  }>("features/orbit-ai/service-factory.ts");

  assert.equal(
    factoryModule.orbitAgentArtifactTaskServiceFactory.capabilityId,
    "orbit-agent-artifact-task",
  );
  assert.deepEqual(
    factoryModule.orbitAgentArtifactTaskServiceFactory.availableModes,
    ["mock", "live"],
  );

  const service = factoryModule.createOrbitAgentArtifactTaskService("mock");
  assert.equal(typeof service.createArtifactTask, "function");
  assert.equal(typeof service.getArtifactTask, "function");
});

test("live artifact task renders follow-up queue from the followups service", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAgentFollowupReviewArtifactService: (input: {
      followupService: {
        listTasks: (input?: { limit?: number | null }) => Promise<{
          success: true;
          data: {
            tasks: readonly {
              audit: { sourceLabel: string };
              connectionId: string;
              contactName: string;
              dueInDays: number;
              evidenceIds: readonly string[];
              organization: string;
              priority: string;
              rationale: string;
              recommendedAction: string;
              source: { label: string };
              taskId: string;
              title: string;
              triggerKind: string;
            }[];
            provenance: {
              collectedAt: string;
              evidenceIds: readonly string[];
              liveDatabaseReadExecuted: boolean;
              source: string;
              sourceLabel: string;
            };
            state: string;
            summary: string;
          };
        }>;
        generateTasks: () => never;
      };
    }) => {
      createArtifactTask: (input: {
        kind: string;
        locale?: string;
        query: string;
        toolArguments?: Record<string, unknown>;
      }) => Promise<{
        success: boolean;
        data?: {
          result: {
            generatedView: {
              sections: readonly {
                items: readonly {
                  actions: readonly { requiresConfirmation: boolean }[];
                  body?: string;
                  evidenceIds: readonly string[];
                  metadata: readonly { label: string; value: string }[];
                  reason?: string;
                  subtitle?: string;
                  title: string;
                }[];
              }[];
              summary: string;
            } | null;
            kind: string;
            provenance: {
              generationMethod: string;
              source: string;
              sourceModules: readonly string[];
              toolCalls: readonly { status: string; toolName: string }[];
            };
            safety: {
              externalSideEffectsExecuted: false;
              liveDatabaseReadExecuted: boolean;
            };
          };
          task: {
            artifactProducer: string;
            kind: string;
          };
        };
      }>;
    };
  }>("features/orbit-ai/followup-review-artifact-service.ts");

  const listInputs: { limit?: number | null }[] = [];
  const service = serviceModule.createOrbitAgentFollowupReviewArtifactService({
    followupService: {
      async listTasks(input) {
        listInputs.push(input ?? {});

        return {
          success: true,
          data: {
            tasks: [
              {
                audit: { sourceLabel: "Followup Postgres live storage" },
                connectionId: "connection_0012",
                contactName: "佐藤 健一",
                dueInDays: 2,
                evidenceIds: ["evidence:task:001"],
                organization: "North Star Foods",
                priority: "this_week",
                rationale: "Shared Japan market entry evidence supports a timely review.",
                recommendedAction: "Review the Japan market entry thread.",
                source: { label: "Live task source" },
                taskId: "task_001",
                title: "Follow up on Japan market entry",
                triggerKind: "promised_action",
              },
            ],
            provenance: {
              collectedAt: "2026-06-30T00:00:00.000Z",
              evidenceIds: ["evidence:task:001"],
              liveDatabaseReadExecuted: true,
              source: "postgres-live-record-store:followups:workspace:orbit-dev",
              sourceLabel: "Followup Postgres live storage",
            },
            state: "success",
            summary: "1 followup task was loaded from the live task store.",
          },
        };
      },
      generateTasks() {
        throw new Error("generateTasks must not be used for review queue artifacts");
      },
    },
  });

  const result = await service.createArtifactTask({
    kind: "followup_queue",
    locale: "zh",
    query: "本周应该跟进谁",
    toolArguments: { limit: 1 },
  });

  assert.equal(result.success, true);
  assert.equal(listInputs[0]?.limit, 1);
  assert.equal(result.data?.task.kind, "followup_queue");
  assert.equal(result.data?.task.artifactProducer, "followup_review_producer");
  assert.equal(result.data?.result.kind, "followup_queue");
  assert.equal(result.data?.result.provenance.sourceModules.includes("followups"), true);
  assert.equal(result.data?.result.provenance.toolCalls[0]?.toolName, "followups.reviewQueue");
  assert.equal(result.data?.result.provenance.toolCalls[0]?.status, "completed");
  assert.equal(result.data?.result.provenance.generationMethod, "artifact-producer-generated-view");
  assert.equal(result.data?.result.safety.liveDatabaseReadExecuted, true);
  assert.equal(result.data?.result.safety.externalSideEffectsExecuted, false);
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.title,
    "Follow up on Japan market entry",
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.subtitle,
    "佐藤 健一",
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.actions[0]?.requiresConfirmation,
    true,
  );
  assert.deepEqual(
    result.data?.result.generatedView?.sections[0]?.items[0]?.evidenceIds,
    ["evidence:task:001"],
  );
  assert.match(
    JSON.stringify(result.data?.result.generatedView),
    /North Star Foods/,
  );
  assert.doesNotMatch(
    JSON.stringify(result.data?.result.generatedView),
    /preview boundary|Maya Chen/,
  );
});

test("live artifact task renders event recommendations from the events tool", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAgentEventRecommendationArtifactService: (input: {
      recommendationTool: {
        recommend: (input: {
          query: string;
          toolArguments?: Record<string, unknown> | null;
        }) => Promise<{
          candidates: readonly {
            databaseQueryExecuted: boolean;
            description: string;
            endsAt: string;
            eventId: string;
            evidenceIds: readonly string[];
            matchReasons: readonly string[];
            nextAction: string;
            recommendedPreparation: string;
            relationshipContext: string;
            score: number;
            sourceLabel: string;
            startsAt: string;
            status: string;
            title: string;
            venue: string;
          }[];
          databaseQueryExecuted: boolean;
          evidenceIds: readonly string[];
          sourceLabel: string;
          state: string;
          summary: string;
        }>;
      };
    }) => {
      createArtifactTask: (input: {
        kind: string;
        locale?: string;
        query: string;
        toolArguments?: Record<string, unknown>;
      }) => Promise<{
        success: boolean;
        data?: {
          result: {
            generatedView: {
              sections: readonly {
                items: readonly {
                  actions: readonly { requiresConfirmation: boolean }[];
                  evidenceIds: readonly string[];
                  metadata: readonly { label: string; value: string }[];
                  reason?: string;
                  subtitle?: string;
                  title: string;
                }[];
              }[];
              summary: string;
            } | null;
            kind: string;
            provenance: {
              generationMethod: string;
              sourceModules: readonly string[];
              toolCalls: readonly { status: string; toolName: string }[];
            };
            safety: {
              externalSideEffectsExecuted: false;
              liveDatabaseReadExecuted: boolean;
            };
          };
          task: {
            artifactProducer: string;
            kind: string;
          };
        };
      }>;
    };
  }>("features/orbit-ai/event-recommendation-artifact-service.ts");

  const requests: {
    query: string;
    toolArguments?: Record<string, unknown> | null;
  }[] = [];
  const service = serviceModule.createOrbitAgentEventRecommendationArtifactService({
    recommendationTool: {
      async recommend(input) {
        requests.push(input);

        return {
          candidates: [
            {
              databaseQueryExecuted: true,
              description: "Invite-only operator dinner for Japan market entry teams.",
              endsAt: "2026-07-08T12:00:00.000Z",
              eventId: "event_tokyo_ai_dinner",
              evidenceIds: ["evidence:event:tokyo-ai-dinner"],
              matchReasons: [
                "The event mentions Japan market entry and operator introductions.",
              ],
              nextAction: "Review the attendee list before asking for an intro.",
              recommendedPreparation:
                "Prepare a short China SaaS expansion question.",
              relationshipContext:
                "Useful for meeting founders selling into Japan.",
              score: 94,
              sourceLabel: "Events Postgres live storage",
              startsAt: "2026-07-08T10:00:00.000Z",
              status: "confirmed",
              title: "Tokyo AI Operator Dinner",
              venue: "Shibuya, Tokyo",
            },
          ],
          databaseQueryExecuted: true,
          evidenceIds: ["evidence:event:tokyo-ai-dinner"],
          sourceLabel: "Events Postgres live storage",
          state: "success",
          summary: "1 event matched the request from live Events data.",
        };
      },
    },
  });

  const result = await service.createArtifactTask({
    kind: "event_recommendations",
    locale: "zh",
    query: "推荐适合 Japan market entry 的活动",
    toolArguments: { limit: 1 },
  });

  assert.equal(result.success, true);
  assert.equal(requests[0]?.query, "推荐适合 Japan market entry 的活动");
  assert.equal(requests[0]?.toolArguments?.limit, 1);
  assert.equal(result.data?.task.kind, "event_recommendations");
  assert.equal(result.data?.task.artifactProducer, "event_recommendation_producer");
  assert.equal(result.data?.result.kind, "event_recommendations");
  assert.equal(result.data?.result.provenance.sourceModules.includes("events"), true);
  assert.equal(result.data?.result.provenance.toolCalls[0]?.toolName, "events.recommend");
  assert.equal(result.data?.result.provenance.toolCalls[0]?.status, "completed");
  assert.equal(result.data?.result.provenance.generationMethod, "artifact-producer-generated-view");
  assert.equal(result.data?.result.safety.liveDatabaseReadExecuted, true);
  assert.equal(result.data?.result.safety.externalSideEffectsExecuted, false);
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.title,
    "Tokyo AI Operator Dinner",
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.subtitle,
    "Shibuya, Tokyo",
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.actions[0]?.requiresConfirmation,
    true,
  );
  assert.deepEqual(
    result.data?.result.generatedView?.sections[0]?.items[0]?.evidenceIds,
    ["evidence:event:tokyo-ai-dinner"],
  );
  assert.doesNotMatch(
    JSON.stringify(result.data?.result.generatedView),
    /preview boundary|Founder relationship roundtable/,
  );
});

test("mock artifact task creates a traceable ready event recommendation view", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        conversationId?: string | null;
        kind: string;
        presentation?: { preferredSurface?: string; title?: string };
        query: string;
      }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: {
              sections: readonly {
                items: readonly {
                  actions: readonly { requiresConfirmation: boolean }[];
                  evidenceIds: readonly string[];
                  title: string;
                }[];
              }[];
              summary: string;
            } | null;
            kind: string;
            presentation: { preferredSurface: string; title: string };
            provenance: {
              generationMethod: string;
              sourceModules: readonly string[];
              toolCalls: readonly { status: string; toolName: string }[];
            };
            safety: {
              aiProviderRequested: false;
              domainWritesExecuted: false;
              externalSideEffectsExecuted: false;
              liveDatabaseReadExecuted: false;
            };
            status: string;
          };
          task: {
            artifactId: string;
            conversationId: string | null;
            kind: string;
            status: string;
            artifactProducer: string;
          };
        };
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const result = service.createArtifactTask({
    conversationId: "demo-orbit-agent-conversation-1",
    kind: "event_recommendations",
    presentation: {
      preferredSurface: "side_panel",
      title: "Events for Maya",
    },
    query: "推荐下周适合见 Maya 的活动",
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.task.status, "ready");
  assert.equal(result.data?.task.kind, "event_recommendations");
  assert.equal(result.data?.task.artifactProducer, "event_recommendation_producer");
  assert.equal(result.data?.result.status, "ready");
  assert.equal(result.data?.result.generatedView?.sections[0]?.items[0]?.actions[0]?.requiresConfirmation, true);
  assert.equal(result.data?.result.presentation.preferredSurface, "side_panel");
  assert.equal(result.data?.result.presentation.title, "Events for Maya");
  assert.equal(result.data?.result.provenance.generationMethod, "artifact-producer-generated-view");
  assert.equal(result.data?.result.provenance.sourceModules.includes("events"), true);
  assert.equal(result.data?.result.provenance.toolCalls[0]?.toolName, "events.recommend");
  assert.equal(result.data?.result.provenance.toolCalls[0]?.status, "completed");
  assert.equal(result.data?.result.safety.aiProviderRequested, false);
  assert.equal(result.data?.result.safety.domainWritesExecuted, false);
  assert.equal(result.data?.result.safety.externalSideEffectsExecuted, false);
  assert.equal(result.data?.result.safety.liveDatabaseReadExecuted, false);
});

test("preview artifact task service does not deep-clone fresh generated payloads", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAgentArtifactPreviewService: () => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
      }) => {
        data?: { result: { presentation: { title: string } } };
        success: boolean;
      };
    };
  }>("features/orbit-ai/artifact-task-preview-service.ts");

  const service = serviceModule.createOrbitAgentArtifactPreviewService();
  const { count, value: result } = countJsonStringifyCalls(() =>
    service.createArtifactTask({
      kind: "event_recommendations",
      query: "推荐下周适合认识投资人的活动",
    }),
  );

  assert.equal(result.success, true);
  assert.equal(result.data?.result.presentation.title, "Event recommendations");
  assert.equal(count, 0);
});

test("mock artifact task supports contact chat and follow-up generated views", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: { kind: string; query: string }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: { summary: string } | null;
            provenance: {
              sourceModules: readonly string[];
              toolCalls: readonly { toolName: string }[];
            };
          };
          task: { artifactProducer: string };
        };
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const contactResult = service.createArtifactTask({
    kind: "contact_recommendations",
    query: "帮我推荐该联系的人",
  });
  const chatResult = service.createArtifactTask({
    kind: "relationship_chat_context",
    query: "帮我整理回复上下文",
  });
  const followupResult = service.createArtifactTask({
    kind: "followup_queue",
    query: "帮我看看今天该跟进谁",
  });

  assert.equal(contactResult.success, true);
  assert.equal(contactResult.data?.task.artifactProducer, "contact_recommendation_producer");
  assert.equal(contactResult.data?.result.provenance.sourceModules.includes("contacts"), true);
  assert.equal(contactResult.data?.result.provenance.toolCalls[0]?.toolName, "contacts.recommend");

  assert.equal(chatResult.success, true);
  assert.equal(chatResult.data?.task.artifactProducer, "relationship_chat_review_producer");
  assert.equal(chatResult.data?.result.provenance.sourceModules.includes("chat"), true);
  assert.equal(chatResult.data?.result.provenance.toolCalls[0]?.toolName, "chat.context");

  assert.equal(followupResult.success, true);
  assert.equal(followupResult.data?.task.artifactProducer, "followup_review_producer");
  assert.equal(followupResult.data?.result.provenance.sourceModules.includes("followups"), true);
  assert.equal(followupResult.data?.result.provenance.toolCalls[0]?.toolName, "followups.reviewQueue");
});

test("mock artifact task localizes generated recommendation views from locale", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        kind: string;
        locale?: string | null;
        query: string;
      }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: {
              sections: readonly {
                items: readonly {
                  actions: readonly { label: string }[];
                  metadata: readonly { label: string; value: string }[];
                }[];
                title: string;
              }[];
              summary: string;
            } | null;
            nextAction: string;
            presentation: { subtitle: string; title: string };
          };
        };
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const result = service.createArtifactTask({
    kind: "contact_recommendations",
    locale: "zh",
    query: "帮我推荐几个应该联系的人脉。",
  });
  const generatedViewText = JSON.stringify(result.data?.result.generatedView);

  assert.equal(result.success, true);
  assert.equal(result.data?.result.presentation.title, "推荐人脉");
  assert.match(result.data?.result.presentation.subtitle ?? "", /人脉推荐/);
  assert.match(result.data?.result.generatedView?.summary ?? "", /人脉推荐/);
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.actions[0]?.label,
    "查看人脉",
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.metadata[1]?.label,
    "最近联系",
  );
  assert.match(result.data?.result.nextAction ?? "", /复核|确认/);
  assert.doesNotMatch(generatedViewText, /Recommended contacts|Review contact|Last touch/);
});

test("mock artifact task can return pending state without generated view", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
        scenario?: string;
      }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: unknown;
            nextAction: string;
            provenance: { generationMethod: string; toolCalls: readonly { status: string }[] };
            status: string;
          };
          task: { status: string };
        };
      };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const result = service.createArtifactTask({
    kind: "event_recommendations",
    query: "推荐活动",
    scenario: "pending",
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.task.status, "pending");
  assert.equal(result.data?.result.status, "pending");
  assert.equal(result.data?.result.generatedView, null);
  assert.equal(result.data?.result.provenance.generationMethod, "rule-based-artifact-task");
  assert.equal(result.data?.result.provenance.toolCalls[0]?.status, "planned");
  assert.match(result.data?.result.nextAction ?? "", /loading|do not execute/i);
});

test("mock artifact task validates input and keeps live providers unused", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentArtifactTaskService: () => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
        scenario?: string;
      }) => { success: boolean; error?: { appCode: string; code: string } };
      getArtifactTask: (input: {
        artifactId: string;
        scenario?: string;
      }) => { success: boolean; error?: { appCode: string; code: string } };
    };
  }>("features/orbit-ai/mock-artifact-task-service.ts");

  const service = serviceModule.createMockOrbitAgentArtifactTaskService();
  const blankQuery = service.createArtifactTask({
    kind: "event_recommendations",
    query: "   ",
  });
  const unsupportedKind = service.createArtifactTask({
    kind: "unknown_kind",
    query: "recommend something",
  });
  const missingArtifact = service.getArtifactTask({
    artifactId: "artifact:missing:demo",
  });
  const controlledFailure = service.createArtifactTask({
    kind: "event_recommendations",
    query: "recommend events",
    scenario: "failure",
  });

  assert.equal(blankQuery.success, false);
  assert.equal(blankQuery.error?.code, "ORBIT_AGENT_ARTIFACT_QUERY_REQUIRED");
  assert.equal(blankQuery.error?.appCode, "VALIDATION_ERROR");
  assert.equal(unsupportedKind.success, false);
  assert.equal(
    unsupportedKind.error?.code,
    "ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND",
  );
  assert.equal(missingArtifact.success, false);
  assert.equal(missingArtifact.error?.code, "ORBIT_AGENT_ARTIFACT_NOT_FOUND");
  assert.equal(controlledFailure.success, false);
  assert.equal(
    controlledFailure.error?.code,
    "ORBIT_AGENT_ARTIFACT_MOCK_FAILED",
  );

  assertNoLiveProviderCalls("features/orbit-ai/mock-artifact-task-service.ts");
});
