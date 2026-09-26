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

// resume extraction route 从简历材料生成 profile 更新草稿。
// route 只合并 query scenario 和 JSON body；抽取逻辑和建议状态由 extraction service 负责。
export function createResumeExtractionPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    const extractionService = createProfileDocumentExtractionService();
    const result = extractionService.extractResumeDraft(
      await readProfileExtractionInput(request),
    );

    return profileExtractionResponse(result, mode);
  };
}
