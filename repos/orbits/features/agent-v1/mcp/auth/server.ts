/**
 * agent-design AG17 (设计稿 §5.4「授权」): Orbit's own authorization server for the MCP endpoint — OAuth 2.1 with PKCE,
 * public clients known by their Client ID Metadata Document, tokens bound to the MCP endpoint as their audience.
 *
 *   GET  /oauth/authorize   checks the request, then sends the browser to Orbit's consent page with a signed ticket
 *   POST (consent, signed in) the user picks scopes → a one-time code goes back to the client's redirect address
 *   POST /oauth/token       code + PKCE verifier → access token (1 hour) and refresh token; refresh rotates every time
 *
 * What is never accepted: a request without PKCE S256, a redirect address the client's document does not list, a
 * `resource` that is not this MCP endpoint, a code or refresh token presented a second time (that ends the connection).
 * An access token says which connection it is for and nothing about the user; the connection is read on every call, so
 * revoking takes effect at once.
 */
import { jwtVerify, SignJWT } from "jose";

import { isActive, type AgentConnection, type ConnectionService } from "../connections";
import { GRANT_COLLECTION, type McpRecords } from "../records";
import { MCP_SCOPES, parseScopes, type McpScope } from "../scopes";
import type { ClientRegistry } from "./clients";
import { redirectUriAllowed } from "./clients";
import { ACCESS_TOKEN_TTL_SECONDS, AUTHORIZATION_CODE_TTL_MS, AUTHORIZATION_REQUEST_TTL_SECONDS, CONSENT_PAGE_PATH, derivedKey, isThisResource, randomToken, REFRESH_TOKEN_TTL_MS, sameText, sha256, type McpAddresses } from "./config";

export interface AuthorizationRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  /** What the client asked for (the consent page pre-selects these; the user decides). */
  scopes: McpScope[];
  state?: string;
}

export type AuthorizeOutcome =
  /** The request cannot be trusted enough to send the browser anywhere: shown as a plain error, never redirected. */
  | { kind: "refused"; status: 400; error: string; description: string }
  /** The client and its redirect address are known: errors go back to the client (RFC 6749 §4.1.2.1). */
  | { kind: "redirect"; location: string }
  | { kind: "consent"; location: string; ticket: string; request: AuthorizationRequest };

interface CodeGrant {
  kind: "code";
  accountId: string;
  userId: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: McpScope[];
  locale: AgentConnection["locale"];
  expiresAt: string;
  status: "issued" | "redeemed";
  connectionId?: string;
  version: number;
}

interface RefreshGrant {
  kind: "refresh";
  accountId: string;
  connectionId: string;
  expiresAt: string;
  status: "active" | "rotated";
  version: number;
}

export interface TokenResponse {
  status: number;
  body: Record<string, unknown>;
}

export type AccessCheck = { ok: true; connection: AgentConnection } | { ok: false; reason: "missing" | "invalid" };

export interface AuthorizationServer {
  authorize(params: URLSearchParams, addresses: McpAddresses): Promise<AuthorizeOutcome>;
  /** The request a consent ticket stands for; null when it is not one of ours or is older than ten minutes. */
  readTicket(ticket: string, addresses: McpAddresses): Promise<AuthorizationRequest | null>;
  /** The signed-in user's answer on the consent page. Returns where the browser goes next (the client's redirect address). */
  decide(input: { ticket: string; decision: "allow" | "deny"; scopes: readonly string[]; account: { accountId: string; userId: string }; locale?: string }, addresses: McpAddresses): Promise<{ ok: true; redirectTo: string } | { ok: false; reason: "TICKET_INVALID" | "SCOPES_INVALID" }>;
  token(form: URLSearchParams, addresses: McpAddresses): Promise<TokenResponse>;
  /** Checks a bearer token: ours, for this endpoint, not expired, and its connection still active. */
  check(authorization: string | null, addresses: McpAddresses): Promise<AccessCheck>;
}

export interface AuthorizationServerDeps {
  secret: string;
  records: McpRecords;
  connections: ConnectionService;
  clients: ClientRegistry;
  now: () => string;
  /** Called when a spent code or refresh token comes back: the connection is already revoked; its open proposals are voided here. */
  onRevoked?: (connection: AgentConnection) => Promise<void>;
}

const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/u;
const TICKET_TYPE = "orbit-mcp-authz+jwt";
const ACCESS_TOKEN_TYPE = "at+jwt";

