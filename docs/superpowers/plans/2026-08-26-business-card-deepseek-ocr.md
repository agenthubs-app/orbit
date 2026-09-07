# 名片识别 DeepSeek 两阶段引擎 + HEIC 进口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把名片识别的云端 OCR 从 Gemini 切换为 DeepSeek 两阶段（`deepseek-v4-flash-vision-exp` 读卡 → `deepseek-v4-flash` 结构化），并让上传边界接受 iPhone HEIC 图片，端到端跑通 上传→识别→复核→确认→入库。

**Architecture:** 全部工作在 `repos/orbits`。在 provider 中立契约 `BusinessCardCloudOcrProvider` 下新增 DeepSeek provider（内部两次 `https://api.deepseek.com/chat/completions` 调用）；工厂改为 DeepSeek 优先、Gemini 兜底；HEIC 在 scan 服务边界经 `heic-convert`（纯 JS，已实测可解码测试图）转成 JPEG 后进入现有管线。UI、复核流、草稿管线、确认写入、查重不动。

**Tech Stack:** Next.js + TypeScript、`node --test --import tsx`（测试）、`heic-convert`（新依赖）、DeepSeek chat/completions（OpenAI 兼容）。

**Spec:** `docs/superpowers/specs/2026-08-26-business-card-deepseek-ocr-design.md`

## Global Constraints

- 工作目录：`/Users/li/work/orbit/repos/orbits`（下文相对路径均以此为根；spec 与测试图在上层 `/Users/li/work/orbit/docs/designs/`）。
- **GitNexus 纪律（orbits 仓库 CLAUDE.md 强制）**：修改任何已有函数/类前先跑 impact 分析并报告 blast radius（工具用法见 `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md`）；每次提交前跑 `detect_changes()`；HIGH/CRITICAL 风险必须先警告用户。新建文件不需要 impact。
- 契约 `BusinessCardCloudOcrProvider`（`features/acquisition/business-card-cloud-ocr.ts`）零改动；模型侧 MIME 白名单 `BUSINESS_CARD_IMAGE_MIME_TYPES` 保持 JPEG/PNG/WebP。
- 错误码集合不变：`INVALID_STRUCTURED_OUTPUT` / `PROVIDER_REQUEST_FAILED` / `PROVIDER_TIMEOUT`；每阶段超时 20_000ms。
- 原图/转码图/base64/provider 原始响应一律不落库；SHA-256 证据摘要按**上传原始字节**计算。
- 默认模型名（逐字）：vision `deepseek-v4-flash-vision-exp`，text `deepseek-v4-flash`；env 覆盖键：`ORBIT_BUSINESS_CARD_OCR_VISION_MODEL` / `ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL`；密钥仅 `DEEPSEEK_API_KEY`。
- 上传大小上限沿用 10MiB（按上传原图字节）。
- 测试跑法：单文件 `node --test --import tsx tests/capabilities/<file>.test.ts`；全量 `npm test`。**开工前先跑一次全量记录失败基线**（仓库存在既有失败基线，不得新增失败）。
- 已实测事实：本机 sharp 0.34.5 预编译包**不能**解码 HEIC（`heif: Support for this compression format has not been built in`）；`heic-convert@2` 可以（random_meishi.heic → 4.9MB JPEG，约 2s）。不要再尝试 sharp 解码 HEIC。
- Gemini provider 文件保留，不删除。

---

### Task 0: 记录测试基线

**Files:** 无修改。

- [ ] **Step 1: 跑全量测试记录基线**

Run: `cd /Users/li/work/orbit/repos/orbits && npm test 2>&1 | tail -30`
把失败清单存到 scratchpad（如 `baseline-test-failures.txt`）。后续每个任务只要求：不新增失败。

---

### Task 1: 抽取共享校验模块 `business-card-ocr-validation.ts`

把 Gemini provider 里 provider 无关的部分（错误类、严格结构校验、JSON schema）移到共享文件，供 DeepSeek provider 复用。纯重构，行为不变，由现有测试守护。

**Files:**
- Create: `features/acquisition/business-card-ocr-validation.ts`
- Modify: `features/acquisition/gemini-business-card-ocr-provider.ts`
- Test（现有，不改）: `tests/capabilities/business-card-cloud-ocr.test.ts`

**Interfaces:**
- Produces（后续任务依赖，签名逐字）:
  - `class BusinessCardCloudOcrProviderError extends Error { readonly code: BusinessCardCloudOcrProviderErrorCode }`（构造 `(code, message)`）
  - `type BusinessCardCloudOcrProviderErrorCode = "INVALID_STRUCTURED_OUTPUT" | "PROVIDER_REQUEST_FAILED" | "PROVIDER_TIMEOUT"`
  - `function parseBusinessCardStructuredExtraction(value: unknown): BusinessCardStructuredExtraction`（无效时 throw `INVALID_STRUCTURED_OUTPUT` 的 `BusinessCardCloudOcrProviderError`）
  - `const BUSINESS_CARD_EXTRACTION_JSON_SCHEMA`（原样移动）

- [ ] **Step 1: GitNexus impact 分析**

对 `createConfiguredGeminiBusinessCardOcrProvider`、`BusinessCardCloudOcrProviderError` 跑 upstream impact，报告 blast radius（已知调用方：`service-factory.ts`、`scripts/evaluate-business-card-ocr.ts`、`tests/capabilities/business-card-cloud-ocr.test.ts`）。

- [ ] **Step 2: 创建共享模块**

