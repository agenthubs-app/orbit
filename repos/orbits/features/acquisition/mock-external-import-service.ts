import {
  EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS,
  EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS,
  type ExternalContactCandidate,
  type ExternalContactDraft,
  type ExternalContactsCandidatesPayload,
  type ExternalContactsCandidatesResult,
  type ExternalContactsCandidatesSuccess,
  type ExternalContactsImportErrorCode,
  type ExternalContactsImportFailure,
  type ExternalContactsImportInput,
  type ExternalContactsImportPayload,
  type ExternalContactsImportResult,
  type ExternalContactsImportScenario,
  type ExternalContactsImportService,
  type ExternalContactsImportSourceKind,
  type ExternalContactsImportSuccess,
  type ExternalContactsSourceSummary,
} from "./external-import-contract";
import {
  mockEmptyExternalContactsCandidatesFixture,
  mockEmptyExternalContactsImportFixture,
  mockExternalContactsCandidatesFixture,
  mockExternalContactsImportFailureProvenance,
  mockExternalContactsImportFixture,
  mockPendingExternalContactsCandidatesFixture,
  mockPendingExternalContactsImportFixture,
} from "./external-import-fixtures";

const supportedScenarios = new Set<ExternalContactsImportScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedSourceKinds = new Set<ExternalContactsImportSourceKind>(
  EXTERNAL_CONTACTS_IMPORT_SOURCE_KINDS,
);

// ExternalContactsImport mock service 模拟从外部联系人来源筛选候选人并生成草稿。
// 它不连接 Gmail/通讯录/CRM，也不执行真实导入写入。
function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function candidatesSuccess(
  payload: ExternalContactsCandidatesPayload,
): ExternalContactsCandidatesSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function importSuccess(
  payload: ExternalContactsImportPayload,
): ExternalContactsImportSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ExternalContactsImportErrorCode,
): ExternalContactsImportFailure {
  // 外部导入失败同样是本地 mock 边界里的受控失败，不代表 provider 错误。
  const definition = EXTERNAL_CONTACTS_IMPORT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockExternalContactsImportFailureProvenance,
      evidenceIds: mockExternalContactsImportFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ExternalContactsImportInput["scenario"],
): ExternalContactsImportScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ExternalContactsImportScenario)
  ) {
    return scenario as ExternalContactsImportScenario;
  }

  return "success";
}

function normalizeSourceKind(
  sourceKind?: ExternalContactsImportInput["sourceKind"],
): ExternalContactsImportSourceKind | null {
  if (sourceKind === undefined || sourceKind === null) {
    return null;
  }

  const normalized = sourceKind.trim();

  if (!normalized) {
    return null;
  }

  if (supportedSourceKinds.has(normalized as ExternalContactsImportSourceKind)) {
    return normalized as ExternalContactsImportSourceKind;
  }

  return null;
}

function sourceFailure(
  sourceKind?: ExternalContactsImportInput["sourceKind"],
): ExternalContactsImportFailure | null {
  // 未传 sourceKind 表示使用全部来源；显式传入不支持的来源必须失败。
  if (sourceKind === undefined || sourceKind === null || sourceKind.trim() === "") {
    return null;
  }

  if (!supportedSourceKinds.has(sourceKind as ExternalContactsImportSourceKind)) {
    return failure("EXTERNAL_CONTACTS_IMPORT_SOURCE_NOT_SUPPORTED");
  }

  return null;
}

function filterSources(
  sourceKind: ExternalContactsImportSourceKind | null,
): readonly ExternalContactsSourceSummary[] {
  if (!sourceKind) {
    return mockExternalContactsCandidatesFixture.sources;
  }

  return mockExternalContactsCandidatesFixture.sources.filter(
    (source) => source.kind === sourceKind,
  );
}

function filterCandidates(
  sourceKind: ExternalContactsImportSourceKind | null,
): readonly ExternalContactCandidate[] {
  if (!sourceKind) {
    return mockExternalContactsCandidatesFixture.candidates;
  }

  return mockExternalContactsCandidatesFixture.candidates.filter(
    (candidate) => candidate.sourceKind === sourceKind,
  );
}

