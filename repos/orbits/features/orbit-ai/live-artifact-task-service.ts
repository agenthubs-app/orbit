import { createOrbitAgentChatContextArtifactService } from "./chat-context-artifact-service";
import { createOrbitAgentContactRecommendationArtifactService } from "./contact-recommendation-artifact-service";
import { createOrbitAgentEventRecommendationArtifactService } from "./event-recommendation-artifact-service";
import { createOrbitAgentFollowupReviewArtifactService } from "./followup-review-artifact-service";
import { createOrbitAgentArtifactPreviewService } from "./artifact-task-preview-service";
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
  });

  return createOrbitAgentContactRecommendationArtifactService({
    fallbackService: eventService,
  });
}
