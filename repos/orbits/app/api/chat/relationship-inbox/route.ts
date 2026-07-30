import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
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

const mockGET = createRelationshipInboxGetHandler();
const mockPOST = createRelationshipInboxPostHandler();

type RequestScopedHandler = (
  request: Request,
  context?: unknown,
) => Promise<Response>;

const authenticatedGET = auth(async (request) => {
  return createRelationshipInboxGetHandler(async () => {
    const user = request.auth?.user;

    return user?.id
      ? resolveAuthenticatedApiActorFromSession({
          email: user.email,
          name: user.name,
          userId: user.id,
        })
      : null;
  })(request);
}) as unknown as RequestScopedHandler;

const authenticatedPOST = auth(async (request) => {
  return createRelationshipInboxPostHandler(async () => {
    const user = request.auth?.user;

    return user?.id
      ? resolveAuthenticatedApiActorFromSession({
          email: user.email,
          name: user.name,
          userId: user.id,
        })
      : null;
  })(request);
}) as unknown as RequestScopedHandler;

export async function GET(
  request: Request,
  context?: unknown,
): Promise<Response> {
  return resolveFeatureMode() === "mock"
    ? mockGET(request)
    : authenticatedGET(request, context);
}

export async function POST(
  request: Request,
  context?: unknown,
): Promise<Response> {
  return resolveFeatureMode() === "mock"
    ? mockPOST(request)
    : authenticatedPOST(request, context);
}
