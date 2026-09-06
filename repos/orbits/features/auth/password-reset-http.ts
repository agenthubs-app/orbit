import { createConfiguredPasswordResetRuntime } from "./password-reset-factory";

type ResetRuntime = ReturnType<typeof createConfiguredPasswordResetRuntime>;

function response(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export async function handlePasswordResetRequest(request: Request, operation: "request" | "reset", resolve: () => ResetRuntime = createConfiguredPasswordResetRuntime): Promise<Response> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response(415, { success: false, error: { message: "请使用正确的表单重试。" } });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return response(413, { success: false, error: { message: "请求内容过长。" } });
  try {
    const raw = await request.text();
    if (raw.length > 4096) return response(413, { success: false, error: { message: "请求内容过长。" } });
    const body = JSON.parse(raw) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || typeof body !== "object") return response(400, { success: false, error: { message: "请检查输入后重试。" } });
    const runtime = resolve();
    if (!runtime) return response(503, { success: false, error: { message: "密码恢复暂不可用，请稍后重试或联系管理员。" } });
    const origin = request.headers.get("origin");
    if (origin && origin !== runtime.origin) return response(403, { success: false, error: { message: "请在 Orbit 页面重新提交。" } });
    const result = operation === "request" ? await runtime.service.request(body.email) : await runtime.service.reset(body.token, body.password);
    if (result.success === false) return response(400, { success: false, error: { code: result.code, message: result.code === "INVALID_TOKEN" ? "链接已失效或已使用，请重新申请。" : "请检查邮箱；新密码至少 8 位，UTF-8 长度不超过 72 字节。" } });
    return response(operation === "request" ? 202 : 200, { success: true, data: { message: operation === "request" ? "申请已受理。如果该邮箱支持密码恢复，你将收到重置链接；未收到时请稍后重试。" : "密码已更新，请使用新密码登录。" } });
  } catch (error) {
    return response(error instanceof SyntaxError ? 400 : 503, { success: false, error: { message: error instanceof SyntaxError ? "请检查输入后重试。" : "暂时无法处理，请稍后重试。" } });
  }
}
