import { handlePasswordChangeRequest } from "../../../../../features/auth/password-change-http";
import { configuredPasswordChangeDeps } from "../../../../../features/auth/password-change-runtime";

export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return handlePasswordChangeRequest(request, configuredPasswordChangeDeps);
}
