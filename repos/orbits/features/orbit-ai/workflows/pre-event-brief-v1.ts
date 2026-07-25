import type { AgentRuntimeService } from "../../agent/runtime/service";
import type { AgentActionSourceReference } from "../../agent/contract";
import type {
  OrbitKnownWorkflow,
  PreEventBriefArtifact,
  PreEventBriefPerson,
} from "./contract";
import { workflowId } from "./id";

export interface PreEventBriefInput {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  goal?: string;
  conversationId?: string;
  trigger?: "chat" | "today" | "scheduler" | "manual";
  attendees: readonly PreEventBriefPerson[];
  preparationGaps?: readonly string[];
  evidenceIds?: readonly string[];
  calendarProvider?: "google_calendar" | "microsoft_graph";
}

function sourceFor(input: PreEventBriefInput): AgentActionSourceReference {
  return {
    type: "calendar_signal",
    id: `source:event:${input.eventId}`,
    label: input.title,
    providerRecordId: input.eventId,
    generatedBy: "live-store-query",
  };
}

function attendeeScore(person: PreEventBriefPerson): number {
  return (
    person.evidenceIds.length * 3 +
    person.suggestedTopics.length * 2 +
    person.openCommitments.length * 4 +
    (person.lastInteraction ? 2 : 0)
  );
}

function briefBody(artifact: PreEventBriefArtifact): string {
  const people = artifact.people
    .map(
      (person) =>
        [
          `${person.displayName}${person.organization ? `（${person.organization}）` : ""}`,
          `值得见：${person.whyWorthMeeting}`,
          `上次互动：${person.lastInteraction ?? "暂无记录"}`,
          `证据：${person.evidenceSummaries?.join("、") || `${person.evidenceIds.length} 条关系记录`}`,
          `建议话题：${person.suggestedTopics.join("、") || "待补充"}`,
          `未完成承诺：${person.openCommitments.join("、") || "无"}`,
        ].join("；"),
    )
    .join("\n");
  return [
    artifact.goal ? `目标：${artifact.goal}` : "目标：待确认",
    `时间：${artifact.startsAt}${artifact.endsAt ? ` — ${artifact.endsAt}` : ""}`,
    `地点：${artifact.location ?? "待确认"}`,
    people,
    artifact.preparationGaps.length
      ? `准备缺口：${artifact.preparationGaps.join("、")}`
      : "准备缺口：无",
  ].join("\n");
}

