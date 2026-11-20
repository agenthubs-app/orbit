/**
 * agent-design AG17: the simulated external agent (eval/README.md §3.1 `mcp`, §3.4 `mcp_paginate`). It behaves as a
 * client the product has never met: it finds the authorization server from the 401 challenge, identifies itself with a
 * recorded client document, walks the authorization-code flow with PKCE (the fixture account, signed in, picks the
 * scopes on Orbit's consent interface), exchanges the code and then calls tools — refreshing its token once on a 401,
 * as real clients do. It never visits the client's redirect address: it only reads the code out of the redirect.
 *
 * What goes into the case log: every tool call and its answer (`mcp.request` / `mcp.response`), the steps of the
 * connection (`mcp.connect`) and the tool list (`mcp.tools`). Never a token, a code or a cookie.
 */
import { createHash, randomBytes } from "node:crypto";

import type { CaseLog } from "./trace-log";

export const CLAUDE_DOCUMENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
export const CLAUDE_CODE_DOCUMENT = "https://claude.ai/oauth/claude-code-client-metadata";

/** Which recorded document a fixture connection uses: «Claude» the hosted one; anything else the command-line one (a loopback redirect, as Codex-like clients use). */
export function clientProfileFor(fixtureClient: string): { clientId: string; redirectUri: string; era: "modern" | "legacy" } {
  return /^claude$/iu.test(fixtureClient.trim())
    ? { clientId: CLAUDE_DOCUMENT, era: "modern", redirectUri: "https://claude.ai/api/mcp/auth_callback" }
    : { clientId: CLAUDE_CODE_DOCUMENT, era: "legacy", redirectUri: `http://127.0.0.1:${49152 + Math.floor(Math.random() * 16000)}/callback` };
}

export interface McpCallResult {
  status: number;
  /** The tool result's structuredContent, when the call got that far. */
  result: Record<string, any> | null;
  isError: boolean | null;
  /** JSON-RPC or OAuth error body, when there is one. */
  error: Record<string, any> | null;
  wwwAuthenticate: string | null;
  refreshed: boolean;
}

interface Tokens {
  access: string;
  refresh: string;
}

const s256 = (value: string) => createHash("sha256").update(value).digest("base64url");

export class ExternalAgent {
  private tokens: Tokens | null = null;
  private tokenUrl = "";
  private resource = "";
  private rpcId = 0;
  private initialized = false;
  connectionId: string | null = null;
  tools: string[] = [];

  constructor(private readonly options: { baseUrl: string; log: CaseLog; name: string; clientId: string; redirectUri: string; era: "modern" | "legacy" }) {}

  /** The address a user pastes into Claude or Codex (approved draft D11): the endpoint itself, `/connect`. */
  private get mcpUrl(): string {
    return `${this.options.baseUrl}/connect`;
  }

