import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(
    pathToFileURL(path.join(projectRoot, relativePath)).href
  )) as TModule;
}

function geminiTextResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      steps: [
        { content: [{ text, type: "text" }], type: "model_output" },
      ],
    }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}

test("language normalization translates non-Latin ingest text to English", async () => {
  const module = await importProjectModule<{
    createOrbitLanguageNormalizationService: (config: {
      apiKey: string;
      fetchImplementation: typeof fetch;
      provider: string;
    }) => {
      translateToEnglish: (
        text: string,
      ) => Promise<{ englishText: string | null; translated: boolean }>;
    };
  }>("features/orbit-ai/language-normalization-service.ts");

  let calls = 0;
  const service = module.createOrbitLanguageNormalizationService({
    apiKey: "test-key",
    fetchImplementation: (async () => {
      calls += 1;
      return geminiTextResponse("Restaurant owner exploring project partnerships.");
    }) as typeof fetch,
    provider: "gemini",
  });

  const result = await service.translateToEnglish("我是做餐饮的，想找项目合作。");
  assert.equal(result.translated, true);
  assert.match(result.englishText ?? "", /restaurant/i);
  assert.equal(calls, 1);
});

test("language normalization skips translation for already-Latin text (no provider call)", async () => {
  const module = await importProjectModule<{
    createOrbitLanguageNormalizationService: (config: {
      apiKey: string;
      fetchImplementation: typeof fetch;
      provider: string;
    }) => {
      translateToEnglish: (
        text: string,
      ) => Promise<{ englishText: string | null; translated: boolean }>;
    };
  }>("features/orbit-ai/language-normalization-service.ts");

  let calls = 0;
  const service = module.createOrbitLanguageNormalizationService({
    apiKey: "test-key",
    fetchImplementation: (async () => {
      calls += 1;
      return geminiTextResponse("unused");
    }) as typeof fetch,
    provider: "gemini",
  });

  const result = await service.translateToEnglish("Restaurant partner in Osaka");
  assert.equal(result.translated, false);
  assert.equal(result.englishText, null);
  assert.equal(calls, 0);
});

test("language normalization fails closed without an API key", async () => {
  const module = await importProjectModule<{
    createOrbitLanguageNormalizationService: (config: {
      apiKey: null;
    }) => {
      translateToEnglish: (
        text: string,
      ) => Promise<{ englishText: string | null; translated: boolean }>;
      extractSearchTerms: (
        query: string,
      ) => Promise<{ intent: string | null; searchTerms: string | null }>;
    };
  }>("features/orbit-ai/language-normalization-service.ts");

  const service = module.createOrbitLanguageNormalizationService({ apiKey: null });
  const translated = await service.translateToEnglish("我是做餐饮的");
  const extracted = await service.extractSearchTerms("找做餐饮的人");

  assert.equal(translated.translated, false);
  assert.equal(extracted.searchTerms, null);
});

test("language normalization extracts English search terms from any-language query", async () => {
  const module = await importProjectModule<{
    createOrbitLanguageNormalizationService: (config: {
      apiKey: string;
      fetchImplementation: typeof fetch;
      provider: string;
    }) => {
      extractSearchTerms: (
        query: string,
      ) => Promise<{ intent: string | null; searchTerms: string | null }>;
    };
  }>("features/orbit-ai/language-normalization-service.ts");

  const service = module.createOrbitLanguageNormalizationService({
    apiKey: "test-key",
    fetchImplementation: (async () =>
      geminiTextResponse(
        '{"searchTerms":"restaurant hospitality partnership","intent":"partnership"}',
      )) as typeof fetch,
    provider: "gemini",
  });

  const result = await service.extractSearchTerms(
    "我想找做餐饮的人合作一个项目，能给我推荐一下人选吗?",
  );
  assert.equal(result.searchTerms, "restaurant hospitality partnership");
  assert.equal(result.intent, "partnership");
});

test("contact recommendation feeds model-extracted search terms into the relationship search", async () => {
  const module = await importProjectModule<{
    createOrbitAgentContactRecommendationArtifactService: (input: {
      matcher: {
        recommend: (input: {
          query: string;
          toolArguments?: Record<string, unknown> | null;
        }) => {
          candidates: readonly unknown[];
          criteria: Record<string, unknown>;
          method: string;
          state: string;
          summary: string;
        };
      };
      normalizationService: {
        extractSearchTerms: (
          query: string,
        ) => Promise<{ intent: string | null; searchTerms: string | null }>;
      };
    }) => {
      createArtifactTask: (input: {
        kind: string;
        locale?: string;
        query: string;
        toolArguments?: Record<string, unknown> | null;
      }) => Promise<{ success: boolean }>;
    };
  }>("features/orbit-ai/contact-recommendation-artifact-service.ts");

  let captured: Record<string, unknown> | null | undefined;
  const service = module.createOrbitAgentContactRecommendationArtifactService({
    matcher: {
      recommend: (input) => {
        captured = input.toolArguments;
        return {
          candidates: [],
          criteria: { relationshipPolicy: "existing_links_only", searchQuery: "restaurant" },
          method: "rules_v1",
          state: "empty",
          summary: "",
        };
      },
    },
    normalizationService: {
      extractSearchTerms: async () => ({
        intent: "partnership",
        searchTerms: "restaurant",
      }),
    },
  });

  const result = await service.createArtifactTask({
    kind: "contact_recommendations",
    locale: "zh",
    query: "我想找做餐饮的人合作一个项目，能给我推荐一下人选吗?",
    toolArguments: {},
  });

  assert.equal(result.success, true);
  assert.equal(captured?.searchTerms, "restaurant");
});
