/**
 * agent-design AG17 (设计稿 §5.4「传输与授权」; CONVENTIONS §2 `ORBIT_MCP_BASE_URL`): where the MCP endpoint and Orbit's own
 * authorization server live, and the keys they sign with.
 *
 * The endpoints are outside `/api/` (`/connect`, `/oauth/authorize`, `/oauth/token`, `/.well-known/…`): the proxy's session
 * check covers `/api/` and `/app/` only, so a client without a browser session reaches the handler, which answers with
 * the challenge the MCP authorization spec asks for instead of the proxy's plain 401.
 *
 * The public address comes from configuration, never from the request, in production: tokens are bound to it as their
 * audience. Under the agent eval (and local development) the request's own origin stands in when nothing is configured.
 *
 * The short address (approved draft D11): the address the user pastes into Claude or Codex — `<origin>/connect` — is the
 * MCP endpoint itself, not an alias of another one. A client takes the address it was given as the resource, checks that
 * the resource metadata names the same address, and asks for tokens for it (RFC 9728 §3.3, RFC 8707); an alias would
 * be a second resource with tokens of its own. So there is one endpoint, `/connect`, and every token's audience is it.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MCP_PATH = "/connect";
/** What settings › 外部 AI 助手 shows for the user to copy: the endpoint above. */
export const CONNECT_PATH = MCP_PATH;
export const AUTHORIZE_PATH = "/oauth/authorize";
export const TOKEN_PATH = "/oauth/token";
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
export const CONSENT_PAGE_PATH = "/app/settings/agent-connections/authorize";
export const PROPOSAL_PAGE_PATH = "/app/agent/proposals";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
export const AUTHORIZATION_REQUEST_TTL_SECONDS = 10 * 60;

export interface McpAddresses {
  /** The authorization server's issuer: the deployment's origin. */
  issuer: string;
  /** The MCP endpoint; access tokens carry it as their audience (RFC 8707). */
  resource: string;
  authorizeUrl: string;
  tokenUrl: string;
  resourceMetadataUrl: string;
}

type Env = Record<string, string | undefined>;

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** The configured public origin, or null (then production refuses and the eval uses the request's origin). */
export function configuredOrigin(env: Env = process.env): string | null {
  return originOf(env.ORBIT_MCP_BASE_URL) ?? originOf(env.AUTH_URL) ?? originOf(env.NEXTAUTH_URL);
}

export function addressesFor(origin: string): McpAddresses {
  return {
    authorizeUrl: `${origin}${AUTHORIZE_PATH}`,
    issuer: origin,
    resource: `${origin}${MCP_PATH}`,
    // The path-suffixed form (RFC 9728 §3.1) is the one clients try first for a resource with a path.
    resourceMetadataUrl: `${origin}${RESOURCE_METADATA_PATH}${MCP_PATH}`,
    tokenUrl: `${origin}${TOKEN_PATH}`,
  };
}

/** The addresses for this request; null when the deployment has no public address configured (production only). */
export function mcpAddresses(request: Request, env: Env = process.env): McpAddresses | null {
  const configured = configuredOrigin(env);
  if (configured) return addressesFor(configured);
  if (env.ORBIT_AGENT_EVAL === "1" || env.NODE_ENV !== "production") return addressesFor(requestOriginOf(request));
  return null;
}

/**
 * The origin the browser or client used (eval and local development only). Next gives a route handler `request.url`
 * on its own host name (localhost) and a page only the Host header; both go by the Host header, so a request ticket
 * signed by the authorize route is readable by the consent page however the address was written.
 */
function requestOriginOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host && /^[A-Za-z0-9.\-[\]:]+$/u.test(host) ? `${url.protocol}//${host}` : url.origin;
}

/** The deployment secret the keys below are derived from; null when none is set (then nothing is issued or accepted). */
export function mcpSecret(env: Env = process.env): string | null {
  const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? "";
  return secret.length >= 16 ? secret : null;
}

/** A 32-byte key for one purpose, derived from the deployment secret (never the secret itself). */
export function derivedKey(secret: string, purpose: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`orbit-mcp\u0000${purpose}\u0000${secret}`).digest());
}

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("base64url");

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export function hmac(key: Uint8Array, value: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

export function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** RFC 8707 resource values that mean this server: the endpoint itself, with or without a trailing slash, any letter case in scheme and host. */
export function isThisResource(value: string | null | undefined, addresses: McpAddresses): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.hash || url.search) return false;
    return `${url.origin}${url.pathname.replace(/\/+$/u, "")}` === addresses.resource;
  } catch {
    return false;
  }
}
