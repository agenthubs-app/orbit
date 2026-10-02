import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBusinessCardExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import { businessCardEnrichmentInstruction } from "../../features/acquisition/business-card-enrichment-prompt";
import {
  BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  parseBusinessCardStructuredExtraction,
} from "../../features/acquisition/business-card-ocr-validation";
import {
  businessCardStructuringPrompt,
  createConfiguredDeepseekBusinessCardOcrProvider,
} from "../../features/acquisition/deepseek-business-card-ocr-provider";
import {
  BUSINESS_CARD_EXTRACTION_PROMPT,
  createConfiguredGeminiBusinessCardOcrProvider,
} from "../../features/acquisition/gemini-business-card-ocr-provider";
import { businessCardStructuredExtractionSchema } from "../../shared/api-schema/business-card-batch";

// W0045 SC-01：同一次调用多出职级与地区；provider HTTP 请求次数与改前完全相同。

function baseExtraction() {
  return {
    addresses: [{ label: "本社", value: "東京都千代田区丸の内1-1-1" }],
    certifications: [],
    contactPoints: [{ label: "本社", type: "phone", value: "03-0000-3333" }],
    departments: ["営業本部"],
    detectedLanguages: ["ja"],
    emails: [{ label: null, value: "hanako@example.test" }],
    fullName: "架空 花子",
    nativeFullName: "架空 花子",
    organization: "架空商事株式会社",
    primaryIndustryId: null,
    romanizedFullName: null,
    secondaryIndustryId: null,
    title: "営業本部長",
    website: null,
  };
}

const OTHER_FIELDS = {
  addresses: [{ label: "本社", value: "東京都千代田区丸の内1-1-1" }],
  certifications: [],
  contactPoints: [{ label: "本社", type: "phone", value: "03-0000-3333" }],
  departments: ["営業本部"],
  detectedLanguages: ["ja"],
  emails: [{ label: null, value: "hanako@example.test" }],
  fullName: "架空 花子",
  nativeFullName: "架空 花子",
  organization: "架空商事株式会社",
  primaryIndustryId: null,
  romanizedFullName: null,
  secondaryIndustryId: null,
  title: "営業本部長",
  website: null,
};

// 三种模型输出：合法、越界、缺失。
const CASES: readonly {
  name: string;
  enrichment: Record<string, unknown>;
  expected: { seniorityLevel: string | null; regionCountryCode: string | null; regionCity: string | null };
}[] = [
  {
    name: "valid seniority and region (city alias canonicalized)",
    enrichment: { seniorityLevel: "director", regionCountryCode: "JP", regionCity: "東京" },
    expected: { seniorityLevel: "director", regionCountryCode: "JP", regionCity: "Tokyo" },
  },
  {
    name: "out-of-range values",
    enrichment: { seniorityLevel: "chairman", regionCountryCode: "XX", regionCity: "Tokyo" },
    expected: { seniorityLevel: null, regionCountryCode: null, regionCity: null },
  },
  {
    name: "wrong types",
    enrichment: { seniorityLevel: 3, regionCountryCode: ["JP"], regionCity: {} },
    expected: { seniorityLevel: null, regionCountryCode: null, regionCity: null },
  },
  {
    name: "missing keys",
    enrichment: {},
    expected: { seniorityLevel: null, regionCountryCode: null, regionCity: null },
  },
];

function chatResponse(content: string, prompt: number, completion: number): Response {
  return Response.json({
    choices: [{ message: { content, role: "assistant" } }],
    usage: { completion_tokens: completion, prompt_tokens: prompt },
  });
}

test("both providers ask for seniority and region inside the existing request, and the schema requires the three keys", () => {
  assert.ok(businessCardStructuringPrompt().includes(businessCardEnrichmentInstruction()));
  assert.ok(BUSINESS_CARD_EXTRACTION_PROMPT.includes(businessCardEnrichmentInstruction()));
  assert.match(businessCardStructuringPrompt(), /except the industry, seniority, and region fields/);
  const required: readonly string[] = BUSINESS_CARD_EXTRACTION_JSON_SCHEMA.required;
  for (const key of ["seniorityLevel", "regionCountryCode", "regionCity"]) {
    assert.ok(required.includes(key), key);
    assert.deepEqual((BUSINESS_CARD_EXTRACTION_JSON_SCHEMA.properties as Record<string, unknown>)[key], { type: ["string", "null"] });
  }
  assert.equal(Object.keys(BUSINESS_CARD_EXTRACTION_JSON_SCHEMA.properties).length, required.length, "every property stays required");
});

