import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBusinessCardExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import {
  businessCardIndustryInstruction,
  businessCardIndustryTaxonomyBlock,
} from "../../features/acquisition/business-card-industry-prompt";
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
import { INGEST_V2_EXTRACTION_SCHEMA_VERSION } from "../../features/acquisition/business-card-ingest-v2/contract";
import { businessCardStructuredExtractionSchema, ingestCardConfirmationInputSchema } from "../../shared/api-schema/business-card-batch";
import { INDUSTRY_CATALOG, SECONDARY_INDUSTRY_CATALOG, sanitizeIndustryPair } from "../../shared/domain/industries";

// W0013：名片识别在现有调用的文本整理步骤里顺带输出一级／二级行业。

function baseExtraction() {
  return {
    addresses: [{ label: "本社", value: "東京都テスト区7-8-9" }],
    certifications: [],
    contactPoints: [{ label: "本社", type: "phone", value: "03-0000-3333" }],
    departments: ["法務部"],
    detectedLanguages: ["ja"],
    emails: [{ label: null, value: "taro@example.test" }],
    fullName: "青空 太郎",
    nativeFullName: "青空 太郎",
    organization: "架空法律事務所",
    romanizedFullName: null,
    title: "弁護士",
    website: null,
  };
}

const OTHER_FIELDS = {
  addresses: [{ label: "本社", value: "東京都テスト区7-8-9" }],
  certifications: [],
  contactPoints: [{ label: "本社", type: "phone", value: "03-0000-3333" }],
  departments: ["法務部"],
  detectedLanguages: ["ja"],
  emails: [{ label: null, value: "taro@example.test" }],
  fullName: "青空 太郎",
  nativeFullName: "青空 太郎",
  organization: "架空法律事務所",
  romanizedFullName: null,
  title: "弁護士",
  website: null,
  // W0045：提取结构 v3 起多出职级与地区；本文件的模型输出不含它们，清成 null。
  seniorityLevel: null,
  regionCountryCode: null,
  regionCity: null,
};

