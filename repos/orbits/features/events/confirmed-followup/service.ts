import { createHash } from "node:crypto";

import type { HumanEncounterRecord, HumanEncounterService } from "../../encounters/service";
import type { FollowupActionWriter } from "../../followups/action-writer";
import type { ReminderActionWriter } from "../../notifications/action-writer";
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { AppError } from "../../../shared/errors/app-error";

export type ConfirmedFollowupSourceKind = "commitment" | "next_step";

export interface ConfirmedEventFollowupView {
  contactDisplayName: string | null;
  contactHref: string;
  contactId: string;
  createdAt: string | null;
  dueAt: string | null;
  encounterId: string;
  evidenceIds: readonly string[];
  noteExcerpt: string;
  reminderId: string;
  reminderStatus: "dismissed" | "failed" | "missing" | "pending" | "sent";
  sourceIndex: number;
  sourceKind: ConfirmedFollowupSourceKind;
  sourceText: string;
  state: "available" | "completed" | "created" | "dismissed" | "partial";
  taskHref: "/app/followups";
  taskId: string;
  taskStatus: "completed" | "dismissed" | "missing" | "open" | "scheduled";
}

export interface ConfirmedEventFollowupService {
  confirm(input: {
    actorId: string;
    dueAt?: string | null;
    encounterId: string;
    eventId: string;
    sourceIndex: number;
    sourceKind: ConfirmedFollowupSourceKind;
  }): Promise<ConfirmedEventFollowupView>;
  list(input: {
    actorId: string;
    eventId: string;
  }): Promise<readonly ConfirmedEventFollowupView[]>;
}

const DEFAULT_REMINDER_DELAY_MS = 3 * 24 * 60 * 60_000;
const MAXIMUM_REMINDER_DELAY_MS = 366 * 24 * 60 * 60_000;
const PROVENANCE_KIND = "user_confirmed_human_encounter_followup";
export const CONFIRMED_EVENT_FOLLOWUP_COLLECTION = "event_confirmed_followups";

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new AppError("VALIDATION_ERROR", `${label} is required.`);
  if (normalized.length > 256) throw new AppError("VALIDATION_ERROR", `${label} is too long.`);
  return normalized;
}

function selectedSource(
  encounter: HumanEncounterRecord,
  sourceKind: ConfirmedFollowupSourceKind,
  sourceIndex: number,
): string | null {
  if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0) return null;
  if (sourceKind === "next_step") {
    return sourceIndex === 0 && encounter.nextStep.trim()
      ? encounter.nextStep.trim()
      : null;
  }
  return encounter.commitments[sourceIndex]?.trim() || null;
}

