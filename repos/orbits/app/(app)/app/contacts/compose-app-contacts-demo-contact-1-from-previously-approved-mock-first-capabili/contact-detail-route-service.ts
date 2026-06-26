import { createRelationshipValueScoringService } from "../../../../../features/analysis/service-factory";
import type {
  RelationshipValueAssessment,
  RelationshipValuePayload,
  RelationshipValueScoringService,
} from "../../../../../features/analysis/value-contract";
import { createConnectionEvidenceService } from "../../../../../features/connections/service-factory";
import type {
  ConnectionEvidenceDetailPayload,
  ConnectionEvidenceTimelineItem,
  ConnectionRecord,
} from "../../../../../features/connections/contract";
import type { ConnectionEvidenceService } from "../../../../../features/connections/service";
import { createContactDetailTagStatusService } from "../../../../../features/contacts/service-factory";
import type {
  ContactDetail,
  ContactDetailTagStatusPayload,
  ContactDetailTagStatusService,
} from "../../../../../features/contacts/detail-contract";
import {
  createModuleServiceFactory,
  type ModuleMode,
} from "../../../../../shared/services/module-mode";

export const APP_CONTACT_DETAIL_CONTACT_ID = "demo-contact-1";
export const APP_CONTACT_DETAIL_CONNECTION_ID = "demo-connection-1";

export type AppContactDetailRouteScenario = "empty" | "pending" | "failure";
export type AppContactDetailRouteAction = "prepare-follow-up";
export type AppContactDetailRouteState =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export interface AppContactDetailRouteInput {
  action?: string | null;
  contactId: string;
  mode?: ModuleMode | string;
  scenario?: string | null;
}

export interface AppContactDetailLocalActionResult {
  databaseQueryExecuted: false;
  evidenceId: string;
  excerpt: string;
  draftBody: string;
  draftSubject: string;
  notificationDelivered: false;
  productionAuditLogWriteExecuted: false;
  databaseWriteExecuted: false;
  externalNetworkRequested: false;
  localNextStep: string;
  messageSent: false;
  searchIndexReadExecuted: false;
  sideEffectsLabel: "none";
  title: string;
}

export interface AppContactDetailSuccessModel {
  actionResult: AppContactDetailLocalActionResult | null;
  assessment: RelationshipValueAssessment;
  contact: ContactDetail;
  contactPayload: ContactDetailTagStatusPayload;
  connection: ConnectionRecord;
  connectionPayload: ConnectionEvidenceDetailPayload;
  evidenceTimeline: readonly ConnectionEvidenceTimelineItem[];
  routeState: "success";
  valuePayload: RelationshipValuePayload;
}

export interface AppContactDetailBoundaryModel {
  description: string;
  evidence: readonly string[];
  nextStep: string;
  recoveryActions: readonly {
    href: string;
    label: string;
  }[];
  routeState: Exclude<AppContactDetailRouteState, "success">;
  title: string;
}

export type AppContactDetailRouteModel =
  | AppContactDetailSuccessModel
  | AppContactDetailBoundaryModel;

interface AppContactDetailRouteServices {
  connectionEvidence: ConnectionEvidenceService;
  contactDetail: ContactDetailTagStatusService;
  relationshipValue: RelationshipValueScoringService;
}

const contactDetailServiceFactory =
  createModuleServiceFactory<ContactDetailTagStatusService>({
    capabilityId: "app-contacts-demo-contact-1.contact-detail",
    implementations: {
      mock: () => createContactDetailTagStatusService(),
    },
  });

const connectionEvidenceServiceFactory =
  createModuleServiceFactory<ConnectionEvidenceService>({
    capabilityId: "app-contacts-demo-contact-1.connection-evidence",
    implementations: {
      mock: () => createConnectionEvidenceService(),
    },
  });

const relationshipValueServiceFactory =
  createModuleServiceFactory<RelationshipValueScoringService>({
    capabilityId: "app-contacts-demo-contact-1.relationship-value",
    implementations: {
      mock: () => createRelationshipValueScoringService(),
    },
  });

