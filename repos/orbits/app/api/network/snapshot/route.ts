import { after } from "next/server";

import { createNetworkSnapshotRouteHandlers } from "./handlers";

export const dynamic = "force-dynamic";

const handlers = createNetworkSnapshotRouteHandlers({ after });

export const GET = handlers.GET;
