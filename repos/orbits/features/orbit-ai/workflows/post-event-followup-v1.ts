import type { AgentRuntimeService } from "../../agent/runtime/service";
import type { AgentActionSourceReference } from "../../agent/contract";
import type {
  OrbitKnownWorkflow,
  PostEventFollowupArtifact,
} from "./contract";
import { workflowId } from "./id";

export interface PostEventFollowupInput {
  eventId: string;
  eventTitle: string;
  contactId?: string;
  contactName?: string;
  organization?: string;
  connectionId?: string;
  encounterId?: string;
  noteText: string;
  conversationId?: string;
  trigger?: "chat" | "today" | "domain_signal" | "manual";
  duplicateContactIds?: readonly string[];
  followupDueAt?: string;
  reminderDueAt?: string;
  evidenceIds?: readonly string[];
  relationshipContext?: string;
  lastInteractionAt?: string;
  nextAction?: string;
  messageDraft?: string;
  noteSource?: "typed" | "voice_transcript";
  noteAlreadyPersisted?: boolean;
}

function sourceFor(input: PostEventFollowupInput): AgentActionSourceReference {
  return {
    type: "event_import",
    id: `source:event:${input.eventId}`,
    label: input.eventTitle,
    providerRecordId: input.eventId,
    generatedBy: "live-store-query",
  };
}

function compactSentence(value: string): string {
  return value.trim().replace(/[。.!！?？]+$/u, "");
}

