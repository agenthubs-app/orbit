import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { createProfileDocumentExtractionService } from "../../../../../features/profile/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";
import {
  profileExtractionResponse,
  readProfileExtractionInput,
} from "../route-support";

// business-card extraction route 从名片材料生成 profile 更新草稿。
// route 只合并 query scenario 和 JSON body；抽取逻辑和建议状态由 extraction service 负责。
export function createBusinessCardExtractionPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const extractionService = createProfileDocumentExtractionService();
    const result = extractionService.extractBusinessCardDraft(
      await readProfileExtractionInput(request),
    );

    return profileExtractionResponse(result, mode);
  };
}
