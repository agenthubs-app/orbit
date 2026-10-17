// R17-16 申込页短链 slug → 活动 id（App `/e/<slug>`；可未登录，只认已公开活动）。
import { createHostRoutes } from "../../../../../features/events/host/handlers";

export const dynamic = "force-dynamic";
export const GET = createHostRoutes().eventBySlug;
