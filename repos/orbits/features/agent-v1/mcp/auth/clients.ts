/**
 * agent-design AG17 (设计稿 §5.4「客户端登记」): clients identify themselves with a Client ID Metadata Document — their
 * `client_id` is an HTTPS URL whose JSON says who they are and where they may be sent back to. There is no dynamic
 * registration. Only the documents listed here are read at all (the trust policy); anything else is refused before
 * any request leaves the server.
 *
 * Under the agent eval nothing is fetched: the eval hook hands back the recorded copy
 * (docs/epics/agent-design/eval/world/mcp-client-documents.json). In production the listed URL is fetched with a
 * time limit and a size limit, redirects refused, and kept for a few minutes.
 */
export interface AllowedClient {
  /** The exact `client_id` URL. */
  clientId: string;
  /** The name Orbit shows for it (the document's own `client_name` is self-asserted and not shown). */
  name: string;
}

/**
 * The allow list. Verified 2026-11-19: both documents exist at these URLs. ChatGPT and Codex are added here once their
 * registration method is confirmed in the hook-up with the real clients (设计稿 §5.4「逐个客户端要单独核实的事」).
 */
export const ALLOWED_CLIENTS: readonly AllowedClient[] = [
  { clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata", name: "Claude" },
  { clientId: "https://claude.ai/oauth/claude-code-client-metadata", name: "Claude Code" },
];

export interface ClientDocument {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

export interface KnownClient {
  clientId: string;
  name: string;
  redirectUris: string[];
}

export type ClientDocumentLoader = (clientId: string) => Promise<unknown>;

export const CLIENT_DOCUMENT_MAX_BYTES = 64 * 1024;
export const CLIENT_DOCUMENT_TIMEOUT_MS = 5_000;
const CACHE_MS = 5 * 60 * 1000;

export function allowedClient(clientId: string, allowed: readonly AllowedClient[] = ALLOWED_CLIENTS): AllowedClient | null {
  return allowed.find((entry) => entry.clientId === clientId) ?? null;
}

/** The document as this server reads it; null when it is not a valid document for that `client_id`. */
export function readClientDocument(clientId: string, value: unknown): ClientDocument | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const doc = value as Record<string, unknown>;
  // The document's own client_id must be the URL it was read from, exactly.
  if (doc.client_id !== clientId) return null;
  if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0 || doc.redirect_uris.some((uri) => typeof uri !== "string" || !uri)) return null;
  // Public clients only: nothing here holds a client secret.
  if (doc.token_endpoint_auth_method !== undefined && doc.token_endpoint_auth_method !== "none") return null;
  return { client_id: clientId, redirect_uris: [...(doc.redirect_uris as string[])], ...(typeof doc.client_name === "string" ? { client_name: doc.client_name } : {}) };
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/**
 * Whether the requested redirect address is one the document lists. Exact comparison; a loopback address
 * (http://127.0.0.1, http://[::1], http://localhost) is compared with its port ignored, because a native client binds
 * a different port each time (RFC 8252 §7.3).
 */
export function redirectUriAllowed(requested: string, registered: readonly string[]): boolean {
  if (registered.includes(requested)) return true;
  let url: URL;
  try {
    url = new URL(requested);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password || url.hash) return false;
  return registered.some((candidate) => {
    try {
      const listed = new URL(candidate);
      return listed.protocol === "http:" && listed.hostname === url.hostname && listed.pathname === url.pathname && listed.search === url.search;
    } catch {
      return false;
    }
  });
}

/** The production loader: one GET of the listed URL, no redirects, a time limit and a size limit, JSON only. */
export const fetchClientDocument: ClientDocumentLoader = async (clientId) => {
  const response = await fetch(clientId, { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(CLIENT_DOCUMENT_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`client document answered ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > CLIENT_DOCUMENT_MAX_BYTES) throw new Error("client document is too large");
  const text = await response.text();
  if (Buffer.byteLength(text) > CLIENT_DOCUMENT_MAX_BYTES) throw new Error("client document is too large");
  return JSON.parse(text) as unknown;
};

/**
 * The recorded copy the agent eval provides instead of a fetch. `undefined` outside the eval; under the eval a URL with
 * no recorded copy reads as `null` (refused), so the eval never fetches.
 */
function evalClientDocument(clientId: string): unknown | undefined {
  const hook = (globalThis as { __orbitAgentEval?: { clientDocument?: (clientId: string) => unknown } }).__orbitAgentEval;
  return typeof hook?.clientDocument === "function" ? hook.clientDocument(clientId) ?? null : undefined;
}

export interface ClientRegistry {
  /** The client behind a `client_id`; null when it is not on the allow list or its document is not valid. */
  resolve(clientId: string): Promise<KnownClient | null>;
}

export function createClientRegistry(options: { allowed?: readonly AllowedClient[]; load?: ClientDocumentLoader; now?: () => number } = {}): ClientRegistry {
  const allowed = options.allowed ?? ALLOWED_CLIENTS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; client: KnownClient }>();
  return {
    async resolve(clientId) {
      const entry = allowedClient(clientId, allowed);
      // Not on the list: refused here, before anything is fetched.
      if (!entry) return null;
      const cached = cache.get(clientId);
      if (cached && now() - cached.at < CACHE_MS) return cached.client;
      let raw: unknown;
      try {
        const recorded = options.load ? undefined : evalClientDocument(clientId);
        raw = recorded !== undefined ? recorded : await (options.load ?? fetchClientDocument)(clientId);
      } catch {
        return null;
      }
      const document = readClientDocument(clientId, raw);
      if (!document) return null;
      const client: KnownClient = { clientId, name: entry.name, redirectUris: document.redirect_uris };
      cache.set(clientId, { at: now(), client });
      return client;
    },
  };
}