// 四种模型输出：合法、分类外、二级不属于一级、缺失。
const CASES: readonly {
  name: string;
  industry: Record<string, unknown>;
  expected: { primaryIndustryId: string | null; secondaryIndustryId: string | null };
}[] = [
  {
    name: "valid pair",
    industry: { primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" },
    expected: { primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" },
  },
  {
    name: "out-of-taxonomy ids",
    industry: { primaryIndustryId: "law", secondaryIndustryId: "law.firms" },
    expected: { primaryIndustryId: null, secondaryIndustryId: null },
  },
  {
    name: "secondary not under primary",
    industry: { primaryIndustryId: "professional_services", secondaryIndustryId: "finance_investment.banking" },
    expected: { primaryIndustryId: null, secondaryIndustryId: null },
  },
  {
    name: "missing industry",
    industry: {},
    expected: { primaryIndustryId: null, secondaryIndustryId: null },
  },
];

function chatResponse(content: string, prompt: number, completion: number): Response {
  return Response.json({
    choices: [{ message: { content, role: "assistant" } }],
    usage: { completion_tokens: completion, prompt_tokens: prompt },
  });
}

test("the prompt taxonomy block is generated from shared/domain/industries.ts and stays compact", () => {
  const block = businessCardIndustryTaxonomyBlock();
  const groups = new Map(block.split("; ").map((entry) => {
    const [primary, suffixes = ""] = entry.split(": ");
    return [primary!, suffixes ? suffixes.split("|") : []] as const;
  }));
  assert.deepEqual([...groups.keys()], INDUSTRY_CATALOG.map((primary) => primary.id));
  for (const secondary of SECONDARY_INDUSTRY_CATALOG) {
    const suffix = secondary.id.slice(secondary.parentId.length + 1);
    // "other" 每个一级都有，由说明统一交代，不逐条列出。
    assert.equal(groups.get(secondary.parentId)!.includes(suffix), suffix !== "other", secondary.id);
  }
  assert.match(businessCardIndustryInstruction(), /every primary also has the suffix "other"/);
  // 紧凑：不重复一级前缀、不带标签；比逐条列完整 id 更短。
  const naive = SECONDARY_INDUSTRY_CATALOG.map((entry) => entry.id).join(", ");
  assert.ok(block.length < naive.length * 0.5, `${block.length} vs ${naive.length}`);
  assert.doesNotMatch(block, /餐饮|Food/);
  assert.ok(businessCardIndustryInstruction().includes(block));
});

test("both providers' prompts carry the industry instruction and the schema requires both industry keys", () => {
  assert.ok(businessCardStructuringPrompt().includes(businessCardIndustryInstruction()));
  assert.ok(BUSINESS_CARD_EXTRACTION_PROMPT.includes(businessCardIndustryInstruction()));
  const required: readonly string[] = BUSINESS_CARD_EXTRACTION_JSON_SCHEMA.required;
  assert.ok(required.includes("primaryIndustryId"));
  assert.ok(required.includes("secondaryIndustryId"));
  assert.deepEqual(BUSINESS_CARD_EXTRACTION_JSON_SCHEMA.properties.primaryIndustryId, { type: ["string", "null"] });
  assert.equal(INGEST_V2_EXTRACTION_SCHEMA_VERSION, 3);
});

test("sanitizeIndustryPair keeps a valid primary when only the secondary is unknown", () => {
  assert.deepEqual(sanitizeIndustryPair("professional_services", "professional_services.unknown"), {
    primaryIndustryId: "professional_services",
    secondaryIndustryId: null,
  });
  assert.deepEqual(sanitizeIndustryPair(null, "professional_services.legal"), {
    primaryIndustryId: null,
    secondaryIndustryId: null,
  });
  assert.deepEqual(sanitizeIndustryPair(42, {}), { primaryIndustryId: null, secondaryIndustryId: null });
});

for (const entry of CASES) {
  test(`DeepSeek structuring step: ${entry.name}`, async () => {
    const requests: Record<string, unknown>[] = [];
    const provider = createConfiguredDeepseekBusinessCardOcrProvider({
      env: { DEEPSEEK_API_KEY: "test-deepseek-key" },
      fetchImplementation: (async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return requests.length === 1
          ? chatResponse("架空法律事務所\n青空 太郎 弁護士", 900, 120)
          : chatResponse(JSON.stringify({ ...baseExtraction(), ...entry.industry }), 1400, 230);
      }) as typeof fetch,
    });
    assert.ok(provider);
    const result = await provider.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" });

    assert.equal(requests.length, 2, "transcribe + structure: no extra call for the industry");
    const structuringMessages = requests[1]?.messages as { content: string; role: string }[];
    assert.ok(structuringMessages[0]?.content.includes(businessCardIndustryTaxonomyBlock()));
    const visionMessages = requests[0]?.messages as { content: { text?: string }[] }[];
    assert.ok(!JSON.stringify(visionMessages).includes("primaryIndustryId"), "the vision stage is unchanged");

    const { primaryIndustryId, secondaryIndustryId, ...others } = result.extraction;
    assert.deepEqual({ primaryIndustryId, secondaryIndustryId }, entry.expected);
    assert.deepEqual(others, OTHER_FIELDS, "other fields are unaffected");
    assert.equal(result.usage.inputTokens, 2300);
    assert.equal(result.usage.outputTokens, 350);
  });

  test(`Gemini single call: ${entry.name}`, async () => {
    const requests: Record<string, unknown>[] = [];
    const provider = createConfiguredGeminiBusinessCardOcrProvider({
      env: { GEMINI_API_KEY: "test-gemini-key" },
      fetchImplementation: (async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          steps: [{ content: [{ text: JSON.stringify({ ...baseExtraction(), ...entry.industry }), type: "text" }], type: "message" }],
          usage: { total_input_tokens: 1500, total_output_tokens: 260 },
        });
      }) as typeof fetch,
    });
    assert.ok(provider);
    const result = await provider.extract({ imageBase64: "aW1hZ2U=", mimeType: "image/png" });

    assert.equal(requests.length, 1, "Gemini keeps its single request");
    const input = requests[0]?.input as { text?: string }[];
    assert.ok(input[0]?.text?.includes(businessCardIndustryTaxonomyBlock()));
    const schema = (requests[0]?.response_format as { schema: { required: string[] } }).schema;
    assert.ok(schema.required.includes("primaryIndustryId"));

    const { primaryIndustryId, secondaryIndustryId, ...others } = result.extraction;
    assert.deepEqual({ primaryIndustryId, secondaryIndustryId }, entry.expected);
    assert.deepEqual(others, OTHER_FIELDS, "other fields are unaffected");
  });
}

