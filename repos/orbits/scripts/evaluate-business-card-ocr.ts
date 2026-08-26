import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeBusinessCardExtraction,
  reviewIssuesForBusinessCard,
  type BusinessCardCloudOcrUsage,
} from "../features/acquisition/business-card-cloud-ocr";
import {
  normalizeBusinessCardUploadImage,
  type BusinessCardUploadMimeType,
} from "../features/acquisition/business-card-image-normalization";
import { createConfiguredBusinessCardCloudOcrProvider } from "../features/acquisition/business-card-ocr-provider-selection";

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
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface RedactedEvaluationRecordInput {
  extractedValues?: unknown;
  fileName: string;
  issueCodes: readonly string[];
  model: string;
  usage: BusinessCardCloudOcrUsage;
  valid: boolean;
}

export interface RedactedBusinessCardEvaluationRecord {
  fileName: string;
  valid: boolean;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  reviewIssueCount: number;
  reviewIssueCodes: readonly string[];
}

function roundedCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function createRedactedBusinessCardEvaluationRecord(
  input: RedactedEvaluationRecordInput,
): RedactedBusinessCardEvaluationRecord {
  const estimatedCostUsd =
    (input.usage.inputTokens * INPUT_PRICE_PER_MILLION_TOKENS_USD +
      input.usage.outputTokens * OUTPUT_PRICE_PER_MILLION_TOKENS_USD) /
    1_000_000;

  return {
    fileName: input.fileName,
    valid: input.valid,
    model: input.model,
    latencyMs: input.usage.latencyMs,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    estimatedCostUsd: roundedCost(estimatedCostUsd),
    reviewIssueCount: input.issueCodes.length,
    reviewIssueCodes: [...input.issueCodes],
  };
}

function inputDirectoryFrom(argv: readonly string[]): string {
  const inputDirIndex = argv.indexOf("--input-dir");
  const inputDir = inputDirIndex >= 0 ? argv[inputDirIndex + 1]?.trim() : "";

  if (!inputDir) {
    throw new Error(
      "Usage: npm run eval:business-card-ocr -- --input-dir <directory>",
    );
  }

  return resolve(inputDir);
}

function mimeTypeFor(fileName: string): BusinessCardUploadMimeType | null {
  switch (extname(fileName).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    default:
      return null;
  }
}

async function runEvaluation(argv: readonly string[]): Promise<void> {
  const inputDirectory = inputDirectoryFrom(argv);
  const showExtraction = argv.includes("--show-extraction");
  const provider = createConfiguredBusinessCardCloudOcrProvider();

  if (!provider) {
    throw new Error(
      "Business card OCR evaluation requires DEEPSEEK_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY.",
    );
  }

  const fileNames = (await readdir(inputDirectory))
    .filter((fileName) => mimeTypeFor(fileName) !== null)
    .sort();
  const records: Array<
    RedactedBusinessCardEvaluationRecord | {
      errorCode: string;
      fileName: string;
      valid: false;
    }
  > = [];

  for (const fileName of fileNames) {
    const mimeType = mimeTypeFor(fileName);

    if (!mimeType) {
      continue;
    }

    try {
      const imageBytes = await readFile(resolve(inputDirectory, fileName));

      if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
        records.push({
          errorCode: "BUSINESS_CARD_IMAGE_TOO_LARGE",
          fileName,
          valid: false,
        });
        continue;
      }

      const normalized = await normalizeBusinessCardUploadImage({
        imageBase64: imageBytes.toString("base64"),
        mimeType,
      });
      const result = await provider.extract({
        imageBase64: normalized.imageBase64,
        mimeType: normalized.mimeType,
      });
      const extraction = normalizeBusinessCardExtraction(result.extraction);
      const issues = reviewIssuesForBusinessCard(extraction);

      const record = createRedactedBusinessCardEvaluationRecord({
        fileName,
        issueCodes: issues.map((issue) => issue.code),
        model: provider.model,
        usage: result.usage,
        valid: true,
      });

      records.push(showExtraction ? { ...record, extraction } : record);
    } catch {
      records.push({
        errorCode: "BUSINESS_CARD_OCR_EVALUATION_FAILED",
        fileName,
        valid: false,
      });
    }
  }

  const validRecords = records.filter(
    (record): record is RedactedBusinessCardEvaluationRecord =>
      record.valid === true,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    model: provider.model,
    pricing: {
      inputPerMillionTokensUsd: INPUT_PRICE_PER_MILLION_TOKENS_USD,
      outputPerMillionTokensUsd: OUTPUT_PRICE_PER_MILLION_TOKENS_USD,
    },
    sourceFileCount: fileNames.length,
    validRecordCount: validRecords.length,
    totalEstimatedCostUsd: roundedCost(
      validRecords.reduce(
        (total, record) => total + record.estimatedCostUsd,
        0,
      ),
    ),
    records,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  void runEvaluation(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Business card OCR evaluation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
