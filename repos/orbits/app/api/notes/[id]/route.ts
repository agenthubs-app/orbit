import { createNoteDetailHandlers } from "./handler";

export const dynamic = "force-dynamic";
const handlers = createNoteDetailHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
