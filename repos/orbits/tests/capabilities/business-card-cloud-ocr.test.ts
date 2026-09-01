import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBusinessCardExtraction,
  reviewIssuesForBusinessCard,
  type BusinessCardStructuredExtraction,
} from "../../features/acquisition/business-card-cloud-ocr";
import {
  BusinessCardCloudOcrProviderError,
  createConfiguredGeminiBusinessCardOcrProvider,
} from "../../features/acquisition/gemini-business-card-ocr-provider";

function extraction(
  overrides: Partial<BusinessCardStructuredExtraction> = {},
): BusinessCardStructuredExtraction {
  return {
    addresses: [],
    certifications: [],
    contactPoints: [],
    departments: [],
    detectedLanguages: ["ja"],
    emails: [],
    fullName: "未来 花子",
    nativeFullName: "未来 花子",
    organization: "架空産業株式会社",
    romanizedFullName: null,
    title: "代表取締役社長",
    website: null,
    ...overrides,
  };
}

test("business card normalization preserves labeled multi-office contact points", () => {
  const normalized = normalizeBusinessCardExtraction(
    extraction({
      addresses: [
        { label: " 本社 ", value: " 東京都テスト区1-2-3 " },
        { label: " 関西事業所 ", value: " 大阪府サンプル市4-5-6 " },
      ],
      contactPoints: [
        { label: " 本社 ", type: "phone", value: " 03-0000-1111 " },
        { label: " 関西事業所 ", type: "fax", value: " 06-0000-2222 " },
        { label: " 本社 ", type: "fax", value: " 06-0000-2222 " },
      ],
      emails: [{ label: " E-mail ", value: " HANAKO@EXAMPLE.TEST " }],
      website: " https://example.test ",
    }),
  );

  assert.deepEqual(normalized.contactPoints, [
    { label: "本社", type: "phone", value: "03-0000-1111" },
    { label: "関西事業所", type: "fax", value: "06-0000-2222" },
    { label: "本社", type: "fax", value: "06-0000-2222" },
  ]);
  assert.deepEqual(normalized.emails, [
    { label: "E-mail", value: "hanako@example.test" },
  ]);
  assert.deepEqual(normalized.addresses, [
    { label: "本社", value: "東京都テスト区1-2-3" },
    { label: "関西事業所", value: "大阪府サンプル市4-5-6" },
  ]);
  assert.equal(normalized.website, "https://example.test");
});

test("business card review policy flags multiple offices and shared contact values", () => {
  const issues = reviewIssuesForBusinessCard(
    extraction({
      addresses: [
        { label: "本社", value: "東京都テスト区1-2-3" },
        { label: "関西事業所", value: "大阪府サンプル市4-5-6" },
      ],
      contactPoints: [
        { label: "関西事業所", type: "fax", value: "06-0000-2222" },
        { label: "本社", type: "fax", value: "06-0000-2222" },
      ],
    }),
  );

  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["MULTIPLE_OFFICES", "SHARED_CONTACT_VALUE"],
  );
});

test("business card review policy validates identity, email, and phone fields", () => {
  const issues = reviewIssuesForBusinessCard(
    extraction({
      contactPoints: [{ label: null, type: "phone", value: "abc" }],
      emails: [{ label: null, value: "not-an-email" }],
      fullName: null,
      nativeFullName: null,
    }),
  );

  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["IDENTITY_MISSING", "INVALID_EMAIL", "INVALID_PHONE"],
  );
  assert.ok(issues.every((issue) => issue.message.length > 0));
});

test("business card review policy flags conflicting native and romanized names", () => {
  const issues = reviewIssuesForBusinessCard(
    extraction({
      fullName: "架空 太郎",
      nativeFullName: "架空 太郎",
      romanizedFullName: "UNRELATED PERSON",
    }),
  );

  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["NATIVE_ROMANIZED_NAME_CONFLICT"],
  );
});

