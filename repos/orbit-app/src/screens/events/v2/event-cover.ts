// 2026-11-20 活动图片（coverUrl）：服务端给绝对 URL，或站内路径（`/orbit-covers/…`）——站内路径按当前接口地址补全，App 的 Image 才能读。
import { useOrbitApiBaseUrl } from "../../../api/ApiBaseUrlProvider";
import { normalizeEventCoverUrl } from "../../../api/compute/event-cover";

export function coverUri(coverUrl: string | null | undefined, baseUrl: string | null | undefined): string | null {
  // Same acceptance rule as the server (https:// or a site path); anything else is no image.
  const value = normalizeEventCoverUrl(coverUrl);
  if (!value) return null;
  try {
    return new URL(value, baseUrl ?? undefined).toString();
  } catch {
    return null;
  }
}

/** The cover as an Image source uri (null = no image: keep the emoji card). */
export function useCoverUri(coverUrl: string | null | undefined): string | null {
  const { baseUrl } = useOrbitApiBaseUrl();
  return coverUri(coverUrl, baseUrl);
}
