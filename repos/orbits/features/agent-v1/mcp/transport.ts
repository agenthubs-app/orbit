/**
 * agent-design AG17 (设计稿 §5.4「传输」): the MCP endpoint — one path that takes POST, each message its own request,
 * no session, no stream. It speaks both eras of the protocol:
 *
 *   2026-07-28   every request names its version in `_meta` and in the `MCP-Protocol-Version` header; `Mcp-Method` (and
 *                `Mcp-Name` for a tool call) mirror the body and must agree with it; `server/discover` describes the server.
 *   2025-11-25   (and the two revisions before it) a client opens with `initialize`; the server answers it and then
 *                serves that client's later requests the same stateless way. No session id is issued.
 *
 * Order of checks on every POST: Origin (a browser page on another origin is refused — DNS rebinding), then the bearer
 * token (401 with the resource-metadata challenge), then the message. A call the connection's scopes do not cover is a
 * 403 `insufficient_scope`, not a tool result, so the client can ask the user for more.
 */
import { emitTrace } from "../observability/trace";
import type { AuthorizationServer } from "./auth/server";
import { insufficientScopeChallenge, unauthorizedChallenge } from "./auth/server";
import type { McpAddresses } from "./auth/config";
import type { AgentConnection, ConnectionService } from "./connections";
import { toolsFor } from "./scopes";
import { TOOL_DEFINITIONS } from "./tools/definitions";
import { runTool, type ToolDeps } from "./tools/run";

export const MODERN_VERSIONS = ["2026-07-28"] as const;
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const SUPPORTED_VERSIONS: readonly string[] = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER = "io.modelcontextprotocol/serverInfo";
const SERVER_INFO = { name: "Orbit", title: "Orbit", version: "1.0.0" };
const INSTRUCTIONS = "Orbit holds the user's contacts, memos, to-dos and schedule. You can read the kinds of record the user allowed and propose changes. A proposed change is never applied by you: Orbit returns a confirm_url, and the user confirms in Orbit.";

const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json" };
/** The largest request body the endpoint reads (a proposal of ten operations with long memo texts fits well inside). */
export const MAX_REQUEST_BYTES = 256 * 1024;

export interface McpEndpointDeps {
  addresses: (request: Request) => McpAddresses | null;
  auth: Pick<AuthorizationServer, "check">;
  connections: Pick<ConnectionService, "recordCall">;
  /** The connection's account still exists, is the one it was authorised for and is open (not being deleted). */
  accountOpen: (connection: AgentConnection) => Promise<boolean>;
  tools: ToolDeps;
}

type JsonRpcId = string | number | null;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { headers: { ...JSON_HEADERS, ...headers }, status });
}

const rpcError = (id: JsonRpcId | undefined, code: number, message: string, data?: unknown) => ({ error: { code, message, ...(data !== undefined ? { data } : {}) }, ...(id !== undefined ? { id } : {}), jsonrpc: "2.0" });
const rpcResult = (id: JsonRpcId, result: unknown) => ({ id, jsonrpc: "2.0", result });

function unauthorized(addresses: McpAddresses, reason: "missing" | "invalid"): Response {
  // No record content in this body, whatever the request asked for.
  return json(401, { error: reason === "missing" ? "unauthorized" : "invalid_token", error_description: "Authorization is required. See the resource metadata named in WWW-Authenticate." }, { "www-authenticate": unauthorizedChallenge(addresses, reason) });
}

/** `Mcp-Name: =?base64?…?=` carries a name that is not plain ASCII. */
function decodeHeaderValue(value: string): string {
  const match = /^=\?base64\?(.*)\?=$/u.exec(value);
  return match ? Buffer.from(match[1], "base64").toString("utf8") : value;
}

/** Which era the message speaks and which version; or the error to answer with. */
function negotiate(request: Request, message: { method: string; params?: Record<string, unknown>; id?: JsonRpcId }): { era: "modern" | "legacy"; version: string } | { status: number; code: number; message: string; data?: unknown } {
  const header = request.headers.get("mcp-protocol-version");
  const meta = (message.params?._meta ?? null) as Record<string, unknown> | null;
  const inBody = meta && typeof meta[META_VERSION] === "string" ? (meta[META_VERSION] as string) : null;
  if (message.method === "initialize") {
    const requested = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
    // A legacy client names the newest version it speaks; it gets that one when this server has it, else the newest legacy one.
    return { era: "legacy", version: (LEGACY_VERSIONS as readonly string[]).includes(requested) ? requested : LEGACY_VERSIONS[0] };
  }
  if (inBody !== null) {
    if (header === null) return { code: -32020, message: "Header mismatch: MCP-Protocol-Version header is required", status: 400 };
    if (header !== inBody) return { code: -32020, message: `Header mismatch: MCP-Protocol-Version header value '${header}' does not match body value '${inBody}'`, status: 400 };
    if (!(MODERN_VERSIONS as readonly string[]).includes(inBody)) return { code: -32022, data: { requested: inBody, supported: [...SUPPORTED_VERSIONS] }, message: "Unsupported protocol version", status: 400 };
    const method = request.headers.get("mcp-method");
    if (method === null || method !== message.method) return { code: -32020, message: `Header mismatch: Mcp-Method header ${method === null ? "is required" : `value '${method}' does not match body value '${message.method}'`}`, status: 400 };
    if (message.method === "tools/call") {
      const name = request.headers.get("mcp-name");
      const inParams = typeof message.params?.name === "string" ? message.params.name : "";
      if (name === null || decodeHeaderValue(name) !== inParams) return { code: -32020, message: `Header mismatch: Mcp-Name header ${name === null ? "is required" : `value '${decodeHeaderValue(name)}' does not match body value '${inParams}'`}`, status: 400 };
    }
    return { era: "modern", version: inBody };
  }
  // No version in the body: a legacy client after its handshake (the header names the agreed version; absent means 2025-03-26).
  if (header === null) return { era: "legacy", version: "2025-03-26" };
  if ((LEGACY_VERSIONS as readonly string[]).includes(header)) return { era: "legacy", version: header };
  if ((MODERN_VERSIONS as readonly string[]).includes(header)) return { code: -32020, message: `Header mismatch: the request body carries no ${META_VERSION}`, status: 400 };
  return { code: -32022, data: { requested: header, supported: [...SUPPORTED_VERSIONS] }, message: "Unsupported protocol version", status: 400 };
}

