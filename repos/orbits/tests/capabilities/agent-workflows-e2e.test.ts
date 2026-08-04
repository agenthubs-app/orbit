import assert from "node:assert/strict";
import test from "node:test";

import { createStorageContactArchiveActionWriter } from "../../features/contacts/action-writer";
import { createAgentPreferencesService, createStorageAgentPreferencesService } from "../../features/agent/preferences";
import { createRuntimeBackedAgentLedgerService } from "../../features/agent/ledger/runtime-adapter";
import { createAgentDomainExecutors } from "../../features/agent/runtime/domain-executors";
import { createAgentExecutorRegistry } from "../../features/agent/runtime/executor-registry";
import { createAgentRuntimeService } from "../../features/agent/runtime/service";
import { projectLedgerEntriesToTodayWorkItems } from "../../features/agent/runtime/today-projection";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createStorageEventActionWriter } from "../../features/events/action-writer";
import {
  createEventMatchmakingService,
  type MatchmakingParticipant,
} from "../../features/events/matchmaking/service";
import { createVoiceMemoTranscriptionService } from "../../features/events/voice-memo/service";
import { createStorageFollowupActionWriter } from "../../features/followups/action-writer";
import { createStorageReminderActionWriter } from "../../features/notifications/action-writer";
import { shouldSendPreEventNudge } from "../../features/notifications/push-adapter";
import { createEventMatchmakingWorkflow } from "../../features/orbit-ai/workflows/event-matchmaking-v1";
import { createPostEventFollowupWorkflow } from "../../features/orbit-ai/workflows/post-event-followup-v1";
import { createPreEventBriefWorkflow } from "../../features/orbit-ai/workflows/pre-event-brief-v1";
import { createOrbitKnownWorkflowRouter } from "../../features/orbit-ai/workflows/router";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function createWorkflowHarness() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "agent-workflow-e2e";
  const actorId = "user:agent-workflow-e2e";
  const matchmaking = createEventMatchmakingService({ store, workspaceId });
  const runtime = createAgentRuntimeService({
    repository: createStorageAgentRuntimeRepository({
      store,
      workspaceId,
    }),
    executors: createAgentExecutorRegistry(
      createAgentDomainExecutors({
        contacts: createStorageContactArchiveActionWriter({
          store,
          workspaceId,
        }),
        events: createStorageEventActionWriter({
          store,
          userId: actorId,
          workspaceId,
        }),
        followups: createStorageFollowupActionWriter({
          store,
          userId: actorId,
          workspaceId,
        }),
        notifications: createStorageReminderActionWriter({
          store,
          userId: actorId,
          workspaceId,
        }),
        matchmaking,
      }),
    ),
    now: () => "2026-07-25T01:00:00.000Z",
    id: (() => {
      let value = 0;
      return () => `e2e-${++value}`;
    })(),
  });
  return { actorId, matchmaking, runtime, store, workspaceId };
}

async function records(
  harness: ReturnType<typeof createWorkflowHarness>,
  collectionName: string,
) {
  return harness.store.listRecords({
    workspaceId: harness.workspaceId,
    collectionName,
  });
}

test("known workflow router keeps the retired matchmaking trigger out of planner fallback", async () => {
  const router = createOrbitKnownWorkflowRouter({ includeLegacyPostEventFollowup: true });
  assert.equal(router.find("event_ended")?.key, "post_event_followup_v1");
  assert.equal(router.find("event_in_24_hours")?.key, "pre_event_brief_v1");
  const retired = router.find("event_matchmaking_requested");
  assert.equal(retired?.key, "event_matchmaking_v1");
  await assert.rejects(
    () => retired!.run({}),
    {
      code: "LEGACY_MATCHMAKING_READ_ONLY",
      message: /LEGACY_MATCHMAKING_READ_ONLY/,
    },
  );
  assert.equal(router.find("general_business_question"), null);
});

