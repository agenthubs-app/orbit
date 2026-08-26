import assert from "node:assert/strict";
import test from "node:test";

import { BusinessCardCloudOcrProviderError } from "../../features/acquisition/business-card-ocr-validation";
import { createConfiguredBusinessCardCloudOcrProvider } from "../../features/acquisition/business-card-ocr-provider-selection";
import { createConfiguredDeepseekBusinessCardOcrProvider } from "../../features/acquisition/deepseek-business-card-ocr-provider";

function providerExtraction() {
  return {
    addresses: [{ label: "本社", value: "東京都テスト区7-8-9" }],
    certifications: [],
    contactPoints: [
      { label: "本社", type: "phone", value: "03-0000-3333" },
      { label: "本社", type: "fax", value: "03-0000-4444" },
    ],
    departments: ["事業開発室"],
    detectedLanguages: ["ja", "en"],
    emails: [{ label: "email", value: "taro.a@example.test" }],
    fullName: "青空 太郎",
    nativeFullName: "青空 太郎",
    organization: "架空技研株式会社",
    romanizedFullName: null,
    title: "室長",
    website: "https://example.test",
  };
}

function chatResponse(
  content: string,
  usage: { prompt: number; completion: number },
): Response {
  return Response.json({
    choices: [{ message: { content, role: "assistant" } }],
    usage: { completion_tokens: usage.completion, prompt_tokens: usage.prompt },
  });
}

test("DeepSeek business card provider runs the two-stage transcribe-then-structure flow", async () => {
  const requests: {
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }[] = [];
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "test-deepseek-key" },
    fetchImplementation: (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({
        body,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return requests.length === 1
        ? chatResponse("架空技研株式会社\n青空 太郎 室長\nTEL(本社) 03-0000-3333", {
            prompt: 900,
            completion: 120,
          })
        : chatResponse(JSON.stringify(providerExtraction()), {
            prompt: 400,
            completion: 210,
          });
    }) as typeof fetch,
  });

  assert.ok(provider);
  assert.equal(provider.providerName, "deepseek-chat-completions");
  assert.equal(provider.model, "deepseek-v4-flash-vision-exp+deepseek-v4-flash");

  const result = await provider.extract({
    imageBase64: "aGVsbG8=",
    mimeType: "image/jpeg",
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.body.model, "deepseek-v4-flash-vision-exp");
  const visionMessages = requests[0]?.body.messages as { content: unknown }[];
  const visionContent = visionMessages[0]?.content as {
    image_url?: { url: string };
    type: string;
  }[];
  assert.ok(
    visionContent.some(
      (part) =>
        part.type === "image_url" &&
        part.image_url?.url === "data:image/jpeg;base64,aGVsbG8=",
    ),
  );
  assert.equal(requests[0]?.headers.Authorization, "Bearer test-deepseek-key");
  assert.equal(requests[1]?.body.model, "deepseek-v4-flash");
  assert.deepEqual(requests[1]?.body.response_format, { type: "json_object" });
  const structuringMessages = requests[1]?.body.messages as {
    content: string;
    role: string;
  }[];
  assert.equal(
    structuringMessages[1]?.content,
    "架空技研株式会社\n青空 太郎 室長\nTEL(本社) 03-0000-3333",
  );
  assert.equal(result.extraction.organization, "架空技研株式会社");
  assert.equal(result.usage.inputTokens, 1300);
  assert.equal(result.usage.outputTokens, 330);
});

test("DeepSeek business card provider is absent without an API key", () => {
  assert.equal(createConfiguredDeepseekBusinessCardOcrProvider({ env: {} }), null);
});

test("DeepSeek business card provider honors model overrides", () => {
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: {
      DEEPSEEK_API_KEY: "k",
      ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL: "deepseek-text-test",
      ORBIT_BUSINESS_CARD_OCR_VISION_MODEL: "deepseek-vision-test",
    },
    fetchImplementation: (async () =>
      chatResponse("x", { prompt: 0, completion: 0 })) as typeof fetch,
  });

  assert.equal(provider?.model, "deepseek-vision-test+deepseek-text-test");
});

test("DeepSeek business card provider fails visibly on an empty transcription", async () => {
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "k" },
    fetchImplementation: (async () =>
      chatResponse("   ", { prompt: 1, completion: 1 })) as typeof fetch,
  });

  assert.ok(provider);
  await assert.rejects(
    provider.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError &&
      error.code === "INVALID_STRUCTURED_OUTPUT",
  );
});

test("DeepSeek business card provider fails visibly on invalid structured JSON", async () => {
  let calls = 0;
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "k" },
    fetchImplementation: (async () => {
      calls += 1;
      return calls === 1
        ? chatResponse("transcript", { prompt: 1, completion: 1 })
        : chatResponse("not json at all", { prompt: 1, completion: 1 });
    }) as typeof fetch,
  });

  assert.ok(provider);
  await assert.rejects(
    provider.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError &&
      error.code === "INVALID_STRUCTURED_OUTPUT",
  );
});

test("DeepSeek business card provider redacts provider request failures", async () => {
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "k" },
    fetchImplementation: (async () =>
      new Response("secret upstream detail", { status: 500 })) as typeof fetch,
  });

  assert.ok(provider);
  await assert.rejects(
    provider.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError &&
      error.code === "PROVIDER_REQUEST_FAILED" &&
      !error.message.includes("secret upstream detail"),
  );
});

test("DeepSeek business card provider times out per stage", async () => {
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "k" },
    fetchImplementation: ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch,
    timeoutMs: 5,
  });

  assert.ok(provider);
  await assert.rejects(
    provider.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError &&
      error.code === "PROVIDER_TIMEOUT",
  );
});

test("business card OCR provider selection prefers DeepSeek and falls back to Gemini", () => {
  const both = createConfiguredBusinessCardCloudOcrProvider({
    env: { DEEPSEEK_API_KEY: "a", GEMINI_API_KEY: "b" },
  });
  assert.equal(both?.providerName, "deepseek-chat-completions");

  const geminiOnly = createConfiguredBusinessCardCloudOcrProvider({
    env: { GEMINI_API_KEY: "b" },
  });
  assert.equal(geminiOnly?.providerName, "google-gemini-interactions");

  assert.equal(createConfiguredBusinessCardCloudOcrProvider({ env: {} }), null);
});