function identity(input: {
  actorId: string;
  encounterId: string;
  eventId: string;
  sourceIndex: number;
  sourceKind: ConfirmedFollowupSourceKind;
}): string {
  return createHash("sha256")
    .update([
      input.actorId,
      input.eventId,
      input.encounterId,
      input.sourceKind,
      String(input.sourceIndex),
    ].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
}

function ids(input: Parameters<typeof identity>[0]): { markerId: string; reminderId: string; taskId: string } {
  const value = identity(input);
  return {
    markerId: `event-confirmed-followup:${value}`,
    reminderId: `reminder:event-followup:${value}`,
    taskId: `task:event-followup:${value}`,
  };
}

function evidenceId(encounterId: string): string {
  return `evidence:human-encounter:${encounterId}`;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ownedContactDisplayName(
  record: LiveRecord<Record<string, unknown>> | null,
  actorId: string,
  contactId: string,
): string | null {
  if (
    !record ||
    record.lifecycleState !== "active" ||
    record.userId !== actorId ||
    record.recordId !== contactId ||
    record.payload.id !== contactId
  ) {
    return null;
  }
  return stringValue(record.payload.displayName);
}

function matchesMarker(
  record: LiveRecord<Record<string, unknown>> | null,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  if (!record) return true;
  const provenance = object(record.payload.provenance);
  const expectedEvidenceIds = Array.isArray(expected.evidenceIds) ? expected.evidenceIds : [];
  const provenanceEvidenceIds = Array.isArray(provenance?.evidenceIds) ? provenance.evidenceIds : [];
  return record.userId === expected.actorId
    && record.targetType === "event"
    && record.targetId === expected.eventId
    && provenance?.kind === expected.kind
    && provenance.actorId === expected.actorId
    && provenance.eventId === expected.eventId
    && provenance.encounterId === expected.encounterId
    && provenance.sourceKind === expected.sourceKind
    && provenance.sourceIndex === expected.sourceIndex
    && JSON.stringify(provenanceEvidenceIds) === JSON.stringify(expectedEvidenceIds)
    && JSON.stringify(record.evidenceIds) === JSON.stringify(expectedEvidenceIds);
}

function matchesActorEvidence(
  record: LiveRecord<Record<string, unknown>> | null,
  actorId: string,
  expectedEvidenceIds: readonly string[],
): boolean {
  return !record || (
    record.userId === actorId
      && JSON.stringify(record.evidenceIds) === JSON.stringify(expectedEvidenceIds)
  );
}

function taskStatus(record: LiveRecord<Record<string, unknown>> | null): ConfirmedEventFollowupView["taskStatus"] {
  const status = record?.payload.status;
  return status === "open" || status === "scheduled" || status === "completed" || status === "dismissed"
    ? status
    : "missing";
}

function reminderStatus(record: LiveRecord<Record<string, unknown>> | null): ConfirmedEventFollowupView["reminderStatus"] {
  const status = record?.payload.status;
  return status === "pending" || status === "sent" || status === "failed" || status === "dismissed"
    ? status
    : "missing";
}

function followupState(
  marker: LiveRecord<Record<string, unknown>> | null,
  task: ConfirmedEventFollowupView["taskStatus"],
  reminder: ConfirmedEventFollowupView["reminderStatus"],
): ConfirmedEventFollowupView["state"] {
  if (marker && task === "completed") return "completed";
  if (marker && (task === "dismissed" || reminder === "dismissed")) return "dismissed";
  if (marker && (task === "open" || task === "scheduled") && (reminder === "pending" || reminder === "sent")) return "created";
  if (marker || task !== "missing" || reminder !== "missing") return "partial";
  return "available";
}

function view(input: {
  contactDisplayName: string | null;
  encounter: HumanEncounterRecord;
  marker: LiveRecord<Record<string, unknown>> | null;
  reminder: LiveRecord<Record<string, unknown>> | null;
  sourceIndex: number;
  sourceKind: ConfirmedFollowupSourceKind;
  sourceText: string;
  task: LiveRecord<Record<string, unknown>> | null;
}): ConfirmedEventFollowupView {
  const identityIds = ids({
    actorId: input.encounter.actorId,
    encounterId: input.encounter.encounterId,
    eventId: input.encounter.eventId!,
    sourceIndex: input.sourceIndex,
    sourceKind: input.sourceKind,
  });
  const taskPresent = input.task?.lifecycleState === "active";
  const reminderPresent = input.reminder?.lifecycleState === "active";
  const resolvedTaskStatus = taskStatus(taskPresent ? input.task : null);
  const resolvedReminderStatus = reminderStatus(reminderPresent ? input.reminder : null);
  return {
    contactDisplayName: input.contactDisplayName,
    contactHref: `/app/contacts/${encodeURIComponent(input.encounter.contactId)}`,
    contactId: input.encounter.contactId,
    createdAt: input.marker?.createdAt ?? (taskPresent ? input.task!.createdAt : reminderPresent ? input.reminder!.createdAt : null),
    dueAt: stringValue(input.marker?.payload.dueAt)
      ?? (taskPresent ? stringValue(input.task!.payload.dueAt) : null)
      ?? (reminderPresent ? stringValue(input.reminder!.payload.scheduledFor) : null),
    encounterId: input.encounter.encounterId,
    evidenceIds: [evidenceId(input.encounter.encounterId)],
    noteExcerpt: input.encounter.noteText.trim().slice(0, 240),
    reminderId: identityIds.reminderId,
    reminderStatus: resolvedReminderStatus,
    sourceIndex: input.sourceIndex,
    sourceKind: input.sourceKind,
    sourceText: input.sourceText,
    state: followupState(input.marker, resolvedTaskStatus, resolvedReminderStatus),
    taskHref: "/app/followups",
    taskId: identityIds.taskId,
    taskStatus: resolvedTaskStatus,
  };
}

function dueAt(value: string | null | undefined, now: string): string {
  const nowTimestamp = Date.parse(now);
  const parsed = value?.trim() ? Date.parse(value) : nowTimestamp + DEFAULT_REMINDER_DELAY_MS;
  if (!Number.isFinite(parsed) || parsed <= nowTimestamp) {
    throw new AppError("VALIDATION_ERROR", "The follow-up due time must be in the future.");
  }
  if (parsed > nowTimestamp + MAXIMUM_REMINDER_DELAY_MS) {
    throw new AppError("VALIDATION_ERROR", "The follow-up due time must be within one year.");
  }
  return new Date(parsed).toISOString();
}

function normalizedDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("VALIDATION_ERROR", "The follow-up due time is invalid.");
  }
  return new Date(parsed).toISOString();
}

function eligibleEncounters(values: readonly HumanEncounterRecord[], actorId: string, eventId: string) {
  return values.filter((encounter) =>
    encounter.actorId === actorId
      && encounter.eventId === eventId
      && encounter.talked === "yes",
  );
}

