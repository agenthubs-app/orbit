import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed display keyset, not a durable event-consumption watermark. */
export function createRelationshipReadCursor(secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new Error("READ_CURSOR_SECRET_MISSING");
  const sign = (value: string) => createHmac("sha256", secret).update("relationship-read:v1:").update(value).digest();
  return {
    encode(scope: string, at: string, id: string) {
      const payload = Buffer.from(JSON.stringify({ scope, at, id })).toString("base64url");
      return `${payload}.${sign(payload).toString("base64url")}`;
    },
    decode(token: string | null | undefined, scope: string): { at: string; id: string } | null {
      if (!token) return null;
      try {
        if (token.length > 4096) throw Error();
        const [payload, signature, ...rest] = token.split(".");
        if (!payload || !signature || rest.length) throw Error();
        const expected = sign(payload), provided = Buffer.from(signature, "base64url");
        if (provided.toString("base64url") !== signature || expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw Error();
        const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (value.scope !== scope || typeof value.at !== "string" || value.at.length > 64 || !Number.isFinite(Date.parse(value.at)) || typeof value.id !== "string" || !value.id || value.id.length > 512) throw Error();
        return { at: value.at, id: value.id };
      } catch { throw new Error("RELATIONSHIP_CURSOR_INVALID"); }
    },
  };
}
