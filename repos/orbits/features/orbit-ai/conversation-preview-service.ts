import { createMockOrbitAgentConversationService } from "./mock-conversation-service";
import type { OrbitAgentConversationService } from "./service";

// Server-rendered GET previews must stay deterministic and provider-free.
// Normal submitted chat turns still use the /api/ai/conversations service factory.
export function createOrbitAgentConversationPreviewService(): OrbitAgentConversationService {
  return createMockOrbitAgentConversationService();
}
