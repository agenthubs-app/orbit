import { createSyncDomainHandlers } from "../domain-handlers";

export const dynamic = "force-dynamic";

const handlers = createSyncDomainHandlers();

export const GET = handlers.lease;
