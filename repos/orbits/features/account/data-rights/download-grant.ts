import { createHmac, timingSafeEqual } from "node:crypto";

const FIVE_MINUTES = 5 * 60_000;

function signature(secret: string, actorId: string, exportId: string, until: number): string {
  return createHmac("sha256", secret).update(JSON.stringify(["account-export-v1", actorId, exportId, until])).digest("base64url");
}

export function createAccountExportDownloadGrant(input: {
  actorId: string;
  exportId: string;
  secret: string;
  now: Date;
  requestUrl: string;
  publicBaseUrl?: string;
}): URL {
  if (!input.secret || !input.actorId || !input.exportId) throw new Error("Download grant unavailable");
  const requestOrigin = new URL(input.requestUrl).origin;
  const publicOrigin = input.publicBaseUrl ? new URL(input.publicBaseUrl).origin : requestOrigin;
  if (!/^https:\/\//.test(publicOrigin) && !/^http:\/\/localhost(?::\d+)?$/.test(publicOrigin)) {
    throw new Error("Download origin unavailable");
  }
  const until = input.now.getTime() + FIVE_MINUTES;
  const url = new URL(`/api/account/exports/${encodeURIComponent(input.exportId)}/download`, publicOrigin);
  url.searchParams.set("until", String(until));
  url.searchParams.set("sig", signature(input.secret, input.actorId, input.exportId, until));
  return url;
}

export function verifyAccountExportDownloadGrant(input: {
  actorId: string;
  exportId: string;
  secret: string;
  url: URL;
  now: Date;
}): boolean {
  const untilText = input.url.searchParams.get("until");
  const provided = input.url.searchParams.get("sig");
  if (!input.secret || !untilText || !/^\d{13}$/.test(untilText) || !provided || !/^[A-Za-z0-9_-]{43}$/.test(provided)) return false;
  const until = Number(untilText);
  if (!Number.isSafeInteger(until) || input.now.getTime() >= until || until - input.now.getTime() > FIVE_MINUTES) return false;
  const expected = Buffer.from(signature(input.secret, input.actorId, input.exportId, until));
  const received = Buffer.from(provided);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
