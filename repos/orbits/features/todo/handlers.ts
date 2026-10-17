import { todoPageQueryObject, todoPageSchema } from "../../shared/api-schema/todo-page";
import { AppError } from "../../shared/errors/app-error";
import { redesignMock } from "../redesign-contracts/mock-service";
import { redesignContractRoute } from "../redesign-contracts/route";

export const getTodoPage = redesignContractRoute("todo-page", todoPageSchema, request => {
  const search = new URL(request.url).searchParams;
  const query = todoPageQueryObject.safeParse(Object.fromEntries(search));
  if ([...search.keys()].some(key => search.getAll(key).length !== 1) || !query.success || query.data.cursor) {
    return { error: new AppError("VALIDATION_ERROR", "Reload the first To-do page.") };
  }
  return { data: redesignMock.todoPage(query.data.date, query.data.timeZone) };
});
