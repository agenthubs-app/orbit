// Git commit IDs are identities, not ordered versions.
const DISMISSED_BUILD_KEY = "orbit:web-version-dismissed-build-id";
const GIT_SHA = /^[a-f\d]{7,40}$/iu;

export function shouldShowWebVersionBanner(currentBuildId: string | undefined, response: unknown, dismissedBuildId?: string): boolean {
  if (!currentBuildId?.trim() || !response || typeof response !== "object" || Array.isArray(response)) return false;
  const nextBuildId = (response as Record<string, unknown>).webBuildId;
  return typeof nextBuildId === "string" && !!nextBuildId.trim()
    && currentBuildId.trim().toLowerCase() !== nextBuildId.trim().toLowerCase()
    && dismissedBuildId?.trim().toLowerCase() !== nextBuildId.trim().toLowerCase();
}

export async function readWebVersionBuildId(
  fetcher: (input: string, init?: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetcher("/api/app/version", { cache: "no-store", signal });
    if (!response.ok) return null;
    const envelope: unknown = await response.json();
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
    const { success, data } = envelope as Record<string, unknown>;
    if (success !== true || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const buildId = (data as Record<string, unknown>).webBuildId;
    return typeof buildId === "string" && GIT_SHA.test(buildId) ? buildId : null;
  } catch {
    return null;
  }
}

export function readDismissedWebBuildId(storage: Pick<Storage, "getItem">): string | undefined {
  try {
    return storage.getItem(DISMISSED_BUILD_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function dismissWebBuildId(storage: Pick<Storage, "setItem">, buildId: string): void {
  try {
    storage.setItem(DISMISSED_BUILD_KEY, buildId);
  } catch {
    // Storage can be unavailable in private browsing. The mounted banner still closes.
  }
}
