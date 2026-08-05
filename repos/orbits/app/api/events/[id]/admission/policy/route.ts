import {
  createEventAdmissionPolicyGetHandler,
  createEventAdmissionPolicyPutHandler,
} from "./handler";

export const dynamic = "force-dynamic";
export const GET = createEventAdmissionPolicyGetHandler();
export const PUT = createEventAdmissionPolicyPutHandler();
