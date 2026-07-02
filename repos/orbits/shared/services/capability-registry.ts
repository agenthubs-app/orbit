import {
  DEFAULT_MODULE_MODE,
  type ModuleMode,
  type ModuleServiceFactory,
  type ServiceResolution,
  createModuleServiceFactory,
} from "./module-mode";

// capability registry 是开发面板和架构检查用的目录。
// 它不实现业务逻辑，只描述每个 capability 的 API envelope、debug 入口、
// 当前 mock/hybrid service 状态，以及是否需要敏感操作确认。
export const CAPABILITY_IDS = [
  "account-profile",
  "permissions",
  "contact-acquisition",
  "contacts",
  "connections",
  "events",
  "followups",
  "chat",
  "dashboard",
  "agent-actions",
  "notifications",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const CAPABILITY_API_ENVELOPE =
  "{ success: true, data } | { success: false, error }" as const;

export interface CapabilityApiRouteMetadata {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  purpose: string;
}

export interface CapabilityApiMetadata {
  envelope: typeof CAPABILITY_API_ENVELOPE;
  routes: readonly CapabilityApiRouteMetadata[];
}

export interface CapabilityDebugMetadata {
  route: string;
  title: string;
  description: string;
}

export type CapabilityServiceStatus =
  | "mock-ready"
  | "hybrid-mock-ready"
  | "live-ready";

export interface CapabilityService {
  capabilityId: CapabilityId;
  mode: ModuleMode;
  status: CapabilityServiceStatus;
  source:
    | "mock-service-factory"
    | "hybrid-service-factory"
    | "live-service-factory";
  provenance: {
    requiresEvidence: true;
    requiresSource: true;
    sensitiveActionsRequireConfirmation: boolean;
  };
}

export interface CapabilityRegistration {
  id: CapabilityId;
  label: string;
  description: string;
  defaultMode: ModuleMode;
  api: CapabilityApiMetadata;
  debug: CapabilityDebugMetadata;
  factory: ModuleServiceFactory<CapabilityService>;
}

export interface CapabilitySummary {
  id: CapabilityId;
  label: string;
  description: string;
  currentMode: ModuleMode;
  serviceStatus: CapabilityServiceStatus | "not-implemented";
  defaultMode: ModuleMode;
  api: CapabilityApiMetadata;
  debug: CapabilityDebugMetadata;
}

interface CapabilityDefinition {
  id: CapabilityId;
  label: string;
  description: string;
  sensitiveActionsRequireConfirmation: boolean;
  apiRoutes: readonly CapabilityApiRouteMetadata[];
  debugDescription: string;
}

function createServiceConstructor(
  mode: ModuleMode,
  source: CapabilityService["source"],
  status: CapabilityServiceStatus,
  sensitiveActionsRequireConfirmation: boolean,
) {
  // registry 里的 service 是元数据 service，用来展示某个 capability 在当前 mode 下是否可用。
  // 真正的 feature service 仍由各 features/*/service-factory.ts 提供。
  return ({
    capabilityId,
  }: {
    capabilityId: string;
    requestedMode: ModuleMode;
  }): CapabilityService => ({
    capabilityId: capabilityId as CapabilityId,
    mode,
    status,
    source,
    provenance: {
      requiresEvidence: true,
      requiresSource: true,
      sensitiveActionsRequireConfirmation,
    },
  });
}

function createRegistration(
  definition: CapabilityDefinition,
): CapabilityRegistration {
  // registry 只展示 capability group 的运行时目录状态；具体业务实现仍由各 feature factory 负责。
  const defaultMode = DEFAULT_MODULE_MODE;

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    defaultMode,
    api: {
      envelope: CAPABILITY_API_ENVELOPE,
      routes: definition.apiRoutes,
    },
    debug: {
      route: `/dev/capabilities#${definition.id}`,
      title: `${definition.label} capability`,
      description: definition.debugDescription,
    },
    factory: createModuleServiceFactory<CapabilityService>({
      capabilityId: definition.id,
      defaultMode,
      implementations: {
        mock: createServiceConstructor(
          "mock",
          "mock-service-factory",
          "mock-ready",
          definition.sensitiveActionsRequireConfirmation,
        ),
        hybrid: createServiceConstructor(
          "hybrid",
          "hybrid-service-factory",
          "hybrid-mock-ready",
          definition.sensitiveActionsRequireConfirmation,
        ),
        live: createServiceConstructor(
          "live",
          "live-service-factory",
          "live-ready",
          definition.sensitiveActionsRequireConfirmation,
        ),
      },
    }),
  };
}

