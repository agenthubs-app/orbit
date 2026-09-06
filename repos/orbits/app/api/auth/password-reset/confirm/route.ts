import { handlePasswordResetRequest } from "../../../../../features/auth/password-reset-http";

export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return handlePasswordResetRequest(request, "reset");
}