test("post-event workflow persists only a confirmed transcript, draft, task, and reminder", async () => {
  const harness = createWorkflowHarness();
  const workflow = createPostEventFollowupWorkflow(harness.runtime);
  const result = await workflow.run({
    eventId: "event-1",
    eventTitle: "Tokyo Founder Dinner",
    contactId: "contact-1",
    contactName: "Maya",
    conversationId: "conversation-1",
    noteText: "Maya wants a Japan launch partner next week.",
    noteSource: "voice_transcript",
    followupDueAt: "2026-07-28T01:00:00.000Z",
    reminderDueAt: "2026-07-29T01:00:00.000Z",
    relationshipContext: "Met through the Tokyo launch community.",
    lastInteractionAt: "2026-07-20T08:00:00.000Z",
    nextAction: "Introduce Maya to a Japan launch partner.",
  });

  assert.equal(result.artifact.rawAudioPersisted, false);
  assert.match(result.artifact.summary, /本次会面：Maya wants a Japan launch partner/);
  assert.match(result.artifact.summary, /关系背景：Met through the Tokyo launch community/);
  assert.match(result.artifact.summary, /上次互动：2026-07-20/);
  assert.match(result.artifact.summary, /已有下一步：Introduce Maya/);
  assert.match(result.artifact.messageDraft, /Maya wants a Japan launch partner/);
  assert.equal(result.actions.length, 4);
  const note = result.actions.find((action) =>
    action.operations.some((operation) => operation.operationType === "save_meeting_note"),
  );
  const draft = result.actions.find((action) =>
    action.operations.some((operation) => operation.operationType === "save_message_draft"),
  );
  const task = result.actions.find((action) =>
    action.operations.some((operation) => operation.operationType === "create_followup_task"),
  );
  const reminder = result.actions.find((action) =>
    action.operations.some((operation) => operation.operationType === "create_followup_reminder"),
  );
  assert.equal(note?.status, "approved");
  assert.equal(draft?.status, "completed");
  assert.equal(task?.status, "awaiting_confirmation");
  assert.equal(reminder?.status, "awaiting_confirmation");

  const originalTaskHash = task!.immutablePayloadHash;
  await harness.runtime.updateDraft({
    actionId: task!.actionId,
    operationId: task!.operations[0].operationId,
    field: "title",
    draftText: "与 Maya 确认日本发布伙伴",
  });
  const editedTask = await harness.runtime.updateDraft({
    actionId: task!.actionId,
    operationId: task!.operations[0].operationId,
    field: "dueAt",
    draftText: "2026-07-30T09:30:00.000Z",
  });
  assert.notEqual(editedTask.immutablePayloadHash, originalTaskHash);
  assert.equal(
    editedTask.operations[0].payload.title,
    "与 Maya 确认日本发布伙伴",
  );
  assert.equal(
    editedTask.operations[0].payload.dueAt,
    "2026-07-30T09:30:00.000Z",
  );
  await harness.runtime.updateDraft({
    actionId: reminder!.actionId,
    operationId: reminder!.operations[0].operationId,
    field: "title",
    draftText: "提醒我联系 Maya",
  });
  await harness.runtime.updateDraft({
    actionId: reminder!.actionId,
    operationId: reminder!.operations[0].operationId,
    field: "dueAt",
    draftText: "2026-07-30T08:30:00.000Z",
  });

  await harness.runtime.approveAction({
    actionId: task!.actionId,
    actorLabel: "Orbit user",
  });
  await harness.runtime.approveAction({
    actionId: reminder!.actionId,
    actorLabel: "Orbit user",
  });
  await harness.runtime.processOutbox();

  const encounterNotes = await records(harness, "encounterNotes");
  const drafts = await records(harness, "messageDrafts");
  const tasks = await records(harness, "tasks");
  const reminders = await records(harness, "notifications");
  assert.equal(encounterNotes.length, 1);
  assert.equal(encounterNotes[0].payload.kind, "confirmed_voice_transcript");
  assert.equal("audioBase64" in encounterNotes[0].payload, false);
  assert.equal(drafts.length, 1);
  assert.equal(tasks.length, 1);
  assert.equal(reminders.length, 1);
  assert.equal(encounterNotes[0].userId, harness.actorId);
  assert.equal(drafts[0].userId, harness.actorId);
  assert.equal(tasks[0].userId, harness.actorId);
  assert.equal(reminders[0].userId, harness.actorId);
  assert.equal(tasks[0].payload.title, "与 Maya 确认日本发布伙伴");
  assert.equal(tasks[0].payload.dueAt, "2026-07-30T09:30:00.000Z");
  assert.equal(reminders[0].payload.title, "提醒我联系 Maya");
  assert.equal(
    reminders[0].payload.scheduledFor,
    "2026-07-30T08:30:00.000Z",
  );

  const ledger = await createRuntimeBackedAgentLedgerService({
    runtime: harness.runtime,
  }).listEntries({});
  assert.equal(ledger.success, true);
  const entries = ledger.success ? ledger.data.entries : [];
  const todayItems = projectLedgerEntriesToTodayWorkItems(entries);
  assert.deepEqual(
    new Set(todayItems.map((item) => item.actionId)),
    new Set(result.actions.map((action) => action.actionId)),
  );
  assert.ok(
    entries.every((entry) => entry.conversationId === "conversation-1"),
  );

  await workflow.run({
    eventId: "event-1",
    eventTitle: "Tokyo Founder Dinner",
    contactId: "contact-1",
    contactName: "Maya",
    noteText: "Maya wants a Japan launch partner next week.",
    noteSource: "voice_transcript",
  });
  assert.equal((await records(harness, "encounterNotes")).length, 1);
  assert.equal((await records(harness, "messageDrafts")).length, 1);
});

