import { createV1ImportHandlers } from "../handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const POST = createV1ImportHandlers().verifySource;
