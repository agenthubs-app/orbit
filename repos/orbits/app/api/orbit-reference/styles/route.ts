import {
  readReferenceStyleSheet,
  readReferenceStyleSheetEtag,
} from "../../../(app)/app/orbit-reference-styles";

export const runtime = "nodejs";

const cacheControl = "public, max-age=3600, stale-while-revalidate=86400";

function hasMatchingEtag(request: Request | undefined, etag: string): boolean {
  return (
    request?.headers
      .get("if-none-match")
      ?.split(",")
      .map((value) => value.trim())
      .some((value) => value === etag || value === "*") ?? false
  );
}

export function GET(request?: Request): Response {
  const etag = readReferenceStyleSheetEtag();
  const headers = {
    "Cache-Control": cacheControl,
    ETag: etag,
  };

  if (hasMatchingEtag(request, etag)) {
    return new Response(null, {
      headers,
      status: 304,
    });
  }

  return new Response(readReferenceStyleSheet(), {
    headers: {
      ...headers,
      "Content-Type": "text/css; charset=utf-8",
    },
    status: 200,
  });
}
