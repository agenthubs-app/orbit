/**
 * QR 扫码建联流程 fixture。
 *
 * 数据覆盖扫码来源、互相关系上下文、证据链、连接草稿和确认后的候选联系人。
 * 这些 fixture 用来验证 QR 建联 UI 和确认流程，不会写入真实联系人图谱。
 */
import {
  QR_SCAN_CONNECT_FIXTURE_SOURCE,
  type QrConnectionCandidate,
  type QrConnectionDraft,
  type QrConnectionEvidence,
  type QrContactCandidate,
  type QrMutualConnectionContext,
  type QrScanConnectPayload,
  type QrScanConnectProvenance,
  type QrScanResult,
  type QrScanSourceReference,
} from "./qr-contract";

export { QR_SCAN_CONNECT_FIXTURE_SOURCE };

const fixtureCollectedAt = "2026-06-25T14:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T14:03:00.000Z";
const fixtureConfirmedAt = "2026-06-25T14:09:00.000Z";

export const mockQrScanSource: QrScanSourceReference = {
  type: "qr_scan",
  id: "source:qr-scan:mika-tan",
  label: "relationship QR scan from climate founders dinner",
};

export const mockQrScanConnectProvenance: QrScanConnectProvenance = {
  source: QR_SCAN_CONNECT_FIXTURE_SOURCE,
  sourceLabel: "Mock QR scan connect fixture",
  evidenceIds: [
    "evidence:qr-scan-frame-mika",
    "evidence:qr-mutual-context-mika",
    "evidence:qr-draft-mika",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-qr-scan-connect-only",
  generationMethod: "fixture",
};

export const mockEmptyQrScanConnectProvenance: QrScanConnectProvenance = {
  ...mockQrScanConnectProvenance,
  sourceLabel: "Mock empty QR scan rule",
  evidenceIds: ["evidence:qr-empty-scan"],
  generationMethod: "rule-based-qr",
};

export const mockPendingQrScanConnectProvenance: QrScanConnectProvenance = {
  ...mockQrScanConnectProvenance,
  sourceLabel: "Mock pending QR scan rule",
  evidenceIds: ["evidence:qr-pending-scan"],
  generationMethod: "rule-based-qr",
};

export const mockQrScanConnectFailureProvenance: QrScanConnectProvenance = {
  ...mockQrScanConnectProvenance,
  sourceLabel: "Mock QR scan controlled failure rule",
  evidenceIds: ["evidence:qr-controlled-failure"],
  generationMethod: "rule-based-qr",
};

export const mockQrScanResult: QrScanResult = {
  scanId: "scan:qr-mika",
  scanMethod: "fixture-camera-frame",
  scanLabel: "mika-tan-heliogrid-qr.png",
  payloadFormat: "orbit-demo-qr-v1",
  qrText:
    "orbit-qr:name=Mika Tan;role=Founder;organization=HelioGrid;event=Climate founders dinner;mutual=Rei Nakamura,Samir Patel;topic=grid resilience,community solar",
  payloadDigest: "sha256:mock-qr-mika-tan",
  deviceCameraAccessed: false,
  qrDecoderProviderCalled: false,
  cryptographicValidationExecuted: false,
  externalLookupExecuted: false,
  databaseWriteExecuted: false,
};

export const mockEmptyQrScanResult: QrScanResult = {
  ...mockQrScanResult,
  scanId: "scan:qr-empty",
  scanMethod: "rule-based-qr-text",
  scanLabel: "empty-qr-frame.png",
  qrText: "",
  payloadDigest: "sha256:mock-qr-empty",
};

export const mockPendingQrScanResult: QrScanResult = {
  ...mockQrScanResult,
  scanId: "scan:qr-pending",
  scanLabel: "pending-qr-frame.png",
  payloadDigest: "sha256:mock-qr-pending",
};

export const mockQrMutualConnectionContext: QrMutualConnectionContext = {
  contextId: "context:qr-mika",
  eventId: "event:climate-founders-dinner",
  eventName: "Climate founders dinner",
  encounterReason:
    "Mika scanned an Orbit relationship QR after discussing community solar distribution.",
  mutualConnections: ["Rei Nakamura", "Samir Patel"],
  sharedTopics: ["grid resilience", "community solar"],
  introductionPath:
    "Rei Nakamura introduced Mika as a potential distribution partner for local grid pilots.",
  confidence: "fixture-high",
  evidenceId: "evidence:qr-mutual-context-mika",
  externalGraphLookupExecuted: false,
};

export const mockQrScanEvidence: QrConnectionEvidence = {
  evidenceId: "evidence:qr-scan-frame-mika",
  source: mockQrScanSource,
  sourceLabel: "Climate founders dinner QR scan",
  excerpt:
    "Mock camera frame decoded Mika Tan's relationship QR without opening device camera access.",
  capturedFields: ["scanId", "scanLabel", "payloadDigest"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-qr-service",
};

export const mockQrMutualContextEvidence: QrConnectionEvidence = {
  evidenceId: "evidence:qr-mutual-context-mika",
  source: mockQrScanSource,
  sourceLabel: "Mutual relationship QR context",
  excerpt:
    "QR payload lists Rei Nakamura and Samir Patel as mutual context from the climate founders dinner.",
  capturedFields: ["eventName", "mutualConnections", "sharedTopics"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-qr-service",
};

export const mockQrDraftEvidence: QrConnectionEvidence = {
  evidenceId: "evidence:qr-draft-mika",
  source: mockQrScanSource,
  sourceLabel: "QR connection draft fixture",
  excerpt:
    "Mika Tan, Founder at HelioGrid, is staged as a QR-sourced connection draft.",
  capturedFields: ["displayName", "role", "organization", "relationshipContext"],
  createdAt: fixtureCreatedAt,
  createdBy: "mock-qr-service",
};

export const mockQrConnectionDraft: QrConnectionDraft = {
  id: "demo-qr-draft",
  status: "pending_confirmation",
  source: mockQrScanSource,
  displayName: "Mika Tan",
  role: "Founder",
  organization: "HelioGrid",
  email: "mika.tan@heliogrid.example",
  relationshipContext:
    "Relationship QR scanned at the climate founders dinner after a conversation about community solar distribution.",
  suggestedNextAction:
    "Confirm Mika's QR connection draft, then send a follow-up about distribution partner fit.",
  mutualContext: mockQrMutualConnectionContext,
  confirmation: {
    required: true,
    state: "pending",
    question: "Confirm adding Mika Tan from the scanned relationship QR?",
  },
  contactWriteExecuted: false,
  connectionWriteExecuted: false,
  notificationDelivered: false,
  evidence: [
    mockQrScanEvidence,
    mockQrMutualContextEvidence,
    mockQrDraftEvidence,
  ],
  provenance: mockQrScanConnectProvenance,
  createdAt: fixtureCreatedAt,
};

export const mockQrScanConnectFixture: QrScanConnectPayload = {
  state: "success",
  scan: mockQrScanResult,
  mutualContext: mockQrMutualConnectionContext,
  draft: mockQrConnectionDraft,
  summary:
    "A relationship QR code was decoded through deterministic mock rules and staged as a source-backed connection draft.",
  provenance: mockQrScanConnectProvenance,
  nextAction: "Review mutual context and confirm the QR connection draft.",
};

export const mockEmptyQrScanConnectFixture: QrScanConnectPayload = {
  state: "empty",
  scan: mockEmptyQrScanResult,
  mutualContext: null,
  draft: null,
  summary: "No readable Orbit relationship QR payload was supplied.",
  provenance: mockEmptyQrScanConnectProvenance,
  nextAction:
    "Scan a relationship QR code before staging a connection draft.",
};

export const mockPendingQrScanConnectFixture: QrScanConnectPayload = {
  state: "pending",
  scan: mockPendingQrScanResult,
  mutualContext: null,
  draft: null,
  summary:
    "A QR frame is waiting in the mock validation queue before mutual context can be staged.",
  provenance: mockPendingQrScanConnectProvenance,
  nextAction: "Wait for mock QR validation before confirming the draft.",
};

export const mockQrConfirmationEvidence: QrConnectionEvidence = {
  evidenceId: "evidence:qr-confirmation-mika",
  source: mockQrScanSource,
  sourceLabel: "QR connection confirmation fixture",
  excerpt: "Demo operator confirmed Mika Tan's QR connection draft.",
  capturedFields: ["confirmedDraft", "contactCandidate", "connectionCandidate"],
  createdAt: fixtureConfirmedAt,
  createdBy: "mock-qr-service",
};

export const mockConfirmedQrConnectionDraft: QrConnectionDraft = {
  ...mockQrConnectionDraft,
  status: "confirmed",
  confirmation: {
    ...mockQrConnectionDraft.confirmation,
    state: "confirmed",
    confirmedAt: fixtureConfirmedAt,
    actorLabel: "Demo operator",
  },
  evidence: [...mockQrConnectionDraft.evidence, mockQrConfirmationEvidence],
  provenance: {
    ...mockQrScanConnectProvenance,
    evidenceIds: [
      ...mockQrScanConnectProvenance.evidenceIds,
      mockQrConfirmationEvidence.evidenceId,
    ],
  },
};

export const mockQrContactCandidate: QrContactCandidate = {
  candidateId: "contact-candidate:qr-mika",
  displayName: mockQrConnectionDraft.displayName,
  role: mockQrConnectionDraft.role,
  organization: mockQrConnectionDraft.organization,
  email: mockQrConnectionDraft.email,
  relationshipContext: mockQrConnectionDraft.relationshipContext,
  source: mockQrScanSource,
  evidenceIds: mockConfirmedQrConnectionDraft.provenance.evidenceIds,
  readyForContactWrite: true,
  contactWriteExecuted: false,
};

export const mockQrConnectionCandidate: QrConnectionCandidate = {
  candidateId: "connection-candidate:qr-mika",
  displayName: mockQrConnectionDraft.displayName,
  organization: mockQrConnectionDraft.organization,
  mutualContext: mockQrMutualConnectionContext,
  valueHypothesis:
    "Mika is a warm distribution partner lead because the QR context includes mutual founders and shared grid resilience topics.",
  source: mockQrScanSource,
  evidenceIds: mockConfirmedQrConnectionDraft.provenance.evidenceIds,
  readyForConnectionWrite: true,
  connectionWriteExecuted: false,
};

export const mockQrConnectionConfirmedFixture = {
  state: "confirmed",
  confirmedDraft: mockConfirmedQrConnectionDraft,
  contactCandidate: mockQrContactCandidate,
  connectionCandidate: mockQrConnectionCandidate,
  createdEvidence: mockQrConfirmationEvidence,
  confirmedAt: fixtureConfirmedAt,
  provenance: mockConfirmedQrConnectionDraft.provenance,
  nextAction:
    "Hand the source-backed contact and connection candidates to live persistence only after preserving QR evidence.",
} as const;
