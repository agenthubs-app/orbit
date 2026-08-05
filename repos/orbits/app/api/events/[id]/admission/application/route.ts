import {
  createEventAdmissionApplicationDeleteHandler,
  createEventAdmissionApplicationGetHandler,
  createEventAdmissionApplicationPostHandler,
} from "./handler";

export const dynamic = "force-dynamic";
export const DELETE = createEventAdmissionApplicationDeleteHandler();
export const GET = createEventAdmissionApplicationGetHandler();
export const POST = createEventAdmissionApplicationPostHandler();
