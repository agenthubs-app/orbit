import {
  QR_SCAN_CONNECT_ERROR_DEFINITIONS,
  type QrConnectionDraft,
  type QrConnectionDraftConfirmInput,
  type QrConnectionConfirmationResult,
  type QrConnectionConfirmationSuccess,
  type QrConnectionEvidence,
  type QrMutualConnectionContext,
  type QrScanConnectConfirmationScenario,
  type QrScanConnectErrorCode,
  type QrScanConnectFailure,
  type QrScanConnectInput,
  type QrScanConnectPayload,
  type QrScanConnectResult,
  type QrScanConnectScenario,
  type QrScanConnectService,
  type QrScanConnectSuccess,
  type QrScanResult,
} from "./qr-contract";
import {
  mockEmptyQrScanConnectFixture,
  mockPendingQrScanConnectFixture,
  mockQrConnectionConfirmedFixture,
  mockQrConnectionDraft,
  mockQrDraftEvidence,
  mockQrMutualConnectionContext,
  mockQrMutualContextEvidence,
  mockQrScanConnectFailureProvenance,
  mockQrScanConnectFixture,
  mockQrScanConnectProvenance,
  mockQrScanEvidence,
  mockQrScanResult,
  mockQrScanSource,
} from "./qr-fixtures";

const supportedScanScenarios = new Set<QrScanConnectScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedConfirmationScenarios =
  new Set<QrScanConnectConfirmationScenario>([
    "success",
    "pending",
    "failure",
  ]);

// QrScanConnect mock service 模拟扫描 Orbit 关系 QR 并生成连接草稿。
// 它解析文本形式的 orbit-qr payload，不访问相机、签名校验、关系图、数据库或外部通知。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(payload: QrScanConnectPayload): QrScanConnectSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function confirmationSuccess(
  payload: typeof mockQrConnectionConfirmedFixture,
): QrConnectionConfirmationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: QrScanConnectErrorCode): QrScanConnectFailure {
  // 失败结果固定使用 QR mock provenance，说明没有真实扫描/连接副作用。
  const definition = QR_SCAN_CONNECT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockQrScanConnectFailureProvenance,
      evidenceIds: mockQrScanConnectFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScanScenario(
  scenario?: QrScanConnectInput["scenario"],
): QrScanConnectScenario {
  if (
    scenario &&
    supportedScanScenarios.has(scenario as QrScanConnectScenario)
  ) {
    return scenario as QrScanConnectScenario;
  }

  return "success";
}

function normalizeConfirmationScenario(
  scenario?: QrConnectionDraftConfirmInput["scenario"],
): QrScanConnectConfirmationScenario {
  if (
    scenario &&
    supportedConfirmationScenarios.has(
      scenario as QrScanConnectConfirmationScenario,
    )
  ) {
    return scenario as QrScanConnectConfirmationScenario;
  }

  return "success";
}

function compactDigest(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 33 + character.charCodeAt(0)) % 1000000;
  }

  return `sha256:mock-qr-${hash.toString().padStart(6, "0")}`;
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

  // 支持的 mock 格式是 orbit-qr:key=value;key=value。
  // 不符合格式时返回 null，让 service 走 QR_SCAN_PAYLOAD_REQUIRED。
function parseRuleBasedQrText(qrText: string) {
  const normalizedText = qrText.trim();
  const prefix = "orbit-qr:";

  if (!normalizedText.startsWith(prefix)) {
    return null;
  }

  const fields = new Map<string, string>();

  for (const pair of normalizedText.slice(prefix.length).split(";")) {
    const [rawKey, ...rawValue] = pair.split("=");
    const key = rawKey?.trim();
    const value = rawValue.join("=").trim();

    if (key && value) {
      fields.set(key, value);
    }
  }

  return {
    displayName: fields.get("name") ?? "Unknown QR contact",
    role: fields.get("role") ?? "Unknown role",
    organization: fields.get("organization") ?? "Unknown organization",
    email: fields.get("email") ?? "",
    eventName: fields.get("event") ?? "Unknown event",
    mutualConnections: splitList(fields.get("mutual")),
    sharedTopics: splitList(fields.get("topic")),
  };
}

function buildRuleBasedScan(
  input: QrScanConnectInput,
  qrText: string,
): QrScanResult {
  const scanLabel = input.scanLabel?.trim() || "uploaded-relationship-qr.txt";

  return {
    ...mockQrScanResult,
    scanId: "scan:qr-rule-based",
    scanMethod: "rule-based-qr-text",
    scanLabel,
    qrText,
    payloadDigest: compactDigest(`${scanLabel}:${qrText}`),
  };
}

