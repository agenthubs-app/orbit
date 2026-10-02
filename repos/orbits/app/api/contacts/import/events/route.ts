import { createContactImportHandlers } from "../handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handlers = createContactImportHandlers();

export const GET = () => handlers.events();
export const POST = (request: Request) => handlers.importEvent(request);
