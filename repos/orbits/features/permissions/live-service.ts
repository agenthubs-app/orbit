import type { PermissionState as SourcePermissionState } from "../../shared/domain/source-types";
import {
  PERMISSION_CAPABILITIES,
  PERMISSION_STATE_ERROR_DEFINITIONS,
  type PermissionAuthorizationStage,
  type PermissionCapability,
  type PermissionEvidence,
  type PermissionIntent,
  type PermissionRequestInput,
  type PermissionRequestPayload,
  type PermissionRequestResult,
  type PermissionRequestScenario,
  type PermissionRequestSuccess,
  type PermissionStateErrorCode,
  type PermissionStateFailure,
  type PermissionStateInput,
  type PermissionStatePayload,
  type PermissionStateProvenance,
  type PermissionStateRecord,
  type PermissionStateResult,
  type PermissionStateScenario,
  type PermissionStateSuccess,
  type PermissionStatus,
} from "./contract";
import type { PermissionStateService } from "./service";
import type { PermissionStateDTO } from "../../shared/domain/contracts";
import type {
  LivePermissionStateGraph,
  LivePermissionStateProvider,
} from "./storage/permission-live-record-provider";

export interface LivePermissionStateServiceOptions {
  now?: () => string;
  provider?: LivePermissionStateProvider | null;
}

const supportedStateScenarios = new Set<PermissionStateScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedRequestScenarios = new Set<PermissionRequestScenario>([
  "success",
  "empty",
  "pending",
  "failure",
  "blocked",
]);

const supportedCapabilities = new Set<PermissionCapability>(
  PERMISSION_CAPABILITIES,
);

const supportedIntents = new Set<PermissionIntent>([
  "sync-contacts",
  "connect-event-calendar",
  "review-email-context",
  "enable-notifications",
  "scan-business-card",
  "import-event-data",
  "analyze-chat-context",
]);

const permissionCopy: Record<
  PermissionCapability,
  {
    action: string;
    label: string;
    requiredFor: string;
  }
> = {
  "business-card-scan": {
    action: "Review business-card scan access",
    label: "Business-card scan",
    requiredFor: "Business-card OCR and contact capture.",
  },
  calendar: {
    action: "Review calendar access",
    label: "Calendar",
    requiredFor: "Event readiness, meeting context, and follow-up timing.",
  },
  camera: {
    action: "Review camera access",
    label: "Camera",
    requiredFor: "Business-card image capture.",
  },
  "chat-analysis": {
    action: "Review chat analysis access",
    label: "Chat analysis",
    requiredFor: "Chat summary extraction and writing assist.",
  },
  contacts: {
    action: "Review contacts access",
    label: "Contacts",
    requiredFor: "Manual add, imports, merge review, and relationship search.",
  },
  email: {
    action: "Review email context access",
    label: "Email",
    requiredFor: "Email signals and follow-up context.",
  },
  "event-data": {
    action: "Review event data access",
    label: "Event data",
    requiredFor: "Event attendee import, goals, and readiness context.",
  },
  notifications: {
    action: "Review notification access",
    label: "Notifications",
    requiredFor: "Follow-up reminders and action queue prompts.",
  },
};

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function stateSuccess(payload: PermissionStatePayload): PermissionStateSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function requestSuccess(
  payload: PermissionRequestPayload,
): PermissionRequestSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function normalizeStateScenario(
  scenario?: PermissionStateInput["scenario"],
): PermissionStateScenario {
  if (scenario && supportedStateScenarios.has(scenario as PermissionStateScenario)) {
    return scenario as PermissionStateScenario;
  }

  return "success";
}

function normalizeRequestScenario(
  scenario?: PermissionRequestInput["scenario"],
): PermissionRequestScenario {
  if (
    scenario &&
    supportedRequestScenarios.has(scenario as PermissionRequestScenario)
  ) {
    return scenario as PermissionRequestScenario;
  }

  return "pending";
}

function normalizeIntent(intent?: PermissionRequestInput["intent"]): PermissionIntent {
  if (intent && supportedIntents.has(intent as PermissionIntent)) {
    return intent as PermissionIntent;
  }

  return "connect-event-calendar";
}

function normalizeCapability(
  capability: PermissionRequestInput["capability"],
): PermissionCapability | null {
  if (supportedCapabilities.has(capability as PermissionCapability)) {
    return capability as PermissionCapability;
  }

  return null;
}