const definitions: readonly CapabilityDefinition[] = [
  // definitions 是 capability map 的唯一维护点。
  // 新增 capability 时，应在这里补 label/API/debug 元数据，并在对应 feature 下实现服务。
  {
    id: "account-profile",
    label: "Account and profile",
    description:
      "Account container and operator profile services before live auth exists.",
    sensitiveActionsRequireConfirmation: false,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/account/profile",
        purpose: "Return the active account and user profile DTOs.",
      },
    ],
    debugDescription:
      "Shows whether account and profile services resolve from mock, hybrid, or live mode.",
  },
  {
    id: "permissions",
    label: "Staged permissions",
    description:
      "Permission state services for staged provider access before OAuth wiring.",
    sensitiveActionsRequireConfirmation: true,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/permissions",
        purpose: "List staged permission states with source evidence.",
      },
      {
        method: "POST",
        path: "/api/permissions/:capability/request",
        purpose: "Stage a permission request without opening a live provider.",
      },
    ],
    debugDescription:
      "Shows whether permission services are using mock, hybrid, or live mode and whether consent evidence is required.",
  },
  {
    id: "contact-acquisition",
    label: "Contact acquisition",
    description:
      "Manual, card OCR, QR, import, signal, referral, and merge-suggestion acquisition services.",
    sensitiveActionsRequireConfirmation: false,
    apiRoutes: [
      {
        method: "POST",
        path: "/api/contact-acquisition/manual",
        purpose: "Create a sourced contact candidate from a manual note.",
      },
      {
        method: "POST",
        path: "/api/contact-acquisition/imports",
        purpose: "Create contact candidates from a mock import provider.",
      },
    ],
    debugDescription:
      "Shows whether acquisition mocks or future providers are active for relationship-source intake.",
  },
  {
    id: "contacts",
    label: "Contacts",
    description:
      "Contact record services that preserve source references and evidence ids.",
    sensitiveActionsRequireConfirmation: false,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/contacts",
        purpose: "List contacts with relationship stage and provenance.",
      },
      {
        method: "POST",
        path: "/api/contacts",
        purpose: "Create a contact only when source and evidence are present.",
      },
    ],
    debugDescription:
      "Shows whether contact services resolve from mock, hybrid, or live mode and keep source evidence attached.",
  },
  {
    id: "connections",
    label: "Connections and evidence",
    description:
      "Connection, evidence, relationship profile, value scoring, and relationship search services.",
    sensitiveActionsRequireConfirmation: false,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/connections",
        purpose: "List source-backed relationship connections.",
      },
      {
        method: "GET",
        path: "/api/evidence",
        purpose: "List evidence records used by relationship services.",
      },
    ],
    debugDescription:
      "Shows whether connection and evidence services resolve through mock, hybrid, or live providers.",
  },
  {
    id: "events",
    label: "Event lifecycle",
    description:
      "Event, attendee roster, readiness, recommendation, encounter note, and post-event review services.",
    sensitiveActionsRequireConfirmation: false,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/events",
        purpose: "List events and attendee context with evidence.",
      },
      {
        method: "POST",
        path: "/api/events/:id/notes",
        purpose: "Capture encounter notes as source-backed evidence.",
      },
    ],
    debugDescription:
      "Shows whether event lifecycle services are mock-backed or live-provider-backed.",
  },
  {
    id: "followups",
    label: "Followups and reminders",
    description:
      "Follow-up task, draft, reminder, notification-prep, and external-action intent services.",
    sensitiveActionsRequireConfirmation: true,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/followups",
        purpose: "List follow-up tasks with source-backed reasons.",
      },
      {
        method: "POST",
        path: "/api/followups/:id/draft",
        purpose: "Prepare a follow-up draft without sending externally.",
      },
    ],
    debugDescription:
      "Shows whether follow-up services require confirmation before reminders or external messages.",
  },
  {
    id: "chat",
    label: "Chat and summaries",
    description:
      "Chat, writing assist, summary extraction, and privacy-control services.",
    sensitiveActionsRequireConfirmation: true,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/chat/conversations",
        purpose: "List conversations with source and evidence provenance.",
      },
      {
        method: "POST",
        path: "/api/chat/assist",
        purpose: "Draft relationship-aware chat copy without calling a live AI provider.",
      },
    ],
    debugDescription:
      "Shows whether chat services are mock, hybrid, or live and whether private context is protected.",
  },
  {
    id: "dashboard",
    label: "Dashboard analytics",
    description:
      "Dashboard, analytics, opportunity analysis, and AI-provider provenance services.",
    sensitiveActionsRequireConfirmation: false,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/dashboard",
        purpose: "Return dashboard items with evidence provenance.",
      },
      {
        method: "GET",
        path: "/api/opportunities",
        purpose: "Return opportunity analysis without live AI calls.",
      },
    ],
    debugDescription:
      "Shows whether dashboard analytics resolve from mock services or future live providers.",
  },
  {
    id: "agent-actions",
    label: "Agent action queue",
    description:
      "Action queue, autonomy setting, external-action sandbox, and confirmation-guard services.",
    sensitiveActionsRequireConfirmation: true,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/agent/actions",
        purpose: "List proposed actions with evidence and confirmation state.",
      },
      {
        method: "POST",
        path: "/api/agent/actions/:id/confirm",
        purpose: "Confirm a sensitive action before any external provider call.",
      },
    ],
    debugDescription:
      "Shows whether proposed action services are using mock, hybrid, or live mode and whether confirmation guards are required.",
  },
  {
    id: "notifications",
    label: "Notifications",
    description:
      "Notification preparation and delivery-state services before live delivery providers exist.",
    sensitiveActionsRequireConfirmation: true,
    apiRoutes: [
      {
        method: "GET",
        path: "/api/notifications",
        purpose: "List notification records and delivery state.",
      },
      {
        method: "POST",
        path: "/api/notifications/:id/confirm",
        purpose: "Confirm notification delivery intent before live delivery exists.",
      },
    ],
    debugDescription:
      "Shows whether notification services use mock delivery state or future live providers.",
  },
] as const;