function providerExtraction() {
  return {
    addresses: [{ label: "本社", value: "東京都テスト区7-8-9" }],
    certifications: [],
    contactPoints: [
      { label: "本社", type: "phone", value: "03-0000-3333" },
      { label: "本社", type: "fax", value: "03-0000-4444" },
    ],
    departments: ["事業開発室", "企画室"],
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

function interactionResponse(output: unknown): Response {
  return Response.json({
    steps: [
      { signature: "provider-signature", type: "thought" },
      {
        content: [{ text: JSON.stringify(output), type: "text" }],
        type: "message",
      },
    ],
    usage: {
      total_input_tokens: 1156,
      total_output_tokens: 236,
    },
  });
}

test("Gemini business card provider sends high-resolution strict structured requests", async () => {
  const requests: {
    body: Record<string, unknown>;
    headers: Headers;
    url: string;
  }[] = [];
  const provider = createConfiguredGeminiBusinessCardOcrProvider({
    env: {
      GEMINI_API_KEY: "primary-key",
      GOOGLE_API_KEY: "fallback-key",
    },
    fetchImplementation: (async (input, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: new Headers(init?.headers),
        url: String(input),
      });

      return interactionResponse(providerExtraction());
    }) as typeof fetch,
    nowMs: (() => {
      let value = 100;

      return () => {
        value += 25;
        return value;
      };
    })(),
  });

  assert.ok(provider);

  const result = await provider.extract({
    imageBase64: "aW1hZ2U=",
    mimeType: "image/jpeg",
  });
  const request = requests[0];
  const input = request?.body.input as readonly Record<string, unknown>[];
  const responseFormat = request?.body.response_format as Record<string, unknown>;
  const schema = responseFormat.schema as Record<string, unknown>;

  assert.equal(request?.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(request?.headers.get("x-goog-api-key"), "primary-key");
  assert.equal(request?.body.model, "gemini-3.5-flash-lite");
  assert.equal(input[0]?.type, "text");
  assert.equal(input[1]?.resolution, "high");
  assert.equal(input[1]?.mime_type, "image/jpeg");
  assert.equal(responseFormat.mime_type, "application/json");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(request?.body.generation_config, {
    thinking_level: "minimal",
  });
  assert.equal(result.extraction.fullName, "青空 太郎");
  assert.equal(result.usage.inputTokens, 1156);
  assert.equal(result.usage.outputTokens, 236);
  assert.equal(result.usage.latencyMs, 25);
});

test("Gemini business card provider supports GOOGLE_API_KEY fallback and model override", async () => {
  const requestHeaders: Headers[] = [];
  const provider = createConfiguredGeminiBusinessCardOcrProvider({
    env: {
      GOOGLE_API_KEY: "google-key",
      ORBIT_BUSINESS_CARD_OCR_MODEL: "gemini-test-model",
    },
    fetchImplementation: (async (_input, init) => {
      requestHeaders.push(new Headers(init?.headers));
      return interactionResponse(providerExtraction());
    }) as typeof fetch,
  });

  assert.ok(provider);
  assert.equal(provider.model, "gemini-test-model");
  await provider.extract({
    imageBase64: "aW1hZ2U=",
    mimeType: "image/png",
  });
  assert.equal(requestHeaders[0]?.get("x-goog-api-key"), "google-key");
});

test("Gemini business card provider is absent without a paid API key", () => {
  assert.equal(
    createConfiguredGeminiBusinessCardOcrProvider({ env: {} }),
    null,
  );
});

test("Gemini business card provider fails visibly on invalid structured output", async () => {
  const provider = createConfiguredGeminiBusinessCardOcrProvider({
    env: { GEMINI_API_KEY: "test-key" },
    fetchImplementation: (async () =>
      interactionResponse({ fullName: "Missing required fields" })) as typeof fetch,
  });

  assert.ok(provider);
  await assert.rejects(
    provider.extract({
      imageBase64: "aW1hZ2U=",
      mimeType: "image/webp",
    }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError &&
      error.code === "INVALID_STRUCTURED_OUTPUT" &&
      !error.message.includes("Missing required fields"),
  );
});

test("Gemini business card provider redacts provider response failures", async () => {
  const provider = createConfiguredGeminiBusinessCardOcrProvider({
    env: { GEMINI_API_KEY: "secret-provider-key" },
    fetchImplementation: (async () =>
      Response.json(
        {
          error: {
            message: "secret-provider-key and printed-card-content",
          },
        },
        { status: 429 },
      )) as typeof fetch,
  });

  assert.ok(provider);
  await assert.rejects(
    provider.extract({
      imageBase64: "cHJpbnRlZC1jYXJkLWNvbnRlbnQ=",
      mimeType: "image/jpeg",
    }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError &&
      error.code === "PROVIDER_REQUEST_FAILED" &&
      !error.message.includes("secret-provider-key") &&
      !error.message.includes("printed-card-content"),
  );
});

test("Gemini business card provider times out hung requests", async () => {
  const provider = createConfiguredGeminiBusinessCardOcrProvider({
    env: { GEMINI_API_KEY: "test-key" },
    fetchImplementation: ((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      })) as typeof fetch,
    timeoutMs: 5,
  });

  assert.ok(provider);
  await assert.rejects(
    Promise.race([
      provider.extract({
        imageBase64: "aW1hZ2U=",
        mimeType: "image/jpeg",
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("Test timed out.")), 100);
      }),
    ]),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError &&
      error.code === "PROVIDER_TIMEOUT",
  );
});

