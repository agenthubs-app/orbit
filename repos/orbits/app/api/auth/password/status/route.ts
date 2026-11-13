import { handlePasswordStatusRequest } from "../../../../../features/auth/password-change-http";
import { configuredPasswordChangeDeps } from "../../../../../features/auth/password-change-runtime";

export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return handlePasswordStatusRequest(configuredPasswordChangeDeps);
}
