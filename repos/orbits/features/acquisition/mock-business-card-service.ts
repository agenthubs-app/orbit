import {
  BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS,
  type BusinessCardCapture,
  type BusinessCardContactDraft,
  type BusinessCardDraftLookupInput,
  type BusinessCardDraftLookupResult,
  type BusinessCardDraftLookupSuccess,
  type BusinessCardEvidence,
  type BusinessCardScanOcrErrorCode,
  type BusinessCardScanOcrFailure,
  type BusinessCardScanOcrInput,
  type BusinessCardScanOcrPayload,
  type BusinessCardScanOcrResult,
  type BusinessCardScanOcrScenario,
  type BusinessCardScanOcrService,
  type BusinessCardScanOcrSuccess,
} from "./business-card-contract";
import {
  mockBusinessCardContactDraft,
  mockBusinessCardDraftEvidence,
  mockBusinessCardOcrEvidence,
  mockBusinessCardScanOcrFailureProvenance,
  mockBusinessCardScanOcrFixture,
  mockBusinessCardScanOcrProvenance,
  mockBusinessCardSource,
  mockEmptyBusinessCardScanOcrFixture,
  mockPendingBusinessCardScanOcrFixture,
} from "./business-card-fixtures";

const supportedScanScenarios = new Set<BusinessCardScanOcrScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

// BusinessCardScanOcr mock service 模拟名片 OCR 到联系人草稿的流程。
// 它只解析传入的 imageText 或固定 fixture，不调用相机、OCR provider、AI 提取或数据库。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: BusinessCardScanOcrPayload,
): BusinessCardScanOcrSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function draftSuccess(
  draft: BusinessCardContactDraft,
): BusinessCardDraftLookupSuccess {
  return {
    success: true,
    data: clonePayload(draft),
  };
}

function failure(
  code: BusinessCardScanOcrErrorCode,
): BusinessCardScanOcrFailure {
  // 失败 provenance 固定在本地 OCR mock 边界内，方便 route 生成稳定错误 envelope。
  const definition = BUSINESS_CARD_SCAN_OCR_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockBusinessCardScanOcrFailureProvenance,
      evidenceIds: mockBusinessCardScanOcrFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScanScenario(
  scenario?: BusinessCardScanOcrInput["scenario"],
): BusinessCardScanOcrScenario {
  if (
    scenario &&
    supportedScanScenarios.has(scenario as BusinessCardScanOcrScenario)
  ) {
    return scenario as BusinessCardScanOcrScenario;
  }

  return "success";
}

function compactDigest(value: string): string {
  // digest 只是 mock 里的稳定指纹，不用于安全校验或真实文件完整性判断。
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1000000;
  }

  return `sha256:mock-card-${hash.toString().padStart(6, "0")}`;
}

  // 规则解析假设文本每行是 name/role/org/email/phone 的近似结构。
  // 这是为了测试字段流转，不代表真实 OCR 或名片理解能力。
function parseRuleBasedText(imageText: string) {
  const lines = imageText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const email =
    lines.find((line) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) ?? "";
  const phone = lines.find((line) => /^\+?[\d\s().-]{7,}$/.test(line)) ?? "";
  const descriptiveLines = lines.filter(
    (line) => line !== email && line !== phone,
  );

  return {
    displayName: descriptiveLines[0] ?? "Unknown card contact",
    role: descriptiveLines[1] ?? "Unknown role",
    organization: descriptiveLines[2] ?? "Unknown organization",
    email,
    phone,
    lines,
  };
}

function buildRuleBasedPayload(
  input: BusinessCardScanOcrInput,
  // 传入 imageText 时按本地规则构造 capture/ocr/evidence/draft。
  // 空文本返回 null，让调用方映射到 BUSINESS_CARD_IMAGE_REQUIRED。
): BusinessCardScanOcrPayload | null {
  const imageText = input.imageText?.trim();

  if (!imageText) {
    return null;
  }

  const parsed = parseRuleBasedText(imageText);
  const imageName = input.imageName?.trim() || "uploaded-business-card.txt";
  const capture: BusinessCardCapture = {
    ...mockBusinessCardScanOcrFixture.capture,
    captureId: "capture:business-card-rule-based",
    captureMethod: "rule-based-image-text",
    imageName,
    imageMimeType: "text/plain",
    imageDigest: compactDigest(`${imageName}:${imageText}`),
  };
  const ocrEvidence: BusinessCardEvidence = {
    ...mockBusinessCardOcrEvidence,
    evidenceId: "evidence:business-card-ocr-rule-based",
    excerpt: imageText,
    sourceLabel: "Rule-based card text fixture",
  };
  const draftEvidence: BusinessCardEvidence = {
    ...mockBusinessCardDraftEvidence,
    evidenceId: "evidence:business-card-draft-rule-based",
    excerpt: `${parsed.displayName}, ${parsed.role} at ${parsed.organization}, staged from local card text.`,
    sourceLabel: "Rule-based business card contact draft",
  };
  const evidence = [ocrEvidence, draftEvidence];
  const provenance = {
    ...mockBusinessCardScanOcrProvenance,
    evidenceIds: evidence.map((item) => item.evidenceId),
    generationMethod: "rule-based-card-ocr" as const,
    sourceLabel: "Rule-based business card scan OCR",
  };
  const draft: BusinessCardContactDraft = {
    ...mockBusinessCardContactDraft,
    id: "demo-business-card-draft-rule-based",
    source: mockBusinessCardSource,
    displayName: parsed.displayName,
    role: parsed.role,
    organization: parsed.organization,
    email: parsed.email,
    phone: parsed.phone,
    relationshipContext:
      "Rule-based card text was converted into a local contact draft without OCR, AI, storage, or database calls.",
    evidence,
    provenance,
  };

  return {
    ...mockBusinessCardScanOcrFixture,
    capture,
    ocr: {
      status: "complete",
      rawText: imageText,
      rawTextLines: parsed.lines,
      extractedFields: ["name", "role", "organization", "email", "phone"],
      ocrProviderCalled: false,
      aiExtractionExecuted: false,
    },
    draft,
    provenance,
    summary:
      "Business card text was parsed by deterministic local rules and staged as a contact draft.",
  };
}

export function createMockBusinessCardScanOcrService(): BusinessCardScanOcrService {
  // scanBusinessCard 负责生成草稿；getBusinessCardDraft 只查固定 demo draft。
  return {
    scanBusinessCard(input = {}): BusinessCardScanOcrResult {
      switch (normalizeScanScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyBusinessCardScanOcrFixture);
        case "pending":
          return success(mockPendingBusinessCardScanOcrFixture);
        case "failure":
          return failure("BUSINESS_CARD_SCAN_OCR_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (input.imageText !== undefined) {
        const payload = buildRuleBasedPayload(input);

        return payload
          ? success(payload)
          : failure("BUSINESS_CARD_IMAGE_REQUIRED");
      }

      return success(mockBusinessCardScanOcrFixture);
    },

    getBusinessCardDraft(
      input: BusinessCardDraftLookupInput,
    ): BusinessCardDraftLookupResult {
      if (input.scenario === "pending") {
        return failure("BUSINESS_CARD_SCAN_NOT_READY");
      }

      if (input.draftId !== mockBusinessCardContactDraft.id) {
        return failure("BUSINESS_CARD_DRAFT_NOT_FOUND");
      }

      return draftSuccess(mockBusinessCardContactDraft);
    },
  };
}

export type {
  BusinessCardDraftLookupResult,
  BusinessCardScanOcrResult,
};
