import type {
  AppContactListItemViewModel,
  AppContactsRouteViewModel,
} from "./contacts-route-view-model";
import type {
  OrbitContactPipelineStatus,
  OrbitContactsViewModel,
  OrbitContactView,
} from "../../orbit-contacts-route-view-model";

type AppContactsSuccessRouteViewModel = Extract<
  AppContactsRouteViewModel,
  { state: "success" }
>;

function initialFor(value: string): string {
  return value.trim().slice(0, 1).toUpperCase() || "?";
}

function sourceFor(
  contact: AppContactListItemViewModel,
): OrbitContactView["source"] {
  const source = contact.sourceLabel.toLowerCase();

  if (source.includes("scan") || source.includes("card") || source.includes("ocr")) {
    return "scan";
  }

  if (source.includes("manual")) {
    return "manual";
  }

  return "exchange";
}

function pipelineStatusFor(
  contact: AppContactListItemViewModel,
): OrbitContactPipelineStatus {
  const status = contact.statusLabel.toLowerCase();

  if (status.includes("archived")) {
    return "partnered";
  }

  if (status.includes("follow")) {
    return "to_contact";
  }

  return "in_progress";
}

function eventIdFor(contact: AppContactListItemViewModel): string {
  return `source:${contact.sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "contact"}`;
}

function contactToOrbitView(
  contact: AppContactListItemViewModel,
  index: number,
): OrbitContactView {
  const eventId = eventIdFor(contact);
  const relationshipContext =
    contact.relationshipContextCopy || contact.profileSnippet || contact.nextAction;

  return {
    company: contact.organization,
    displayName: contact.displayName,
    email: "",
    encounters: [
      {
        context: {
          metAt: "",
          publicProfile: {
            bio: contact.profileSnippet,
            conversationPrompts: [contact.nextAction].filter(Boolean),
            industry: contact.location || contact.tags[0] || "",
            intro: relationshipContext,
            offering: contact.relationshipValueLabels.length
              ? Array.from(contact.relationshipValueLabels)
              : [contact.relationshipValueSummary],
            seeking: [contact.nextAction].filter(Boolean),
            topics: contact.tags.length ? Array.from(contact.tags).slice(0, 4) : [],
          },
          reason: relationshipContext,
          score: contact.needsAttention ? 88 : 72,
          tableNo: (index % 8) + 1,
        },
        createdAt: "",
        eventId,
        id: `encounter:${contact.id}`,
      },
    ],
    g: "g-violet",
    id: contact.id,
    industry: contact.location || contact.tags[0] || "",
    initial: initialFor(contact.displayName),
    lastEventId: eventId,
    lineId: "",
    met: `${contact.sourceLabel} · ${contact.location}`,
    note: relationshipContext,
    notes: relationshipContext
      ? [{ body: relationshipContext, createdAt: "", id: `note:${contact.id}` }]
      : [],
    offering: contact.relationshipValueSummary,
    phone: "",
    pipelineStatus: pipelineStatusFor(contact),
    seeking: contact.nextAction,
    source: sourceFor(contact),
    stage: contact.statusLabel,
    title: contact.role,
    wechat: "",
  };
}

export function contactsRouteToOrbitContactsViewModel(
  model: AppContactsSuccessRouteViewModel,
): OrbitContactsViewModel {
  const sourceLabels = Array.from(
    new Set(model.payload.contacts.map((contact) => contact.sourceLabel)),
  );

  return {
    connections: model.payload.contacts.map(contactToOrbitView),
    events: sourceLabels.map((sourceLabel) => ({
      id: `source:${sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "contact"}`,
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
