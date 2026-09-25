import { createRelationshipPageGetHandler } from "../read-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createRelationshipPageGetHandler("conversations");