export function createPreEventBriefWorkflow(
  runtime: AgentRuntimeService,
): OrbitKnownWorkflow<PreEventBriefInput, PreEventBriefArtifact> {
  return {
    key: "pre_event_brief_v1",
    version: 1,
    canHandle: (trigger) =>
      trigger === "event_in_24_hours" ||
      trigger === "pre_event_brief_requested",
    async run(input) {
      if (
        !input.eventId.trim() ||
        !input.title.trim() ||
        !Number.isFinite(Date.parse(input.startsAt))
      ) {
        throw new Error("eventId, title, and a valid startsAt are required.");
      }
      const people = [...input.attendees]
        .sort((left, right) => attendeeScore(right) - attendeeScore(left))
        .slice(0, 3)
        .map((person) => ({
          ...person,
          evidenceSummaries:
            person.evidenceSummaries?.filter(Boolean) ??
            (person.evidenceIds.length > 0
              ? [`${person.evidenceIds.length} 条关系证据`]
              : []),
        }));
      const evidenceIds = [
        ...new Set([
          ...(input.evidenceIds ?? []),
          ...people.flatMap((person) => person.evidenceIds),
        ]),
      ];
      const runId = workflowId("run:pre-event-brief", {
        eventId: input.eventId,
        startsAt: input.startsAt,
      });
      let run = await runtime.createRun({
        runId,
        workflowKey: "pre_event_brief_v1",
        workflowVersion: 1,
        conversationId: input.conversationId,
        trigger: input.trigger ?? "scheduler",
      });
      const artifact: PreEventBriefArtifact = {
        eventId: input.eventId,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location,
        goal: input.goal,
        people,
        preparationGaps: input.preparationGaps ?? [],
        evidenceIds,
      };
      await runtime.addRunStep({
        stepId: `${runId}:compose-brief`,
        runId,
        kind: "deterministic",
        name: "compose_pre_event_brief",
        status: "completed",
        attempt: 1,
        inputRef: input.eventId,
        outputRef: `${runId}:brief`,
      });

      const sourceRefs = [sourceFor(input)];
      const briefActionId = workflowId("action:save-brief", { runId });
      const briefAction = await runtime.proposeAction({
        actionId: briefActionId,
        runId,
        workflowKey: "pre_event_brief_v1",
        workflowVersion: 1,
        conversationId: input.conversationId,
        title: `会前简报 — ${input.title}`,
        whyNow: "活动将在 24 小时内开始。",
        riskLevel: "draft",
        payloadVersion: 1,
        preview: briefBody(artifact),
        compensation: {
          supported: true,
          executorKey: "events.saveBrief",
          preview: "可移除已准备的简报。",
        },
        operations: [
          {
            operationId: `${briefActionId}:save`,
            operationType: "generate_meeting_brief",
            executorKey: "events.saveBrief",
            idempotencyKey: `${briefActionId}:v1`,
            payloadVersion: 1,
            payload: {
              briefId: `brief:${briefActionId}`,
              eventId: input.eventId,
              title: input.title,
              body: briefBody(artifact),
              artifact,
              evidenceIds,
            },
            preview: `准备 ${input.title} 会前简报`,
            riskLevel: "draft",
            compensation: {
              supported: true,
              executorKey: "events.saveBrief",
              preview: "移除简报",
            },
          },
        ],
        evidenceChips: [
          {
            kind: "calendar_signal",
            label: "活动与日历信号",
            evidenceId: evidenceIds[0] ?? `evidence:event:${input.eventId}`,
          },
        ],
        evidenceIds,
        sourceRefs,
      });
      if (
        briefAction.status === "awaiting_confirmation" ||
        briefAction.status === "deferred"
      ) {
        await runtime.approveAction({
          actionId: briefAction.actionId,
          actorLabel: "Orbit automatic draft policy",
        });
        await runtime.processOutbox({
          actionId: briefAction.actionId,
          limit: 1,
          workerId: "pre-event-brief-inline-draft",
        });
      }

      const proposals = [];
      if (!input.goal?.trim()) {
        const actionId = workflowId("action:event-goal", { runId });
        proposals.push(
          await runtime.proposeAction({
            actionId,
            runId,
            workflowKey: "pre_event_brief_v1",
            workflowVersion: 1,
            conversationId: input.conversationId,
            title: `确认 ${input.title} 的活动目标`,
            whyNow: "明确目标后，人物排序与话题建议会更准确。",
            riskLevel: "write",
            payloadVersion: 1,
            preview: "填写并保存本场活动目标",
            compensation: {
              supported: true,
              executorKey: "events.saveGoal",
              preview: "可移除该目标。",
            },
            operations: [
              {
                operationId: `${actionId}:save-goal`,
                operationType: "save_event_goal",
                executorKey: "events.saveGoal",
                idempotencyKey: `${actionId}:v1`,
                payloadVersion: 1,
                payload: {
                  goalId: `event-goal:${input.eventId}`,
                  eventId: input.eventId,
                  goal: "",
                  evidenceIds,
                },
                preview: "填写活动目标并保存",
                riskLevel: "write",
                compensation: {
                  supported: true,
                  executorKey: "events.saveGoal",
                  preview: "移除活动目标",
                },
              },
            ],
            evidenceChips: [
              {
                kind: "calendar_signal",
                label: "活动资料",
                evidenceId:
                  evidenceIds[0] ?? `evidence:event:${input.eventId}`,
              },
            ],
            evidenceIds,
            sourceRefs,
          }),
        );
      }
      if (artifact.preparationGaps.length > 0) {
        const actionId = workflowId("action:prep-task", { runId });
        proposals.push(
          await runtime.proposeAction({
            actionId,
            runId,
            workflowKey: "pre_event_brief_v1",
            workflowVersion: 1,
            conversationId: input.conversationId,
            title: `建立准备任务 — ${input.title}`,
            whyNow: artifact.preparationGaps.join("、"),
            riskLevel: "write",
            payloadVersion: 1,
            preview: `补齐：${artifact.preparationGaps.join("、")}`,
            compensation: {
              supported: true,
              executorKey: "followups.createTask",
              preview: "可移除该准备任务。",
            },
            operations: [
              {
                operationId: `${actionId}:create`,
                operationType: "create_preparation_task",
                executorKey: "followups.createTask",
                idempotencyKey: `${actionId}:v1`,
                payloadVersion: 1,
                payload: {
                  taskId: `task:${actionId}`,
                  title: `${input.title} 准备：${artifact.preparationGaps.join("、")}`,
                  dueAt: input.startsAt,
                  evidenceIds,
                },
                preview: "创建会前准备任务",
                riskLevel: "write",
                compensation: {
                  supported: true,
                  executorKey: "followups.createTask",
                  preview: "移除准备任务",
                },
              },
            ],
            evidenceChips: [
              {
                kind: "calendar_signal",
                label: "日历",
                evidenceId:
                  evidenceIds[0] ?? `evidence:event:${input.eventId}`,
              },
            ],
            evidenceIds,
            sourceRefs,
          }),
        );
      }
      const scheduleActionId = workflowId("action:orbit-schedule", {
        runId,
      });
      proposals.push(
        await runtime.proposeAction({
          actionId: scheduleActionId,
          runId,
          workflowKey: "pre_event_brief_v1",
          workflowVersion: 1,
          conversationId: input.conversationId,
          title: `加入 Orbit Schedule — ${input.title}`,
          whyNow: "把活动放入 Orbit 日程后，会前简报和准备任务会出现在同一时间脊柱。",
          riskLevel: "write",
          payloadVersion: 1,
          preview: `${input.startsAt} · ${input.location ?? "地点待定"}`,
          compensation: {
            supported: true,
            executorKey: "events.addToOrbitSchedule",
            preview: "可从 Orbit Schedule 移除。",
          },
          operations: [
            {
              operationId: `${scheduleActionId}:add`,
              operationType: "add_to_orbit_schedule",
              executorKey: "events.addToOrbitSchedule",
              idempotencyKey: `${scheduleActionId}:v1`,
              payloadVersion: 1,
              payload: {
                scheduleId: `schedule:${input.eventId}`,
                eventId: input.eventId,
                title: input.title,
                startsAt: input.startsAt,
                endsAt: input.endsAt,
                location: input.location,
                evidenceIds,
              },
              preview: "加入 Orbit Schedule",
              riskLevel: "write",
              compensation: {
                supported: true,
                executorKey: "events.addToOrbitSchedule",
                preview: "从 Orbit Schedule 移除",
              },
            },
          ],
          evidenceChips: [
            {
              kind: "calendar_signal",
              label: "活动时间",
              evidenceId:
                evidenceIds[0] ?? `evidence:event:${input.eventId}`,
            },
          ],
          evidenceIds,
          sourceRefs,
        }),
      );
      if (input.calendarProvider) {
        const calendarActionId = workflowId("action:external-calendar", {
          runId,
          provider: input.calendarProvider,
        });
        proposals.push(
          await runtime.proposeAction({
            actionId: calendarActionId,
            runId,
            workflowKey: "pre_event_brief_v1",
            workflowVersion: 1,
            conversationId: input.conversationId,
            title: `同步到外部日历 — ${input.title}`,
            whyNow: "你已选择一个单独授权的日历 provider；写入仍需本次确认。",
            riskLevel: "external",
            payloadVersion: 1,
            preview: `${input.startsAt} · ${input.location ?? "地点待定"}`,
            compensation: {
              supported: false,
              preview: "首版不承诺自动撤销 provider 侧事件。",
            },
            operations: [
              {
                operationId: `${calendarActionId}:create`,
                operationType: "sync_event_to_calendar",
                executorKey: "calendar.syncEvent",
                idempotencyKey: `${calendarActionId}:v1`,
                payloadVersion: 1,
                payload: {
                  provider: input.calendarProvider,
                  eventId: input.eventId,
                  title: input.title,
                  startsAt: input.startsAt,
                  endsAt: input.endsAt,
                  location: input.location,
                  evidenceIds,
                },
                preview: `在 ${input.calendarProvider} 新建日历事件`,
                riskLevel: "external",
                compensation: { supported: false },
              },
            ],
            evidenceChips: [
              {
                kind: "calendar_signal",
                label: "已授权日历",
                evidenceId:
                  evidenceIds[0] ?? `evidence:event:${input.eventId}`,
              },
            ],
            evidenceIds,
            sourceRefs,
          }),
        );
      }

      const detail = await runtime.getRun(runId);
      run = detail?.run ?? run;
      return {
        run,
        actions: [
          ...(detail?.actions.filter(
            (action) => action.actionId === briefActionId,
          ) ?? []),
          ...proposals,
        ],
        artifact,
      };
    },
  };
}