for (const entry of CASES) {
  test(`DeepSeek: ${entry.name} — still transcribe + structure (+ optional verification), no extra call`, async () => {
    const requests: Record<string, unknown>[] = [];
    const provider = createConfiguredDeepseekBusinessCardOcrProvider({
      env: { DEEPSEEK_API_KEY: "test-deepseek-key" },
      fetchImplementation: (async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (requests.length === 1) return chatResponse("架空商事株式会社\n営業本部長 架空 花子", 900, 120);
        if (requests.length === 2) return chatResponse(JSON.stringify({ ...baseExtraction(), ...entry.enrichment }), 1600, 250);
        return chatResponse("EMAIL: hanako@example.test\nPHONE: 03-0000-3333\nORG: 架空商事株式会社", 700, 40);
      }) as typeof fetch,
    });
    assert.ok(provider);
    const result = await provider.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" });
    assert.equal(requests.length, 2, "transcription + structuring only — seniority and region ride on the structuring call");
    const structuring = requests[1]?.messages as { content: string }[];
    assert.ok(structuring[0]?.content.includes(businessCardEnrichmentInstruction()));
    assert.ok(!JSON.stringify(requests[0]).includes("seniorityLevel"), "the vision stage is unchanged");

    const { seniorityLevel, regionCountryCode, regionCity, ...others } = result.extraction;
    assert.deepEqual({ seniorityLevel, regionCountryCode, regionCity }, entry.expected);
    assert.deepEqual(others, OTHER_FIELDS, "other fields are unaffected");
    assert.deepEqual([result.usage.inputTokens, result.usage.outputTokens], [2500, 370]);

    await provider.verifyHighRiskFields?.({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" });
    assert.equal(requests.length, 3, "the optional verification stays a single extra call");
    assert.ok(!JSON.stringify(requests[2]).includes("seniorityLevel"), "verification prompt is untouched");
  });

  test(`Gemini: ${entry.name} — still a single request`, async () => {
    const requests: Record<string, unknown>[] = [];
    const provider = createConfiguredGeminiBusinessCardOcrProvider({
      env: { GEMINI_API_KEY: "test-gemini-key" },
      fetchImplementation: (async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          steps: [{ content: [{ text: JSON.stringify({ ...baseExtraction(), ...entry.enrichment }), type: "text" }], type: "message" }],
          usage: { total_input_tokens: 1500, total_output_tokens: 260 },
        });
      }) as typeof fetch,
    });
    assert.ok(provider);
    const result = await provider.extract({ imageBase64: "aW1hZ2U=", mimeType: "image/png" });
    assert.equal(requests.length, 1, "Gemini keeps its single request");
    const input = requests[0]?.input as { text?: string }[];
    assert.ok(input[0]?.text?.includes(businessCardEnrichmentInstruction()));
    const schema = (requests[0]?.response_format as { schema: { required: string[] } }).schema;
    for (const key of ["seniorityLevel", "regionCountryCode", "regionCity"]) assert.ok(schema.required.includes(key));

    const { seniorityLevel, regionCountryCode, regionCity, ...others } = result.extraction;
    assert.deepEqual({ seniorityLevel, regionCountryCode, regionCity }, entry.expected);
    assert.deepEqual(others, OTHER_FIELDS, "other fields are unaffected");
  });
}

test("an invalid country drops the city too, and an invalid seniority never fails the card", () => {
  const parsed = parseBusinessCardStructuredExtraction({ ...baseExtraction(), seniorityLevel: "boss", regionCountryCode: "ZZ", regionCity: "Tokyo" });
  assert.deepEqual([parsed.seniorityLevel, parsed.regionCountryCode, parsed.regionCity], [null, null, null]);
  assert.equal(parsed.organization, "架空商事株式会社");
  const countryOnly = parseBusinessCardStructuredExtraction({ ...baseExtraction(), seniorityLevel: "c_level", regionCountryCode: "sg", regionCity: null });
  assert.deepEqual([countryOnly.seniorityLevel, countryOnly.regionCountryCode, countryOnly.regionCity], ["c_level", "SG", null]);
});

test("normalization maps a v1/v2 extraction without the new keys to null and keeps valid values", () => {
  const { seniorityLevel: _s, regionCountryCode: _c, regionCity: _r, ...v2 } = parseBusinessCardStructuredExtraction(baseExtraction());
  const legacy = normalizeBusinessCardExtraction(v2 as Parameters<typeof normalizeBusinessCardExtraction>[0]);
  assert.deepEqual([legacy.seniorityLevel, legacy.regionCountryCode, legacy.regionCity], [null, null, null]);
  const kept = normalizeBusinessCardExtraction({ ...v2, seniorityLevel: "vp", regionCountryCode: "CN", regionCity: "上海" } as Parameters<typeof normalizeBusinessCardExtraction>[0]);
  assert.deepEqual([kept.seniorityLevel, kept.regionCountryCode, kept.regionCity], ["vp", "CN", "Shanghai"]);
});

test("the cross-client extraction schema keeps v2 JSON unchanged and clears invalid v3 values", () => {
  const v2 = baseExtraction();
  assert.deepEqual(businessCardStructuredExtractionSchema.parse(v2), v2);
  const v3 = { ...v2, seniorityLevel: "manager", regionCountryCode: "JP", regionCity: "Osaka" };
  assert.deepEqual(businessCardStructuredExtractionSchema.parse(v3), v3);
  const invalid = businessCardStructuredExtractionSchema.parse({ ...v2, seniorityLevel: "boss", regionCountryCode: "jp", regionCity: "Osaka" });
  assert.deepEqual([invalid.seniorityLevel, invalid.regionCountryCode, invalid.regionCity], [null, null, null]);
});
