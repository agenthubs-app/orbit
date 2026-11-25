import { createEmailVerificationSendHandler } from "./handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createEmailVerificationSendHandler();
