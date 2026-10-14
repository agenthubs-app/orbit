// R08 redesign contract 8; R26: live → features/events/assessment (mock / hybrid serve the demo world).
export { listAssessments as GET, createAssessment as POST } from "../../../../features/redesign-contracts/handlers";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