新建 `features/acquisition/business-card-ocr-validation.ts`，从 `gemini-business-card-ocr-provider.ts` **原样移入**（非复制）以下内容：
- `BusinessCardCloudOcrProviderErrorCode` 类型、`BusinessCardCloudOcrProviderError` 类（现文件 102-118 行）；
- `nullableStringSchema`、`labeledValueSchema`、`BUSINESS_CARD_EXTRACTION_JSON_SCHEMA`（25-100 行）；
- 校验辅助函数 `isRecord`、`nullableString`、`stringArray`、`labeledValues`、`contactPoints`、`isContactPointType`（135-216 行）；
- `structuredExtraction` 函数（218-273 行），**改名导出为 `parseBusinessCardStructuredExtraction`**。

import 从 `./business-card-cloud-ocr` 取所需类型（`BusinessCardContactPoint`、`BusinessCardContactPointType`、`BusinessCardLabeledValue`、`BusinessCardStructuredExtraction`）。

- [ ] **Step 3: 改写 Gemini provider 引用共享模块**

`gemini-business-card-ocr-provider.ts`：删除已移走的定义；顶部加

```ts
import {
  BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  BusinessCardCloudOcrProviderError,
  parseBusinessCardStructuredExtraction,
} from "./business-card-ocr-validation";

export {
  BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  BusinessCardCloudOcrProviderError,
  type BusinessCardCloudOcrProviderErrorCode,
} from "./business-card-ocr-validation";
```

`parseProviderPayload` 内 `structuredExtraction(JSON.parse(text) as unknown)` 改为 `parseBusinessCardStructuredExtraction(JSON.parse(text) as unknown)`。其余（prompt、endpoint、`responseText`、`usageFor`、provider 工厂）不动。

- [ ] **Step 4: 跑守护测试**

Run: `node --test --import tsx tests/capabilities/business-card-cloud-ocr.test.ts`
Expected: 全部 PASS（测试从 gemini 文件 import 的 `BusinessCardCloudOcrProviderError` 经 re-export 仍可用）。

- [ ] **Step 5: Commit**

```bash
git add features/acquisition/business-card-ocr-validation.ts features/acquisition/gemini-business-card-ocr-provider.ts
git commit -m "refactor(acquisition): extract provider-neutral business-card OCR validation"
```

---

### Task 2: DeepSeek 两阶段 OCR provider

**Files:**
- Create: `features/acquisition/deepseek-business-card-ocr-provider.ts`
- Test: `tests/capabilities/deepseek-business-card-ocr-provider.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `BusinessCardCloudOcrProviderError` / `parseBusinessCardStructuredExtraction` / `BUSINESS_CARD_EXTRACTION_JSON_SCHEMA`。
- Produces: `createConfiguredDeepseekBusinessCardOcrProvider(options?: ConfiguredDeepseekBusinessCardOcrProviderOptions): BusinessCardCloudOcrProvider | null`，options 形如 `{ env?, fetchImplementation?, nowMs?, timeoutMs? }`（与 Gemini 版一致）。`providerName` 为 `"deepseek-chat-completions"`，`model` 为 `` `${visionModel}+${textModel}` ``。

- [ ] **Step 1: 写失败测试**

新建 `tests/capabilities/deepseek-business-card-ocr-provider.test.ts`（复用现有测试的 `providerExtraction()` 形状，见 `business-card-cloud-ocr.test.ts` 118-136 行）：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { BusinessCardCloudOcrProviderError } from "../../features/acquisition/business-card-ocr-validation";
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

function chatResponse(content: string, usage: { prompt: number; completion: number }): Response {
  return Response.json({
    choices: [{ message: { content, role: "assistant" } }],
    usage: { completion_tokens: usage.completion, prompt_tokens: usage.prompt },
  });
}

test("DeepSeek business card provider runs the two-stage transcribe-then-structure flow", async () => {
  const requests: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "test-deepseek-key" },
    fetchImplementation: (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ body, headers: (init?.headers ?? {}) as Record<string, string> });
      return requests.length === 1
        ? chatResponse("架空技研株式会社\n青空 太郎 室長\nTEL(本社) 03-0000-3333", { prompt: 900, completion: 120 })
        : chatResponse(JSON.stringify(providerExtraction()), { prompt: 400, completion: 210 });
    }) as typeof fetch,
  });

  assert.ok(provider);
  const result = await provider.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" });

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.body.model, "deepseek-v4-flash-vision-exp");
  const visionContent = (requests[0]?.body.messages as { content: unknown }[])[0]?.content as {
    image_url?: { url: string };
    type: string;
  }[];
  assert.ok(
    visionContent.some(
      (part) => part.type === "image_url" && part.image_url?.url === "data:image/jpeg;base64,aGVsbG8=",
    ),
  );
  assert.equal(requests[0]?.headers.Authorization, "Bearer test-deepseek-key");
  assert.equal(requests[1]?.body.model, "deepseek-v4-flash");
  assert.deepEqual(requests[1]?.body.response_format, { type: "json_object" });
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
    fetchImplementation: (async () => chatResponse("x", { prompt: 0, completion: 0 })) as typeof fetch,
  });

  assert.equal(provider?.model, "deepseek-vision-test+deepseek-text-test");
});

test("DeepSeek business card provider fails visibly on an empty transcription", async () => {
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "k" },
    fetchImplementation: (async () => chatResponse("   ", { prompt: 1, completion: 1 })) as typeof fetch,
  });

  await assert.rejects(
    provider!.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError && error.code === "INVALID_STRUCTURED_OUTPUT",
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

  await assert.rejects(
    provider!.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError && error.code === "INVALID_STRUCTURED_OUTPUT",
  );
});

test("DeepSeek business card provider redacts provider request failures", async () => {
  const provider = createConfiguredDeepseekBusinessCardOcrProvider({
    env: { DEEPSEEK_API_KEY: "k" },
    fetchImplementation: (async () =>
      new Response("secret upstream detail", { status: 500 })) as typeof fetch,
  });

  await assert.rejects(
    provider!.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
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

  await assert.rejects(
    provider!.extract({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" }),
    (error: unknown) =>
      error instanceof BusinessCardCloudOcrProviderError && error.code === "PROVIDER_TIMEOUT",
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --import tsx tests/capabilities/deepseek-business-card-ocr-provider.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 provider**

新建 `features/acquisition/deepseek-business-card-ocr-provider.ts`：

```ts
import {
  BUSINESS_CARD_IMAGE_MIME_TYPES,
  type BusinessCardCloudOcrProvider,
  type BusinessCardImageMimeType,
} from "./business-card-cloud-ocr";
import {
  BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  BusinessCardCloudOcrProviderError,
  parseBusinessCardStructuredExtraction,
} from "./business-card-ocr-validation";

const DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT =
  "https://api.deepseek.com/chat/completions";
export const DEFAULT_BUSINESS_CARD_VISION_MODEL = "deepseek-v4-flash-vision-exp";
export const DEFAULT_BUSINESS_CARD_TEXT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 20_000;

export const BUSINESS_CARD_TRANSCRIPTION_PROMPT = [
  "Transcribe every piece of text visibly printed on this business card.",
  "The photographed card may be rotated; read it in its natural orientation.",
  "Preserve the original wording, line breaks, and office or contact labels.",
  "Keep native-script and romanized spellings separately when both are printed.",
  "Do not translate, summarize, or invent text that is not on the card.",
].join(" ");

export function businessCardStructuringPrompt(): string {
  return [
    "You convert a raw business-card transcription into structured JSON.",
    "Use only text present in the transcription. Never infer or invent missing values.",
    "Keep native-script and romanized names separate when both are transcribed.",
    "Keep printed office labels on phones, faxes, emails, and addresses.",
    "Return null or an empty array for absent fields.",
    "Respond with a single JSON object matching this JSON schema exactly:",
    JSON.stringify(BUSINESS_CARD_EXTRACTION_JSON_SCHEMA),
  ].join(" ");
}

type BusinessCardOcrEnv = Record<string, string | undefined>;

export interface ConfiguredDeepseekBusinessCardOcrProviderOptions {
  env?: BusinessCardOcrEnv;
  fetchImplementation?: typeof fetch;
  nowMs?: () => number;
  timeoutMs?: number;
}

function readString(value: string | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chatCompletionContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const first: unknown = payload.choices[0];

  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }

  return typeof first.message.content === "string" ? first.message.content : null;
}

function chatCompletionUsage(payload: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return { inputTokens: 0, outputTokens: 0 };
  }

  return {
    inputTokens:
      typeof payload.usage.prompt_tokens === "number"
        ? payload.usage.prompt_tokens
        : 0,
    outputTokens:
      typeof payload.usage.completion_tokens === "number"
        ? payload.usage.completion_tokens
        : 0,
  };
}

function isBusinessCardMimeType(value: string): value is BusinessCardImageMimeType {
  return BUSINESS_CARD_IMAGE_MIME_TYPES.some((mimeType) => mimeType === value);
}

