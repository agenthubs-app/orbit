import { NextResponse, type NextRequest } from "next/server";

function normalizeOrbitLanguage(value: string | null) {
  return value === "en" ? "en" : value === "zh" ? "zh" : null;
}

export function proxy(request: NextRequest) {
  const language = normalizeOrbitLanguage(request.nextUrl.searchParams.get("lang"));
  const requestHeaders = new Headers(request.headers);

  if (language) {
    requestHeaders.set("x-orbit-lang", language);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (language) {
    response.cookies.set("orbit-lang", language, {
      maxAge: 31536000,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: "/app/:path*",
};