const routeBoundaryCopy = {
  empty: {
    description:
      "Choose a contact with source evidence before reviewing tags, status, connection context, or relationship value.",
    evidence: ["contact-detail-empty", "connection-evidence-empty"],
    nextStep: "Return to the sourced contacts list and select a relationship with evidence.",
    recoveryActions: [
      {
        href: "/app/contacts",
        label: "Return to contacts list",
      },
      {
        href: "/app/contacts/demo-contact-1",
        label: "Open Kenji detail",
      },
    ],
    title: "No contact detail is available",
  },
  failure: {
    description:
      "The local relationship detail boundary returned a controlled failure.",
    evidence: ["contact-detail-failure", "connection-evidence-failure"],
    nextStep:
      "Retry the detail view after confirming the local capability boundary is available.",
    recoveryActions: [
      {
        href: "/app/contacts/demo-contact-1",
        label: "Retry contact detail",
      },
      {
        href: "/app/contacts",
        label: "Return to contacts list",
      },
    ],
    title: "Contact detail could not load",
  },
  pending: {
    description:
      "Orbit is waiting for local source evidence before exposing this relationship profile.",
    evidence: ["contact-detail-pending", "connection-evidence-pending"],
    nextStep: "Check the current detail once source evidence has settled.",
    recoveryActions: [
      {
        href: "/app/contacts/demo-contact-1",
        label: "Check current detail",
      },
      {
        href: "/app/contacts",
        label: "Return to contacts list",
      },
    ],
    title: "Contact detail is loading",
  },
} as const satisfies Record<
  Exclude<AppContactDetailRouteState, "success">,
  Omit<AppContactDetailBoundaryModel, "routeState">
>;

