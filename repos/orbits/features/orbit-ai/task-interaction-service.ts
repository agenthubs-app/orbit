import { createHash } from "node:crypto";

import type { OrbitAiTaskInteractionContract } from "../../shared/contract/orbit-ai";
import type { TaskCategory } from "../tasks/contract";
import type { TaskService } from "../tasks/service";
import type { TaskSuggestionService } from "../tasks/suggestion-service";
import type { AgentNaturalLanguageActionRequest } from "../agent/natural-language-actions/contract";

const PROACTIVE_SUGGESTION_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface OrbitAiTaskInteractionService {
  handle: (input: {
    actorId: string;
    conversationId: string;
    message: string;
    now: string;
    proposedActionRequests: readonly AgentNaturalLanguageActionRequest[];
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

function isExplicitTaskRequest(message: string): boolean {
  return /(?:创建|新建|添加|加到|加入|记(?:下|一个)?|设(?:置)?)(?:一个|一条|个|条)?(?:待办|任务)|(?:create|add|make)\s+(?:a\s+)?(?:task|todo)/iu.test(
    message,
  );
}

function inferredTaskTitle(message: string): string | null {
  const normalized = message.trim().replace(/[。！？!?]+$/u, "");
  const hasCommitment =
    /(?:我|我们)(?:之后|稍后|今天|明天|后天|下周|本周|晚上|下午|上午)?(?:还)?(?:要|需要|得|打算|准备|计划)|\b(?:i|we)\s+(?:need|plan|intend|have)\s+to\b/iu.test(
      normalized,
    );
  const hasAction =
    /(?:联系|跟进|确认|整理|提交|发送|发|准备|预约|购买|完成|更新|安排|回复)/u.test(
      normalized,
    );
  if (
    !normalized ||
    /[？?]|(?:谁|什么|怎么|如何|有没有|是否)/u.test(normalized) ||
    !hasCommitment ||
    !hasAction
  ) {
    return null;
  }

  return normalized
    .replace(/^(?:我|我们)(?:之后|稍后)?(?:还)?(?:要|需要|得|打算|准备|计划)(?:去)?/u, "")
    .trim()
    .slice(0, 180);
}

function explicitTaskTitle(message: string): string {
  return message
    .replace(
      /^.*?(?:创建|新建|添加|加到|加入|记(?:下|一个)?|设(?:置)?)(?:一个|一条|个|条)?(?:待办|任务)[：:\s]*/u,
      "",
    )
    .replace(/[。！？!?]+$/u, "")
    .trim()
    .slice(0, 180);
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
  taskService: TaskService;
  suggestionService: TaskSuggestionService;
}): OrbitAiTaskInteractionService {
  return {
    async handle(request) {
      const plannedTask = taskRequest(request.proposedActionRequests);
      const explicit = isExplicitTaskRequest(request.message);
      const title =
        plannedTask?.arguments.title ??
        (explicit
          ? explicitTaskTitle(request.message)
          : inferredTaskTitle(request.message));

      if (!title) {
        return { remainingActionRequests: request.proposedActionRequests };
      }

      const remainingActionRequests = withoutTaskRequests(
        request.proposedActionRequests,
      );
      const category = taskCategory(title);
      const dueAt = plannedTask?.arguments.dueAt;

      if (explicit) {
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
          evidenceIds: [],
          confidence: plannedTask ? 0.88 : 0.76,
          deduplicationKey: `agent-chat-window:${nowBucket}`,
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
            title: suggestion.title,
          },
          remainingActionRequests,
        };
      } catch {
        return { remainingActionRequests };
      }
    },
  };
}
