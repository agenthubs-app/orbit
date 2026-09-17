import { createHash } from "node:crypto";

import type { OrbitAiTaskInteractionContract } from "../../shared/contract/orbit-ai";
import type { TaskCategory } from "../tasks/contract";
import type { TaskService } from "../tasks/service";
import type { TaskSuggestionService } from "../tasks/suggestion-service";
import type { AgentNaturalLanguageActionRequest } from "../agent/natural-language-actions/contract";
import type { NoteService } from "../notes/service";
import { taskWriteAuthorization } from "./task-write-authorization";

const PROACTIVE_SUGGESTION_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface OrbitAiTaskInteractionService {
  handle: (input: {
    actorId: string;
    conversationId: string;
    message: string;
    now: string;
    proposedActionRequests: readonly AgentNaturalLanguageActionRequest[];
    sourceNote?: { id: string; version: number };
  }) => Promise<{
    interaction?: OrbitAiTaskInteractionContract;
    remainingActionRequests: readonly AgentNaturalLanguageActionRequest[];
  }>;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function taskRequest(
  requests: readonly AgentNaturalLanguageActionRequest[],
) {
  return requests.find((request) => request.capabilityId === "followups.createTask");
}

function withoutTaskRequests(
  requests: readonly AgentNaturalLanguageActionRequest[],
) {
  return requests.filter((request) => request.capabilityId !== "followups.createTask");
}

function taskCategory(title: string): TaskCategory {
  if (/(?:联系|跟进|回复|引荐|介绍|人脉)/u.test(title)) return "relationship";
  if (/(?:会面|见面|会议|拜访|面谈)/u.test(title)) return "meeting";
  if (/(?:活动|交流会|路演|展会|峰会)/u.test(title)) return "event";
  if (/(?:购买|家里|个人|健身|医院)/u.test(title)) return "personal";
  return "work";
}

function proactiveBucket(now: string): number {
  return Math.floor(Date.parse(now) / PROACTIVE_SUGGESTION_WINDOW_MS);
}

export function createOrbitAiTaskInteractionService(input: {
  noteService?: NoteService;
  taskService: TaskService;
  suggestionService: TaskSuggestionService;
}): OrbitAiTaskInteractionService {
  return {
    async handle(request) {
      const authorization = taskWriteAuthorization(request.message);
      const remainingActionRequests = withoutTaskRequests(request.proposedActionRequests);
      if (authorization.kind === "none" || (authorization.kind === "note_suggestion" && !request.sourceNote)) {
        return { remainingActionRequests };
      }
      let sourceNote = null;
      try {
        sourceNote = request.sourceNote
          ? await input.noteService?.get({ actorId: request.actorId, noteId: request.sourceNote.id }) ?? null
          : null;
      } catch {
        sourceNote = null;
      }
      if (request.sourceNote && (!sourceNote || sourceNote.version !== request.sourceNote.version)) {
        return {
          interaction: {
            category: "work",
            reason: "来源笔记已变化或不可访问，请返回笔记页重新整理。",
            sourceNoteId: request.sourceNote.id,
            sourceNoteVersion: request.sourceNote.version,
            state: "failed",
            title: "从笔记整理待办",
          },
          remainingActionRequests,
        };
      }
      const candidate = taskRequest(request.proposedActionRequests);
      // A model can refine an authorized title, but cannot substitute another
      // task (or that task's date) for the user's explicit command.
      const plannedTask = authorization.kind !== "direct" ||
        (candidate?.arguments.title.trim() && authorization.title.includes(candidate.arguments.title.trim()))
        ? candidate : undefined;
      const explicit = authorization.kind === "direct";
      const title =
        plannedTask?.arguments.title ??
        (sourceNote?.body.split(/\r?\n/u).map((line) => line.trim()).find(Boolean)?.slice(0, 180)) ??
        (authorization.kind === "note_suggestion" ? null : authorization.title);

      if (!title) {
        return { remainingActionRequests };
      }

      const category = taskCategory(title);
      const dueAt = plannedTask?.arguments.dueAt;

      if (
        sourceNote &&
        !dueAt &&
        /(?:今天|明天|后天|下周|本周|稍后|改天|近期|today|tomorrow|next\s+week|later)/iu.test(`${request.message}\n${sourceNote.body}`) &&
        !/\b\d{4}-\d{2}-\d{2}\b/u.test(request.message)
      ) {
        return {
          interaction: {
            category,
            reason: "请补充明确日期后再发送，当前没有创建建议或待办。",
            relatedContactIds: sourceNote.contactIds,
            sourceNoteId: sourceNote.id,
            sourceNoteVersion: sourceNote.version,
            state: "needs_date_confirmation",
            title,
          },
          remainingActionRequests,
        };
      }

      if (explicit && !sourceNote) {
        try {
          const created = await input.taskService.create({
            actorId: request.actorId,
            title,
            category,
            ...(dueAt ? { dueAt } : {}),
            source: "ai_confirmed",
            relatedConversationId: request.conversationId,
            idempotencyKey: `agent-chat:${shortHash(
              `${request.conversationId}\u0000${request.message}`,
            )}`,
            now: request.now,
          });
          return {
            interaction: {
              category,
              ...(dueAt ? { dueAt } : {}),
              state: "created",
              taskId: created.task.id,
              title,
            },
            remainingActionRequests,
          };
        } catch {
          return {
            interaction: {
              category,
              reason: "待办存储暂时不可用，请稍后重试。",
              state: "failed",
              title,
            },
            remainingActionRequests,
          };
        }
      }

      try {
        const nowBucket = proactiveBucket(request.now);
        const suggestion = await input.suggestionService.suggest({
          actorId: request.actorId,
          title,
          reason: "你在对话中提到了一项明确的后续行动。",
          category,
          ...(dueAt ? { suggestedDueAt: dueAt } : {}),
          relatedConversationId: request.conversationId,
          ...(sourceNote
            ? {
                relatedContactId: sourceNote.contactIds[0],
                relatedContactIds: sourceNote.contactIds,
                sourceNoteId: sourceNote.id,
                sourceNoteVersion: sourceNote.version,
              }
            : {}),
          evidenceIds: [],
          confidence: plannedTask ? 0.88 : 0.76,
          deduplicationKey: sourceNote
            ? `agent-note:${sourceNote.id}:${sourceNote.version}:${shortHash(request.message)}`
            : `agent-chat-window:${nowBucket}`,
          expiresAt: new Date(
            Date.parse(request.now) + 14 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          now: request.now,
        });

        if (suggestion.createdAt !== request.now) {
          return { remainingActionRequests };
        }

        return {
          interaction: {
            category,
            ...(dueAt ? { dueAt } : {}),
            reason: suggestion.reason,
            state: "suggested",
            suggestionId: suggestion.id,
            ...(sourceNote
              ? {
                  relatedContactIds: sourceNote.contactIds,
                  sourceNoteId: sourceNote.id,
                  sourceNoteVersion: sourceNote.version,
                }
              : {}),
            title: suggestion.title,
          },
          remainingActionRequests,
        };
      } catch {
        return sourceNote
          ? {
              interaction: {
                category,
                reason: "待办建议暂时无法保存，笔记和输入均已保留，请稍后重试。",
                relatedContactIds: sourceNote.contactIds,
                sourceNoteId: sourceNote.id,
                sourceNoteVersion: sourceNote.version,
                state: "failed",
                title,
              },
              remainingActionRequests,
            }
          : { remainingActionRequests };
      }
    },
  };
}
