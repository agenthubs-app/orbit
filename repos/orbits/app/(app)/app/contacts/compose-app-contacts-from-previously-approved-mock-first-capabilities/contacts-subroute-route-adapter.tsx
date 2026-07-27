import { StateView } from "../../../../../shared/ui/state-view";
import type {
  OrbitContactView,
  OrbitContactsViewModel,
  OrbitContactStrength,
  OrbitContactPipelineStatus,
} from "../../orbit-contacts-route-view-model";
import type {
  AppContactListItemViewModel,
  AppContactsPayloadViewModel,
  AppContactsRouteViewModel,
} from "./contacts-route-view-model";

function initialFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function eventIdForSource(sourceLabel: string): string {
  const id = sourceLabel
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `source:${id || "contacts"}`;
}

function pipelineStatusForContact(
  contact: AppContactListItemViewModel,
): OrbitContactPipelineStatus {
  if (contact.status === "needs_follow_up") {
    return "to_contact";
  }

  if (contact.status === "archived") {
    return "partnered";
  }

  return "in_progress";
}

function sourceKindForContact(
  contact: AppContactListItemViewModel,
): OrbitContactView["source"] {
  if (contact.sourceType === "business_card_ocr") {
    return "scan";
  }

  if (contact.sourceType === "qr_scan") {
    return "qr";
  }

  if (contact.sourceType === "event_import") {
    return "event";
  }

  if (contact.sourceType === "external_contacts") {
    return "contact";
  }

  if (contact.sourceType === "referral") {
    return "referral";
  }

  if (contact.sourceType === "manual") {
    return "manual";
  }

  return "exchange";
}

function strengthForContact(
  contact: AppContactListItemViewModel,
): OrbitContactStrength {
  const highValue = contact.relationshipValueLabels.some((label) =>
    /commercial|strategic|invest/i.test(label),
  );

  if (highValue) {
    return "strong";
  }

  return contact.needsAttention ? "weak" : "medium";
}

function nextActionForContact(
  contact: AppContactListItemViewModel,
): OrbitContactView["nextAction"] {
  if (!contact.nextAction) {
    return null;
  }

  return {
    text: contact.nextAction,
    reason: contact.relationshipContextCopy || contact.valueRationale || contact.nextAction,
    evidenceId: contact.evidenceIds[0],
  };
}

function contactToOrbitView(
  contact: AppContactListItemViewModel,
  index: number,
): OrbitContactView {
  const eventId = eventIdForSource(contact.sourceLabel);
  const note =
    contact.relationshipContextCopy ||
    contact.profileSnippet ||
    contact.valueRationale;
  const offering =
    contact.relationshipValueLabels[0] ?? contact.tags[0] ?? "Relationship context";
  const seeking = contact.nextAction || contact.valueRationale;

  return {
    company: contact.organization,
    displayName: contact.displayName,
    email: "",
    encounters: [
      {
        context: {
          metAt: contact.sourceLabel,
          publicProfile: {
            bio: contact.profileSnippet || note,
            conversationPrompts: [contact.nextAction, contact.valueRationale]
              .filter(Boolean)
              .slice(0, 2),
            industry: contact.tags[0] ?? "Relationship",
            intro: note,
            offering: [offering],
            seeking: [seeking],
            topics: contact.tags.length
              ? Array.from(contact.tags).slice(0, 4)
              : contact.relationshipValueLabels.slice(0, 4),
          },
          reason: note,
          score: contact.needsAttention ? 72 : 84,
          tableNo: (index % 8) + 1,
        },
        createdAt: contact.sourceLabel,
        eventId,
        id: `encounter:${contact.id}`,
      },
    ],
    g: "g-violet",
    id: contact.id,
    industry: contact.tags[0] ?? "Relationship",
    initial: initialFor(contact.displayName),
    lastEventId: eventId,
    lineId: "",
    met: `${contact.sourceLabel}${contact.location ? ` · ${contact.location}` : ""}`,
    note,
    notes: note
      ? [
          {
            body: note,
            createdAt: contact.sourceLabel,
            id: `note:${contact.id}`,
          },
        ]
      : [],
    offering,
    phone: "",
    pipelineStatus: pipelineStatusForContact(contact),
    seeking,
    source: sourceKindForContact(contact),
    stage: contact.statusLabel,
    title: contact.role,
    wechat: "",
    strength: strengthForContact(contact),
    valueTags: Array.from(contact.relationshipValueLabels).slice(0, 3),
    nextAction: nextActionForContact(contact),
    lastInteraction: "",
    dormant: false,
  };
}

export function contactsRouteToOrbitContactsViewModel(
  payload: AppContactsPayloadViewModel,
): OrbitContactsViewModel {
  const sourceLabels = Array.from(
    new Set(payload.contacts.map((contact) => contact.sourceLabel)),
  );

  return {
    connections: payload.contacts.map(contactToOrbitView),
    events: sourceLabels.map((sourceLabel) => ({
      id: eventIdForSource(sourceLabel),
      name: sourceLabel,
    })),
    intros: [],
    pipelineStatuses: [
      { value: "to_contact", label: "待联系" },
      { value: "in_progress", label: "在推进" },
      { value: "partnered", label: "已合作" },
    ],
  };
}

function recoveryActions(
  actions: readonly { href: string; label: string }[],
): {
  href: string;
  id: string;
  label: string;
  recoveryCopy: string;
}[] {
  return actions.map((action, index) => ({
    href: action.href,
    id: `contacts-subroute-recovery-${index}`,
    label: action.label,
    recoveryCopy: "Return to a contacts route that can re-check source records.",
  }));
}

export function ContactsSubrouteStateBoundary({
  marker,
  routeModel,
}: {
  marker: string;
  routeModel: Exclude<AppContactsRouteViewModel, { state: "success" }>;
}) {
  const copy =
    routeModel.state === "route-state"
      ? routeModel.routeState.copy
      : routeModel.failure;
  const evidence =
    routeModel.state === "route-state"
      ? routeModel.routeState.evidenceIds
      : routeModel.failure.evidenceIds;
  const actions =
    routeModel.state === "route-state"
      ? routeModel.routeState.recoveryActions
      : [{ href: "/app/contacts", label: "Reload contacts list" }];

  return (
    <main
      data-orbit-route={marker}
      style={{ minHeight: "100dvh", padding: "32px", background: "var(--bg)" }}
    >
      <StateView
        description={copy.description}
        emptyState={copy.emptyState}
        evidence={[...evidence]}
        eyebrow={copy.eyebrow}
        guardrail={copy.guardrail}
        nextStep={copy.nextStep}
        purpose={copy.purpose}
        recoveryActions={recoveryActions(actions)}
        title={copy.title}
      />
    </main>
  );
}
