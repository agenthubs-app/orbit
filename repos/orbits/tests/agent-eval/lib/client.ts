/**
 * The runner's stand-in for the Web and App clients: a signed Auth.js session cookie
 * (RULES 5.4, as scripts/verify-session-cookie.ts) and the same HTTP endpoints the
 * clients call. Every request and response is written to the case log as http.*.
 */
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

import { CaseLog, safeHeaders } from "./trace-log";

export const SESSION_COOKIE = "authjs.session-token";

export async function signSessionCookie(input: { secret: string; userId: string; email: string; name: string }): Promise<string> {
  const token = await encode({
    maxAge: 60 * 24 * 60 * 60,
    salt: SESSION_COOKIE,
    secret: input.secret,
    token: { authenticatedAt: Date.now(), email: input.email, name: input.name, sub: input.userId },
  });
  return `${SESSION_COOKIE}=${token}`;
}

export interface HttpResult {
  status: number;
  body: any;
  requestSeqRef: Record<string, unknown>;
}

export class EvalClient {
  constructor(
    private readonly baseUrl: string,
    private readonly log: CaseLog,
    public cookie: string,
    public client: "web" | "app" | "app_old" = "web",
  ) {}

  async request(method: string, path: string, body?: unknown, extra: { purpose?: string; headers?: Record<string, string> } = {}): Promise<HttpResult> {
    const requestId = randomUUID();
    const headers: Record<string, string> = { accept: "application/json", cookie: this.cookie, ...(extra.headers ?? {}) };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.client !== "web") headers["user-agent"] = "OrbitApp/agent-eval";
    const ref = this.log.push({ body: body ?? null, client: this.client, headers: safeHeaders(headers), httpId: requestId, method, path, purpose: extra.purpose ?? null, type: "http.request" });
    const started = Date.now();
    let status = 0;
    let parsed: any = null;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { body: body === undefined ? undefined : JSON.stringify(body), headers, method });
      status = response.status;
      const text = await response.text();
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = { text: text.slice(0, 4000) };
      }
      this.log.push({ body: parsed, client: this.client, durationMs: Date.now() - started, headers: safeHeaders(response.headers), httpId: requestId, path, status, type: "http.response" });
    } catch (error) {
      this.log.push({ client: this.client, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error), httpId: requestId, path, status: 0, type: "http.response" });
    }
    return { body: parsed, requestSeqRef: ref, status };
  }
}