test("review flags an organization that lost its legal suffix present in the transcript", () => {
  const issues = reviewIssuesForBusinessCard(
    extraction({ organization: "架空産業" }),
    { transcript: "架空産業株式会社\n未来 花子\n代表取締役社長" },
  );

  assert.ok(issues.some((issue) => issue.code === "ORG_SUFFIX_MISSING"));
});

test("review stays quiet when the structured organization keeps its suffix", () => {
  const issues = reviewIssuesForBusinessCard(
    extraction({ organization: "架空産業株式会社" }),
    { transcript: "架空産業株式会社\n未来 花子" },
  );

  assert.ok(!issues.some((issue) => issue.code === "ORG_SUFFIX_MISSING"));
});

test("review flags an email that the character-level verification pass read differently", () => {
  const issues = reviewIssuesForBusinessCard(
    extraction({ emails: [{ label: null, value: "m-watanabe@example.test" }] }),
    {
      verification: {
        emails: ["r-watanabe@example.test"],
        organizations: [],
        phones: [],
      },
    },
  );

  assert.ok(
    issues.some(
      (issue) => issue.code === "VERIFICATION_MISMATCH" && issue.field === "emails",
    ),
  );
});

test("review accepts an email confirmed by the verification pass and skips absent verification", () => {
  const base = extraction({ emails: [{ label: null, value: "m-watanabe@example.test" }] });

  const confirmed = reviewIssuesForBusinessCard(base, {
    verification: {
      emails: [" M-Watanabe@Example.Test "],
      organizations: [],
      phones: [],
    },
  });
  assert.ok(!confirmed.some((issue) => issue.code === "VERIFICATION_MISMATCH"));

  // 校验遍失败/缺席时不产生 mismatch——格式检查仍然兜底，但不能凭空标红。
  const withoutVerification = reviewIssuesForBusinessCard(base, {});
  assert.ok(!withoutVerification.some((issue) => issue.code === "VERIFICATION_MISMATCH"));
});

test("review flags a phone number the verification pass read differently by digits", () => {
  const issues = reviewIssuesForBusinessCard(
    extraction({
      contactPoints: [
        { label: null, type: "mobile", value: "090-1234-5678" },
        { label: null, type: "wechat", value: "hanako_wx" },
      ],
    }),
    {
      verification: {
        emails: [],
        organizations: [],
        phones: ["090-1234-5679"],
      },
    },
  );

  assert.ok(
    issues.some(
      (issue) => issue.code === "VERIFICATION_MISMATCH" && issue.field === "contactPoints",
    ),
  );
});

test("messenger contact points survive normalization and skip phone validation", () => {
  const normalized = normalizeBusinessCardExtraction(
    extraction({
      contactPoints: [{ label: " WeChat ", type: "wechat", value: " hanako_wx " }],
    }),
  );
  assert.deepEqual(normalized.contactPoints, [
    { label: "WeChat", type: "wechat", value: "hanako_wx" },
  ]);

  // 微信号不是电话号码，不能被 INVALID_PHONE 误伤。
  const issues = reviewIssuesForBusinessCard(
    extraction({
      contactPoints: [{ label: null, type: "wechat", value: "hanako_wx" }],
    }),
  );
  assert.ok(!issues.some((issue) => issue.code === "INVALID_PHONE"));
});
