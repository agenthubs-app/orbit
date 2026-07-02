import type {
  ContactDetailSourceReference,
  ContactDetailStatusOption,
} from "../../../../../features/contacts/detail-contract";
import type {
  AppContactDetailSuccessModel,
} from "./contact-detail-route-service";
import type {
  OrbitContactEncounterView,
  OrbitContactNoteView,
  OrbitContactPipelineStatus,
  OrbitContactsViewModel,
  OrbitContactView,
} from "../../orbit-contacts-route-view-model";

function pipelineStatusFor(
  status: ContactDetailStatusOption,
): OrbitContactPipelineStatus {
  if (status === "needs_follow_up") {
    return "to_contact";
  }

  if (status === "archived") {
    return "partnered";
  }

  return "in_progress";
}

function sourceFor(
  source: ContactDetailSourceReference,
): OrbitContactView["source"] {
  return source.type === "manual" ? "manual" : "exchange";
}

function eventIdFor(model: AppContactDetailSuccessModel): string {
  return (
    model.connection.sourceLinks.find((source) => source.type === "event_import")
      ?.id ??
    model.contact.lastInteraction.source.id ??
    model.connection.sourceLinks[0]?.id ??
    "live-relationship-source"
  );
}

function noteViews(model: AppContactDetailSuccessModel): OrbitContactNoteView[] {
  const sourceNotes = model.contact.notes.map((note) => ({
    body: note.body,
    createdAt: note.createdAt,
    id: note.noteId,
  }));

  if (sourceNotes.length > 0) {
    return sourceNotes;
  }

  return model.evidenceTimeline.slice(0, 3).map((item) => ({
    body: item.excerpt,
    createdAt: item.occurredAt,
    id: item.evidenceId,
  }));
}

function encounterFor(
  model: AppContactDetailSuccessModel,
  eventId: string,
): OrbitContactEncounterView {
  const profile = model.contact.publicProfile;

  return {
    context: {
      metAt:
        model.contact.lastInteraction.occurredAt ||
        model.connection.lastTouchedAt ||
        model.contact.updatedAt,
      publicProfile: {
        bio: profile.bio,
        conversationPrompts: Array.from(profile.conversationPrompts),
        industry: profile.industry,
        intro: profile.selfIntroduction,
        offering: Array.from(profile.offering),
        seeking: Array.from(profile.seeking),
        topics: Array.from(profile.topics),
      },
      reason:
        model.connection.connectionReason ||
        model.contact.relationshipContext ||
        model.assessment.rationale.summary,
      score:
        model.assessment.priorityScore.value || model.connection.strengthScore,
      tableNo: 0,
    },
    createdAt: model.connection.lastTouchedAt || model.contact.updatedAt,
    eventId,
    id: `encounter:${model.connection.id}`,
  };
}

export function contactDetailRouteToOrbitContactsViewModel(
  model: AppContactDetailSuccessModel,
): OrbitContactsViewModel {
  const eventId = eventIdFor(model);
  const notes = noteViews(model);
  const contact: OrbitContactView = {
    company: model.contact.organization,
    displayName: model.contact.displayName,
    email: "",
    encounters: [encounterFor(model, eventId)],
    g: "g-violet",
    id: model.contact.id,
    industry: model.contact.publicProfile.industry,
    initial:
      model.contact.displayName.trim().slice(0, 1).toUpperCase() ||
      model.contact.id.slice(0, 1).toUpperCase(),
    lastEventId: eventId,
    lineId: "",
    met: `${model.contact.source.label} · ${model.contact.source.type}`,
    note:
      model.contact.relationshipContext ||
      model.connection.connectionReason ||
      model.assessment.rationale.summary,
    notes,
    offering: model.contact.publicProfile.offering.join(", "),
    phone: "",
    pipelineStatus: pipelineStatusFor(model.contact.status),
    seeking: model.contact.publicProfile.seeking.join(", "),
    source: sourceFor(model.contact.source),
    stage: model.contact.status,
    title: model.contact.role,
    wechat: "",
  };

  return {
    connections: [contact],
    events: [
      {
        id: eventId,
        name: model.contact.source.label || model.connection.sourceLinks[0]?.label || eventId,
      },
    ],
    intros: [],
    pipelineStatuses: [
      { value: "to_contact", label: "待联系" },
      { value: "in_progress", label: "在推进" },
      { value: "partnered", label: "已合作" },
    ],
  };
}
