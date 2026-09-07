import type { ContactArchiveActionWriter } from "../../contacts/action-writer";
import type { EventActionWriter } from "../../events/action-writer";
import type { EventMatchmakingService } from "../../events/matchmaking/service";
import type { FollowupActionWriter } from "../../followups/action-writer";
import type { ReminderActionWriter } from "../../notifications/action-writer";
import type { AgentMemoryService } from "../memory/contract";
import {
  getAgentRuntimeExecutorDescriptor,
} from "../capabilities/registry";
import type { AgentActionExecutor } from "./executor-registry";

export interface AgentDomainExecutorDependencies {
  contacts: ContactArchiveActionWriter;
  events: EventActionWriter;
  followups: FollowupActionWriter;
  notifications: ReminderActionWriter;
  matchmaking: EventMatchmakingService;
  memory: AgentMemoryService;
  calendar?: {
    createEvent: (
      payload: Readonly<Record<string, unknown>>,
      idempotencyKey: string,
    ) => Promise<{ providerRecordId: string }>;
    deleteEvent?: (
      providerRecordId: string,
      payload: Readonly<Record<string, unknown>>,
      idempotencyKey: string,
    ) => Promise<void>;
  };
}

function requiredString(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function optionalString(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function createAgentDomainExecutors(
  dependencies: AgentDomainExecutorDependencies,
): readonly AgentActionExecutor[] {
  return [
    {
      ...getAgentRuntimeExecutorDescriptor("followups.createTask"),
      async execute(payload, context) {
        const taskId = optionalString(payload, "taskId") ??
          `task:agent:${context.idempotencyKey}`;
        const result = await dependencies.followups.createTask({
          taskId,
          title: requiredString(payload, "title"),
          contactId: optionalString(payload, "contactId"),
          connectionId: optionalString(payload, "connectionId"),
          dueAt: optionalString(payload, "dueAt"),
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `tasks:${result.recordId}`,
          summary: "Follow-up task created in Orbit.",
        };
      },
      async compensate(payload, context) {
        const taskId = optionalString(payload, "taskId") ??
          `task:agent:${context.idempotencyKey.replace(/^undo:/, "")}`;
        await dependencies.followups.removeTask(taskId, context.now);
        return {
          resultRef: `tasks:${taskId}`,
          summary: "Follow-up task removed.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("notifications.createReminder"),
      async execute(payload, context) {
        const reminderId =
          optionalString(payload, "reminderId") ??
          `reminder:agent:${context.idempotencyKey}`;
        const result = await dependencies.notifications.createReminder({
          reminderId,
          title: requiredString(payload, "title"),
          dueAt: requiredString(payload, "dueAt"),
          taskId: optionalString(payload, "taskId"),
          contactId: optionalString(payload, "contactId"),
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `notifications:${result.recordId}`,
          summary: "In-app reminder scheduled in Orbit.",
        };
      },
      async compensate(payload, context) {
        const reminderId =
          optionalString(payload, "reminderId") ??
          `reminder:agent:${context.idempotencyKey.replace(/^undo:/, "")}`;
        await dependencies.notifications.removeReminder(
          reminderId,
          context.now,
        );
        return {
          resultRef: `notifications:${reminderId}`,
          summary: "Reminder removed.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("followups.saveDraft"),
      async execute(payload, context) {
        const draftId =
          optionalString(payload, "draftId") ??
          `draft:agent:${context.idempotencyKey}`;
        const result = await dependencies.followups.saveDraft({
          draftId,
          contactId: optionalString(payload, "contactId"),
          text: requiredString(payload, "draftText"),
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `messageDrafts:${result.recordId}`,
          summary: "Message saved as a draft. Nothing was sent.",
        };
      },
      async compensate(payload, context) {
        const draftId =
          optionalString(payload, "draftId") ??
          `draft:agent:${context.idempotencyKey.replace(/^undo:/, "")}`;
        await dependencies.followups.removeDraft(draftId, context.now);
        return {
          resultRef: `messageDrafts:${draftId}`,
          summary: "Message draft removed.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("events.saveMeetingNote"),
      async execute(payload, context) {
        const noteId =
          optionalString(payload, "noteId") ??
          `note:agent:${context.idempotencyKey}`;
        const result = await dependencies.events.saveMeetingNote({
          noteId,
          eventId: requiredString(payload, "eventId"),
          contactId: optionalString(payload, "contactId"),
          text: requiredString(payload, "noteText"),
          noteSource:
            optionalString(payload, "noteSource") === "voice_transcript"
              ? "voice_transcript"
              : "typed",
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `encounterNotes:${result.recordId}`,
          summary: "Confirmed meeting note saved.",
        };
      },
      async compensate(payload, context) {
        const noteId =
          optionalString(payload, "noteId") ??
          `note:agent:${context.idempotencyKey.replace(/^undo:/, "")}`;
        await dependencies.events.removeRecord(
          "encounterNotes",
          noteId,
          context.now,
        );
        return {
          resultRef: `encounterNotes:${noteId}`,
          summary: "Meeting note removed.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("events.saveBrief"),
      async execute(payload, context) {
        const briefId =
          optionalString(payload, "briefId") ??
          `brief:agent:${context.idempotencyKey}`;
        const result = await dependencies.events.saveBrief({
          briefId,
          eventId: requiredString(payload, "eventId"),
          title: requiredString(payload, "title"),
          body: requiredString(payload, "body"),
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `eventBriefs:${result.recordId}`,
          summary: "Pre-event brief saved.",
        };
      },
      async compensate(payload, context) {
        const briefId =
          optionalString(payload, "briefId") ??
          `brief:agent:${context.idempotencyKey.replace(/^undo:/, "")}`;
        await dependencies.events.removeRecord(
          "eventBriefs",
          briefId,
          context.now,
        );
        return {
          resultRef: `eventBriefs:${briefId}`,
          summary: "Pre-event brief removed.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("events.saveGoal"),
      async execute(payload, context) {
        const goalId =
          optionalString(payload, "goalId") ??
          `event-goal:agent:${context.idempotencyKey}`;
        const result = await dependencies.events.saveGoal({
          goalId,
          eventId: requiredString(payload, "eventId"),
          goal: requiredString(payload, "goal"),
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `eventGoals:${result.recordId}`,
          summary: "Event goal saved.",
        };
      },
      async compensate(payload, context) {
        const goalId =
          optionalString(payload, "goalId") ??
          `event-goal:agent:${context.idempotencyKey.replace(/^undo:/, "")}`;
        await dependencies.events.removeRecord(
          "eventGoals",
          goalId,
          context.now,
        );
        return {
          resultRef: `eventGoals:${goalId}`,
          summary: "Event goal removed.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("events.addToOrbitSchedule"),
      async execute(payload, context) {
        const scheduleId =
          optionalString(payload, "scheduleId") ??
          `schedule:agent:${context.idempotencyKey}`;
        const result = await dependencies.events.saveScheduleItem({
          scheduleId,
          eventId: requiredString(payload, "eventId"),
          title: requiredString(payload, "title"),
          startsAt: requiredString(payload, "startsAt"),
          endsAt: optionalString(payload, "endsAt"),
          location: optionalString(payload, "location"),
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `orbitScheduleItems:${result.recordId}`,
          summary: "Event added to Orbit Schedule.",
        };
      },
      async compensate(payload, context) {
        const scheduleId =
          optionalString(payload, "scheduleId") ??
          `schedule:agent:${context.idempotencyKey.replace(/^undo:/, "")}`;
        await dependencies.events.removeRecord(
          "orbitScheduleItems",
          scheduleId,
          context.now,
        );
        return {
          resultRef: `orbitScheduleItems:${scheduleId}`,
          summary: "Event removed from Orbit Schedule.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("contacts.archive"),
      async execute(payload, context) {
        const contacts = Array.isArray(payload.contacts)
          ? payload.contacts.filter(
              (item): item is {
                id: string;
                displayName: string;
                organization?: string;
              } =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as Record<string, unknown>).id === "string" &&
                typeof (item as Record<string, unknown>).displayName ===
                  "string",
            )
          : [];
        if (contacts.length === 0) {
          throw new Error("contacts is required.");
        }
        const result = await dependencies.contacts.archiveContacts({
          batchId: context.actionId,
          contacts,
          evidenceIds: stringArray(payload, "evidenceIds"),
          now: context.now,
        });
        return {
          resultRef: `contacts:${result.recordIds.join(",")}`,
          summary: `${result.recordIds.length} contacts archived.`,
        };
      },
      async compensate(payload, context) {
        const ids = Array.isArray(payload.contacts)
          ? payload.contacts.flatMap((item) =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as Record<string, unknown>).id === "string"
                ? [(item as Record<string, unknown>).id as string]
                : [],
            )
          : [];
        await dependencies.contacts.removeContacts(ids, context.now);
        return {
          resultRef: `contacts:${ids.join(",")}`,
          summary: `${ids.length} contacts removed.`,
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("calendar.syncEvent"),
      async execute(payload, context) {
        if (!dependencies.calendar) {
          throw new Error(
            "Calendar integration is not authorized. Connect a calendar before retrying.",
          );
        }
        const result = await dependencies.calendar.createEvent(
          payload,
          context.idempotencyKey,
        );
        return {
          resultRef: `calendar:${result.providerRecordId}`,
          summary: "Calendar event created after explicit confirmation.",
        };
      },
      async compensate(payload, context) {
        // Only the successful execution receipt can identify the created event.
        const providerRecordId = context.resultRef?.startsWith("calendar:")
          ? context.resultRef.slice("calendar:".length).trim()
          : undefined;
        if (
          !providerRecordId ||
          !dependencies.calendar?.deleteEvent
        ) {
          throw new Error("Calendar event cannot be compensated.");
        }
        await dependencies.calendar.deleteEvent(providerRecordId, payload, context.idempotencyKey);
        return {
          resultRef: `calendar:${providerRecordId}`,
          summary: "Calendar event removed.",
        };
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor(
        "events.createIntroductionRequest",
      ),
      async execute() {
        throw Object.assign(
          new Error(
            "LEGACY_MATCHMAKING_READ_ONLY: legacy matchmaking writes are gone; use event operations contact requests.",
          ),
          { code: "LEGACY_MATCHMAKING_READ_ONLY" as const },
        );
      },
    },
    {
      ...getAgentRuntimeExecutorDescriptor("memory.save"),
      async execute(payload) {
        const result = await dependencies.memory.create({
          category: requiredString(payload, "category") as
            | "identity"
            | "goal"
            | "preference"
            | "constraint",
          content: requiredString(payload, "content"),
          memoryId: requiredString(payload, "memoryId"),
          source: "conversation",
        });
        return {
          resultRef: `agentMemories:${result.memoryId}`,
          summary: "User-confirmed Agent memory saved.",
        };
      },
      async compensate(payload) {
        const memoryId = requiredString(payload, "memoryId");
        await dependencies.memory.remove(memoryId);
        return {
          resultRef: `agentMemories:${memoryId}`,
          summary: "Agent memory removed.",
        };
      },
    },
  ];
}
