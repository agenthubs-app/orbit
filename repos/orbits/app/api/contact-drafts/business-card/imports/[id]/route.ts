import { createV1ImportHandlers } from "../handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = createV1ImportHandlers().get;
