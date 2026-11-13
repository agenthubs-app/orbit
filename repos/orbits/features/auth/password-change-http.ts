// POST /api/auth/password/change 与 GET /api/auth/password/status 的 HTTP 处理（写法照 password-reset-http）。
// `/api/auth/*` 在代理层是公开路径，所以这里自己要求会话。
import type { PasswordChangeAccount, PasswordChangeFailureCode, PasswordChangeService } from "./password-change";

export interface PasswordChangeHttpDeps {
  /** 当前 Auth.js 会话的 `{ userId, email }`；未登录返回 null。 */
  resolveAccount: () => Promise<PasswordChangeAccount | null>;
  /** 未配置数据库时返回 null。 */
  resolveService: () => PasswordChangeService | null;
}

const MAX_REQUEST_BYTES = 4096;
const HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

export const PASSWORD_CHANGE_FAILURE_MESSAGES: Record<PasswordChangeFailureCode, string> = {
  INVALID_INPUT: "新密码至少 8 位，UTF-8 长度不超过 72 字节。",
  SAME_PASSWORD: "新密码不能与当前密码相同。",
  WRONG_PASSWORD: "当前密码不正确。",
  NO_PASSWORD: "该账号没有设置密码（通过 Google 登录），无需修改。",
  CONFLICT: "密码刚刚已被修改，请重新登录后再试。",
};

function response(status: number, body: unknown) {
  return Response.json(body, { status, headers: HEADERS });
}

function failure(status: number, code: string, message: string) {
  return response(status, { success: false, error: { code, message } });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, total).toString("utf8");
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
}

function usableAccount(account: PasswordChangeAccount | null): account is PasswordChangeAccount {
  return Boolean(account && typeof account.userId === "string" && account.userId && typeof account.email === "string" && account.email);
}

export async function handlePasswordChangeRequest(request: Request, deps: PasswordChangeHttpDeps): Promise<Response> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure(415, "UNSUPPORTED_MEDIA_TYPE", "请使用正确的表单重试。");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return failure(413, "PAYLOAD_TOO_LARGE", "请求内容过长。");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return failure(403, "FORBIDDEN", "请在 Orbit 页面重新提交。");
  try {
    const account = await deps.resolveAccount();
    if (!usableAccount(account)) return failure(401, "UNAUTHORIZED", "请先登录后再修改密码。");
    const raw = await readBoundedBody(request);
    if (raw === null) return failure(413, "PAYLOAD_TOO_LARGE", "请求内容过长。");
    const body = JSON.parse(raw) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || typeof body !== "object") return failure(400, "VALIDATION_ERROR", "请检查输入后重试。");
    const service = deps.resolveService();
    if (!service) return failure(503, "SERVICE_UNAVAILABLE", "暂时无法修改密码，请稍后重试。");
    const result = await service.change(account, body.currentPassword, body.newPassword);
    if (result.success === false) return failure(result.code === "CONFLICT" ? 409 : 400, result.code, PASSWORD_CHANGE_FAILURE_MESSAGES[result.code]);
    return response(200, { success: true, data: { message: "密码已更新。" } });
  } catch (error) {
    return error instanceof SyntaxError
      ? failure(400, "VALIDATION_ERROR", "请检查输入后重试。")
      : failure(503, "SERVICE_UNAVAILABLE", "暂时无法处理，请稍后重试。");
  }
}

export async function handlePasswordStatusRequest(deps: PasswordChangeHttpDeps): Promise<Response> {
  try {
    const account = await deps.resolveAccount();
    if (!usableAccount(account)) return failure(401, "UNAUTHORIZED", "请先登录。");
    const service = deps.resolveService();
    if (!service) return failure(503, "SERVICE_UNAVAILABLE", "暂时无法处理，请稍后重试。");
    const { mustChangePassword } = await service.status(account);
    return response(200, { mustChangePassword });
  } catch {
    return failure(503, "SERVICE_UNAVAILABLE", "暂时无法处理，请稍后重试。");
  }
}