function withParams(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

const oauthError = (status: number, error: string, description: string): TokenResponse => ({ body: { error, error_description: description }, status });

export function createAuthorizationServer(deps: AuthorizationServerDeps): AuthorizationServer {
  const { records, connections } = deps;
  const ticketKey = derivedKey(deps.secret, "authorization-request");
  const accessKey = derivedKey(deps.secret, "access-token");
  const seconds = () => Math.floor(Date.parse(deps.now()) / 1000);

  async function issue(connection: AgentConnection, addresses: McpAddresses): Promise<TokenResponse> {
    const at = deps.now();
    const issuedAt = seconds();
    const accessToken = await new SignJWT({ client_id: connection.clientId, scope: connection.scopes.join(" ") })
      .setProtectedHeader({ alg: "HS256", typ: ACCESS_TOKEN_TYPE })
      .setIssuer(addresses.issuer)
      .setAudience(addresses.resource)
      .setSubject(connection.id)
      .setJti(randomToken(12))
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(accessKey);
    const refreshToken = `ort_${randomToken(32)}`;
    const grant: RefreshGrant = { accountId: connection.accountId, connectionId: connection.id, expiresAt: new Date(Date.parse(at) + REFRESH_TOKEN_TTL_MS).toISOString(), kind: "refresh", status: "active", version: 1 };
    await records.insert(GRANT_COLLECTION, `refresh:${sha256(refreshToken)}`, connection.accountId, grant, at, { sourceId: connection.id });
    return { body: { access_token: accessToken, expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken, scope: connection.scopes.join(" "), token_type: "Bearer" }, status: 200 };
  }

  async function endConnection(connectionId: string, reason: "code_reuse" | "refresh_reuse"): Promise<void> {
    const revoked = await connections.revoke({ connectionId, reason });
    if (revoked) await deps.onRevoked?.(revoked.connection);
  }

  async function redeemCode(form: URLSearchParams, addresses: McpAddresses): Promise<TokenResponse> {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    if (!code) return oauthError(400, "invalid_request", "code is required.");
    if (!PKCE_VALUE.test(verifier)) return oauthError(400, "invalid_grant", "code_verifier is required (PKCE).");
    const resource = form.get("resource");
    if (resource !== null && !isThisResource(resource, addresses)) return oauthError(400, "invalid_target", "resource must be this MCP endpoint.");
    const id = `code:${sha256(code)}`;
    const current = await records.get<CodeGrant>(GRANT_COLLECTION, id);
    if (!current || current.value.kind !== "code") return oauthError(400, "invalid_grant", "The authorization code is not valid.");
    const grant = current.value;
    if (grant.status !== "issued") {
      // A code presented twice: whoever holds the tokens of the first exchange loses them (OAuth 2.1 §4.1.3).
      if (grant.connectionId) await endConnection(grant.connectionId, "code_reuse");
      return oauthError(400, "invalid_grant", "The authorization code was already used.");
    }
    if (Date.parse(deps.now()) >= Date.parse(grant.expiresAt)) return oauthError(400, "invalid_grant", "The authorization code has expired.");
    if (form.get("client_id") !== grant.clientId || form.get("redirect_uri") !== grant.redirectUri) return oauthError(400, "invalid_grant", "client_id and redirect_uri must be the ones the code was issued for.");
    if (!sameText(sha256(verifier), grant.codeChallenge)) return oauthError(400, "invalid_grant", "code_verifier does not match the code_challenge.");
    // The code is spent first: of two exchanges of one code at the same moment only one gets this far.
    const redeemed: CodeGrant = { ...grant, status: "redeemed", version: grant.version + 1 };
    if (!(await records.replace(GRANT_COLLECTION, id, grant.accountId, current, redeemed, deps.now()))) return oauthError(400, "invalid_grant", "The authorization code was already used.");
    // One connection per client per account (approved draft, board 3): the same client authorised again changes the
    // connection it has — what the user picked this time replaces what it had, lower as well as higher.
    const existing = await connections.findActive(grant.accountId, grant.clientId);
    const changed = existing ? await connections.regrant({ connectionId: existing.id, locale: grant.locale, scopes: grant.scopes, userId: grant.userId }) : null;
    const connection = changed ?? (await connections.create({ accountId: grant.accountId, clientId: grant.clientId, clientName: grant.clientName, locale: grant.locale, scopes: grant.scopes, userId: grant.userId }));
    // Which connection the code stood for, so that presenting it again ends that connection.
    const spent = await records.get<CodeGrant>(GRANT_COLLECTION, id);
    if (spent) await records.replace(GRANT_COLLECTION, id, grant.accountId, spent, { ...spent.value, connectionId: connection.id, version: spent.value.version + 1 }, deps.now());
    return issue(connection, addresses);
  }

  async function refresh(form: URLSearchParams, addresses: McpAddresses): Promise<TokenResponse> {
    const token = form.get("refresh_token") ?? "";
    if (!token) return oauthError(400, "invalid_request", "refresh_token is required.");
    const resource = form.get("resource");
    if (resource !== null && !isThisResource(resource, addresses)) return oauthError(400, "invalid_target", "resource must be this MCP endpoint.");
    const id = `refresh:${sha256(token)}`;
    const current = await records.get<RefreshGrant>(GRANT_COLLECTION, id);
    if (!current || current.value.kind !== "refresh") return oauthError(400, "invalid_grant", "The refresh token is not valid.");
    const grant = current.value;
    if (grant.status !== "active") {
      // A rotated refresh token came back: someone else may hold the new one, so the whole connection ends.
      await endConnection(grant.connectionId, "refresh_reuse");
      return oauthError(400, "invalid_grant", "The refresh token was already used; this connection has been ended.");
    }
    const connection = await connections.get(grant.connectionId);
    if (!isActive(connection) || Date.parse(deps.now()) >= Date.parse(grant.expiresAt)) return oauthError(400, "invalid_grant", "The refresh token is no longer valid.");
    const clientId = form.get("client_id");
    if (clientId !== null && clientId !== connection.clientId) return oauthError(400, "invalid_grant", "The refresh token belongs to another client.");
    if (!(await records.replace(GRANT_COLLECTION, id, grant.accountId, current, { ...grant, status: "rotated", version: grant.version + 1 }, deps.now()))) {
      await endConnection(grant.connectionId, "refresh_reuse");
      return oauthError(400, "invalid_grant", "The refresh token was already used; this connection has been ended.");
    }
    return issue(connection, addresses);
  }

  const server: AuthorizationServer = {
    async authorize(params, addresses) {
      const refused = (description: string, error = "invalid_request"): AuthorizeOutcome => ({ description, error, kind: "refused", status: 400 });
      const clientId = params.get("client_id") ?? "";
      const redirectUri = params.get("redirect_uri") ?? "";
      if (!clientId || !redirectUri) return refused("client_id and redirect_uri are required.");
      const client = await deps.clients.resolve(clientId);
      if (!client) return refused("This client is not one Orbit accepts.", "invalid_client");
      if (!redirectUriAllowed(redirectUri, client.redirectUris)) return refused("redirect_uri is not one this client registered.");
      const state = params.get("state") ?? undefined;
      const back = (error: string, description: string): AuthorizeOutcome => ({ kind: "redirect", location: withParams(redirectUri, { error, error_description: description, iss: addresses.issuer, state }) });
      if (params.get("response_type") !== "code") return back("unsupported_response_type", "response_type must be code.");
      const challenge = params.get("code_challenge") ?? "";
      if (params.get("code_challenge_method") !== "S256" || !PKCE_VALUE.test(challenge)) return back("invalid_request", "PKCE is required: code_challenge with code_challenge_method=S256.");
      if (!isThisResource(params.get("resource"), addresses)) return back("invalid_target", "resource must be this MCP endpoint.");
      // offline_access asks for a refresh token; one is always issued, so the word is accepted and not stored.
      const { scopes, unknown } = parseScopes((params.get("scope") ?? "").split(/\s+/u).filter((word) => word !== "offline_access"));
      if (unknown.length) return back("invalid_scope", `Unknown scope: ${unknown.join(" ")}.`);
      const request: AuthorizationRequest = { clientId, clientName: client.name, codeChallenge: challenge, redirectUri, scopes, ...(state !== undefined ? { state } : {}) };
      const issuedAt = seconds();
      const ticket = await new SignJWT({ request })
        .setProtectedHeader({ alg: "HS256", typ: TICKET_TYPE })
        .setIssuer(addresses.issuer)
        .setAudience(addresses.authorizeUrl)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + AUTHORIZATION_REQUEST_TTL_SECONDS)
        .sign(ticketKey);
      return { kind: "consent", location: withParams(`${addresses.issuer}${CONSENT_PAGE_PATH}`, { request: ticket }), request, ticket };
    },

    async readTicket(ticket, addresses) {
      try {
        const verified = await jwtVerify(ticket, ticketKey, { algorithms: ["HS256"], audience: addresses.authorizeUrl, currentDate: new Date(deps.now()), issuer: addresses.issuer, typ: TICKET_TYPE });
        const request = verified.payload.request as AuthorizationRequest | undefined;
        return request && typeof request.clientId === "string" && typeof request.redirectUri === "string" && typeof request.codeChallenge === "string" ? { ...request, scopes: parseScopes(request.scopes).scopes } : null;
      } catch {
        return null;
      }
    },

    async decide(input, addresses) {
      const request = await server.readTicket(input.ticket, addresses);
      if (!request) return { ok: false, reason: "TICKET_INVALID" };
      if (input.decision === "deny") return { ok: true, redirectTo: withParams(request.redirectUri, { error: "access_denied", iss: addresses.issuer, state: request.state }) };
      // The user's own choice on the page decides what is granted: any scopes of the catalogue, at least one.
      const { scopes, unknown } = parseScopes(input.scopes);
      if (unknown.length || !scopes.length) return { ok: false, reason: "SCOPES_INVALID" };
      const at = deps.now();
      const code = `orc_${randomToken(32)}`;
      const grant: CodeGrant = {
        accountId: input.account.accountId,
        clientId: request.clientId,
        clientName: request.clientName,
        codeChallenge: request.codeChallenge,
        expiresAt: new Date(Date.parse(at) + AUTHORIZATION_CODE_TTL_MS).toISOString(),
        kind: "code",
        locale: input.locale === "ja" || input.locale === "en" ? input.locale : "zh",
        redirectUri: request.redirectUri,
        scopes,
        status: "issued",
        userId: input.account.userId,
        version: 1,
      };
      await records.insert(GRANT_COLLECTION, `code:${sha256(code)}`, grant.accountId, grant, at);
      return { ok: true, redirectTo: withParams(request.redirectUri, { code, iss: addresses.issuer, state: request.state }) };
    },

    async token(form, addresses) {
      const grantType = form.get("grant_type");
      if (grantType === "authorization_code") return redeemCode(form, addresses);
      if (grantType === "refresh_token") return refresh(form, addresses);
      return oauthError(400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
    },

    async check(authorization, addresses) {
      const match = /^Bearer\s+(\S+)$/iu.exec(authorization ?? "");
      if (!match) return { ok: false, reason: "missing" };
      try {
        // Ours (the signature), for this endpoint (the audience), from this issuer, not expired. A session cookie,
        // a token of another service or one minted for another audience fails here and is never passed on.
        const verified = await jwtVerify(match[1], accessKey, { algorithms: ["HS256"], audience: addresses.resource, currentDate: new Date(deps.now()), issuer: addresses.issuer, typ: ACCESS_TOKEN_TYPE });
        const connection = typeof verified.payload.sub === "string" ? await connections.get(verified.payload.sub) : null;
        // The signature alone is not enough: the connection is read every time, so revoking works at once.
        return isActive(connection) ? { connection, ok: true } : { ok: false, reason: "invalid" };
      } catch {
        return { ok: false, reason: "invalid" };
      }
    },
  };
  return server;
}

export const SCOPES_SUPPORTED: readonly string[] = MCP_SCOPES;

/** RFC 9728: the protected resource's own description, naming Orbit as its authorization server. */
export function protectedResourceMetadata(addresses: McpAddresses): Record<string, unknown> {
  return {
    authorization_servers: [addresses.issuer],
    bearer_methods_supported: ["header"],
    resource: addresses.resource,
    resource_name: "Orbit",
    scopes_supported: SCOPES_SUPPORTED,
  };
}

/** RFC 8414: the authorization server's description. `none` and the CIMD flag are what Claude checks before using its document as client_id. */
export function authorizationServerMetadata(addresses: McpAddresses): Record<string, unknown> {
  return {
    authorization_endpoint: addresses.authorizeUrl,
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    issuer: addresses.issuer,
    response_types_supported: ["code"],
    scopes_supported: SCOPES_SUPPORTED,
    token_endpoint: addresses.tokenUrl,
    token_endpoint_auth_methods_supported: ["none"],
  };
}

/** What a client is told to ask for (设计稿 §5.4「默认只请求只读」): reading, and looking at its own proposals. Proposing is the user's tick on the consent page. */
export const DEFAULT_REQUEST_SCOPES: readonly string[] = MCP_SCOPES.filter((scope) => !scope.endsWith(":propose"));

/**
 * The 401 challenge (MCP authorization spec): where to find the resource metadata, and the scopes to ask for (without
 * it a client asks for everything in scopes_supported); `invalid_token` when a token was sent.
 */
export function unauthorizedChallenge(addresses: McpAddresses, reason: "missing" | "invalid"): string {
  return `Bearer ${reason === "invalid" ? 'error="invalid_token", error_description="The access token is missing, expired or revoked", ' : ""}resource_metadata="${addresses.resourceMetadataUrl}", scope="${DEFAULT_REQUEST_SCOPES.join(" ")}"`;
}

/** The 403 challenge: the scopes this one operation needs, all at once. */
export function insufficientScopeChallenge(addresses: McpAddresses, scopes: readonly string[]): string {
  return `Bearer error="insufficient_scope", scope="${scopes.join(" ")}", resource_metadata="${addresses.resourceMetadataUrl}", error_description="This connection was not granted ${scopes.join(" ")}"`;
}
