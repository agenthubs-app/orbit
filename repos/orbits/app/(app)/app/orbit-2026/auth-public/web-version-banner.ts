// Git commit IDs are identities, not ordered versions.
export function shouldShowWebVersionBanner(currentBuildId: string | undefined, response: unknown, dismissedBuildId?: string): boolean {
  if (!currentBuildId?.trim() || !response || typeof response !== "object" || Array.isArray(response)) return false;
  const nextBuildId = (response as Record<string, unknown>).webBuildId;
  return typeof nextBuildId === "string" && !!nextBuildId.trim()
    && currentBuildId.trim().toLowerCase() !== nextBuildId.trim().toLowerCase()
    && dismissedBuildId?.trim().toLowerCase() !== nextBuildId.trim().toLowerCase();
}
