import { readReferenceStyleSheet } from "../../../(app)/app/orbit-reference-styles";

export const runtime = "nodejs";

export function GET(): Response {
  return new Response(readReferenceStyleSheet(), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "text/css; charset=utf-8",
    },
    status: 200,
  });
}
