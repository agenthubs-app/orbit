import { createNetworkSnapshotRouteHandlers } from "../handlers";

export const dynamic = "force-dynamic";
/** 手动重新分析在请求内同步生成（W48-8）。 */
export const maxDuration = 120;

const handlers = createNetworkSnapshotRouteHandlers();

export const POST = handlers.recompute;
