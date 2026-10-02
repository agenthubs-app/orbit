import { createContactImportHandlers } from "./handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handlers = createContactImportHandlers();

export const GET = () => handlers.list();
export const POST = (request: Request) => handlers.upload(request);