const registrations = definitions.map(createRegistration);

const registry = new Map<CapabilityId, CapabilityRegistration>(
  registrations.map((registration) => [registration.id, registration]),
);

export function listCapabilityRegistrations(): CapabilityRegistration[] {
  // 返回浅拷贝，避免调用方直接修改 registrations 数组。
  return [...registrations];
}

export function getCapabilityRegistration(
  id: CapabilityId,
): CapabilityRegistration {
  const registration = registry.get(id);

  if (!registration) {
    throw new Error(`Capability "${id}" is not registered.`);
  }

  return registration;
}

export function createCapabilityService(
  id: CapabilityId,
  options: {
    mode?: ModuleMode | string;
  } = {},
): ServiceResolution<CapabilityService> {
  // mode 解析和 not-implemented 失败都交给 ModuleServiceFactory，保持所有 capability 一致。
  return getCapabilityRegistration(id).factory.create(options.mode);
}

export function listCapabilitySummaries(
  options: {
    mode?: ModuleMode | string;
  } = {},
): CapabilitySummary[] {
  // summaries 是 UI/debug 面板消费的轻量视图，不暴露 factory 实例。
  return registrations.map((registration) => {
    const resolution = registration.factory.create(options.mode);
    const resolutionHasService = "service" in resolution;

    return {
      id: registration.id,
      label: registration.label,
      description: registration.description,
      currentMode: resolutionHasService
        ? resolution.mode
        : resolution.error.requestedMode,
      serviceStatus: resolutionHasService
        ? resolution.service.status
        : "not-implemented",
      defaultMode: registration.defaultMode,
      api: registration.api,
      debug: registration.debug,
    };
  });
}
