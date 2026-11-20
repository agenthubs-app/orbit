// 2026-11-21 活动图片读取：private Blob → 公开响应。对象名内容寻址（内容变了地址就变），所以可让浏览器与 CDN 长缓存。
import { get } from "@vercel/blob";

import { eventCoverObjectFromRoute } from "../../../../../features/events/host/cover-image";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ scope: string; file: string }> }) {
  const { scope, file } = await context.params;
  const name = eventCoverObjectFromRoute(scope, file);
  if (!name) return NOT_FOUND();
  try {
    const result = await get(name, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return NOT_FOUND();
    return new Response(result.stream, {
      headers: {
        "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "content-type": "image/webp",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
