import { createAppointmentInitialProposalHandlers } from "../initial-proposal-handlers";

export const dynamic = "force-dynamic";
const handlers = createAppointmentInitialProposalHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