async function postChatCompletion(input: {
  apiKey: string;
  body: Record<string, unknown>;
  fetchImplementation: typeof fetch;
  timeoutMs: number;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImplementation(
      DEEPSEEK_CHAT_COMPLETIONS_ENDPOINT,
      {
        body: JSON.stringify(input.body),
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new BusinessCardCloudOcrProviderError(
        "PROVIDER_REQUEST_FAILED",
        `The business-card OCR provider request failed with status ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    const content = chatCompletionContent(payload);

    if (!content?.trim()) {
      throw new BusinessCardCloudOcrProviderError(
        "INVALID_STRUCTURED_OUTPUT",
        "The OCR provider returned an invalid structured business-card result.",
      );
    }

    return { content, ...chatCompletionUsage(payload) };
  } catch (error) {
    if (error instanceof BusinessCardCloudOcrProviderError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new BusinessCardCloudOcrProviderError(
        "PROVIDER_TIMEOUT",
        "The business-card OCR provider request timed out.",
      );
    }

    throw new BusinessCardCloudOcrProviderError(
      "PROVIDER_REQUEST_FAILED",
      "The business-card OCR provider request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createConfiguredDeepseekBusinessCardOcrProvider({
  env = process.env,
  fetchImplementation = fetch,
  nowMs = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ConfiguredDeepseekBusinessCardOcrProviderOptions = {}): BusinessCardCloudOcrProvider | null {
  const apiKey = readString(env.DEEPSEEK_API_KEY);

  if (!apiKey) {
    return null;
  }

  const visionModel =
    readString(env.ORBIT_BUSINESS_CARD_OCR_VISION_MODEL) ??
    DEFAULT_BUSINESS_CARD_VISION_MODEL;
  const textModel =
    readString(env.ORBIT_BUSINESS_CARD_OCR_TEXT_MODEL) ??
    DEFAULT_BUSINESS_CARD_TEXT_MODEL;

  return {
    model: `${visionModel}+${textModel}`,
    providerName: "deepseek-chat-completions",
    async extract(input) {
      if (!isBusinessCardMimeType(input.mimeType)) {
        throw new BusinessCardCloudOcrProviderError(
          "INVALID_STRUCTURED_OUTPUT",
          "The OCR provider received an unsupported business-card image type.",
        );
      }

      const startedAt = nowMs();
      const transcription = await postChatCompletion({
        apiKey,
        body: {
          messages: [
            {
              content: [
                { text: BUSINESS_CARD_TRANSCRIPTION_PROMPT, type: "text" },
                {
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.imageBase64}`,
                  },
                  type: "image_url",
                },
              ],
              role: "user",
            },
          ],
          model: visionModel,
        },
        fetchImplementation,
        timeoutMs,
      });

      const structured = await postChatCompletion({
        apiKey,
        body: {
          messages: [
            { content: businessCardStructuringPrompt(), role: "system" },
            { content: transcription.content, role: "user" },
          ],
          model: textModel,
          response_format: { type: "json_object" },
        },
        fetchImplementation,
        timeoutMs,
      });

      let parsed: unknown;

      try {
        parsed = JSON.parse(structured.content);
      } catch {
        throw new BusinessCardCloudOcrProviderError(
          "INVALID_STRUCTURED_OUTPUT",
          "The OCR provider returned an invalid structured business-card result.",
        );
      }

      return {
        extraction: parseBusinessCardStructuredExtraction(parsed),
        usage: {
          inputTokens: transcription.inputTokens + structured.inputTokens,
          latencyMs: Math.max(0, nowMs() - startedAt),
          outputTokens: transcription.outputTokens + structured.outputTokens,
        },
      };
    },
  };
}
```

注意「空转录」测试：stage A 返回空白内容时 `postChatCompletion` 内 `!content?.trim()` 已抛 `INVALID_STRUCTURED_OUTPUT`，无需额外分支。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --import tsx tests/capabilities/deepseek-business-card-ocr-provider.test.ts`
Expected: 7 项全 PASS。再跑 `node --test --import tsx tests/capabilities/business-card-cloud-ocr.test.ts` 确认无回归。

- [ ] **Step 5: Commit**

```bash
git add features/acquisition/deepseek-business-card-ocr-provider.ts tests/capabilities/deepseek-business-card-ocr-provider.test.ts
git commit -m "feat(acquisition): add DeepSeek two-stage business-card OCR provider"
```

---

### Task 3: provider 选择模块 + 工厂接线 + 可用性门禁

**Files:**
- Create: `features/acquisition/business-card-ocr-provider-selection.ts`
- Modify: `features/acquisition/service-factory.ts:21,117`
- Modify: `features/acquisition/business-card-capture-availability.ts:38-39`
- Test: `tests/capabilities/deepseek-business-card-ocr-provider.test.ts`（追加选择测试）、`tests/capabilities/business-card-capture-availability.test.ts`（追加 DeepSeek 用例）

**Interfaces:**
- Consumes: Task 2 的 `createConfiguredDeepseekBusinessCardOcrProvider`；现有 `createConfiguredGeminiBusinessCardOcrProvider`。
- Produces: `createConfiguredBusinessCardCloudOcrProvider(options?: { env?: Record<string, string | undefined>; fetchImplementation?: typeof fetch }): BusinessCardCloudOcrProvider | null`（Task 6 eval 脚本也用它）。

- [ ] **Step 1: GitNexus impact 分析**

对 `resolveBusinessCardCaptureAvailability` 和 `businessCardScanOcrServiceFactory` 跑 upstream impact，报告结果（availability 的调用方含 `/app/contacts/new` 页面服务端组件）。

- [ ] **Step 2: 写失败测试**

`tests/capabilities/deepseek-business-card-ocr-provider.test.ts` 末尾追加：

```ts
import { createConfiguredBusinessCardCloudOcrProvider } from "../../features/acquisition/business-card-ocr-provider-selection";

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
```

（import 放文件顶部。）`tests/capabilities/business-card-capture-availability.test.ts`：找到现有 `reason === "ready"` 用例，复制一份改名为 DeepSeek 用例——env 里去掉 `GEMINI_API_KEY`/`GOOGLE_API_KEY`、加 `DEEPSEEK_API_KEY: "test-deepseek-key"`，断言 `available === true && reason === "ready" && ocrProviderConfigured === true`（其余 env 键与原用例保持逐字一致）。

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test --import tsx tests/capabilities/deepseek-business-card-ocr-provider.test.ts tests/capabilities/business-card-capture-availability.test.ts`
Expected: 新增两项 FAIL。

- [ ] **Step 4: 实现**

新建 `features/acquisition/business-card-ocr-provider-selection.ts`：

```ts
import type { BusinessCardCloudOcrProvider } from "./business-card-cloud-ocr";
import { createConfiguredDeepseekBusinessCardOcrProvider } from "./deepseek-business-card-ocr-provider";
import { createConfiguredGeminiBusinessCardOcrProvider } from "./gemini-business-card-ocr-provider";

export interface ConfiguredBusinessCardOcrProviderOptions {
  env?: Record<string, string | undefined>;
  fetchImplementation?: typeof fetch;
}

