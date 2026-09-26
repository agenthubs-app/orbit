import { createCardUploadHandlers } from "./handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handlers = createCardUploadHandlers();
export const POST = handlers.reserve;
export const GET = handlers.mode;
