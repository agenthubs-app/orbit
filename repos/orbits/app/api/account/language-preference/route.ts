import { createAccountLanguagePreferenceRouteHandlers } from "./handlers";

export const dynamic = "force-dynamic";

const handlers = createAccountLanguagePreferenceRouteHandlers();

export const GET = handlers.GET;
export const PUT = handlers.PUT;
