import { createConfirmedEventFollowupsGetHandler, createConfirmedEventFollowupsPostHandler } from "./handler";

export const dynamic = "force-dynamic";

export const GET = createConfirmedEventFollowupsGetHandler();
export const POST = createConfirmedEventFollowupsPostHandler();
