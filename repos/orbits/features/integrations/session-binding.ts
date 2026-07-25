import { createHash } from "node:crypto";

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

function cookieValues(cookieHeader: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (name && value) {
      try {
        values.set(name, decodeURIComponent(value));
      } catch {
        return new Map();
      }
    }
  }
  return values;
}

export function integrationSessionBinding(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = cookieValues(cookieHeader);
  for (const name of SESSION_COOKIE_NAMES) {
    const value =
      cookies.get(name) ??
      [...cookies.entries()]
        .filter(([key]) => key.startsWith(`${name}.`))
        .sort(
          ([left], [right]) =>
            Number(left.slice(name.length + 1)) -
            Number(right.slice(name.length + 1)),
        )
        .map(([, chunk]) => chunk)
        .join("");
    if (value) {
      return createHash("sha256").update(value).digest("base64url");
    }
  }
  return null;
}
