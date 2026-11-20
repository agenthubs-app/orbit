import { NextResponse } from "next/server";

import { CONSENT_PAGE_PATH, PROPOSAL_PAGE_PATH } from "../../../features/agent-v1/mcp/auth/config";
import { configuredMcp, type McpServices } from "../../../features/agent-v1/mcp/configured";
import { resolveAuthenticatedApiActor, resolveAuthenticatedApiActorFromSession, type AuthenticatedApiActor } from "./authenticated-actor";

/**
 * agent-design AG17: the MCP services bound to the API layer's identity boundary. A token names a connection; the
 * connection names the sign-in subject it was authorised under; the account is resolved from that subject by the same
 * function a session goes through (no second way to resolve an account).
 */
export function mcpServices(): McpServices | null {
  return configuredMcp({ resolveAccountId: async (userId) => (await resolveAuthenticatedApiActorFromSession({ userId }))?.id ?? null });
}

export const NO_STORE = { "cache-control": "private, no-store" } as const;

export function mcpUnavailableResponse(): Response {
  return NextResponse.json({ error: { code: "SERVICE_UNAVAILABLE", message: "External connections are not set up on this server." }, success: false }, { headers: NO_STORE, status: 503 });
}

/** The signed-in user for the pages' own interfaces (consent, connection list, proposal view): a session, never a token. */
export async function signedInActor(): Promise<(AuthenticatedApiActor & { userId: string }) | null> {
  const actor = await resolveAuthenticatedApiActor();
  return actor?.userId ? (actor as AuthenticatedApiActor & { userId: string }) : null;
}

/**
 * 视觉稿 D8: the one line the sign-in dialog adds when it stands in front of the consent page («Claude 想连接你的
 * Orbit») or a confirm link («有一条修改等你确认»). The client's name is taken only from a request ticket this server
 * signed (a link someone made up gets no name); a confirm link says nothing about the proposal before sign-in.
 */
export type SignInNote = { kind: "connect"; clientName: string } | { kind: "proposal" };

export async function signInNoteFor(next: string | null | undefined, origin: string): Promise<SignInNote | null> {
  if (!next || !next.startsWith("/app/")) return null;
  const url = new URL(next, origin);
  if (url.pathname.startsWith(`${PROPOSAL_PAGE_PATH}/`)) return { kind: "proposal" };
  if (url.pathname !== CONSENT_PAGE_PATH) return null;
  const services = mcpServices();
  const addresses = services?.addresses(new Request(origin));
  if (!services || !addresses) return null;
  const pending = await services.auth.readTicket(url.searchParams.get("request") ?? "", addresses);
  return pending ? { clientName: pending.clientName, kind: "connect" } : null;
}

/** The origin a server component's request came to (the eval and local development address themselves by it). */
export async function requestOrigin(): Promise<string | null> {
  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return null;
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/u.test(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

export function signInRequiredResponse(): Response {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to Orbit first." }, success: false }, { headers: NO_STORE, status: 401 });
}
