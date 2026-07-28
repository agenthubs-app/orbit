import {
  createRelationshipInboxGetHandler,
  createRelationshipInboxPostHandler,
} from "./handler";

// 关系收件箱面板的数据入口：返回 async correspondence workspace（inbox + 选中线程 +
// 草稿回复 + 上下文）。传 conversationId 选中某条线程。
//
// mock runtime 读取显式预览数据；live/hybrid 从会话解析 actor，并只读取该
// actor 通过 connection 或内部草稿拥有的记录。内部草稿允许落库，但永远不在
// 此路由发送消息、通知、写外部日历或调用外部传输 provider。
export const dynamic = "force-dynamic";

export const GET = createRelationshipInboxGetHandler();
export const POST = createRelationshipInboxPostHandler();