test("an invalid industry never fails the whole card, while other malformed fields still do", () => {
  const parsed = parseBusinessCardStructuredExtraction({ ...baseExtraction(), primaryIndustryId: 7, secondaryIndustryId: ["x"] });
  assert.equal(parsed.primaryIndustryId, null);
  assert.equal(parsed.organization, "架空法律事務所");
  assert.throws(() => parseBusinessCardStructuredExtraction({ ...baseExtraction(), organization: 7 }));
});

test("normalization keeps a valid pair and maps a v1 extraction without industry keys to null", () => {
  const normalized = normalizeBusinessCardExtraction({
    ...parseBusinessCardStructuredExtraction(baseExtraction()),
    primaryIndustryId: "professional_services",
    secondaryIndustryId: "professional_services.legal",
  });
  assert.equal(normalized.secondaryIndustryId, "professional_services.legal");
  const { primaryIndustryId: _p, secondaryIndustryId: _s, ...v1 } = parseBusinessCardStructuredExtraction(baseExtraction());
  const legacy = normalizeBusinessCardExtraction(v1 as Parameters<typeof normalizeBusinessCardExtraction>[0]);
  assert.equal(legacy.primaryIndustryId, null);
  assert.equal(legacy.secondaryIndustryId, null);
});

test("the cross-client extraction schema accepts v1 JSON unchanged and clears invalid industry values", () => {
  const v1 = baseExtraction();
  assert.deepEqual(businessCardStructuredExtractionSchema.parse(v1), v1);
  const v2 = { ...v1, primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" };
  assert.deepEqual(businessCardStructuredExtractionSchema.parse(v2), v2);
  const invalid = businessCardStructuredExtractionSchema.parse({ ...v1, primaryIndustryId: "law", secondaryIndustryId: "professional_services.legal" });
  assert.equal(invalid.primaryIndustryId, null);
  assert.equal(invalid.secondaryIndustryId, null);
});

test("the confirmation input carries a reviewed industry and rejects a mismatched pair", () => {
  const base = {
    confirmationIntentId: "intent:1",
    expectedCardItems: [{ itemId: "item:1", version: 2, imageDigest: `sha256:${"a".repeat(64)}` }],
    fieldSources: { displayName: "item:1", organization: null, role: null, email: null, phone: null },
    displayName: "青空 太郎", organization: "", role: "", email: "", phone: "", relationshipContext: "", notes: "",
  };
  const legacy = ingestCardConfirmationInputSchema.parse(base);
  assert.equal("primaryIndustryId" in legacy, false, "old clients send no industry and none is written");
  const reviewed = ingestCardConfirmationInputSchema.parse({ ...base, primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" });
  assert.equal(reviewed.secondaryIndustryId, "professional_services.legal");
  const cleared = ingestCardConfirmationInputSchema.parse({ ...base, primaryIndustryId: null, secondaryIndustryId: null });
  assert.equal(cleared.primaryIndustryId, null);
  assert.equal(ingestCardConfirmationInputSchema.safeParse({ ...base, primaryIndustryId: "professional_services", secondaryIndustryId: "finance_investment.banking" }).success, false);
  assert.equal(ingestCardConfirmationInputSchema.safeParse({ ...base, primaryIndustryId: "law" }).success, false);
});
