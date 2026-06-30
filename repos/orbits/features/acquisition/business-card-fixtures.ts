/**
 * 名片 OCR 导入流程 fixture。
 *
 * 数据覆盖拍照来源、OCR 抽取结果、证据链、联系人草稿以及 empty/pending/failure 状态。
 * 这些 fixture 只描述“待复核的导入结果”，不会代表真实 OCR 或联系人写入已经发生。
 */
import {
  BUSINESS_CARD_SCAN_OCR_FIXTURE_SOURCE,
  type BusinessCardCapture,
  type BusinessCardContactDraft,
  type BusinessCardEvidence,
  type BusinessCardOcrExtraction,
  type BusinessCardScanOcrPayload,
  type BusinessCardScanOcrProvenance,
  type BusinessCardSourceReference,
} from "./business-card-contract";

export { BUSINESS_CARD_SCAN_OCR_FIXTURE_SOURCE };

const fixtureCollectedAt = "2026-06-25T11:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T11:04:00.000Z";

export const mockBusinessCardSource: BusinessCardSourceReference = {
  type: "business_card_ocr",
  id: "source:business-card:hana-sato",
  label: "business card scan from robotics investor salon",
};

export const mockBusinessCardScanOcrProvenance: BusinessCardScanOcrProvenance =
  {
    source: BUSINESS_CARD_SCAN_OCR_FIXTURE_SOURCE,
    sourceLabel: "Mock business card scan OCR fixture",
    evidenceIds: [
      "evidence:business-card-capture-hana",
      "evidence:business-card-ocr-hana",
      "evidence:business-card-draft-hana",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-business-card-scan-ocr-only",
    generationMethod: "fixture",
  };

export const mockEmptyBusinessCardScanOcrProvenance: BusinessCardScanOcrProvenance =
  {
    ...mockBusinessCardScanOcrProvenance,
    sourceLabel: "Mock empty card scan rule",
    evidenceIds: ["evidence:business-card-empty-capture"],
    generationMethod: "rule-based-card-ocr",
  };

export const mockPendingBusinessCardScanOcrProvenance: BusinessCardScanOcrProvenance =
  {
    ...mockBusinessCardScanOcrProvenance,
    sourceLabel: "Mock pending card scan rule",
    evidenceIds: ["evidence:business-card-pending-capture"],
    generationMethod: "rule-based-card-ocr",
  };

export const mockBusinessCardScanOcrFailureProvenance: BusinessCardScanOcrProvenance =
  {
    ...mockBusinessCardScanOcrProvenance,
    sourceLabel: "Mock business card scan controlled failure rule",
    evidenceIds: ["evidence:business-card-controlled-failure"],
    generationMethod: "rule-based-card-ocr",
  };

export const mockBusinessCardCapture: BusinessCardCapture = {
  captureId: "capture:business-card-hana",
  captureMethod: "fixture-camera-frame",
  imageName: "hana-sato-aki-robotics-card.jpg",
  imageMimeType: "image/jpeg",
  imageDigest: "sha256:mock-business-card-hana-sato",
  deviceCameraAccessed: false,
  uploadStorageExecuted: false,
  storageWriteExecuted: false,
};

export const mockPendingBusinessCardCapture: BusinessCardCapture = {
  ...mockBusinessCardCapture,
  captureId: "capture:business-card-pending",
  imageName: "pending-business-card.jpg",
  imageDigest: "sha256:mock-business-card-pending",
};

export const mockEmptyBusinessCardCapture: BusinessCardCapture = {
  ...mockBusinessCardCapture,
  captureId: "capture:business-card-empty",
  imageName: "empty-business-card-frame.jpg",
  imageDigest: "sha256:mock-business-card-empty",
};

export const mockBusinessCardOcrExtraction: BusinessCardOcrExtraction = {
  status: "complete",
  rawText:
    "Hana Sato\nHead of Robotics Partnerships\nAki Robotics\nhana.sato@akirobotics.example\n+81-3-5555-0198",
  rawTextLines: [
    "Hana Sato",
    "Head of Robotics Partnerships",
    "Aki Robotics",
    "hana.sato@akirobotics.example",
    "+81-3-5555-0198",
  ],
  extractedFields: ["name", "role", "organization", "email", "phone"],
  ocrProviderCalled: false,
  aiExtractionExecuted: false,
};

export const mockEmptyBusinessCardOcrExtraction: BusinessCardOcrExtraction = {
  status: "empty",
  rawText: "",
  rawTextLines: [],
  extractedFields: [],
  ocrProviderCalled: false,
  aiExtractionExecuted: false,
};

export const mockPendingBusinessCardOcrExtraction: BusinessCardOcrExtraction = {
  status: "pending",
  rawText: "Card image queued for local mock extraction.",
  rawTextLines: ["Card image queued for local mock extraction."],
  extractedFields: [],
  ocrProviderCalled: false,
  aiExtractionExecuted: false,
};

export const mockBusinessCardCaptureEvidence: BusinessCardEvidence = {
  evidenceId: "evidence:business-card-capture-hana",
  source: mockBusinessCardSource,
  sourceLabel: "Robotics investor salon card capture",
  excerpt:
    "Mock camera frame captured Hana Sato's Aki Robotics business card without device access.",
  capturedFields: ["capture", "imageName", "imageDigest"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-business-card-service",
};

export const mockBusinessCardOcrEvidence: BusinessCardEvidence = {
  evidenceId: "evidence:business-card-ocr-hana",
  source: mockBusinessCardSource,
  sourceLabel: "Local OCR fixture text",
  excerpt: mockBusinessCardOcrExtraction.rawText,
  capturedFields: ["rawText", "name", "role", "organization", "email", "phone"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-business-card-service",
};

export const mockBusinessCardDraftEvidence: BusinessCardEvidence = {
  evidenceId: "evidence:business-card-draft-hana",
  source: mockBusinessCardSource,
  sourceLabel: "Extracted contact draft fixture",
  excerpt:
    "Hana Sato, Head of Robotics Partnerships at Aki Robotics, is staged for confirmation from a business card scan.",
  capturedFields: ["displayName", "role", "organization", "email", "phone"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-business-card-service",
};

export const mockBusinessCardContactDraft: BusinessCardContactDraft = {
  id: "demo-business-card-draft",
  status: "pending_confirmation",
  source: mockBusinessCardSource,
  displayName: "Hana Sato",
  role: "Head of Robotics Partnerships",
  organization: "Aki Robotics",
  email: "hana.sato@akirobotics.example",
  phone: "+81-3-5555-0198",
  relationshipContext:
    "Business card captured after a robotics investor salon conversation about partner distribution.",
  suggestedNextAction:
    "Review the OCR fields, then confirm the extracted contact draft before any contact write.",
  confirmation: {
    required: true,
    state: "pending",
    question: "Confirm adding Hana Sato from the business card OCR draft?",
  },
  contactWriteExecuted: false,
  evidence: [
    mockBusinessCardCaptureEvidence,
    mockBusinessCardOcrEvidence,
    mockBusinessCardDraftEvidence,
  ],
  provenance: mockBusinessCardScanOcrProvenance,
  createdAt: fixtureCreatedAt,
};

export const mockBusinessCardScanOcrFixture: BusinessCardScanOcrPayload = {
  state: "success",
  capture: mockBusinessCardCapture,
  ocr: mockBusinessCardOcrExtraction,
  draft: mockBusinessCardContactDraft,
  summary:
    "A business card image was processed through deterministic mock OCR and staged as a contact draft.",
  provenance: mockBusinessCardScanOcrProvenance,
  nextAction:
    "Review extracted fields and confirm the business card contact draft.",
};

export const mockEmptyBusinessCardScanOcrFixture: BusinessCardScanOcrPayload = {
  state: "empty",
  capture: mockEmptyBusinessCardCapture,
  ocr: mockEmptyBusinessCardOcrExtraction,
  draft: null,
  summary: "No readable business card image was supplied.",
  provenance: mockEmptyBusinessCardScanOcrProvenance,
  nextAction: "Capture a readable card image before staging a contact draft.",
};

export const mockPendingBusinessCardScanOcrFixture: BusinessCardScanOcrPayload =
  {
    state: "pending",
    capture: mockPendingBusinessCardCapture,
    ocr: mockPendingBusinessCardOcrExtraction,
    draft: null,
    summary:
      "A card image is waiting in the mock OCR queue before extracted fields can be reviewed.",
    provenance: mockPendingBusinessCardScanOcrProvenance,
    nextAction:
      "Wait for mock OCR completion before staging an extracted contact draft.",
  };