/** DeepSeek first (workspace default), Gemini kept as a compatible fallback. */
export function createConfiguredBusinessCardCloudOcrProvider(
  options: ConfiguredBusinessCardOcrProviderOptions = {},
): BusinessCardCloudOcrProvider | null {
  return (
    createConfiguredDeepseekBusinessCardOcrProvider(options) ??
    createConfiguredGeminiBusinessCardOcrProvider(options)
  );
}
```

`service-factory.ts`：第 21 行 import 改为 `import { createConfiguredBusinessCardCloudOcrProvider } from "./business-card-ocr-provider-selection";`；第 117 行改为 `cloudOcrProvider: createConfiguredBusinessCardCloudOcrProvider(),`。

`business-card-capture-availability.ts` 38-39 行改为：

```ts
  const ocrProviderConfigured =
    configured(env.DEEPSEEK_API_KEY) ||
    configured(env.GEMINI_API_KEY) ||
    configured(env.GOOGLE_API_KEY);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --import tsx tests/capabilities/deepseek-business-card-ocr-provider.test.ts tests/capabilities/business-card-capture-availability.test.ts tests/services/core-service-factories.test.ts`
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add features/acquisition/business-card-ocr-provider-selection.ts features/acquisition/service-factory.ts features/acquisition/business-card-capture-availability.ts tests/capabilities/deepseek-business-card-ocr-provider.test.ts tests/capabilities/business-card-capture-availability.test.ts
git commit -m "feat(acquisition): route business-card OCR through DeepSeek-first provider selection"
```

---

### Task 4: HEIC 归一化模块

**Files:**
- Create: `features/acquisition/business-card-image-normalization.ts`
- Create: `types/heic-convert.d.ts`（若 `@types/heic-convert` 不存在于 npm）
- Create: `tests/fixtures/business-card-tiny.heic`（生成的小 fixture，几 KB）
- Test: `tests/capabilities/business-card-image-normalization.test.ts`

**Interfaces:**
- Produces（Task 5/6 依赖，签名逐字）:
  - `const BUSINESS_CARD_UPLOAD_MIME_TYPES`（= 原三种 + `"image/heic"` + `"image/heif"`）
  - `type BusinessCardUploadMimeType`
  - `function isBusinessCardUploadMimeType(value: string | undefined): value is BusinessCardUploadMimeType`
  - `function resolveBusinessCardUploadMimeType(input: { declaredType?: string; fileName?: string }): string | undefined`
  - `async function normalizeBusinessCardUploadImage(input: { imageBase64: string; mimeType: BusinessCardUploadMimeType }): Promise<{ imageBase64: string; mimeType: BusinessCardImageMimeType }>`（HEIC 解码失败时 reject）

- [ ] **Step 1: 安装依赖**

```bash
cd /Users/li/work/orbit/repos/orbits && npm i heic-convert && npm i -D @types/heic-convert
```

若 `@types/heic-convert` 404，改为新建 `types/heic-convert.d.ts`：

```ts
declare module "heic-convert" {
  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  export default function convert(options: HeicConvertOptions): Promise<Buffer>;
}
```

- [ ] **Step 2: 生成 HEIC 测试 fixture（macOS sips）**

```bash
cd /Users/li/work/orbit/repos/orbits && mkdir -p tests/fixtures && node -e "require('sharp')({create:{width:96,height:64,channels:3,background:{r:230,g:236,b:255}}}).png().toFile('tests/fixtures/business-card-tiny.png').then(()=>console.log('png ok'))" && sips -s format heic tests/fixtures/business-card-tiny.png --out tests/fixtures/business-card-tiny.heic && rm tests/fixtures/business-card-tiny.png && ls -la tests/fixtures/business-card-tiny.heic
```

（若 `tests/fixtures/` 不存在先 `mkdir -p`；fixture 应在 10KB 量级。）

- [ ] **Step 3: 写失败测试**

`tests/capabilities/business-card-image-normalization.test.ts`：

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  isBusinessCardUploadMimeType,
  normalizeBusinessCardUploadImage,
  resolveBusinessCardUploadMimeType,
} from "../../features/acquisition/business-card-image-normalization";

test("upload mime acceptance includes HEIC and HEIF next to the provider trio", () => {
  for (const accepted of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
    assert.equal(isBusinessCardUploadMimeType(accepted), true);
  }
  assert.equal(isBusinessCardUploadMimeType("image/gif"), false);
  assert.equal(isBusinessCardUploadMimeType(undefined), false);
});

test("upload mime resolution falls back to the file extension for empty browser types", () => {
  assert.equal(
    resolveBusinessCardUploadMimeType({ declaredType: "", fileName: "IMG_0001.HEIC" }),
    "image/heic",
  );
  assert.equal(
    resolveBusinessCardUploadMimeType({ declaredType: "image/jpeg", fileName: "card.heic" }),
    "image/jpeg",
  );
  assert.equal(resolveBusinessCardUploadMimeType({ fileName: "notes.txt" }), undefined);
});

test("HEIC uploads are transcoded to JPEG for the OCR provider", async () => {
  const heicBytes = await readFile(
    resolve(__dirname, "../fixtures/business-card-tiny.heic"),
  );
  const normalized = await normalizeBusinessCardUploadImage({
    imageBase64: heicBytes.toString("base64"),
    mimeType: "image/heic",
  });

  assert.equal(normalized.mimeType, "image/jpeg");
  const jpegBytes = Buffer.from(normalized.imageBase64, "base64");
  assert.equal(jpegBytes[0], 0xff);
  assert.equal(jpegBytes[1], 0xd8);
});

