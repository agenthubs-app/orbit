import { createPushTokenDeleteHandler, createPushTokenPostHandler } from "./handler";

export const DELETE = createPushTokenDeleteHandler();
export const POST = createPushTokenPostHandler();