  /** The whole product flow. `sessionCookie` is the fixture account's web session (the user signing in to Orbit to agree). */
  async connect(sessionCookie: string, scopes: readonly string[]): Promise<void> {
    const { log, name } = this.options;
    const steps: Record<string, unknown>[] = [];
    // 1. An unauthorised call: the challenge says where the resource metadata is.
    const first = await fetch(this.mcpUrl, { body: JSON.stringify({ id: 0, jsonrpc: "2.0", method: "tools/list" }), headers: { accept: "application/json, text/event-stream", "content-type": "application/json" }, method: "POST" });
    const challenge = first.headers.get("www-authenticate") ?? "";
    steps.push({ challenge, status: first.status, step: "call without a token" });
    const metadataUrl = /resource_metadata="([^"]+)"/u.exec(challenge)?.[1];
    if (first.status !== 401 || !metadataUrl) throw new Error(`expected a 401 with resource_metadata, got ${first.status} ${challenge}`);
    // 2. Resource metadata, then the authorization server's.
    const resourceMeta = (await (await fetch(metadataUrl)).json()) as { resource: string; authorization_servers: string[] };
    this.resource = resourceMeta.resource;
    const serverMeta = (await (await fetch(`${resourceMeta.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json()) as Record<string, any>;
    steps.push({ authorizationServer: resourceMeta.authorization_servers[0], cimd: serverMeta.client_id_metadata_document_supported, pkce: serverMeta.code_challenge_methods_supported, resource: this.resource, step: "metadata" });
    this.tokenUrl = String(serverMeta.token_endpoint);
    // 3. The authorization request: PKCE, the resource, read scopes only (propose is the user's choice on the page).
    const verifier = randomBytes(32).toString("base64url");
    const state = randomBytes(8).toString("hex");
    const authorize = new URL(String(serverMeta.authorization_endpoint));
    for (const [key, value] of Object.entries({ client_id: this.options.clientId, code_challenge: s256(verifier), code_challenge_method: "S256", redirect_uri: this.options.redirectUri, resource: this.resource, response_type: "code", scope: scopes.filter((scope) => scope.endsWith(":read")).join(" "), state })) authorize.searchParams.set(key, value);
    const toConsent = await fetch(authorize, { redirect: "manual" });
    const consentLocation = toConsent.headers.get("location") ?? "";
    const ticket = consentLocation ? new URL(consentLocation, this.options.baseUrl).searchParams.get("request") : null;
    steps.push({ consentPage: consentLocation ? new URL(consentLocation, this.options.baseUrl).pathname : null, status: toConsent.status, step: "authorization request" });
    if (!ticket) throw new Error(`the authorization request was not accepted (${toConsent.status} ${await toConsent.text().catch(() => "")})`);
    // 4. The user, signed in to Orbit, sees who asks and picks the scopes.
    const shown = await fetch(`${this.options.baseUrl}/api/agent/connections/authorize?request=${encodeURIComponent(ticket)}`, { headers: { cookie: sessionCookie } });
    const shownBody = (await shown.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const decided = await fetch(`${this.options.baseUrl}/api/agent/connections/authorize`, { body: JSON.stringify({ decision: "allow", request: ticket, scopes }), headers: { "content-type": "application/json", cookie: sessionCookie }, method: "POST" });
    const decidedBody = (await decided.json().catch(() => null)) as { data?: { redirectTo?: string } } | null;
    steps.push({ granted: [...scopes], shown: shownBody?.data ?? null, status: decided.status, step: "consent (the signed-in user)" });
    const redirectTo = decidedBody?.data?.redirectTo;
    if (!redirectTo) throw new Error(`consent was not accepted (${decided.status})`);
    // 5. The code comes back on the client's redirect address; the address itself is never visited.
    const back = new URL(redirectTo);
    const code = back.searchParams.get("code");
    if (!code || back.searchParams.get("state") !== state || `${back.origin}${back.pathname}` !== `${new URL(this.options.redirectUri).origin}${new URL(this.options.redirectUri).pathname}`) throw new Error("the redirect did not carry a code for this request");
    steps.push({ iss: back.searchParams.get("iss"), redirectHost: back.host, step: "redirect with a code (not visited)" });
    // 6. Code + verifier → tokens.
    const token = await fetch(this.tokenUrl, { body: new URLSearchParams({ client_id: this.options.clientId, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: this.options.redirectUri, resource: this.resource }), headers: { "content-type": "application/x-www-form-urlencoded" }, method: "POST" });
    const tokenBody = (await token.json()) as Record<string, any>;
    steps.push({ expiresIn: tokenBody.expires_in ?? null, scope: tokenBody.scope ?? null, status: token.status, step: "token" });
    if (token.status !== 200) throw new Error(`the token request failed (${token.status} ${tokenBody.error ?? ""})`);
    this.tokens = { access: String(tokenBody.access_token), refresh: String(tokenBody.refresh_token) };
    this.connectionId = JSON.parse(Buffer.from(this.tokens.access.split(".")[1], "base64url").toString("utf8")).sub as string;
    log.push({ as: name, client: this.options.clientId, connectionId: this.connectionId, era: this.options.era, steps, type: "mcp.connect" });
    this.tools = await this.listTools();
  }

  private async refresh(): Promise<boolean> {
    if (!this.tokens) return false;
    const response = await fetch(this.tokenUrl, { body: new URLSearchParams({ client_id: this.options.clientId, grant_type: "refresh_token", refresh_token: this.tokens.refresh, resource: this.resource }), headers: { "content-type": "application/x-www-form-urlencoded" }, method: "POST" });
    const body = (await response.json().catch(() => ({}))) as Record<string, any>;
    this.options.log.push({ as: this.options.name, error: body.error ?? null, status: response.status, type: "mcp.refresh" });
    if (response.status !== 200) return false;
    this.tokens = { access: String(body.access_token), refresh: String(body.refresh_token) };
    return true;
  }

  private async post(method: string, params: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> | null; wwwAuthenticate: string | null }> {
    const headers: Record<string, string> = { accept: "application/json, text/event-stream", authorization: `Bearer ${this.tokens?.access ?? ""}`, "content-type": "application/json" };
    const message: Record<string, unknown> = { id: (this.rpcId += 1), jsonrpc: "2.0", method };
    if (this.options.era === "modern") {
      headers["mcp-protocol-version"] = "2026-07-28";
      headers["mcp-method"] = method;
      if (method === "tools/call" && typeof params.name === "string") headers["mcp-name"] = params.name;
      message.params = { ...params, _meta: { "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "agent-eval-external-client", version: "1" }, "io.modelcontextprotocol/protocolVersion": "2026-07-28" } };
    } else {
      if (method !== "initialize") headers["mcp-protocol-version"] = "2025-11-25";
      message.params = params;
    }
    const response = await fetch(this.mcpUrl, { body: JSON.stringify(message), headers, method: "POST" });
    const text = await response.text();
    let body: Record<string, any> | null = null;
    try {
      body = text ? (JSON.parse(text) as Record<string, any>) : null;
    } catch {
      body = { text: text.slice(0, 2000) };
    }
    return { body, status: response.status, wwwAuthenticate: response.headers.get("www-authenticate") };
  }

  /** One request; a 401 is answered with one refresh and one retry (what a real client does when its hour is up). */
  private async send(method: string, params: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> | null; wwwAuthenticate: string | null; refreshed: boolean }> {
    if (this.options.era === "legacy" && !this.initialized && method !== "initialize") {
      const init = await this.post("initialize", { capabilities: {}, clientInfo: { name: "agent-eval-external-client", version: "1" }, protocolVersion: "2025-11-25" });
      this.initialized = init.status === 200;
      this.options.log.push({ as: this.options.name, protocolVersion: init.body?.result?.protocolVersion ?? null, status: init.status, type: "mcp.handshake" });
    }
    const first = await this.post(method, params);
    if (first.status !== 401 || !(await this.refresh())) return { ...first, refreshed: false };
    return { ...(await this.post(method, params)), refreshed: true };
  }

  async listTools(): Promise<string[]> {
    const response = await this.send("tools/list", {});
    const tools = ((response.body?.result?.tools ?? []) as { name: string; annotations?: Record<string, unknown>; title?: string }[]);
    this.options.log.push({ as: this.options.name, status: response.status, tools: tools.map((tool) => ({ annotations: tool.annotations ?? null, name: tool.name, title: tool.title ?? null })), type: "mcp.tools" });
    return tools.map((tool) => tool.name);
  }

  async call(tool: string, args: Record<string, unknown>, meta: { step: number; shownArgs?: unknown; page?: number } = { step: -1 }): Promise<McpCallResult> {
    const { log, name } = this.options;
    log.push({ args, as: name, ...(meta.page ? { page: meta.page } : {}), shownArgs: meta.shownArgs ?? args, step: meta.step, tool, type: "mcp.request" });
    const response = await this.send("tools/call", { arguments: args, name: tool });
    const rpcResult = response.body?.result as { structuredContent?: Record<string, any>; isError?: boolean; content?: { text?: string }[] } | undefined;
    const result: McpCallResult = {
      // A JSON-RPC error object, or (for a 401, which is not a JSON-RPC answer) the whole body.
      error: response.body?.error && typeof response.body.error === "object" ? response.body.error : rpcResult ? null : response.body,
      isError: rpcResult ? Boolean(rpcResult.isError) : null,
      refreshed: response.refreshed,
      result: rpcResult?.structuredContent ?? null,
      status: response.status,
      wwwAuthenticate: response.wwwAuthenticate,
    };
    log.push({ as: name, error: result.error, isError: result.isError, ...(meta.page ? { page: meta.page } : {}), refreshed: result.refreshed, result: result.result, status: result.status, step: meta.step, tool, type: "mcp.response", wwwAuthenticate: result.wwwAuthenticate });
    return result;
  }
}