function capabilityFromLiveRecord(capability: string): PermissionCapability | null {
  const normalized = capability.trim().toLowerCase().replace(/_/gu, "-");

  if (supportedCapabilities.has(normalized as PermissionCapability)) {
    return normalized as PermissionCapability;
  }

  switch (normalized) {
    case "business-card":
    case "business-card-ocr":
    case "business-card-scan":
      return "business-card-scan";
    case "calendar-signals":
      return "calendar";
    case "chat-context":
    case "chat-analysis":
      return "chat-analysis";
    case "email-signals":
    case "email-context":
      return "email";
    case "event-data":
    case "event-roster":
    case "relationship-local-remote-database":
      return "event-data";
    case "notification-delivery":
      return "notifications";
    default:
      return null;
  }
}

function statusFromLiveState(state: SourcePermissionState): PermissionStatus {
  switch (state) {
    case "granted":
      return "authorized";
    case "requested":
      return "pending";
    case "denied":
    case "revoked":
      return "denied";
    case "not_requested":
    default:
      return "not_requested";
  }
}

function authorizationStageFor(
  status: PermissionStatus,
): PermissionAuthorizationStage {
  switch (status) {
    case "authorized":
      return "ready";
    case "pending":
      return "staged-review";
    case "available_after_camera":
      return "blocked-by-dependency";
    case "denied":
    case "not_requested":
    default:
      return "not-started";
  }
}

function actionLabelFor(
  capability: PermissionCapability,
  status: PermissionStatus,
): string {
  if (status === "authorized") {
    return `Use ${permissionCopy[capability].label.toLowerCase()} context`;
  }

  if (status === "pending") {
    return permissionCopy[capability].action;
  }

  if (status === "denied") {
    return `Review ${permissionCopy[capability].label.toLowerCase()} denial`;
  }

  return permissionCopy[capability].action;
}

function evidenceFor(permission: PermissionStateDTO): readonly PermissionEvidence[] {
  return permission.evidenceIds.map((evidenceId) => ({
    evidenceId,
    sourceLabel: permission.source.label ?? "Live permission source",
    excerpt: `${permission.capability} permission is ${permission.state}.`,
    collectedAt: permission.updatedAt,
  }));
}

function provenanceFor(
  graph: LivePermissionStateGraph,
  provider: LivePermissionStateProvider,
  generationMethod: PermissionStateProvenance["generationMethod"] =
    "live-store-query",
): PermissionStateProvenance {
  return {
    source: provider.source,
    sourceLabel: provider.sourceLabel,
    evidenceIds: graph.evidenceIds,
    collectedAt: graph.generatedAt,
    privacy: "live-permission-state",
    generationMethod,
  };
}

function unconfiguredProvenance(now: string): PermissionStateProvenance {
  return {
    source: "live-record-store:permissions:unconfigured",
    sourceLabel: "Unconfigured Permissions live store",
    evidenceIds: ["evidence:permission-live-store-unconfigured"],
    collectedAt: now,
    privacy: "live-permission-state",
    generationMethod: "live-store-query",
  };
}

function policyProvenance(
  now: string,
  sourceLabel: string,
): PermissionStateProvenance {
  return {
    source: "live-permission-state-policy",
    sourceLabel,
    evidenceIds: ["evidence:permission-live-request-policy"],
    collectedAt: now,
    privacy: "live-permission-state",
    generationMethod: "live-store-request-policy",
  };
}

