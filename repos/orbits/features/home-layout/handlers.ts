import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { homeLayoutUpdateInputSchema } from "../../shared/api-schema/home-layout";
import { AppError, SAFE_INTERNAL_ERROR_MESSAGE } from "../../shared/errors/app-error";
import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import { readBody, type ContractReply } from "../redesign-contracts/route";
import { createHomeLayoutService } from "./service";

type Service = ReturnType<typeof createHomeLayoutService>;

export function createHomeLayoutLiveHandlers(deps: { resolveActor?: ResolveAuthenticatedApiActor; service?: Service | null } = {}) {
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const service = (): Service | null => {
    if (deps.service !== undefined) return deps.service;
    const runtime = createConfiguredTransactionalPostgresRuntime();
    return runtime ? createHomeLayoutService(runtime) : null;
  };
  const run = async (operation: (actorId: string, service: Service) => Promise<ContractReply>): Promise<ContractReply> => {
    const actor = await resolveActor();
    if (!actor) return { error: new AppError("UNAUTHORIZED", "Sign in to access this resource.") };
    const resolved = service();
    if (!resolved) return { context: { reason: "HOME_LAYOUT_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "Home layout storage is unavailable.") };
    try {
      return await operation(actor.id, resolved);
    } catch {
      console.error(JSON.stringify({ event: "home_layout_route_failed", code: "STORAGE_ERROR" }));
      return { error: new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE) };
    }
  };
  return {
    get: () => run(async (actorId, resolved) => ({ data: await resolved.get(actorId) })),
    put: async (request: Request) => {
      const body = await readBody(request, homeLayoutUpdateInputSchema);
      if (body.ok === false) return body.reply;
      return run(async (actorId, resolved) => {
        const result = await resolved.put(actorId, body.value);
        if (result.kind === "saved") return { data: result.layout };
        if (result.kind === "mutation_reused") return { context: { reason: "MUTATION_REUSED" }, error: new AppError("CONFLICT", "The mutation ID was used for another layout.") };
        return {
          context: { currentLayout: JSON.stringify(result.current), currentRevision: String(result.current.revision), reason: "REVISION_CONFLICT" },
          error: new AppError("CONFLICT", "The layout was changed on another device."),
        };
      });
    },
  };
}

let live: ReturnType<typeof createHomeLayoutLiveHandlers> | null = null;
export function homeLayoutLiveHandlers() {
  live ??= createHomeLayoutLiveHandlers();
  return live;
}
