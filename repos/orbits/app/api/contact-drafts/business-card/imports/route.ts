import { createV1ImportHandlers } from "./handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handlers = createV1ImportHandlers();
export const POST = handlers.create;
export const GET = handlers.list;
