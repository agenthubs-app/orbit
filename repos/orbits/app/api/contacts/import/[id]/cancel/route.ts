import { createContactImportHandlers } from "../../handlers";

export const dynamic = "force-dynamic";

const handlers = createContactImportHandlers();

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handlers.cancel(request, context);
