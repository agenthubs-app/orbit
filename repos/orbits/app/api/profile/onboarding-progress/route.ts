import { createProfileOnboardingProgressRouteHandlers } from "./route-handler";

export const dynamic = "force-dynamic";
const handlers = createProfileOnboardingProgressRouteHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