test("post-event workflow waits for contact confirmation or merge review without proposing writes", async () => {
  const harness = createWorkflowHarness();
  const workflow = createPostEventFollowupWorkflow(harness.runtime);
  const unresolved = await workflow.run({
    eventId: "event-unresolved",
    eventTitle: "Demo Day",
    noteText: "Discussed a follow-up.",
  });
  assert.equal(unresolved.run.status, "waiting_for_input");
  assert.equal(unresolved.artifact.contactResolution, "candidate_confirmation_required");
  assert.deepEqual(unresolved.actions, []);

  const duplicate = await workflow.run({
    eventId: "event-duplicate",
    eventTitle: "Demo Day",
    contactId: "contact-1",
    duplicateContactIds: ["contact-2"],
    noteText: "Discussed a follow-up.",
  });
  assert.equal(duplicate.artifact.contactResolution, "merge_review_required");
  assert.deepEqual(duplicate.actions, []);
});

test("pre-event workflow ranks three explainable people and keeps internal/external writes separate", async () => {
  const harness = createWorkflowHarness();
  const workflow = createPreEventBriefWorkflow(harness.runtime);
  const attendees = [
    {
      contactId: "low",
      displayName: "Low",
      whyWorthMeeting: "One weak signal",
      evidenceIds: ["e-low"],
      suggestedTopics: [],
      openCommitments: [],
    },
    {
      contactId: "highest",
      displayName: "Highest",
      whyWorthMeeting: "Open commitments",
      evidenceIds: ["e-1", "e-2"],
      suggestedTopics: ["Japan", "SaaS"],
      openCommitments: ["Send deck", "Book call"],
      lastInteraction: "2026-07-01",
    },
    {
      contactId: "middle",
      displayName: "Middle",
      whyWorthMeeting: "Shared topic",
      evidenceIds: ["e-3"],
      suggestedTopics: ["AI"],
      openCommitments: ["Intro"],
    },
    {
      contactId: "third",
      displayName: "Third",
      whyWorthMeeting: "Recent contact",
      evidenceIds: ["e-4"],
      suggestedTopics: ["Fundraising"],
      openCommitments: [],
      lastInteraction: "2026-07-20",
    },
  ];
  const result = await workflow.run({
    eventId: "event-brief",
    title: "Founder Summit",
    startsAt: "2026-07-25T03:00:00.000Z",
    location: "Tokyo",
    attendees,
    preparationGaps: ["准备一句产品定位"],
    calendarProvider: "google_calendar",
  });

  assert.deepEqual(
    result.artifact.people.map((person) => person.contactId),
    ["highest", "middle", "third"],
  );
  assert.equal(result.artifact.people.length, 3);
  const brief = result.actions.find((action) => action.riskLevel === "draft");
  const schedule = result.actions.find((action) =>
    action.operations.some((operation) => operation.operationType === "add_to_orbit_schedule"),
  );
  const external = result.actions.find((action) => action.riskLevel === "external");
  assert.equal(brief?.status, "completed");
  assert.equal(schedule?.status, "awaiting_confirmation");
  assert.equal(external?.status, "awaiting_confirmation");
  assert.equal((await records(harness, "orbitScheduleItems")).length, 0);

  await harness.runtime.approveAction({
    actionId: schedule!.actionId,
    actorLabel: "Orbit user",
  });
  await harness.runtime.processOutbox({ actionId: schedule!.actionId });
  const scheduleItems = await records(harness, "orbitScheduleItems");
  assert.equal(scheduleItems.length, 1);
  assert.equal(scheduleItems[0].userId, harness.actorId);
  assert.equal(scheduleItems[0].payload.accountId, harness.actorId);
  assert.equal(external?.status, "awaiting_confirmation");
});

