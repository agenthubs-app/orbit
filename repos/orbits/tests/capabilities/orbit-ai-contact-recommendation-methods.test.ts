import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const methodEnvName = "ORBIT_CONTACT_RECOMMENDATION_METHOD";

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the Orbit Agent contact recommendation methods`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

async function withMethodEnv<TValue>(
  value: string | undefined,
  run: () => Promise<TValue>,
): Promise<TValue> {
  const previousValue = process.env[methodEnvName];

  if (value === undefined) {
    delete process.env[methodEnvName];
  } else {
    process.env[methodEnvName] = value;
  }

  try {
    return await run();
  } finally {
    if (previousValue === undefined) {
      delete process.env[methodEnvName];
    } else {
      process.env[methodEnvName] = previousValue;
    }
  }
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

test("contact recommendation abstraction declares four comparable methods", async () => {
  const module = await importProjectModule<{
    CONTACT_RECOMMENDATION_METHODS: readonly string[];
  }>("features/orbit-ai/contact-recommendation-matching.ts");

  assert.deepEqual(module.CONTACT_RECOMMENDATION_METHODS, [
    "rules_v1",
    "structured_extraction_v1",
    "semantic_index_v1",
    "graph_gated_rag_v1",
  ]);
});

test("contact recommendation method resolver reads env and rejects unknown methods", async () => {
  const module = await importProjectModule<{
    CONTACT_RECOMMENDATION_METHOD_ENV: string;
    resolveContactRecommendationMethod: (value?: string | null) =>
      | { method: string; success: true }
      | { code: string; requestedMethod: string; success: false };
  }>("features/orbit-ai/contact-recommendation-matching.ts");

  assert.equal(module.CONTACT_RECOMMENDATION_METHOD_ENV, methodEnvName);
  assert.deepEqual(module.resolveContactRecommendationMethod(undefined), {
    method: "rules_v1",
    success: true,
  });
  assert.deepEqual(module.resolveContactRecommendationMethod("graph_gated_rag_v1"), {
    method: "graph_gated_rag_v1",
    success: true,
  });
  assert.deepEqual(module.resolveContactRecommendationMethod("not-a-method"), {
    code: "unsupported_method",
    requestedMethod: "not-a-method",
    success: false,
  });
});

test("method A matches finance collaboration requests to evidence-backed existing relationships", async () => {
  const module = await importProjectModule<{
    createRuleBasedContactRecommendationMatcher: () => {
      recommend: (input: {
        contextMessages?: readonly { content: string; role: string }[];
        locale?: string | null;
        query: string;
      }) => {
        candidates: readonly {
          contactId: string;
          displayName: string;
          evidenceIds: readonly string[];
          matchReasons: readonly string[];
          relationshipPath: string;
        }[];
        criteria: {
          industries: readonly string[];
          relationshipPolicy: string;
        };
        method: string;
        state: string;
      };
    };
  }>("features/orbit-ai/contact-recommendation-matching.ts");

  const matcher = module.createRuleBasedContactRecommendationMatcher();
  const result = matcher.recommend({
    contextMessages: [
      {
        content: "我们最近聊到要做金融产品开发，需要找有真实链接的人合作。",
        role: "user",
      },
    ],
    locale: "zh",
    query: "我想做金融产品开发，应该找谁合作？",
  });

  assert.equal(result.method, "rules_v1");
  assert.equal(result.state, "success");
  assert.equal(result.criteria.relationshipPolicy, "existing_links_only");
  assert.deepEqual(result.criteria.industries, ["fintech"]);
  assert.equal(result.candidates[0]?.displayName, "Omar Rahman");
  assert.equal(result.candidates[0]?.contactId, "contact:omar-rahman");
  assert.ok(
    result.candidates[0]?.evidenceIds.includes(
      "evidence:relationship-search-omar",
    ),
  );
  assert.match(result.candidates[0]?.relationshipPath ?? "", /Email signal/i);
  assert.match(result.candidates[0]?.matchReasons.join(" ") ?? "", /fintech/i);
});

test("contacts recommendation search adapter owns candidate retrieval policy above Search", async () => {
  const contactsModule = await importProjectModule<{
    createContactsRecommendationSearchTool: () => {
      recommend: (input: {
        contextMessages?: readonly { content: string; role: string }[];
        query: string;
        toolArguments?: Record<string, unknown> | null;
      }) => {
        candidates: readonly {
          contactId: string;
          displayName: string;
          evidenceIds: readonly string[];
          matchScore: number;
          relationshipPath: string;
          sourceLabel: string;
        }[];
        criteria: {
          industries: readonly string[];
          relationshipPolicy: string;
          searchQuery: string;
          valueTypes: readonly string[];
        };
        method: string;
        state: string;
      };
    };
  }>("features/contacts/contact-recommendation-search.ts");

  const tool = contactsModule.createContactsRecommendationSearchTool();
  const result = tool.recommend({
    contextMessages: [
      {
        content: "我们需要找 climate storage 方向、有证据链的人做引荐。",
        role: "user",
      },
    ],
    query: "谁能介绍 climate storage pilot operator？",
    toolArguments: { query: "climate storage intro" },
  });

  assert.equal(result.method, "rules_v1");
  assert.equal(result.state, "success");
  assert.equal(result.criteria.relationshipPolicy, "existing_links_only");
  assert.equal(result.criteria.searchQuery, "climate intro");
  assert.deepEqual(result.criteria.industries, ["climate"]);
  assert.deepEqual(result.criteria.valueTypes, [
    "strategic_intro",
    "commercial_opportunity",
  ]);
  assert.equal(result.candidates[0]?.displayName, "Kenji Watanabe");
  assert.ok(
    result.candidates[0]?.evidenceIds.includes(
      "evidence:relationship-search-kenji",
    ),
  );
  assert.match(
    result.candidates[0]?.relationshipPath ?? "",
    /climate founders dinner/i,
  );
  assert.match(result.candidates[0]?.sourceLabel ?? "", /Manual climate/i);
});

test("contacts recommendation search adapter awaits async relationship search services", async () => {
  const contactsModule = await importProjectModule<{
    createContactsRecommendationSearchTool: (input: {
      relationshipSearchService: {
        queryRelationships: (input: unknown) => Promise<unknown>;
      };
    }) => {
      recommend: (input: {
        query: string;
      }) => Promise<{
        candidates: readonly {
          contactId: string;
          displayName: string;
          evidenceIds: readonly string[];
          matchScore: number;
        }[];
        state: string;
      }>;
    };
  }>("features/contacts/contact-recommendation-search.ts");

  const tool = contactsModule.createContactsRecommendationSearchTool({
    relationshipSearchService: {
      async queryRelationships() {
        return {
          success: true,
          data: {
            results: [
              {
                aiProviderRequested: false,
                calendarProviderRequested: false,
                contactId: "contact_async_live",
                crossProviderIndexQueried: false,
                databaseQueryExecuted: true,
                displayName: "Async Live Contact",
                emailProviderRequested: false,
                embeddingGenerated: false,
                evidence: [
                  {
                    capturedAt: "2026-07-01T00:00:00.000Z",
                    createdBy: "test",
                    evidenceId: "evidence:async-live",
                    excerpt: "Async relationship evidence.",
                    source: {
                      evidenceId: "evidence:async-live",
                      id: "source:async-live",
                      label: "Async live search source",
                      type: "manual",
                    },
                  },
                ],
                externalNetworkRequested: false,
                followUpStatus: "needs_follow_up",
                id: "relationship-search-result:async-live",
                industry: "enterprise_saas",
                location: "Tokyo",
                matchScore: {
                  band: "high",
                  matchedFields: ["relationshipContext"],
                  rationale: "Async live relationship search matched.",
                  value: 93,
                },
                notificationDelivered: false,
                organization: "Async Orbit",
                recommendedAction: "Review async live relationship path.",
                relationshipContext: "Async live relationship path.",
                role: "Partner",
                semanticSearchExecuted: false,
                source: {
                  evidenceId: "evidence:async-live",
                  id: "source:async-live",
                  label: "Async live search source",
                  type: "manual",
                },
                value: {
                  evidenceIds: ["evidence:async-live"],
                  rationale: "Async value evidence.",
                  score: 93,
                  valueTypes: ["strategic_intro"],
                },
              },
            ],
          },
        };
      },
    },
  });

  const result = await tool.recommend({
    query: "find async live relationship",
  });

  assert.equal(result.state, "success");
  assert.equal(result.candidates[0]?.displayName, "Async Live Contact");
  assert.deepEqual(result.candidates[0]?.evidenceIds, ["evidence:async-live"]);
});

test("Orbit AI contact recommendation matcher delegates candidate policy to feature-owned Contacts adapter", async () => {
  const module = await importProjectModule<{
    createRuleBasedContactRecommendationMatcher: (input: {
      recommendationSearchTool: {
        recommend: (request: {
          contextMessages?: readonly { content: string; role: string }[];
          locale?: string | null;
          query: string;
          toolArguments?: Record<string, unknown> | null;
        }) => {
          candidates: readonly {
            contactId: string;
            displayName: string;
            evidenceIds: readonly string[];
            matchReasons: readonly string[];
            matchScore: number;
            organization: string;
            recommendedAction: string;
            relationshipPath: string;
            role: string;
            sourceLabel: string;
          }[];
          criteria: {
            industries: readonly string[];
            relationshipPolicy: string;
            searchQuery: string;
          };
          method: string;
          state: string;
          summary: string;
        };
      };
    }) => {
      recommend: (input: {
        contextMessages?: readonly { content: string; role: string }[];
        locale?: string | null;
        query: string;
        toolArguments?: Record<string, unknown> | null;
      }) => {
        candidates: readonly { displayName: string }[];
        criteria: { searchQuery: string };
        method: string;
        state: string;
      };
    };
  }>("features/orbit-ai/contact-recommendation-matching.ts");
  const delegatedRequests: {
    query: string;
    toolArguments?: Record<string, unknown> | null;
  }[] = [];
  const matcher = module.createRuleBasedContactRecommendationMatcher({
    recommendationSearchTool: {
      recommend(request) {
        delegatedRequests.push({
          query: request.query,
          toolArguments: request.toolArguments,
        });

        return {
          candidates: [
            {
              contactId: "contact:feature-owned",
              displayName: "Feature Owned Candidate",
              evidenceIds: ["evidence:feature-owned"],
              matchReasons: ["Feature adapter ranked this candidate."],
              matchScore: 91,
              organization: "Contacts Feature",
              recommendedAction: "Review via Contacts.",
              relationshipPath: "Feature-owned adapter path.",
              role: "Adapter",
              sourceLabel: "Contacts adapter",
            },
          ],
          criteria: {
            industries: ["fintech"],
            relationshipPolicy: "existing_links_only",
            searchQuery: "fintech referral",
          },
          method: "rules_v1",
          state: "success",
          summary: "Feature-owned adapter handled contact recommendation.",
        };
      },
    },
  });

  const result = matcher.recommend({
    query: "我想找金融合作伙伴",
    toolArguments: { query: "fintech partner" },
  });

  assert.deepEqual(delegatedRequests, [
    {
      query: "我想找金融合作伙伴",
      toolArguments: { query: "fintech partner" },
    },
  ]);
  assert.equal(result.method, "rules_v1");
  assert.equal(result.state, "success");
  assert.equal(result.criteria.searchQuery, "fintech referral");
  assert.deepEqual(result.candidates.map((item) => item.displayName), [
    "Feature Owned Candidate",
  ]);
});

test("env selects unimplemented methods without silently falling back to rules", async () => {
  const liveModule = await importProjectModule<{
    createLiveOrbitAgentConversationService: (config: {
      apiKey: string;
      fetchImplementation: typeof fetch;
      maxLoopSteps?: number;
      model: string;
    }) => {
      sendMessage: (input: {
        locale?: string | null;
        message?: string | null;
      }) => Promise<{
        success: boolean;
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                emptyState?: string;
                sections: readonly {
                  items: readonly { metadata: readonly { value: string }[] }[];
                }[];
                summary: string;
              } | null;
              provenance: {
                toolCalls: readonly { reason: string; status: string }[];
              };
            };
          }[];
        };
      }>;
    };
  }>("features/orbit-ai/live-conversation-service.ts");

  await withMethodEnv("graph_gated_rag_v1", async () => {
    const service = liveModule.createLiveOrbitAgentConversationService({
      apiKey: "test-gemini-key",
      fetchImplementation: (async () =>
        new Response(
          JSON.stringify({
            steps: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      assistantMessage: "我会先查已有关系路径。",
                      intent: "contact_recommendations",
                      toolRequests: [
                        {
                          arguments: { query: "金融产品开发 合作" },
                          requiresUserConfirmation: true,
                          toolName: "contacts.recommend",
                        },
                      ],
                    }),
                    type: "text",
                  },
                ],
                type: "model_output",
              },
            ],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        )) as typeof fetch,
      maxLoopSteps: 2,
      model: "gemini-test-model",
    });

    const result = await service.sendMessage({
      locale: "zh",
      message: "我想做金融产品开发，应该找谁合作？",
    });
    const artifact = result.data?.artifacts[0];
    const view = artifact?.result.generatedView;
    const artifactText = JSON.stringify(artifact);

    assert.equal(result.success, true);
    assert.match(view?.summary ?? "", /graph_gated_rag_v1/);
    assert.match(view?.emptyState ?? "", /尚未实现/);
    assert.equal(
      artifact?.result.provenance.toolCalls[0]?.status,
      "skipped",
    );
    assert.doesNotMatch(artifactText, /Omar Rahman/);
  });
});

test("contact recommendation artifact service does not deep-clone fresh generated payloads", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAgentContactRecommendationArtifactService: (input: {
      matcher: {
        method: string;
        recommend: () => {
          candidates: readonly {
            contactId: string;
            displayName: string;
            evidenceIds: readonly string[];
            matchReasons: readonly string[];
            matchScore: number;
            organization: string;
            recommendedAction: string;
            relationshipPath: string;
            role: string;
            sourceLabel: string;
          }[];
          criteria: {
            businessIntent: string | null;
            helpTypes: readonly string[];
            industries: readonly string[];
            relationshipPolicy: "existing_links_only";
            searchQuery: string;
            valueTypes: readonly string[];
          };
          method: string;
          state: string;
          summary: string;
        };
      };
    }) => {
      createArtifactTask: (input: {
        kind: string;
        query: string;
      }) => {
        data?: { result: { generatedView: { summary: string } | null } };
        success: boolean;
      };
    };
  }>("features/orbit-ai/contact-recommendation-artifact-service.ts");

  const service = serviceModule.createOrbitAgentContactRecommendationArtifactService({
    matcher: {
      method: "rules_v1",
      recommend: () => ({
        candidates: [
          {
            contactId: "contact:test",
            displayName: "Test Contact",
            evidenceIds: ["evidence:test"],
            matchReasons: ["Test evidence matched."],
            matchScore: 91,
            organization: "Orbit",
            recommendedAction: "Review the relationship path.",
            relationshipPath: "Existing trusted path.",
            role: "Partner",
            sourceLabel: "Test source",
          },
        ],
        criteria: {
          businessIntent: "find_warm_intro",
          helpTypes: ["find_warm_intro"],
          industries: ["fintech"],
          relationshipPolicy: "existing_links_only",
          searchQuery: "fintech referral",
          valueTypes: ["referral_path"],
        },
        method: "rules_v1",
        state: "success",
        summary: "1 existing relationship candidate matched.",
      }),
    },
  });
  const { count, value: result } = countJsonStringifyCalls(() =>
    service.createArtifactTask({
      kind: "contact_recommendations",
      query: "谁能介绍金融行业客户？",
    }),
  );

  assert.equal(result.success, true);
  assert.match(result.data?.result.generatedView?.summary ?? "", /1/);
  assert.equal(count, 0);
});

test("invalid env method returns a visible configuration artifact", async () => {
  const serviceModule = await importProjectModule<{
    createOrbitAgentContactRecommendationArtifactService: () => {
      createArtifactTask: (input: {
        kind: string;
        locale?: string;
        query: string;
      }) => {
        success: boolean;
        data?: {
          result: {
            generatedView: { emptyState?: string; summary: string } | null;
            provenance: {
              toolCalls: readonly { reason: string; status: string }[];
            };
          };
        };
      };
    };
  }>("features/orbit-ai/contact-recommendation-artifact-service.ts");

  await withMethodEnv("random_method", async () => {
    const service = serviceModule.createOrbitAgentContactRecommendationArtifactService();
    const result = service.createArtifactTask({
      kind: "contact_recommendations",
      locale: "zh",
      query: "金融产品开发找谁合作",
    });

    assert.equal(result.success, true);
    assert.match(result.data?.result.generatedView?.summary ?? "", /random_method/);
    assert.match(result.data?.result.generatedView?.emptyState ?? "", /配置/);
    assert.equal(
      result.data?.result.provenance.toolCalls[0]?.status,
      "failed",
    );
  });
});

test("trace contacts.recommend uses relationship matches instead of preview copy", async () => {
  const traceModule = await importProjectModule<{
    createLiveOrbitAgentTrace: (config: {
      apiKey: string;
      fetchImplementation: typeof fetch;
      maxLoopSteps?: number;
      model: string;
    }) => {
      traceMessage: (input: {
        locale?: string | null;
        message?: string | null;
      }) => Promise<{
        success: boolean;
        data?: {
          fullChain: {
            conversation: {
              artifacts: readonly {
                result: {
                  generatedView: {
                    sections: readonly {
                      items: readonly { title: string }[];
                    }[];
                    summary: string;
                  } | null;
                };
              }[];
            };
          };
        };
      }>;
    };
  }>("features/orbit-ai/live-conversation-trace.ts");

  await withMethodEnv(undefined, async () => {
    const trace = traceModule.createLiveOrbitAgentTrace({
      apiKey: "test-gemini-key",
      fetchImplementation: (async () =>
        new Response(
          JSON.stringify({
            steps: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      assistantMessage: "我会先查已有关系路径。",
                      intent: "contact_recommendations",
                      toolRequests: [
                        {
                          arguments: { query: "金融产品开发 合作" },
                          requiresUserConfirmation: true,
                          toolName: "contacts.recommend",
                        },
                      ],
                    }),
                    type: "text",
                  },
                ],
                type: "model_output",
              },
            ],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        )) as typeof fetch,
      maxLoopSteps: 2,
      model: "gemini-test-model",
    });

    const result = await trace.traceMessage({
      locale: "zh",
      message: "我想做金融产品开发，应该找谁合作？",
    });
    const artifact = result.data?.fullChain.conversation.artifacts[0];
    const item = artifact?.result.generatedView?.sections[0]?.items[0];
    const artifactText = JSON.stringify(artifact);

    assert.equal(result.success, true);
    assert.equal(item?.title, "Omar Rahman");
    assert.doesNotMatch(artifactText, /此预览记录了 Orbit 计划交接/);
  });
});

test("live contacts.recommend artifact uses method A instead of preview copy", async () => {
  const liveModule = await importProjectModule<{
    createLiveOrbitAgentConversationService: (config: {
      apiKey: string;
      fetchImplementation: typeof fetch;
      maxLoopSteps?: number;
      model: string;
    }) => {
      sendMessage: (input: {
        locale?: string | null;
        message?: string | null;
      }) => Promise<{
        success: boolean;
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                sections: readonly {
                  items: readonly {
                    body?: string;
                    evidenceIds: readonly string[];
                    title: string;
                  }[];
                }[];
                summary: string;
              } | null;
              provenance: {
                evidenceIds: readonly string[];
                generationMethod: string;
                toolCalls: readonly { toolName: string }[];
              };
            };
            task: { kind: string };
          }[];
        };
      }>;
    };
  }>("features/orbit-ai/live-conversation-service.ts");

  const result = await withMethodEnv(undefined, async () => {
    const service = liveModule.createLiveOrbitAgentConversationService({
      apiKey: "test-gemini-key",
      fetchImplementation: (async () =>
        new Response(
          JSON.stringify({
            steps: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      assistantMessage:
                        "我会先从已有关系里找金融产品合作相关的人脉，任何外部联系仍需要你确认。",
                      intent: "contact_recommendations",
                      toolRequests: [
                        {
                          arguments: { query: "金融产品开发 合作" },
                          requiresUserConfirmation: true,
                          toolName: "contacts.recommend",
                        },
                      ],
                    }),
                    type: "text",
                  },
                ],
                type: "model_output",
              },
            ],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        )) as typeof fetch,
      maxLoopSteps: 2,
      model: "gemini-test-model",
    });

    return service.sendMessage({
      locale: "zh",
      message: "我想做金融产品开发，应该找谁合作？",
    });
  });
  const artifact = result.data?.artifacts[0];
  const item = artifact?.result.generatedView?.sections[0]?.items[0];
  const artifactText = JSON.stringify(artifact);

  assert.equal(result.success, true);
  assert.equal(artifact?.task.kind, "contact_recommendations");
  assert.equal(item?.title, "Omar Rahman");
  assert.ok(item?.evidenceIds.includes("evidence:relationship-search-omar"));
  assert.equal(
    artifact?.result.provenance.generationMethod,
    "artifact-producer-generated-view",
  );
  assert.equal(
    artifact?.result.provenance.toolCalls[0]?.toolName,
    "contacts.recommend",
  );
  assert.doesNotMatch(artifactText, /此预览记录了 Orbit 计划交接/);
  assert.match(
    artifact?.result.generatedView?.summary ?? "",
    /已有关系|existing relationship/i,
  );
});
