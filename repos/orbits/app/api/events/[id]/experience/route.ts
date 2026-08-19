import {
  createEventExperienceDraftPutHandler,
  createEventExperienceGetHandler,
} from "./handlers";

export const dynamic = "force-dynamic";
export const GET = createEventExperienceGetHandler();
export const PUT = createEventExperienceDraftPutHandler();
