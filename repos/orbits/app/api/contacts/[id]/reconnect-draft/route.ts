import { createReconnectDraftRouteHandlers } from "./route-handlers";

export const dynamic = "force-dynamic";

// POST /api/contacts/:id/reconnect-draft：机会标签「待唤醒」的「起草邮件」（W0050）。
// 只在点击时调用；模板草稿，不调 AI、不保存、不发送。
export const POST = createReconnectDraftRouteHandlers().POST;
