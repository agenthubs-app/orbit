import { createContactImportHandlers } from "../../handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const handlers = createContactImportHandlers();

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handlers.commit(request, context);