function filterDrafts(
  sourceKind: ExternalContactsImportSourceKind | null,
): readonly ExternalContactDraft[] {
  if (!sourceKind) {
    return mockExternalContactsImportFixture.contactDrafts;
  }

  return mockExternalContactsImportFixture.contactDrafts.filter(
    (draft) => draft.sourceKind === sourceKind,
  );
}

function buildRuleBasedCandidatesPayload(
  sourceKind: ExternalContactsImportSourceKind,
): ExternalContactsCandidatesPayload {
  // candidates 视图只展示候选人；import 视图会在此基础上追加 contactDrafts。
  const candidates = filterCandidates(sourceKind);
  const sources = filterSources(sourceKind);
  const state = candidates.length > 0 ? "success" : "empty";

  return {
    ...mockExternalContactsCandidatesFixture,
    state,
    sources,
    candidates,
    summary:
      candidates.length > 0
        ? `Local mock rules filtered external contacts by ${sourceKind}.`
        : `No local external contact candidates matched ${sourceKind}.`,
    provenance: {
      ...mockExternalContactsCandidatesFixture.provenance,
      generationMethod: "rule-based-external-contacts-import",
      sourceLabel: "Rule-based external contacts source filter",
      evidenceIds:
        candidates.length > 0
          ? candidates.flatMap((candidate) => candidate.evidenceIds)
          : ["evidence:external-import-empty"],
    },
    nextAction:
      candidates.length > 0
        ? "Review the filtered external contact candidates."
        : "Clear the local source filter before staging contact drafts.",
  };
}

function buildRuleBasedImportPayload(
  sourceKind: ExternalContactsImportSourceKind,
): ExternalContactsImportPayload {
  // import payload 仍然只是 staged drafts，未写真实 contacts。
  const candidatesPayload = buildRuleBasedCandidatesPayload(sourceKind);
  const contactDrafts = filterDrafts(sourceKind);

  return {
    ...candidatesPayload,
    contactDrafts,
    summary:
      contactDrafts.length > 0
        ? `Local mock rules staged external contact drafts filtered by ${sourceKind}.`
        : `No local external contact drafts matched ${sourceKind}.`,
  };
}

function scenarioCandidatesResult(
  scenario: ExternalContactsImportScenario,
): ExternalContactsCandidatesResult | null {
  switch (scenario) {
    case "empty":
      return candidatesSuccess(mockEmptyExternalContactsCandidatesFixture);
    case "pending":
      return candidatesSuccess(mockPendingExternalContactsCandidatesFixture);
    case "failure":
      return failure("EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioImportResult(
  scenario: ExternalContactsImportScenario,
): ExternalContactsImportResult | null {
  switch (scenario) {
    case "empty":
      return importSuccess(mockEmptyExternalContactsImportFixture);
    case "pending":
      return importSuccess(mockPendingExternalContactsImportFixture);
    case "failure":
      return failure("EXTERNAL_CONTACTS_IMPORT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

export function createMockExternalContactsImportService(): ExternalContactsImportService {
  // listExternalContactCandidates 和 importExternalContacts 共享 sourceKind 过滤规则。
  return {
    listExternalContactCandidates(
      input = {},
    ): ExternalContactsCandidatesResult {
      const scenarioResult = scenarioCandidatesResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const unsupportedSourceFailure = sourceFailure(input.sourceKind);

      if (unsupportedSourceFailure) {
        return unsupportedSourceFailure;
      }

      const sourceKind = normalizeSourceKind(input.sourceKind);

      return candidatesSuccess(
        sourceKind
          ? buildRuleBasedCandidatesPayload(sourceKind)
          : mockExternalContactsCandidatesFixture,
      );
    },

    importExternalContacts(input = {}): ExternalContactsImportResult {
      const scenarioResult = scenarioImportResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const unsupportedSourceFailure = sourceFailure(input.sourceKind);

      if (unsupportedSourceFailure) {
        return unsupportedSourceFailure;
      }

      const sourceKind = normalizeSourceKind(input.sourceKind);

      return importSuccess(
        sourceKind
          ? buildRuleBasedImportPayload(sourceKind)
          : mockExternalContactsImportFixture,
      );
    },
  };
}

export type {
  ExternalContactsCandidatesResult,
  ExternalContactsImportResult,
};
