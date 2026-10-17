import { createContactDeleteHandlers } from "../delete-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createContactDeleteHandlers().RESTORE;
