import { createOrbitAgentContactRecommendationArtifactService } from "./contact-recommendation-artifact-service";
import type { OrbitAgentArtifactTaskService } from "./service";

// Live conversation 和 dev trace 必须共享同一个 artifact 组合逻辑。
// contact_recommendations 走真实人脉匹配；其它 artifact kind 由组合服务内部回退到 preview。
export function createOrbitAgentLiveArtifactTaskService(): OrbitAgentArtifactTaskService {
  return createOrbitAgentContactRecommendationArtifactService();
}
