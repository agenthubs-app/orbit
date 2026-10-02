import { strengthFromTier, type NetworkTierLookup } from "../network-0918/network-model";
import { industryLabel, isIndustryIdCode } from "../../../../../shared/domain/industries";
import { hasPendingInitialization } from "../contact-relationship-initialization-view-model";
import type {
  AppContactListItemViewModel,
  AppContactsRouteViewModel,
} from "./contacts-route-view-model";
import type {
  OrbitContactPipelineStatus,
  OrbitContactsViewModel,
  OrbitContactStrength,
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
  if (contact.sourceType === "business_card_ocr") {
    return "scan";
  }

  if (contact.sourceType === "event_import") {
    return "event";
  }

  if (contact.sourceType === "external_contacts") {
    return "contact";
  }

  if (contact.sourceType === "qr_scan") {
    return "qr";
  }

  if (contact.sourceType === "referral") {
    return "referral";
  }

  if (contact.sourceType === "manual") {
    return "manual";
  }

  return "exchange";
}

function pipelineStatusFor(
  contact: AppContactListItemViewModel,
): OrbitContactPipelineStatus {
  if (contact.status === "archived") {
    return "archived";
  }

  if (contact.status === "needs_follow_up") {
    return "to_contact";
  }

  return "in_progress";
}

function eventIdFor(contact: AppContactListItemViewModel): string {
  if (contact.sourceType !== "event_import") {
    return "";
  }

  return `source:${contact.sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "contact"}`;
}

function nextActionFor(
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
  tiers?: NetworkTierLookup,
): OrbitContactView {
  const eventId = eventIdFor(contact);
  const industry = isIndustryIdCode(contact.primaryIndustryId)
    ? industryLabel(contact.primaryIndustryId, "zh")
    : contact.primaryIndustryLabel?.trim() ?? "";
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
            industry,
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
    industry,
    primaryIndustryId: contact.primaryIndustryId,
    location: contact.location,
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
    pipelineStatus: hasPendingInitialization(contact) ? "pending_initialization" : pipelineStatusFor(contact),
    relationshipStatus: contact.status,
    seeking: contact.nextAction,
    source: sourceFor(contact),
    stage: hasPendingInitialization(contact) ? "待设置关系" : contact.statusLabel,
    title: contact.role,
    wechat: "",
    strength: strengthFromTier(tiers?.get(contact.id)),
    dormant: tiers?.get(contact.id)?.dormant === true,
    valueTags: Array.from(contact.relationshipValueLabels).slice(0, 3),
    nextAction: hasPendingInitialization(contact) ? null : nextActionFor(contact),
    lastInteraction: "",
  };
}

/**
 * W0047（W47-4）：`tiers` = 这些联系人的档位（relationship_strengths 读模型投影，加载器读好传入）；
 * 强弱点只读它（core→strong、active→medium、new→weak、dormant→dormant，无行→unscored）。
 */
export function contactsRouteToOrbitContactsViewModel(
  model: AppContactsSuccessRouteViewModel,
  tiers?: NetworkTierLookup,
): OrbitContactsViewModel {
  const sourceLabels = Array.from(
    new Set(
      model.payload.contacts
        .filter((contact) => contact.sourceType === "event_import")
        .map((contact) => contact.sourceLabel),
    ),
  );

  return {
    connections: model.payload.contacts.map((contact, index) => contactToOrbitView(contact, index, tiers)),
    events: sourceLabels.map((sourceLabel) => ({
      id: `source:${sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "contact"}`,
      name: sourceLabel,
    })),
    intros: [],
    pipelineStatuses: [
      ...(model.payload.contacts.some(hasPendingInitialization) ? [{ value: "pending_initialization" as const, label: "待设置关系" }] : []),
      { value: "to_contact", label: "待联系" },
      { value: "in_progress", label: "在推进" },
      { value: "partnered", label: "已合作" },
      { value: "archived", label: "已归档" },
    ],
  };
}
