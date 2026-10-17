import { createConfiguredRelationshipTaskResolver } from "../../../../../features/connections/lifecycle/task-resolve";
import { createRelationshipTaskResolveHandler } from "../../../../../features/connections/lifecycle/task-resolve-handler";

export const dynamic = "force-dynamic";
export const GET = createRelationshipTaskResolveHandler({ reader: createConfiguredRelationshipTaskResolver });
