import {
  createEventAccessAssignmentHandler,
  type EventAccessRouteContext,
} from "./handler";

export const dynamic = "force-dynamic";

const handler = createEventAccessAssignmentHandler();

export function GET(
  request: Request,
  context: EventAccessRouteContext,
): Promise<Response> {
  return handler(request, context, "GET");
}

export function PUT(
  request: Request,
  context: EventAccessRouteContext,
): Promise<Response> {
  return handler(request, context, "PUT");
}

export function DELETE(
  request: Request,
  context: EventAccessRouteContext,
): Promise<Response> {
  return handler(request, context, "DELETE");
}
