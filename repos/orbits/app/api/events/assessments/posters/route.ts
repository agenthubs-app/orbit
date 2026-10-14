// R26 contract 8: upload a poster / screenshot (≤6MB) for `sourceKind: "poster"`; kept 7 days, then purged by the maintenance task.
export { uploadAssessmentPoster as POST } from "../../../../../features/redesign-contracts/handlers";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