export function createMcpEndpoint(deps: McpEndpointDeps) {
  return {
    /** GET and DELETE: there is no stream to open and no session to end. */
    methodNotAllowed(): Response {
      return json(405, rpcError(undefined, -32601, "This MCP endpoint takes POST only."), { allow: "POST" });
    },

    async post(request: Request): Promise<Response> {
      const addresses = deps.addresses(request);
      if (!addresses) return json(503, rpcError(undefined, -32603, "External connections are not set up on this server."));

      const origin = request.headers.get("origin");
      if (origin !== null && origin !== addresses.issuer) return json(403, rpcError(undefined, -32600, "This origin may not call the MCP endpoint."));

      const access = await deps.auth.check(request.headers.get("authorization"), addresses);
      if (access.ok === false) return unauthorized(addresses, access.reason);
      const { connection } = access;
      if (!(await deps.accountOpen(connection))) return unauthorized(addresses, "invalid");

      let message: { jsonrpc?: unknown; method?: unknown; params?: unknown; id?: unknown };
      if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return json(413, rpcError(null, -32600, "The request is too large."));
      try {
        const raw = await request.text();
        if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return json(413, rpcError(null, -32600, "The request is too large."));
        message = JSON.parse(raw) as typeof message;
      } catch {
        return json(400, rpcError(null, -32700, "The request body is not JSON."));
      }
      if (typeof message !== "object" || message === null || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        return json(400, rpcError(null, -32600, "One JSON-RPC 2.0 request or notification per POST."));
      }
      const isNotification = message.id === undefined;
      const id = (isNotification ? null : message.id) as JsonRpcId;
      const params = typeof message.params === "object" && message.params !== null && !Array.isArray(message.params) ? (message.params as Record<string, unknown>) : undefined;
      const method = message.method;

      const agreed = negotiate(request, { method, ...(params ? { params } : {}) });
      if ("status" in agreed) return json(agreed.status, rpcError(id, agreed.code, agreed.message, agreed.data));
      const { era, version } = agreed;
      const done = (result: Record<string, unknown>) => json(200, rpcResult(id, era === "modern" ? { resultType: "complete", ...result } : result));
      const log = async (tool: string, outcome: string, count: number) => {
        emitTrace({ connectionId: connection.id, count, era, outcome, protocolVersion: version, scopes: connection.scopes, tool, type: "mcp.call" });
        await deps.connections.recordCall(connection, { count, outcome, protocolVersion: version, tool });
      };

      if (isNotification) return new Response(null, { headers: { "cache-control": "no-store" }, status: 202 });

      switch (method) {
        case "initialize":
          emitTrace({ connectionId: connection.id, protocolVersion: version, requested: params?.protocolVersion ?? null, type: "mcp.initialize" });
          return done({ capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS, protocolVersion: version, serverInfo: SERVER_INFO });
        case "server/discover":
          return done({ _meta: { [META_SERVER]: SERVER_INFO }, capabilities: { tools: {} }, instructions: INSTRUCTIONS, supportedVersions: [...SUPPORTED_VERSIONS] });
        case "ping":
          return done({});
        case "tools/list": {
          // Only what this connection's scopes cover (设计稿 §5.4): a read-only connection never sees propose_change.
          const tools = toolsFor(connection.scopes).map((name) => TOOL_DEFINITIONS[name]);
          await log("tools/list", "ok", tools.length);
          return done({ tools });
        }
        case "tools/call": {
          const name = typeof params?.name === "string" ? params.name : "";
          const outcome = await runTool(deps.tools, { addresses, args: params?.arguments, connection, name });
          if (outcome.kind === "unknown_tool") {
            await log(name || "(none)", "unknown_tool", 0);
            return json(200, rpcError(id, -32602, `Unknown tool: ${name || "(none)"}`));
          }
          if (outcome.kind === "revoked") return unauthorized(addresses, "invalid");
          if (outcome.kind === "insufficient_scope") {
            await log(name, "insufficient_scope", 0);
            return json(403, rpcError(id, -32003, outcome.message, { error: "insufficient_scope", required_scopes: outcome.scopes }), { "www-authenticate": insufficientScopeChallenge(addresses, outcome.scopes) });
          }
          if (outcome.kind === "tool_error") {
            await log(name, outcome.code, 0);
            return done({ content: [{ text: outcome.message, type: "text" }], isError: true, structuredContent: { error: { code: outcome.code, message: outcome.message } } });
          }
          await log(name, "ok", outcome.count);
          return done({ content: [{ text: JSON.stringify(outcome.payload), type: "text" }], isError: false, structuredContent: outcome.payload });
        }
        default:
          return json(era === "modern" ? 404 : 200, rpcError(id, -32601, `Method not found: ${method}`));
      }
    },
  };
}
