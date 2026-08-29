import { createRemindersGetHandler, createRemindersPostHandler } from "./handler";

export const GET = createRemindersGetHandler();
export const POST = createRemindersPostHandler();
