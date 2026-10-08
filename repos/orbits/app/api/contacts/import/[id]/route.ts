import { createContactImportHandlers } from "../handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handlers = createContactImportHandlers();

export const GET = (request: Request, context: { params: Promise<{ id: string }> }) => handlers.get(request, context);
export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => handlers.remap(request, context);
