import { createContactCardGetHandler } from "../page/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createContactCardGetHandler({ summary: true });
