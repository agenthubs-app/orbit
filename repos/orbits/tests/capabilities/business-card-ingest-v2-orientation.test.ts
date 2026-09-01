import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import { extractWithOrientationFallback } from "../../features/acquisition/business-card-ingest-v2/worker";

const emptyExtraction: BusinessCardStructuredExtraction = {
  addresses: [],
  certifications: [],
  contactPoints: [],
  departments: [],
  detectedLanguages: [],
  emails: [],
  fullName: null,
  nativeFullName: null,
  organization: null,
  romanizedFullName: null,
  title: null,
  website: null,
};

const usage = { inputTokens: 0, latencyMs: 0, outputTokens: 0 };

async function blankJpeg(): Promise<Buffer> {
  return sharp({ create: { background: "#fff", channels: 3, height: 32, width: 64 } })
    .jpeg()
    .toBuffer();
}

test("orientation fallback retries rotations only while identity+org are empty and stops at the first hit", async () => {
  const bytes = await blankJpeg();
  let calls = 0;
  const provider = {
    model: "stub",
    providerName: "stub",
    async extract() {
      calls += 1;
      if (calls === 1) {
        return { extraction: emptyExtraction, usage };
      }
      return {
        extraction: {
          ...emptyExtraction,
          nativeFullName: "未来 花子",
          organization: "架空産業株式会社",
        },
        transcript: "架空産業株式会社",
        usage,
      };
    },
  };

  const best = await extractWithOrientationFallback(provider, bytes);

  // 第一次全空 → 试 180° 命中即停，不再试 90°。
  assert.equal(calls, 2);
  assert.equal(best.extraction.nativeFullName, "未来 花子");
  assert.equal(best.ocr.transcript, "架空産業株式会社");
});

test("orientation fallback does not retry when the first read already has identity", async () => {
  const bytes = await blankJpeg();
  let calls = 0;
  const provider = {
    model: "stub",
    providerName: "stub",
    async extract() {
      calls += 1;
      return { extraction: { ...emptyExtraction, fullName: "Hanako Mirai" }, usage };
    },
  };

  await extractWithOrientationFallback(provider, bytes);

  assert.equal(calls, 1);
});

test("orientation fallback keeps the best coverage when no rotation finds an identity", async () => {
  const bytes = await blankJpeg();
  let calls = 0;
  const provider = {
    model: "stub",
    providerName: "stub",
    async extract() {
      calls += 1;
      if (calls === 2) {
        return {
          extraction: {
            ...emptyExtraction,
            emails: [{ label: null, value: "hanako@example.test" }],
          },
          usage,
        };
      }
      return { extraction: emptyExtraction, usage };
    },
  };

  const best = await extractWithOrientationFallback(provider, bytes);

  // 三个方向都没有姓名/公司 → 全部试完（1 + 2 次回退），保留覆盖度最高的。
  assert.equal(calls, 3);
  assert.equal(best.extraction.emails[0]?.value, "hanako@example.test");
});
