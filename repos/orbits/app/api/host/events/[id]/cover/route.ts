// 2026-11-20 主办方的活动图片：POST（multipart file + focusY）上传 / DELETE 删除。权限同编辑基本情報（event.edit）。
import { createHostRoutes } from "../../../../../../features/events/host/handlers";

export const dynamic = "force-dynamic";

const routes = createHostRoutes();
export const POST = routes.uploadCover;
export const DELETE = routes.deleteCover;