test("provider-native uploads pass through untouched", async () => {
  const normalized = await normalizeBusinessCardUploadImage({
    imageBase64: "aGVsbG8=",
    mimeType: "image/png",
  });

  assert.deepEqual(normalized, { imageBase64: "aGVsbG8=", mimeType: "image/png" });
});

test("corrupt HEIC input rejects instead of silently passing through", async () => {
  await assert.rejects(
    normalizeBusinessCardUploadImage({
      imageBase64: Buffer.from("definitely not heic").toString("base64"),
      mimeType: "image/heic",
    }),
  );
});
```

（若测试环境无 `__dirname`，用 `new URL("../fixtures/business-card-tiny.heic", import.meta.url)` + `fileURLToPath`，与仓库其他测试读 fixture 的写法保持一致。）

- [ ] **Step 4: 跑测试确认失败**

Run: `node --test --import tsx tests/capabilities/business-card-image-normalization.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 5: 实现模块**

`features/acquisition/business-card-image-normalization.ts`：

```ts
import convert from "heic-convert";

import {
  BUSINESS_CARD_IMAGE_MIME_TYPES,
  type BusinessCardImageMimeType,
} from "./business-card-cloud-ocr";

export const BUSINESS_CARD_HEIF_MIME_TYPES = ["image/heic", "image/heif"] as const;

export const BUSINESS_CARD_UPLOAD_MIME_TYPES = [
  ...BUSINESS_CARD_IMAGE_MIME_TYPES,
  ...BUSINESS_CARD_HEIF_MIME_TYPES,
] as const;

export type BusinessCardUploadMimeType =
  (typeof BUSINESS_CARD_UPLOAD_MIME_TYPES)[number];

export function isBusinessCardUploadMimeType(
  value: string | undefined,
): value is BusinessCardUploadMimeType {
  return BUSINESS_CARD_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === value);
}

const UPLOAD_MIME_TYPE_BY_EXTENSION: Record<string, BusinessCardUploadMimeType> = {
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Browsers can hand over HEIC files with an empty `File.type`; the extension
 * fallback keeps iPhone uploads from being rejected at the boundary.
 */
export function resolveBusinessCardUploadMimeType(input: {
  declaredType?: string;
  fileName?: string;
}): string | undefined {
  const declared = input.declaredType?.trim();

  if (declared) {
    return declared;
  }

  const fileName = input.fileName?.trim().toLowerCase() ?? "";
  const extensionStart = fileName.lastIndexOf(".");

  if (extensionStart < 0) {
    return undefined;
  }

  return UPLOAD_MIME_TYPE_BY_EXTENSION[fileName.slice(extensionStart)];
}

export interface NormalizedBusinessCardUploadImage {
  imageBase64: string;
  mimeType: BusinessCardImageMimeType;
}

export async function normalizeBusinessCardUploadImage(input: {
  imageBase64: string;
  mimeType: BusinessCardUploadMimeType;
}): Promise<NormalizedBusinessCardUploadImage> {
  if (BUSINESS_CARD_IMAGE_MIME_TYPES.some((mimeType) => mimeType === input.mimeType)) {
    return {
      imageBase64: input.imageBase64,
      mimeType: input.mimeType as BusinessCardImageMimeType,
    };
  }

  const jpegBytes = await convert({
    buffer: Buffer.from(input.imageBase64, "base64"),
    format: "JPEG",
    quality: 0.9,
  });

  return {
    imageBase64: Buffer.from(jpegBytes).toString("base64"),
    mimeType: "image/jpeg",
  };
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `node --test --import tsx tests/capabilities/business-card-image-normalization.test.ts`
Expected: 5 项全 PASS。

- [ ] **Step 7: Commit**

```bash
git add features/acquisition/business-card-image-normalization.ts tests/capabilities/business-card-image-normalization.test.ts tests/fixtures/business-card-tiny.heic package.json package-lock.json
git add types/heic-convert.d.ts 2>/dev/null || true
git commit -m "feat(acquisition): add HEIC-to-JPEG business-card upload normalization"
```

---

### Task 5: 接入 scan 服务、API handler 与 UI accept

**Files:**
- Modify: `features/acquisition/live-business-card-scan-service.ts:289-377`（`scanUploadedBusinessCard`）及其 `uploadedPayload` 的 mimeType 参数类型
- Modify: `features/acquisition/business-card-contract.ts`（若 payload 的 `imageMimeType` 字段类型是三值联合，放宽为 upload 联合）
- Modify: `app/api/contact-drafts/business-card/scan/handler.ts:56`
- Modify: `app/(app)/app/contacts/business-card-capture-workspace.tsx:647,696`
- Test: `tests/capabilities/business-card-scan-ocr-live-store.test.ts`（追加 HEIC 用例）

**Interfaces:**
- Consumes: Task 4 全部导出。
- Produces: scan 服务对外行为——HEIC 上传成功识别；payload `imageMimeType` 报告用户上传的原始 MIME；证据摘要为原始字节 SHA-256。

- [ ] **Step 1: GitNexus impact 分析**

对 `scanUploadedBusinessCard`（或其所属导出 `createLiveBusinessCardScanOcrService`）和 `createBusinessCardScanHandler` 跑 upstream impact，报告结果。HIGH/CRITICAL 则先停下警告用户。

- [ ] **Step 2: 写失败测试**

在 `tests/capabilities/business-card-scan-ocr-live-store.test.ts` 中，参照该文件现有「uploaded image → cloud OCR draft」用例的 service/provider 搭建方式，追加：

```ts
test("HEIC uploads are transcoded for the provider while evidence digests the original bytes", async () => {
  const heicBytes = await readFile(
    resolve(__dirname, "../fixtures/business-card-tiny.heic"),
  );
  const extractCalls: { imageBase64: string; mimeType: string }[] = [];
  // cloudOcrProvider stub：与本文件现有成功用例相同的 extraction 返回值，
  // 但在 extract 里先 push(input) 记录收到的图。
  // service 构造与现有用例一致（createLiveBusinessCardScanOcrService + stub provider）。

  const result = await service.scanBusinessCard({
    actorId: "actor-1",
    imageBase64: heicBytes.toString("base64"),
    imageName: "IMG_0001.heic",
    imageSizeBytes: heicBytes.byteLength,
    mimeType: "image/heic",
    scenario: null,
  });

  assert.equal(result.success, true);
  assert.equal(extractCalls.length, 1);
  assert.equal(extractCalls[0]?.mimeType, "image/jpeg");
  const expectedDigest = createHash("sha256").update(heicBytes).digest("hex");
  // 断言 payload 中的 digest 字段等于 expectedDigest（字段名以该文件现有断言为准），
  // 且 payload 的 imageMimeType === "image/heic"。
});
```

（stub/断言的具体字段名对齐该测试文件既有用例；`createHash` 从 `node:crypto` import。）

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test --import tsx tests/capabilities/business-card-scan-ocr-live-store.test.ts`
Expected: 新用例 FAIL（`BUSINESS_CARD_IMAGE_UNSUPPORTED`），其余 PASS。

