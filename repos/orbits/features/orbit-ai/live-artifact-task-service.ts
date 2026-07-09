import { createEventsRecommendationTool } from "../events/event-recommendation-tool";
import { createOrbitAgentChatContextArtifactService } from "./chat-context-artifact-service";
import { createOrbitAgentContactRecommendationArtifactService } from "./contact-recommendation-artifact-service";
import { createOrbitAgentEventRecommendationArtifactService } from "./event-recommendation-artifact-service";
import { createOrbitAgentFollowupReviewArtifactService } from "./followup-review-artifact-service";
import { createOrbitAgentArtifactPreviewService } from "./artifact-task-preview-service";
import { createOrbitLanguageNormalizationService } from "./language-normalization-service";
import type { OrbitAgentArtifactTaskService } from "./service";

// Live conversation 和 dev trace 必须共享同一个 artifact 组合逻辑。
// contact_recommendations / event_recommendations / followup_queue / relationship_chat_context 走真实 feature service；
// 其它 artifact kind 由组合服务内部回退到 preview。
export function createOrbitAgentLiveArtifactTaskService(): OrbitAgentArtifactTaskService {
  const previewService = createOrbitAgentArtifactPreviewService();
  const chatContextService = createOrbitAgentChatContextArtifactService({
    fallbackService: previewService,
  });
  const followupService = createOrbitAgentFollowupReviewArtifactService({
    fallbackService: chatContextService,
  });
  const eventService = createOrbitAgentEventRecommendationArtifactService({
    fallbackService: followupService,
    // live 路径用 Events 拥有的 live 推荐工具（读 events live store 并按查询排名），
    // 不注入时该 artifact service 会回退到固定画像的 goal 推荐实现。
    recommendationTool: createEventsRecommendationTool(),
  });

  return createOrbitAgentContactRecommendationArtifactService({
    fallbackService: eventService,
    // live 路径启用"模型抽英文检索词"：任意语言 query → 英文关键词 → 现有子串搜索。
    // 缺 provider key 时抽词返回空，自动回退到确定性正则词表。
    normalizationService: createOrbitLanguageNormalizationService(),
  });
}
