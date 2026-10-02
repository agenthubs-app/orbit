import { createContactImportHandlers } from "../../handlers";

export const dynamic = "force-dynamic";

const handlers = createContactImportHandlers();

export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => handlers.rows(request, context);
export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => handlers.decide(request, context);
