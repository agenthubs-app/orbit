import { createCardUploadHandlers } from "../handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const POST = createCardUploadHandlers().consume;