export function createConfirmedEventFollowupService(input: {
  encounters: Pick<HumanEncounterService, "list">;
  followups: FollowupActionWriter;
  now?: () => string;
  reminders: ReminderActionWriter;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): ConfirmedEventFollowupService {
  async function records(actorId: string, collectionName: "notifications" | "tasks") {
    return input.store.listRecords({
      collectionName,
      lifecycleState: "active",
      userId: actorId,
      workspaceId: input.workspaceId,
    });
  }

  async function list(value: { actorId: string; eventId: string }) {
    const actorId = requiredText(value.actorId, "Actor");
    const eventId = requiredText(value.eventId, "Event");
    const [encounters, tasks, reminders, markers] = await Promise.all([
      input.encounters.list({ actorId, eventId }),
      records(actorId, "tasks"),
      records(actorId, "notifications"),
      input.store.listRecords({
        collectionName: CONFIRMED_EVENT_FOLLOWUP_COLLECTION,
        lifecycleState: "active",
        targetId: eventId,
        targetType: "event",
        userId: actorId,
        workspaceId: input.workspaceId,
      }),
    ]);
    const tasksById = new Map(tasks.map((record) => [record.recordId, record]));
    const remindersById = new Map(reminders.map((record) => [record.recordId, record]));
    const markersById = new Map(markers.map((record) => [record.recordId, record]));
    const eligible = eligibleEncounters(encounters, actorId, eventId);
    const contactIds = [...new Set(eligible.map((encounter) => encounter.contactId))];
    const contacts = contactIds.length
      ? await input.store.listRecords({
          collectionName: "contacts",
          lifecycleState: "active",
          recordIds: contactIds,
          userId: actorId,
          workspaceId: input.workspaceId,
        })
      : [];
    const contactsById = new Map(contacts.map((record) => [record.recordId, record]));

    return eligible
      .flatMap((encounter) => {
        const sources: Array<{ sourceIndex: number; sourceKind: ConfirmedFollowupSourceKind; sourceText: string }> = [];
        if (encounter.nextStep.trim()) sources.push({ sourceIndex: 0, sourceKind: "next_step", sourceText: encounter.nextStep.trim() });
        encounter.commitments.forEach((commitment, sourceIndex) => {
          if (commitment.trim()) sources.push({ sourceIndex, sourceKind: "commitment", sourceText: commitment.trim() });
        });
        return sources.map((source) => {
          const identityIds = ids({ actorId, encounterId: encounter.encounterId, eventId, ...source });
          const marker = markersById.get(identityIds.markerId) ?? null;
          const provenance = {
            actorId,
            encounterId: encounter.encounterId,
            eventId,
            evidenceIds: [evidenceId(encounter.encounterId)],
            kind: PROVENANCE_KIND,
            sourceIndex: source.sourceIndex,
            sourceKind: source.sourceKind,
          } as const;
          const task = tasksById.get(identityIds.taskId) ?? null;
          const reminder = remindersById.get(identityIds.reminderId) ?? null;
          if (!matchesMarker(marker, provenance)
            || !matchesActorEvidence(task, actorId, provenance.evidenceIds)
            || !matchesActorEvidence(reminder, actorId, provenance.evidenceIds)) {
            throw new AppError("CONFLICT", "Stored follow-up records do not match their event evidence marker.");
          }
          return view({
            contactDisplayName: ownedContactDisplayName(
              contactsById.get(encounter.contactId) ?? null,
              actorId,
              encounter.contactId,
            ),
            encounter,
            marker,
            reminder,
            task,
            ...source,
          });
        });
      })
      .sort((left, right) => left.state.localeCompare(right.state) || right.encounterId.localeCompare(left.encounterId));
  }

  return {
    async confirm(value) {
      const actorId = requiredText(value.actorId, "Actor");
      const eventId = requiredText(value.eventId, "Event");
      const encounterId = requiredText(value.encounterId, "Encounter");
      if (value.sourceKind !== "next_step" && value.sourceKind !== "commitment") {
        throw new AppError("VALIDATION_ERROR", "A valid follow-up evidence source is required.");
      }
      const encounters = eligibleEncounters(
        await input.encounters.list({ actorId, eventId }),
        actorId,
        eventId,
      );
      const encounter = encounters.find((item) => item.encounterId === encounterId);
      if (!encounter) {
        throw new AppError("NOT_FOUND", "No eligible human encounter evidence was found for this attendee and event.");
      }
      const sourceText = selectedSource(encounter, value.sourceKind, value.sourceIndex);
      if (!sourceText) {
        throw new AppError("VALIDATION_ERROR", "The selected next step or commitment is no longer present in the encounter evidence.");
      }
      const identityInput = { actorId, encounterId, eventId, sourceIndex: value.sourceIndex, sourceKind: value.sourceKind };
      const identityIds = ids(identityInput);
      const provenance = {
        actorId,
        encounterId,
        eventId,
        evidenceIds: [evidenceId(encounterId)],
        kind: PROVENANCE_KIND,
        sourceIndex: value.sourceIndex,
        sourceKind: value.sourceKind,
      } as const;
      let [marker, task, reminder, contact] = await Promise.all([
        input.store.getRecord({ collectionName: CONFIRMED_EVENT_FOLLOWUP_COLLECTION, recordId: identityIds.markerId, workspaceId: input.workspaceId }),
        input.store.getRecord({ collectionName: "tasks", recordId: identityIds.taskId, workspaceId: input.workspaceId }),
        input.store.getRecord({ collectionName: "notifications", recordId: identityIds.reminderId, workspaceId: input.workspaceId }),
        input.store.getRecord({ collectionName: "contacts", recordId: encounter.contactId, workspaceId: input.workspaceId }),
      ]);
      const contactDisplayName = ownedContactDisplayName(contact, actorId, encounter.contactId);
      if (!matchesMarker(marker, provenance)
        || !matchesActorEvidence(task, actorId, provenance.evidenceIds)
        || !matchesActorEvidence(reminder, actorId, provenance.evidenceIds)) {
        throw new AppError("CONFLICT", "The deterministic follow-up identity is already bound to different evidence.");
      }
      const currentDueAt = stringValue(marker?.payload.dueAt)
        ?? stringValue(task?.payload.dueAt)
        ?? stringValue(reminder?.payload.scheduledFor);
      const now = input.now?.() ?? new Date().toISOString();
      const resolvedDueAt = currentDueAt ?? dueAt(value.dueAt, now);
      if (currentDueAt && value.dueAt?.trim() && normalizedDate(value.dueAt) !== currentDueAt) {
        throw new AppError("CONFLICT", "This evidence already has a follow-up with a different due time.");
      }
      if (!marker) {
        marker = await input.store.upsertRecord({
          collectionName: CONFIRMED_EVENT_FOLLOWUP_COLLECTION,
          createdAt: now,
          evidenceIds: provenance.evidenceIds,
          lifecycleState: "active",
          occurredAt: now,
          payload: {
            actorId,
            contactId: encounter.contactId,
            createdAt: now,
            dueAt: resolvedDueAt,
            encounterId,
            eventId,
            evidenceIds: provenance.evidenceIds,
            provenance,
            reminderId: identityIds.reminderId,
            sourceIndex: value.sourceIndex,
            sourceKind: value.sourceKind,
            sourceText,
            taskHref: "/app/followups",
            taskId: identityIds.taskId,
          },
          recordId: identityIds.markerId,
          searchText: sourceText,
          sourceId: encounterId,
          sourceLabel: "User-confirmed event follow-up",
          sourceType: "manual",
          targetId: eventId,
          targetType: "event",
          updatedAt: now,
          userId: actorId,
          workspaceId: input.workspaceId,
        });
      }
      const beforeRepair = view({ contactDisplayName, encounter, marker, reminder, sourceIndex: value.sourceIndex, sourceKind: value.sourceKind, sourceText, task });
      if (beforeRepair.state === "completed" || beforeRepair.state === "dismissed") return beforeRepair;
      if (beforeRepair.taskStatus === "missing") {
        await input.followups.createTask({
          contactId: encounter.contactId,
          dueAt: resolvedDueAt,
          evidenceIds: provenance.evidenceIds,
          now,
          taskId: identityIds.taskId,
          title: sourceText,
        });
      }
      if (beforeRepair.reminderStatus === "missing" || beforeRepair.reminderStatus === "failed") {
        await input.reminders.createReminder({
          contactId: encounter.contactId,
          dueAt: resolvedDueAt,
          evidenceIds: provenance.evidenceIds,
          now,
          reminderId: identityIds.reminderId,
          taskId: identityIds.taskId,
          title: `跟进提醒：${sourceText}`,
        });
      }
      [marker, task, reminder] = await Promise.all([
        input.store.getRecord({ collectionName: CONFIRMED_EVENT_FOLLOWUP_COLLECTION, recordId: identityIds.markerId, workspaceId: input.workspaceId }),
        input.store.getRecord({ collectionName: "tasks", recordId: identityIds.taskId, workspaceId: input.workspaceId }),
        input.store.getRecord({ collectionName: "notifications", recordId: identityIds.reminderId, workspaceId: input.workspaceId }),
      ]);
      if (!marker || !task || !reminder) throw new AppError("INTERNAL_ERROR", "The confirmed follow-up could not be read after persistence.");
      return view({ contactDisplayName, encounter, marker, reminder, sourceIndex: value.sourceIndex, sourceKind: value.sourceKind, sourceText, task });
    },
    list,
  };
}