test("pre-event push is limited to an unviewed costly miss within two hours and outside quiet hours", () => {
  const base = {
    now: "2026-07-25T10:00:00.000Z",
    startsAt: "2026-07-25T11:30:00.000Z",
    costlyMiss: true,
    pushEnabled: true,
    quietHours: { startHour: 22, endHour: 8 },
  };
  assert.equal(shouldSendPreEventNudge(base), true);
  assert.equal(shouldSendPreEventNudge({ ...base, viewedAt: base.now }), false);
  assert.equal(shouldSendPreEventNudge({ ...base, costlyMiss: false }), false);
  assert.equal(
    shouldSendPreEventNudge({
      ...base,
      startsAt: "2026-07-25T13:00:01.000Z",
    }),
    false,
  );
  assert.equal(
    shouldSendPreEventNudge({
      ...base,
      quietHours: { startHour: 0, endHour: 23 },
    }),
    false,
  );
});

function participant(
  participantId: string,
  overrides: Partial<MatchmakingParticipant> = {},
): MatchmakingParticipant {
  return {
    participantId,
    actorId: `actor:${participantId}`,
    displayName: participantId,
    domains: ["AI"],
    goals: ["partnership"],
    offers: ["distribution"],
    needs: ["fundraising"],
    availableSlots: ["2026-07-26T01:00:00.000Z"],
    evidenceIds: [`evidence:${participantId}`],
    ...overrides,
  };
}

test("legacy matchmaking workflow rejects before ranking or writing", async () => {
  const harness = createWorkflowHarness();
  const workflow = createEventMatchmakingWorkflow();
  await assert.rejects(
    () =>
      workflow.run({
        eventId: "event-match",
        eventTitle: "AI Summit",
        organizerActorId: "actor:organizer",
        requester: participant("requester"),
        candidates: [participant("a"), participant("b")],
      }),
    {
      code: "LEGACY_MATCHMAKING_READ_ONLY",
      message: /LEGACY_MATCHMAKING_READ_ONLY/,
    },
  );
  assert.deepEqual(await records(harness, "matchmakingIntroductionRequests"), []);
  assert.deepEqual(await records(harness, "agentRuns"), []);
});

test("voice memo validates privacy bounds and always falls back to typed note on ASR failure", async () => {
  let seenAudio = "";
  const service = createVoiceMemoTranscriptionService({
    provider: {
      async transcribe(input) {
        seenAudio = input.audioBase64;
        return "  editable transcript  ";
      },
    },
  });
  const result = await service.transcribe({
    audioBase64: Buffer.from("temporary audio").toString("base64"),
    mimeType: "audio/webm",
    durationMs: 14_999,
  });
  assert.equal(seenAudio.length > 0, true);
  assert.equal(result.transcript, "editable transcript");
  assert.equal(result.rawAudioPersisted, false);
  assert.equal(result.evidenceCreated, false);
  assert.equal(result.requiresTextConfirmation, true);
  assert.equal(result.fallback, "typed_note");

  await assert.rejects(
    () =>
      service.transcribe({
        audioBase64: "YQ==",
        mimeType: "audio/webm",
        durationMs: 15_001,
      }),
    /between 1 and 15 seconds/,
  );
  await assert.rejects(
    () =>
      createVoiceMemoTranscriptionService({ provider: null }).transcribe({
        audioBase64: "YQ==",
        mimeType: "audio/webm",
        durationMs: 1_000,
      }),
    /typed note/,
  );
});

test("agent preferences persist and reject malformed quiet hours", async () => {
  const store = createMemoryLiveRecordStore<{
    preferences: Awaited<ReturnType<ReturnType<typeof createAgentPreferencesService>["get"]>>;
  }>();
  const service = createStorageAgentPreferencesService({
    store,
    workspaceId: "preferences-e2e",
    now: () => "2026-07-25T04:00:00.000Z",
  });
  const updated = await service.update({
    preEventBriefPushEnabled: false,
    quietHours: { start: "21:30", end: "07:30" },
  });
  assert.equal(updated.preEventBriefPushEnabled, false);
  assert.deepEqual((await service.get()).quietHours, {
    start: "21:30",
    end: "07:30",
  });
  await assert.rejects(
    () =>
      service.update({
        quietHours: { start: "25:00", end: "07:30" },
      }),
    /HH:mm/,
  );
});
