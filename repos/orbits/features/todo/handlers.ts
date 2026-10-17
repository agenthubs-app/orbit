import { todoPageQueryObject, todoPageSchema } from "../../shared/api-schema/todo-page";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { AppError } from "../../shared/errors/app-error";
import { redesignMock } from "../redesign-contracts/mock-service";
import { redesignContractRoute } from "../redesign-contracts/route";
import { localParts } from "../tasks/local-date-time";
import { createTodoLiveRuntime } from "./live";
import type { createTodoPageService } from "./service";

interface TodoPageDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  now?: () => string;
  live?: (actor: AuthenticatedApiActor) => { service: ReturnType<typeof createTodoPageService>; accountTimeZone(): Promise<string> } | null;
}
export function createTodoPageHandlers(dependencies: TodoPageDependencies = {}) {
  return { get: redesignContractRoute("todo-page", todoPageSchema, async (request, _params, { service }) => {
    const search = new URL(request.url).searchParams;
    const query = todoPageQueryObject.safeParse(Object.fromEntries(search));
    if ([...search.keys()].some(key => search.getAll(key).length !== 1) || !query.success) return { error: new AppError("VALIDATION_ERROR", "Reload the first To-do page.") };
    if (service.mode !== "live") return query.data.cursor ? { error: new AppError("VALIDATION_ERROR", "Reload the first To-do page.") } : { data: redesignMock.todoPage(query.data.date, query.data.timeZone) };
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)().catch(() => null);
    if (!actor) return { error: new AppError("UNAUTHORIZED", "Sign in to access this resource.") };
    try {
      const live = (dependencies.live ?? createTodoLiveRuntime)(actor);
      if (!live) return { error: new AppError("SERVICE_UNAVAILABLE", "To-do requires a configured live database.") };
      const timeZone = query.data.timeZone ?? await live.accountTimeZone();
      const date = query.data.date ?? localParts(dependencies.now?.() ?? new Date().toISOString(), timeZone).date;
      return { data: await live.service.read({ actorId: actor.id, ...query.data, date, timeZone }) };
    } catch (error) {
      if (error instanceof Error && ["TODO_CURSOR_INVALID", "TODO_PAGE_INPUT_INVALID"].includes(error.message)) return { error: new AppError("VALIDATION_ERROR", "Reload the first To-do page.") };
      console.error(JSON.stringify({ event: "todo_page_read_failed", code: "TODO_PAGE_UNAVAILABLE" }));
      return { error: new AppError("SERVICE_UNAVAILABLE", "To-do is temporarily unavailable.") };
    }
  }) };
}

export const getTodoPage = createTodoPageHandlers().get;
