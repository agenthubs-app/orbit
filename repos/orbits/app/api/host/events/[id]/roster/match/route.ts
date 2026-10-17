// R17-11 名簿照合：邮箱哈希 → 申込済み / Orbit 登録済み / 未登録（需要 admission.read，有限流）。
import { createHostRoutes } from "../../../../../../../features/events/host/handlers";

export const dynamic = "force-dynamic";
export const POST = createHostRoutes().rosterMatch;
