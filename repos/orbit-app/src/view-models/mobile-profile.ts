import type { MobileAuthUser } from "../api/mobile-auth";

export function mobileUserDisplayName(
  user: MobileAuthUser | null | undefined,
  fallback = ""
): string {
  return user?.name.trim() || fallback;
}
