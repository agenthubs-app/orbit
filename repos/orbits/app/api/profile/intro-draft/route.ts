import { createProfileIntroDraftHandler } from "./handler";

export const dynamic = "force-dynamic";
// One action can make up to three 45-second model attempts.
export const maxDuration = 180;
export const POST = createProfileIntroDraftHandler();
