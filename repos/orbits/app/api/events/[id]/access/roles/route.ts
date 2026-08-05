import {
  createEventAccessRoleMembersGetHandler,
  type EventAccessRoleMembersRouteContext,
} from "./handler";

export const dynamic = "force-dynamic";

const handler = createEventAccessRoleMembersGetHandler();

export function GET(
  request: Request,
  context: EventAccessRoleMembersRouteContext,
): Promise<Response> {
  return handler(request, context);
}