function failure(
  code: PermissionStateErrorCode,
  provenance: PermissionStateProvenance,
): PermissionStateFailure {
  const definition = PERMISSION_STATE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function permissionRecordFor(
  graph: LivePermissionStateGraph,
  provider: LivePermissionStateProvider,
  permission: PermissionStateDTO,
): PermissionStateRecord | null {
  const capability = capabilityFromLiveRecord(permission.capability);

  if (!capability) {
    return null;
  }

  const status = statusFromLiveState(permission.state);
  const provenance = provenanceFor(
    {
      evidenceIds: permission.evidenceIds,
      generatedAt: permission.updatedAt,
      permissions: graph.permissions,
    },
    provider,
  );

  return {
    capability,
    label: permissionCopy[capability].label,
    status,
    authorizationStage: authorizationStageFor(status),
    actionLabel: actionLabelFor(capability, status),
    requiredFor: permissionCopy[capability].requiredFor,
    rationale:
      status === "authorized"
        ? `${permissionCopy[capability].label} is available from live permission state.`
        : `${permissionCopy[capability].label} is staged from live permission state.`,
    evidence: evidenceFor(permission),
    provenance,
  };
}

function payloadForGraph(
  graph: LivePermissionStateGraph,
  provider: LivePermissionStateProvider,
): PermissionStatePayload {
  const permissions = graph.permissions
    .map((permission) => permissionRecordFor(graph, provider, permission))
    .filter(
      (permission): permission is PermissionStateRecord => permission !== null,
    );
  const state =
    permissions.length === 0
      ? "empty"
      : permissions.some((permission) => permission.status === "pending")
        ? "pending"
        : "success";
  const provenance = provenanceFor(graph, provider);

  return {
    state,
    permissions,
    summary:
      permissions.length === 0
        ? "No live permission records are available for staged authorization."
        : `${permissions.length} live permission record${permissions.length === 1 ? "" : "s"} mapped into staged authorization state.`,
    provenance,
    nextAction:
      state === "pending"
        ? "Review staged live permissions before requesting provider access."
        : "Use live permission state before running sensitive relationship workflows.",
  };
}

function emptyPayload(
  now: string,
  sourceLabel: string,
): PermissionStatePayload {
  const provenance = policyProvenance(now, sourceLabel);

  return {
    state: "empty",
    permissions: [],
    summary: "No live permission workflow has been selected.",
    provenance,
    nextAction:
      "Select a relationship workflow before requesting staged permission review.",
  };
}

function pendingPayload(
  now: string,
  capability: PermissionCapability = "calendar",
  intent: PermissionIntent = "connect-event-calendar",
): PermissionRequestPayload {
  const copy = permissionCopy[capability];
  const provenance = policyProvenance(now, "Live permission request policy");
  const permission: PermissionStateRecord = {
    capability,
    label: copy.label,
    status: "pending",
    authorizationStage: "staged-review",
    actionLabel: copy.action,
    requiredFor: copy.requiredFor,
    rationale:
      "Live provider access remains staged until explicit user review completes.",
    evidence: provenance.evidenceIds.map((evidenceId) => ({
      evidenceId,
      sourceLabel: provenance.sourceLabel,
      excerpt:
        "Live permission request is represented as an in-app review state.",
      collectedAt: now,
    })),
    provenance,
  };

  return {
    state: "pending",
    request: {
      id: `permission-request:${capability}:${intent}`,
      capability,
      intent,
      status: "pending",
      requestedAt: now,
      replacesProviderFlow: true,
      reviewLabel: `${copy.label} staged authorization review`,
      evidenceIds: provenance.evidenceIds,
    },
    permission,
    provenance,
    nextAction:
      "Show a staged authorization review instead of opening a provider flow.",
  };
}

async function readLivePayload(
  provider: LivePermissionStateProvider | null,
  now: string,
): Promise<PermissionStateResult> {
  if (!provider) {
    return failure(
      "PERMISSION_STATE_LIVE_STORE_UNCONFIGURED",
      unconfiguredProvenance(now),
    );
  }

  return stateSuccess(payloadForGraph(await provider.readPermissionGraph(), provider));
}

export function createLivePermissionStateService({
  now = () => new Date().toISOString(),
  provider = null,
}: LivePermissionStateServiceOptions = {}): PermissionStateService {
  return {
    async listPermissionStates(input = {}): Promise<PermissionStateResult> {
      switch (normalizeStateScenario(input.scenario)) {
        case "empty":
          return stateSuccess(
            emptyPayload(now(), "Live permission empty state rule"),
          );
        case "pending":
          return requestSuccess(pendingPayload(now())).success
            ? stateSuccess({
                ...emptyPayload(now(), "Live permission pending state rule"),
                state: "pending",
                permissions: [pendingPayload(now()).permission],
                summary:
                  "Calendar authorization is staged for live provider review.",
                nextAction:
                  "Review the live calendar intent before provider access.",
              })
            : readLivePayload(provider, now());
        case "failure":
          return failure(
            "PERMISSION_STATE_LIVE_STORE_UNCONFIGURED",
            unconfiguredProvenance(now()),
          );
        case "success":
        default:
          return readLivePayload(provider, now());
      }
    },

    async requestPermission(input): Promise<PermissionRequestResult> {
      if (!provider) {
        return failure(
          "PERMISSION_STATE_LIVE_STORE_UNCONFIGURED",
          unconfiguredProvenance(now()),
        );
      }

      const scenario = normalizeRequestScenario(input.scenario);
      const capability = normalizeCapability(input.capability);

      if (!capability) {
        return failure(
          "PERMISSION_CAPABILITY_NOT_FOUND",
          policyProvenance(now(), "Live missing permission capability rule"),
        );
      }

      if (scenario === "blocked" || scenario === "failure") {
        return failure(
          "PERMISSION_REQUEST_NOT_ALLOWED",
          policyProvenance(now(), "Live permission request blocked rule"),
        );
      }

      return requestSuccess(
        pendingPayload(now(), capability, normalizeIntent(input.intent)),
      );
    },
  };
}
