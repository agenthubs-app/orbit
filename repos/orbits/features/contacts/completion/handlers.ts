/**
 * R16 每天一问的 live 路由逻辑（R08 契约 3）。Owner: 甲 (R16).
 * Used by: `features/redesign-contracts/handlers.ts` 的 `getCompletionQuestion` / `answerCompletionQuestion` /
 * `skipCompletionQuestion`——`redesignContractRoute` 解析到 live（`service-factory.ts` 注册）时转到这里；mock / hybrid 仍是演示世界。
 * 响应由 `redesignContractRoute` 过契约 schema 再发出。
 *
 * - 都要登录（未登录 401）。
 * - 示例模式拦写（与 R12 / R15 同一口径）：演示账号（`DEMO_ACTOR_ID`）或请求头 `x-orbit-sample: 1` →
 *   回答 / 跳过 403 `SAMPLE_READ_ONLY`；取题直接返回 null（取题会写当天的问题记录，示例模式不写库）。
 * - 库未配置 → 503 `CONTACT_COMPLETION_UNCONFIGURED`。
 */
import { z } from "zod";

import { contactCompletionAnswerInputSchema } from "../../../shared/api-schema/contact-completion";
import { AppError, SAFE_INTERNAL_ERROR_MESSAGE } from "../../../shared/errors/app-error";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { readBody, type ContractReply } from "../../redesign-contracts/route";
import { createConfiguredContactCompletionService } from "./configured";
import { ContactCompletionError, type ContactCompletionService } from "./service";

export const COMPLETION_SAMPLE_REQUEST_HEADER = "x-orbit-sample";

export interface ContactCompletionLiveDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  /** 测试注入；null = 库未配置（503）。缺省 = live 装配。 */
  service?: ContactCompletionService | null;
}

type Params = Record<string, string>;

const skipInputSchema = z.object({ idempotencyKey: z.string().min(1).max(200) }).strict();

function isSampleRequest(request: Request, actorId: string): boolean {
  return actorId === DEMO_ACTOR_ID || request.headers.get(COMPLETION_SAMPLE_REQUEST_HEADER)?.trim() === "1";
}

function errorReply(error: unknown): ContractReply {
  if (error instanceof ContactCompletionError) {
    switch (error.code) {
      case "NOT_FOUND":
        return { context: { reason: "NOT_FOUND" }, error: new AppError("NOT_FOUND", error.message) };
      case "INVALID":
        return { context: { reason: "INVALID_ANSWER" }, error: new AppError("VALIDATION_ERROR", error.message) };
      case "CONFLICT":
        return { context: { reason: "CONFLICT" }, error: new AppError("CONFLICT", error.message) };
    }
  }
  console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "contact_completion_route_failed" }));
  return { error: new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE) };
}

export function createContactCompletionLiveHandlers(deps: ContactCompletionLiveDeps = {}) {
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const service = (): ContactCompletionService | null => (deps.service !== undefined ? deps.service : createConfiguredContactCompletionService());

  function run(write: boolean, body: (input: { actorId: string; request: Request; params: Params; service: ContactCompletionService; sample: boolean }) => Promise<ContractReply>) {
    return async (request: Request, params: Params = {}): Promise<ContractReply> => {
      const actor = await resolveActor();
      if (!actor) return { error: new AppError("UNAUTHORIZED", "Sign in to access this resource.") };
      const sample = isSampleRequest(request, actor.id);
      if (write && sample) return { context: { reason: "SAMPLE_READ_ONLY" }, error: new AppError("FORBIDDEN", "SAMPLE_READ_ONLY: sample data cannot be saved.") };
      const resolved = service();
      if (!resolved) return { context: { reason: "CONTACT_COMPLETION_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "The daily question requires a configured live database.") };
      try {
        return await body({ actorId: actor.id, params, request, sample, service: resolved });
      } catch (error) {
        return errorReply(error);
      }
    };
  }

  return {
    get: run(false, async ({ actorId, sample, service: resolved }) => ({ data: sample ? null : await resolved.today(actorId) })),
    answer: run(true, async ({ actorId, params, request, service: resolved }) => {
      const body = await readBody(request, contactCompletionAnswerInputSchema);
      if (body.ok === false) return body.reply;
      return { data: await resolved.answer(actorId, params.id ?? "", body.value) };
    }),
    skip: run(true, async ({ actorId, params, request, service: resolved }) => {
      const body = await readBody(request, skipInputSchema);
      if (body.ok === false) return body.reply;
      return { data: await resolved.skip(actorId, params.id ?? "", body.value) };
    }),
  };
}

let liveHandlers: ReturnType<typeof createContactCompletionLiveHandlers> | null = null;

/** 路由用的一份（按需创建）。 */
export function contactCompletionLiveHandlers(): ReturnType<typeof createContactCompletionLiveHandlers> {
  liveHandlers ??= createContactCompletionLiveHandlers();
  return liveHandlers;
}
