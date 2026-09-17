import { createPortraitGetHandler, createPortraitPostHandler } from "./route-handlers";

export const dynamic = "force-dynamic";
export const GET = createPortraitGetHandler();
export const POST = createPortraitPostHandler();