- [ ] **Step 4: 改 scan 服务**

`live-business-card-scan-service.ts` 顶部加：

```ts
import {
  isBusinessCardUploadMimeType,
  normalizeBusinessCardUploadImage,
  type BusinessCardUploadMimeType,
  type NormalizedBusinessCardUploadImage,
} from "./business-card-image-normalization";
```

`scanUploadedBusinessCard` 改为（保持 289-377 行原有 failure/success 辅助与 provenance 调用不变，仅列出变化）：

1. 307 行 `if (!isBusinessCardImageMimeType(input.scanInput.mimeType))` → `if (!isBusinessCardUploadMimeType(input.scanInput.mimeType))`。
2. 335 行 digest 计算保持在原始字节上（不动，加注释）：

```ts
  // Evidence digests always cover the bytes the user actually uploaded,
  // never the transcoded JPEG handed to the OCR provider.
  const digest = uploadedImageDigest(imageBytes);
```

3. `if (!input.cloudOcrProvider)` 块之后、`try { provider.extract }` 之前插入：

```ts
  let normalizedImage: NormalizedBusinessCardUploadImage;

  try {
    normalizedImage = await normalizeBusinessCardUploadImage({
      imageBase64,
      mimeType: input.scanInput.mimeType,
    });
  } catch {
    return failure(
      "BUSINESS_CARD_IMAGE_UNSUPPORTED",
      uploadedProvenance({
        digest,
        now: input.now,
        provider: input.cloudOcrProvider,
        providerRequested: false,
      }),
    );
  }
```

4. `extract` 调用改为 `{ imageBase64: normalizedImage.imageBase64, mimeType: normalizedImage.mimeType }`；`uploadedPayload` 的 `mimeType` 保持 `input.scanInput.mimeType`（如实记录用户上传的类型）。
5. 类型追补：narrow 后 `input.scanInput.mimeType` 是 `BusinessCardUploadMimeType`——把 `uploadedPayload` 参数与 `business-card-contract.ts` 中 payload `imageMimeType` 字段的类型从三值联合放宽为 `BusinessCardUploadMimeType`（用 grep 找到该字段定义，contract 在 lint 的 tsc 列表里，跑 `npm run lint` 兜底）。

- [ ] **Step 5: 改 API handler 与 UI accept**

`app/api/contact-drafts/business-card/scan/handler.ts`：import `resolveBusinessCardUploadMimeType`（路径 `../../../../../features/acquisition/business-card-image-normalization`），56 行 `mimeType: image.type,` → `mimeType: resolveBusinessCardUploadMimeType({ declaredType: image.type, fileName: image.name }),`。

`business-card-capture-workspace.tsx` 647 与 696 行的 `accept="image/jpeg,image/png,image/webp"` 都改为 `accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"`。

- [ ] **Step 6: 跑测试与 lint**

Run: `node --test --import tsx tests/capabilities/business-card-scan-ocr-live-store.test.ts tests/capabilities/business-card-scan-ocr-mock.test.ts && npm run lint`
Expected: 测试全 PASS；lint（含 tsc 列表）通过。

- [ ] **Step 7: Commit**

```bash
git add features/acquisition/live-business-card-scan-service.ts features/acquisition/business-card-contract.ts app/api/contact-drafts/business-card/scan/handler.ts "app/(app)/app/contacts/business-card-capture-workspace.tsx" tests/capabilities/business-card-scan-ocr-live-store.test.ts
git commit -m "feat(acquisition): accept HEIC business-card uploads via transcode boundary"
```

---

### Task 6: eval 脚本升级 + 两张真实名片评估

**Files:**
- Modify: `scripts/evaluate-business-card-ocr.ts`
- Test: `tests/capabilities/business-card-ocr-evaluation.test.ts`（若其断言受改动影响则同步更新；先跑一遍确认）

**Interfaces:**
- Consumes: Task 3 的 `createConfiguredBusinessCardCloudOcrProvider`、Task 4 的 `resolveBusinessCardUploadMimeType` / `normalizeBusinessCardUploadImage` / `isBusinessCardUploadMimeType`。

