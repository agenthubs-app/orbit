import { createReadCostAdminHandler } from "./handler";

export const dynamic = "force-dynamic";

const handler = createReadCostAdminHandler();
export const GET = (request: Request) => handler(request);