function buildRuleBasedContext(parsed: {
  eventName: string;
  mutualConnections: string[];
  sharedTopics: string[];
}): QrMutualConnectionContext {
  // mutualContext 是从 QR payload 派生的关系背景，不查真实 mutual graph。
  return {
    ...mockQrMutualConnectionContext,
    contextId: "context:qr-rule-based",
    eventId: "event:qr-rule-based",
    eventName: parsed.eventName,
    encounterReason:
      "Rule-based relationship QR text was converted into local mutual connection context.",
    mutualConnections: parsed.mutualConnections,
    sharedTopics: parsed.sharedTopics,
    introductionPath:
      parsed.mutualConnections.length > 0
        ? `${parsed.mutualConnections[0]} appears in the local QR mutual context.`
        : "The local QR payload did not include a named introducer.",
    confidence: "rule-based",
    evidenceId: "evidence:qr-mutual-context-rule-based",
  };
}

function buildRuleBasedEvidence(
  parsed: {
    displayName: string;
    role: string;
    organization: string;
    eventName: string;
  },
  qrText: string,
): readonly QrConnectionEvidence[] {
  return [
    {
      ...mockQrScanEvidence,
      evidenceId: "evidence:qr-scan-frame-rule-based",
      excerpt: qrText,
      sourceLabel: "Rule-based relationship QR text",
    },
    {
      ...mockQrMutualContextEvidence,
      evidenceId: "evidence:qr-mutual-context-rule-based",
      excerpt: `Rule-based QR payload came from ${parsed.eventName}.`,
      sourceLabel: "Rule-based QR mutual context",
    },
    {
      ...mockQrDraftEvidence,
      evidenceId: "evidence:qr-draft-rule-based",
      excerpt: `${parsed.displayName}, ${parsed.role} at ${parsed.organization}, staged from local QR text.`,
      sourceLabel: "Rule-based QR connection draft",
    },
  ];
}

function buildRuleBasedPayload(
  input: QrScanConnectInput,
): QrScanConnectPayload | null {
  // 本地规则一次性构造 scan、mutualContext、evidence 和 draft，供 UI 复核。
  const qrText = input.qrText?.trim();

  if (!qrText) {
    return null;
  }

  const parsed = parseRuleBasedQrText(qrText);

  if (!parsed) {
    return null;
  }

  const scan = buildRuleBasedScan(input, qrText);
  const mutualContext = buildRuleBasedContext(parsed);
  const evidence = buildRuleBasedEvidence(parsed, qrText);
  const evidenceIds = evidence.map((item) => item.evidenceId);
  const provenance = {
    ...mockQrScanConnectProvenance,
    evidenceIds,
    generationMethod: "rule-based-qr" as const,
    sourceLabel: "Rule-based QR scan connect",
  };
  const draft: QrConnectionDraft = {
    ...mockQrConnectionDraft,
    id: "demo-qr-draft-rule-based",
    source: mockQrScanSource,
    displayName: parsed.displayName,
    role: parsed.role,
    organization: parsed.organization,
    email: parsed.email,
    relationshipContext:
      "Rule-based QR text was converted into a local connection draft without camera, signature, graph, database, AI, email, calendar, or notification calls.",
    mutualContext,
    evidence,
    provenance,
  };

  return {
    ...mockQrScanConnectFixture,
    scan,
    mutualContext,
    draft,
    provenance,
    summary:
      "Relationship QR text was parsed by deterministic local rules and staged as a connection draft.",
  };
}

export function createMockQrScanConnectService(): QrScanConnectService {
  // confirmQrConnectionDraft 返回确认 fixture，但不会创建真实 connection。
  return {
    scanQrCode(input = {}): QrScanConnectResult {
      switch (normalizeScanScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyQrScanConnectFixture);
        case "pending":
          return success(mockPendingQrScanConnectFixture);
        case "failure":
          return failure("QR_SCAN_CONNECT_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (input.qrText !== undefined) {
        const payload = buildRuleBasedPayload(input);

        return payload ? success(payload) : failure("QR_SCAN_PAYLOAD_REQUIRED");
      }

      return success(mockQrScanConnectFixture);
    },

    confirmQrConnectionDraft(
      input: QrConnectionDraftConfirmInput,
    ): QrConnectionConfirmationResult {
      switch (normalizeConfirmationScenario(input.scenario)) {
        case "pending":
          return failure("QR_SCAN_CONNECT_PENDING");
        case "failure":
          return failure("QR_SCAN_CONNECT_MOCK_FAILED");
        case "success":
        default:
          break;
      }

      if (input.draftId !== mockQrConnectionDraft.id) {
        return failure("QR_SCAN_DRAFT_NOT_FOUND");
      }

      return confirmationSuccess(mockQrConnectionConfirmedFixture);
    },
  };
}

export type {
  QrConnectionConfirmationResult,
  QrScanConnectResult,
};