- [ ] **Step 1: 改脚本**

1. `createConfiguredGeminiBusinessCardOcrProvider()` → `createConfiguredBusinessCardCloudOcrProvider()`（import 相应替换）；缺 key 报错文案改为 `"Business card OCR evaluation requires DEEPSEEK_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY."`。
2. `mimeTypeFor` 返回类型改为 `string | null`，switch 增加 `case ".heic": return "image/heic";` 和 `case ".heif": return "image/heif";`；每个文件读入后：

```ts
      const normalized = await normalizeBusinessCardUploadImage({
        imageBase64: imageBytes.toString("base64"),
        mimeType: mimeType as BusinessCardUploadMimeType,
      });
      const result = await provider.extract({
        imageBase64: normalized.imageBase64,
        mimeType: normalized.mimeType,
      });
```

3. 定价常量参数化：

```ts
function priceFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const INPUT_PRICE_PER_MILLION_TOKENS_USD = priceFromEnv(
  "ORBIT_OCR_EVAL_INPUT_PRICE_PER_MTOK_USD",
  0.3,
);
const OUTPUT_PRICE_PER_MILLION_TOKENS_USD = priceFromEnv(
  "ORBIT_OCR_EVAL_OUTPUT_PRICE_PER_MTOK_USD",
  2.5,
);
```

4. 增加 `--show-extraction` 标志：`argv.includes("--show-extraction")` 为真时，成功 record 上附加 `extraction: normalizeBusinessCardExtraction(result.extraction)` 字段（仅本地人工核对用，默认仍脱敏）。

- [ ] **Step 2: 跑守护测试**

Run: `node --test --import tsx tests/capabilities/business-card-ocr-evaluation.test.ts`
Expected: PASS（若该测试直接构造 Gemini provider 或断言报错文案，按新行为同步修改后再跑到 PASS）。

- [ ] **Step 3: 真实评估两张名片**

```bash
cd /Users/li/work/orbit/repos/orbits && export $(grep -E "^DEEPSEEK_API_KEY=" .env.local) && npm run eval:business-card-ocr -- --input-dir /Users/li/work/orbit/docs/designs --show-extraction > /private/tmp/claude-501/-Users-li-work-orbit/f3b67866-1616-4879-9f6d-f21c69e32933/scratchpad/ocr-eval-report.json; tail -5 /private/tmp/claude-501/-Users-li-work-orbit/f3b67866-1616-4879-9f6d-f21c69e32933/scratchpad/ocr-eval-report.json
```

（若 package.json 无 `eval:business-card-ocr` script，直接 `node --import tsx scripts/evaluate-business-card-ocr.ts --input-dir ... --show-extraction`。）
Expected: 两条 `valid: true` 记录，`model` 为 `deepseek-v4-flash-vision-exp+deepseek-v4-flash`。**把 extraction 内容整理给用户人工核对识别质量**（姓名/公司/电话/邮箱是否与卡面一致），核对结论写进任务汇报。API key 不得出现在任何输出/提交中。

- [ ] **Step 4: Commit**

```bash
git add scripts/evaluate-business-card-ocr.ts tests/capabilities/business-card-ocr-evaluation.test.ts
git commit -m "feat(scripts): evaluate business-card OCR through provider selection with HEIC input"
```

---

### Task 7: 端到端验证 + 收尾

**Files:** 无新代码（发现 bug 则修，修必带测试）。

- [ ] **Step 1: 全量测试对比基线**

Run: `npm test 2>&1 | tail -30`，与 Task 0 基线对比。
Expected: 无新增失败。

- [ ] **Step 2: 起 dev server 并确认入口解锁**

用 Browser pane 的 preview_start（`.claude/launch.json` 已有配置；参考记忆中的 launch 约定）启动，打开 `/app/contacts/new`。
Expected: 「名片扫描」来源卡不再显示「不可用」，工作台可交互（availability 因 `DEEPSEEK_API_KEY` 就绪）。

- [ ] **Step 3: API 级端到端**

浏览器登录测试账号后（或从 dev 会话取 cookie），用 curl 走真实链路：

```bash
curl -s -b "<session-cookie>" -F "image=@/Users/li/work/orbit/docs/designs/arranged_meishi.heic;type=image/heic" http://localhost:<port>/api/contact-drafts/business-card/scan
```

Expected: success envelope，draft `status: "pending_confirmation"`、`contactWriteExecuted: false`、extraction 字段与 Task 6 评估一致。随后按 `business-card-capture-workspace.tsx` 461 行的请求形状 POST `/api/contacts/business-card/confirm` 确认该 draft，再 GET `/api/contacts` 验证新联系人存在且重复确认不重复写。

- [ ] **Step 4: UI 走查 + 截图**

Browser pane 中实走：上传（若浏览器文件对话框不可自动化，允许用 javascript_tool 构造 File 注入 input 触发 change 事件驱动同一条产品代码路径）→ 识别 loading → 复核字段行 → 确认。桌面 + 移动视口各截一张图发给用户。

- [ ] **Step 5: GitNexus detect_changes + 收尾提交**

跑 `detect_changes()`（对照 CLAUDE.md 要求）确认受影响符号/流程仅限本计划范围；若 orbits 索引过期先 `npx gitnexus analyze`。有未提交的修复则测试通过后提交。最后向用户汇报：识别质量核对结果、端到端截图、blast radius 摘要。
