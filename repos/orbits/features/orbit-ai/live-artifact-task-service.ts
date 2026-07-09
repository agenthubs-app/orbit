import { createEventsRecommendationTool } from "../events/event-recommendation-tool";
import {
  createContactRecommendationMatcher,
  resolveContactRecommendationMethod,
} from "./contact-recommendation-matching";
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

  // live 路径显式注入关系检索 matcher：所有 contacts.recommend 请求都查真实关系库，
  // 不再经过按措辞分流到固定画像 goal 推荐的正则门（那条路径会以"目标过于模糊"
  // 反复向用户要信息）。方法配置非法时不注入，让 artifact service 报配置错误。
  const contactMethodResolution = resolveContactRecommendationMethod();

  return createOrbitAgentContactRecommendationArtifactService({
    fallbackService: eventService,
    matcher:
      contactMethodResolution.success === true
        ? createContactRecommendationMatcher({
            method: contactMethodResolution.method,
          })
        : undefined,
    // live 路径启用"模型抽英文检索词"：任意语言 query → 英文关键词 → 现有子串搜索。
    // 缺 provider key 时抽词返回空，自动回退到确定性正则词表。
    normalizationService: createOrbitLanguageNormalizationService(),
  });
}