function normalizeScenario(
  scenario?: string | null,
): AppContactDetailRouteScenario | null {
  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function normalizeAction(action?: string | null): AppContactDetailRouteAction | null {
  if (action === "prepare-follow-up" || action === "stage-local-review") {
    return "prepare-follow-up";
  }

  return null;
}

function createBoundaryModel(
  routeState: Exclude<AppContactDetailRouteState, "success">,
  evidence: readonly string[] = routeBoundaryCopy[routeState].evidence,
): AppContactDetailBoundaryModel {
  return {
    ...routeBoundaryCopy[routeState],
    evidence,
    routeState,
  };
}

function resolveRouteServices(
  mode?: ModuleMode | string,
): AppContactDetailRouteServices | AppContactDetailBoundaryModel {
  const contactDetail = contactDetailServiceFactory.create(mode);

  if (contactDetail.success === false) {
    return createBoundaryModel("failure", [contactDetail.error.code]);
  }

  const connectionEvidence = connectionEvidenceServiceFactory.create(mode);

  if (connectionEvidence.success === false) {
    return createBoundaryModel("failure", [connectionEvidence.error.code]);
  }

  const relationshipValue = relationshipValueServiceFactory.create(mode);

  if (relationshipValue.success === false) {
    return createBoundaryModel("failure", [relationshipValue.error.code]);
  }

  return {
    connectionEvidence: connectionEvidence.service,
    contactDetail: contactDetail.service,
    relationshipValue: relationshipValue.service,
  };
}

function isBoundaryModel(
  value: AppContactDetailRouteServices | AppContactDetailBoundaryModel,
): value is AppContactDetailBoundaryModel {
  return "routeState" in value;
}

function collectRouteEvidenceIds(
  contactPayload: ContactDetailTagStatusPayload,
  connectionPayload: ConnectionEvidenceDetailPayload,
  valuePayload: RelationshipValuePayload,
): string[] {
  return Array.from(
    new Set([
      ...contactPayload.provenance.evidenceIds,
      ...connectionPayload.provenance.evidenceIds,
      ...valuePayload.provenance.evidenceIds,
    ]),
  );
}

function buildLocalActionResult(
  connectionEvidence: ConnectionEvidenceService,
): AppContactDetailLocalActionResult | null {
  const result = connectionEvidence.addEvidence({
    connectionId: APP_CONTACT_DETAIL_CONNECTION_ID,
    contribution: "follow_up_signal",
    occurredAt: "2026-06-25T19:20:00.000Z",
    sourceLabel: "Operator follow-up note",
    sourceType: "manual",
    title: "Operator confirmed warm introduction path",
    excerpt:
      "Kenji wants the storage pilot operator intro before the partner review call.",
  });

  if (result.success === false) {
    return null;
  }

  const addedEvidence = result.data.evidenceTimeline[
    result.data.evidenceTimeline.length - 1
  ];
  const connection = result.data.connection;

  if (!addedEvidence || !connection) {
    return null;
  }

  return {
    databaseQueryExecuted: false,
    evidenceId: addedEvidence.evidenceId,
    excerpt: addedEvidence.excerpt,
    draftBody:
      "Kenji, I can introduce you to the operator team that validated the storage pilot path after the climate founders dinner. I will keep the context tied to the partner review call and wait for your confirmation before anything leaves Orbit.",
    draftSubject: "Warm intro for storage pilot operators",
    notificationDelivered: connection.notificationDelivered,
    productionAuditLogWriteExecuted: connection.productionAuditLogWriteExecuted,
    databaseWriteExecuted: connection.databaseWriteExecuted,
    externalNetworkRequested: connection.externalNetworkRequested,
    localNextStep:
      "Choose where to stage this draft. Orbit keeps it local and does not send, notify, write, query, or sync.",
    messageSent: false,
    searchIndexReadExecuted: false,
    sideEffectsLabel: "none",
    title: addedEvidence.title,
  };
}

function routeStateForPayloads(
  contactPayload: ContactDetailTagStatusPayload,
  connectionPayload: ConnectionEvidenceDetailPayload,
  valuePayload: RelationshipValuePayload,
): Exclude<AppContactDetailRouteState, "success"> | null {
  if (
    contactPayload.state === "pending" ||
    connectionPayload.state === "pending" ||
    valuePayload.state === "pending"
  ) {
    return "pending";
  }

  if (!contactPayload.contact || !connectionPayload.connection || !valuePayload.assessment) {
    return "empty";
  }

  return null;
}

export function loadAppContactDetailRoute({
  action,
  contactId,
  mode,
  scenario,
}: AppContactDetailRouteInput): AppContactDetailRouteModel {
  const services = resolveRouteServices(mode);

  if (isBoundaryModel(services)) {
    return services;
  }

  const routeScenario = normalizeScenario(scenario);
  const contactResult = services.contactDetail.getContactDetail({
    contactId,
    scenario: routeScenario,
  });
  const connectionResult = services.connectionEvidence.getConnection({
    connectionId: APP_CONTACT_DETAIL_CONNECTION_ID,
    scenario: routeScenario,
  });
  const valueResult = services.relationshipValue.getRelationshipValue({
    connectionId: APP_CONTACT_DETAIL_CONNECTION_ID,
    scenario: routeScenario,
  });

  if (
    contactResult.success === false ||
    connectionResult.success === false ||
    valueResult.success === false
  ) {
    const evidence = [
      ...(contactResult.success === false ? contactResult.error.evidenceIds : []),
      ...(connectionResult.success === false
        ? connectionResult.error.evidenceIds
        : []),
      ...(valueResult.success === false ? valueResult.error.evidenceIds : []),
    ];

    return createBoundaryModel("failure", evidence);
  }

  const routeState = routeStateForPayloads(
    contactResult.data,
    connectionResult.data,
    valueResult.data,
  );

  if (routeState) {
    return createBoundaryModel(
      routeState,
      collectRouteEvidenceIds(contactResult.data, connectionResult.data, valueResult.data),
    );
  }

  return {
    actionResult:
      normalizeAction(action) === "prepare-follow-up"
        ? buildLocalActionResult(services.connectionEvidence)
        : null,
    assessment: valueResult.data.assessment,
    contact: contactResult.data.contact,
    contactPayload: contactResult.data,
    connection: connectionResult.data.connection,
    connectionPayload: connectionResult.data,
    evidenceTimeline: connectionResult.data.evidenceTimeline,
    routeState: "success",
    valuePayload: valueResult.data,
  };
}