function structuredSummary(input: PostEventFollowupInput): string {
  const sections = [
    `本次会面：${input.noteText.trim()}`,
    input.relationshipContext
      ? `关系背景：${input.relationshipContext.trim()}`
      : null,
    input.lastInteractionAt
      ? `上次互动：${input.lastInteractionAt.trim()}`
      : null,
    input.nextAction ? `已有下一步：${input.nextAction.trim()}` : null,
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n");
}

function defaultDraft(input: PostEventFollowupInput): string {
  const name = input.contactName?.trim() || "你好";
  const discussion = compactSentence(input.noteText);
  return `${name}，很高兴在${input.eventTitle}交流。我们聊到“${discussion}”，我想按这个方向继续推进，方便时我们再对齐下一步。`;
}

export function createPostEventFollowupWorkflow(
  runtime: AgentRuntimeService,
): OrbitKnownWorkflow<PostEventFollowupInput, PostEventFollowupArtifact> {
  return {
    key: "post_event_followup_v1",
    version: 1,
    canHandle: (trigger) =>
      trigger === "event_ended" ||
      trigger === "encounter_note_created" ||
      trigger === "post_event_followup_requested",
    async run(input) {
      if (!input.eventId.trim() || !input.noteText.trim()) {
        throw new Error("eventId and a confirmed noteText are required.");
      }
      const evidenceIds = input.evidenceIds?.length
        ? input.evidenceIds
        : [
            `evidence:encounter:${input.encounterId ?? input.eventId}:${input.contactId ?? "unresolved"}`,
          ];
      const runId = workflowId("run:post-event-followup", {
        eventId: input.eventId,
        contactId: input.contactId,
        noteText: input.noteText,
      });
      let run = await runtime.createRun({
        runId,
        workflowKey: "post_event_followup_v1",
        workflowVersion: 1,
        conversationId: input.conversationId,
        trigger: input.trigger ?? "domain_signal",
      });
      await runtime.addRunStep({
        stepId: `${runId}:resolve-contact`,
        runId,
        kind: "deterministic",
        name: "resolve_event_contact",
        status:
          !input.contactId || input.duplicateContactIds?.length
            ? "waiting"
            : "completed",
        attempt: 1,
        inputRef: input.eventId,
        outputRef: input.contactId,
      });

      const contactResolution =
        input.duplicateContactIds?.length
          ? "merge_review_required"
          : input.contactId
            ? "resolved"
            : "candidate_confirmation_required";
      const artifact: PostEventFollowupArtifact = {
        eventId: input.eventId,
        contactId: input.contactId ?? null,
        contactResolution,
        summary: structuredSummary(input),
        messageDraft: input.messageDraft?.trim() || defaultDraft(input),
        rawAudioPersisted: false,
        evidenceIds,
      };

      if (contactResolution !== "resolved") {
        run = await runtime.updateRunStatus(runId, "waiting_for_input");
        return { run, actions: [], artifact };
      }

      await runtime.addRunStep({
        stepId: `${runId}:prepare-artifact`,
        runId,
        kind: "deterministic",
        name: "prepare_summary_and_message_draft",
        status: "completed",
        attempt: 1,
        inputRef: evidenceIds.join(","),
        outputRef: `${runId}:artifact`,
      });
      const sourceRefs = [sourceFor(input)];
      const noteActionId = workflowId("action:confirmed-note", {
        runId,
        encounterId: input.encounterId,
      });
      const noteAction = input.noteAlreadyPersisted
        ? null
        : await runtime.proposeAction({
            actionId: noteActionId,
            runId,
            workflowKey: "post_event_followup_v1",
            workflowVersion: 1,
            conversationId: input.conversationId,
            title: `保存会面笔记 — ${input.contactName ?? "活动联系人"}`,
            contactName: input.contactName,
            organization: input.organization,
            whyNow: "你刚刚确认了这段会后记录。",
            riskLevel: "write",
            payloadVersion: 1,
            preview: input.noteText.trim(),
            compensation: {
              supported: true,
              executorKey: "events.saveMeetingNote",
              preview: "可移除这条会面笔记。",
            },
            operations: [
              {
                operationId: `${noteActionId}:save`,
                operationType: "save_meeting_note",
                executorKey: "events.saveMeetingNote",
                idempotencyKey: `${noteActionId}:v1`,
                payloadVersion: 1,
                payload: {
                  noteId: `note:${noteActionId}`,
                  eventId: input.eventId,
                  contactId: input.contactId,
                  noteText: input.noteText.trim(),
                  noteSource: input.noteSource ?? "typed",
                  evidenceIds,
                },
                preview: "保存已确认的会面笔记",
                riskLevel: "write",
                compensation: {
                  supported: true,
                  executorKey: "events.saveMeetingNote",
                  preview: "移除会面笔记",
                },
              },
            ],
            evidenceChips: [
              {
                kind:
                  input.noteSource === "voice_transcript"
                    ? "confirmed_voice_transcript"
                    : "contact_note",
                label:
                  input.noteSource === "voice_transcript"
                    ? "已确认语音转写"
                    : "已确认文字笔记",
                evidenceId: evidenceIds[0],
              },
            ],
            evidenceIds,
            sourceRefs,
          });
      if (noteAction) {
        await runtime.approveAction({
          actionId: noteAction.actionId,
          actorLabel: "Orbit user confirmed encounter note",
        });
      }
      await runtime.recordAnalytics("encounter_note_confirmed", {
        runId,
        actionId: noteAction?.actionId,
        workflowKey: "post_event_followup_v1",
        metadata: {
          source: input.noteSource ?? "typed",
        },
      });

      const draftActionId = workflowId("action:message-draft", {
        runId,
        contactId: input.contactId,
      });
      const draftAction = await runtime.proposeAction({
        actionId: draftActionId,
        runId,
        workflowKey: "post_event_followup_v1",
        workflowVersion: 1,
        conversationId: input.conversationId,
        title: `准备跟进草稿 — ${input.contactName ?? "活动联系人"}`,
        contactName: input.contactName,
        organization: input.organization,
        whyNow: "已根据确认的会面笔记准备草稿；不会自动发送。",
        riskLevel: "draft",
        payloadVersion: 1,
        preview: artifact.messageDraft,
        compensation: {
          supported: true,
          executorKey: "followups.saveDraft",
          preview: "可移除这份草稿。",
        },
        operations: [
          {
            operationId: `${draftActionId}:save`,
            operationType: "save_message_draft",
            executorKey: "followups.saveDraft",
            idempotencyKey: `${draftActionId}:v1`,
            payloadVersion: 1,
            payload: {
              draftId: `draft:${draftActionId}`,
              contactId: input.contactId,
              draftText: artifact.messageDraft,
              evidenceIds,
            },
            preview: artifact.messageDraft,
            riskLevel: "draft",
            compensation: {
              supported: true,
              executorKey: "followups.saveDraft",
              preview: "移除消息草稿",
            },
          },
        ],
        evidenceChips: [
          {
            kind: "contact_note",
            label: "已确认会面笔记",
            evidenceId: evidenceIds[0],
          },
        ],
        evidenceIds,
        sourceRefs,
      });
      await runtime.approveAction({
        actionId: draftAction.actionId,
        actorLabel: "Orbit automatic draft policy",
      });
      await runtime.processOutbox({
        actionId: draftAction.actionId,
        limit: 1,
        workerId: "post-event-followup-inline-draft",
      });
      await runtime.recordAnalytics("followup_draft_prepared", {
        runId,
        actionId: draftAction.actionId,
        workflowKey: "post_event_followup_v1",
      });

      const taskActionId = workflowId("action:followup-task", {
        runId,
        contactId: input.contactId,
      });
      const reminderActionId = workflowId("action:followup-reminder", {
        runId,
        contactId: input.contactId,
      });
      const task = await runtime.proposeAction({
        actionId: taskActionId,
        runId,
        workflowKey: "post_event_followup_v1",
        workflowVersion: 1,
        conversationId: input.conversationId,
        title: `建立跟进任务 — ${input.contactName ?? "活动联系人"}`,
        contactName: input.contactName,
        organization: input.organization,
        whyNow: "活动结束后的跟进窗口正在缩短。",
        riskLevel: "write",
        payloadVersion: 1,
        preview: `创建跟进任务：${input.eventTitle} 会后跟进`,
        compensation: {
          supported: true,
          executorKey: "followups.createTask",
          preview: "可撤销并移除该任务。",
        },
        operations: [
          {
            operationId: `${taskActionId}:create-task`,
            operationType: "create_followup_task",
            executorKey: "followups.createTask",
            idempotencyKey: `${taskActionId}:v1`,
            payloadVersion: 1,
            payload: {
              taskId: `task:${taskActionId}`,
              title: `${input.eventTitle} 会后跟进`,
              contactId: input.contactId,
              connectionId: input.connectionId,
              dueAt: input.followupDueAt,
              evidenceIds,
              messageDraft: artifact.messageDraft,
            },
            preview: `创建「${input.eventTitle} 会后跟进」任务`,
            riskLevel: "write",
            compensation: {
              supported: true,
              executorKey: "followups.createTask",
              preview: "移除该跟进任务",
            },
          },
        ],
        evidenceChips: [
          {
            kind: "contact_note",
            label: "已确认会面笔记",
            evidenceId: evidenceIds[0],
          },
        ],
        evidenceIds,
        sourceRefs,
      });
      const reminder = await runtime.proposeAction({
        actionId: reminderActionId,
        runId,
        workflowKey: "post_event_followup_v1",
        workflowVersion: 1,
        conversationId: input.conversationId,
        title: `设置提醒 — ${input.contactName ?? "活动联系人"}`,
        contactName: input.contactName,
        organization: input.organization,
        whyNow: "按约定时间提醒可以避免错过跟进窗口。",
        riskLevel: "write",
        payloadVersion: 1,
        preview: `设置跟进提醒：${input.reminderDueAt ?? "7 天后"}`,
        compensation: {
          supported: true,
          executorKey: "notifications.createReminder",
          preview: "可撤销并移除该提醒。",
        },
        operations: [
          {
            operationId: `${reminderActionId}:create-reminder`,
            operationType: "create_followup_reminder",
            executorKey: "notifications.createReminder",
            idempotencyKey: `${reminderActionId}:v1`,
            payloadVersion: 1,
            payload: {
              reminderId: `reminder:${reminderActionId}`,
              title: `跟进 ${input.contactName ?? input.eventTitle}`,
              dueAt:
                input.reminderDueAt ??
                new Date(Date.now() + 7 * 86_400_000).toISOString(),
              taskId: `task:${taskActionId}`,
              contactId: input.contactId,
              evidenceIds,
            },
            preview: `到期时在 Orbit 内提醒跟进`,
            riskLevel: "write",
            compensation: {
              supported: true,
              executorKey: "notifications.createReminder",
              preview: "移除该提醒",
            },
          },
        ],
        evidenceChips: [
          {
            kind: "contact_note",
            label: "已确认会面笔记",
            evidenceId: evidenceIds[0],
          },
        ],
        evidenceIds,
        sourceRefs,
      });
      const detail = await runtime.getRun(runId);
      run = detail?.run ?? run;
      return {
        run,
        actions:
          detail?.actions ??
          [noteAction, draftAction, task, reminder].filter(
            (action): action is NonNullable<typeof action> => action !== null,
          ),
        artifact,
      };
    },
  };
}
