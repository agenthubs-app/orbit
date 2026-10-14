/**
 * R26 契约 8 的 live 路由逻辑。Owner: 甲 (R26).
 * Used by: `features/redesign-contracts/handlers.ts`——`redesignContractRoute("event-assessment")` 解析到 live 时转到这里；
 * mock / hybrid 仍是演示世界（含本组新加的异常态与设计稿示例 fixture）。响应由 `redesignContractRoute` 过契约 schema。
 *
 * - 都要登录（401）。只本人可见（他人的 id → 404）。
 * - 示例模式拦写（与 R12 / R15 / R16 同一口径）：演示账号或请求头 `x-orbit-sample: 1` → 写操作 403 `SAMPLE_READ_ONLY`，
 *   读取返回空（示例模式不写库、不调 AI）。
 * - 库未配置 → 503 `EVENT_ASSESSMENT_UNCONFIGURED`。URL 抓取超过限速 → 429 `RATE_LIMITED`（不写 failure_reason，DESIGN §5）。
 */
import { eventAssessmentCreateInputSchema, eventAssessmentPatchInputSchema } from "../../../shared/api-schema/event-assessment";
import { AppError, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { requestContext } from "../../plans/v2/flow-handlers";
import { readBody, type ContractReply } from "../../redesign-contracts/route";
import { getConfiguredEventAssessmentRuntime } from "./configured";
import { EventAssessmentError, type EventAssessmentService } from "./service";

export const ASSESSMENT_SAMPLE_REQUEST_HEADER = "x-orbit-sample";

export interface EventAssessmentLiveDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  /** 测试注入；null = 库未配置。 */
  service?: EventAssessmentService | null;
  /** Next `after()`；测试里缺省同步跑。 */
  after?: (job: () => Promise<void>) => void;
}

type Params = Record<string, string>;

function errorReply(error: unknown): ContractReply {
  if (error instanceof EventAssessmentError) {
    switch (error.code) {
      case "NOT_FOUND": return { context: { reason: "NOT_FOUND" }, error: new AppError("NOT_FOUND", error.message) };
      case "RATE_LIMITED": return { context: { reason: "RATE_LIMITED" }, error: new AppError("CONFLICT", error.message), status: 429 };
      case "INVALID": return { context: { reason: "INVALID" }, error: new AppError("VALIDATION_ERROR", error.message) };
      case "CONFLICT": return { context: { reason: "CONFLICT" }, error: new AppError("CONFLICT", error.message) };
      case "UNAVAILABLE": return { context: { reason: "AI_UNAVAILABLE" }, error: new AppError("SERVICE_UNAVAILABLE", error.message) };
    }
  }
  console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_assessment_route_failed" }));
  return { error: new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE) };
}

export function createEventAssessmentLiveHandlers(deps: EventAssessmentLiveDeps = {}) {
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const resolveService = (): EventAssessmentService | null => {
    if (deps.service !== undefined) return deps.service;
    const runtime = getConfiguredEventAssessmentRuntime();
    if (!runtime) return null;
    if (deps.after) runtime.setScheduler(deps.after);
    return runtime.service;
  };

  function run(write: boolean, body: (input: { actorId: string; request: Request; params: Params; service: EventAssessmentService; language: "ja" | "zh" | "en" }) => Promise<ContractReply>, sampleRead?: () => ContractReply) {
    return async (request: Request, params: Params = {}): Promise<ContractReply> => {
      const actor = await resolveActor();
      if (!actor) return { error: new AppError("UNAUTHORIZED", "Sign in to access this resource.") };
      const sample = actor.id === DEMO_ACTOR_ID || request.headers.get(ASSESSMENT_SAMPLE_REQUEST_HEADER)?.trim() === "1";
      if (sample) {
        if (write) return { context: { reason: "SAMPLE_READ_ONLY" }, error: new AppError("FORBIDDEN", "SAMPLE_READ_ONLY: sample data cannot be saved.") };
        if (sampleRead) return sampleRead();
      }
      const service = resolveService();
      if (!service) return { context: { reason: "EVENT_ASSESSMENT_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "Event assessment requires a configured live database.") };
      try {
        return await body({ actorId: actor.id, language: requestContext(request).language, params, request, service });
      } catch (error) {
        return errorReply(error);
      }
    };
  }

  const notFound = (): ContractReply => ({ context: { reason: "NOT_FOUND" }, error: new AppError("NOT_FOUND", "Not found.") });

  return {
    list: run(false, async ({ actorId, language, service }) => ({ data: await service.list(actorId, language) }), () => ({ data: [] })),
    availability: run(false, async ({ actorId, service }) => ({ data: await service.availability(actorId) }), () => ({ data: { aiReadAvailable: false, dailyLeft: null, monthlyLeft: null, monthlyLimit: null } })),
    create: run(true, async ({ actorId, language, request, service }) => {
      const body = await readBody(request, eventAssessmentCreateInputSchema);
      if (body.ok === false) return body.reply;
      const created = await service.create(actorId, body.value, language);
      return { data: created, status: created.status === "reading" ? 202 : 200 };
    }),
    get: run(false, async ({ actorId, language, params, service }) => {
      const found = await service.get(actorId, params.id ?? "", language);
      return found ? { data: found } : notFound();
    }, notFound),
    patch: run(true, async ({ actorId, language, params, request, service }) => {
      const body = await readBody(request, eventAssessmentPatchInputSchema);
      if (body.ok === false) return body.reply;
      const patched = await service.patch(actorId, params.id ?? "", body.value, language);
      return patched ? { data: patched } : notFound();
    }),
    addToPlan: run(true, async ({ actorId, params, service }) => {
      const added = await service.addToPlan(actorId, params.id ?? "");
      return added ? { data: { addedToPlan: true, assessmentId: params.id, planId: added.planId, planItemId: added.planItemId } } : notFound();
    }),
    dismiss: run(true, async ({ actorId, params, service }) => ((await service.dismiss(actorId, params.id ?? "")) ? { data: { assessmentId: params.id, userDecision: "dismissed" } } : notFound())),
    uploadPoster: run(true, async ({ actorId, request, service }) => {
      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      if (!file || typeof file === "string") return { context: { reason: "INVALID" }, error: new AppError("VALIDATION_ERROR", "Attach an image file.") };
      const blob = file as Blob;
      return { data: await service.uploadPoster(actorId, { bytes: Buffer.from(await blob.arrayBuffer()), mimeType: blob.type || "image/jpeg" }), status: 201 };
    }),
  };
}

let defaultHandlers: ReturnType<typeof createEventAssessmentLiveHandlers> | null = null;
/** 路由用的默认实例（`after` 由路由文件在首次调用前注入）。 */
export function eventAssessmentLiveHandlers(after?: (job: () => Promise<void>) => void) {
  if (after) return createEventAssessmentLiveHandlers({ after });
  defaultHandlers ??= createEventAssessmentLiveHandlers();
  return defaultHandlers;
}
