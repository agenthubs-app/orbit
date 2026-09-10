import { createServer } from "node:http";
import { runtimeOrigin, type CompletionRuntimeFixture } from "./completion-runtime-fixture";

const id = "([A-Za-z0-9:_-]{1,256})";
const v2 = "/api/contact-drafts/business-card/batches/v2";
const legacy = "/api/contact-drafts/business-card/batches";
const routes: Array<{ methods: string[]; pattern: RegExp; boundary: string; operation: string }> = [
  { methods: ["GET"], pattern: /^\/api\/auth\/(csrf|session|providers)$/, boundary: "next-auth", operation: "forward" },
  { methods: ["POST"], pattern: /^\/api\/auth\/callback\/credentials$/, boundary: "next-auth", operation: "forward" },
  { methods: ["POST"], pattern: /^\/api\/auth\/mobile\/credentials$/, boundary: "next-mobile-auth", operation: "forward" },
  { methods: ["POST"], pattern: /^\/api\/auth\/password-reset\/(request|confirm)$/, boundary: "captured-mail", operation: "password" },
  { methods: ["GET", "POST"], pattern: new RegExp(`^${v2}$`), boundary: "injected-ocr", operation: "collection" },
  { methods: ["GET"], pattern: new RegExp(`^${v2}/${id}(?:\\?view=summary)?$`), boundary: "injected-ocr", operation: "detail" },
  { methods: ["POST"], pattern: new RegExp(`^${v2}/${id}/(finalize|cancel)$`), boundary: "injected-ocr", operation: "batch-action" },
  { methods: ["PUT"], pattern: new RegExp(`^${v2}/${id}/items/${id}/content$`), boundary: "injected-ocr", operation: "upload" },
  { methods: ["GET"], pattern: new RegExp(`^${v2}/${id}/items/${id}/image$`), boundary: "injected-ocr", operation: "image" },
  { methods: ["POST"], pattern: new RegExp(`^${v2}/${id}/items/${id}/(replace|exclude|confirm|manual-entry|skip|retry)$`), boundary: "injected-ocr", operation: "item-action" },
  { methods: ["GET", "POST"], pattern: new RegExp(`^${legacy}$`), boundary: "legacy-captured-ocr", operation: "legacy-collection" },
  { methods: ["GET"], pattern: new RegExp(`^${legacy}/${id}$`), boundary: "legacy-captured-ocr", operation: "legacy-detail" },
  { methods: ["POST"], pattern: new RegExp(`^${legacy}/${id}/finish$`), boundary: "legacy-captured-ocr", operation: "legacy-finish" },
  { methods: ["POST"], pattern: new RegExp(`^${legacy}/${id}/items/${id}/(confirm|skip|retry)$`), boundary: "legacy-captured-ocr", operation: "legacy-item-action" },
  { methods: ["GET"], pattern: new RegExp(`^${legacy}/${id}/items/${id}/image$`), boundary: "legacy-captured-ocr", operation: "legacy-image" },
  { methods: ["GET"], pattern: new RegExp(`^/api/events/${id}/experience$`), boundary: "next-http", operation: "forward" },
  { methods: ["PUT"], pattern: new RegExp(`^/api/events/${id}/experience/draft$`), boundary: "next-http", operation: "forward" },
  { methods: ["POST"], pattern: new RegExp(`^/api/events/${id}/experience/(preview|publish)$`), boundary: "next-http", operation: "forward" },
  { methods: ["GET"], pattern: new RegExp(`^/api/events/${id}/registration\\?questions=false$`), boundary: "next-http", operation: "forward" },
  { methods: ["POST"], pattern: new RegExp(`^/api/events/${id}/registration(?:/cancel)?$`), boundary: "next-http", operation: "forward" },
  { methods: ["GET", "PUT"], pattern: new RegExp(`^/api/events/${id}/operations/admin$`), boundary: "next-http", operation: "forward" },
  { methods: ["GET", "PATCH"], pattern: new RegExp(`^/api/contacts/${id}$`), boundary: "next-http", operation: "forward" },
  { methods: ["GET", "PATCH"], pattern: new RegExp(`^/api/tasks/${id}$`), boundary: "next-http", operation: "forward" },
  { methods: ["GET", "POST"], pattern: /^\/api\/ai\/conversations\/sessions$/, boundary: "next-http", operation: "forward" },
  { methods: ["GET", "DELETE"], pattern: new RegExp(`^/api/ai/conversations/sessions/${id}$`), boundary: "next-http", operation: "forward" },
];

export function selectRuntimeRoute(method: string, path: string) {
  if (path.length > 1024 || /[\\\r\n]/.test(path) || path.includes("..")) throw new Error("ROUTE_REJECTED");
  // Only the canonical ID separator may be encoded. Never decode twice or turn
  // an encoded path separator into routing authority.
  const decoded = path.replace(/%3a/gi, ":");
  if (decoded.includes("%")) throw new Error("ROUTE_REJECTED");
  for (const route of routes) {
    const match = route.pattern.exec(decoded);
    if (match && route.methods.includes(method)) return { ...route, params: match.slice(1) };
  }
  throw new Error("ROUTE_REJECTED");
}

export function assertRuntimeRedirect(response: Response, origin: string) {
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location && new URL(location, origin).origin !== origin) {
    const target = new URL(location, origin);
    throw new Error(`CROSS_ORIGIN_REDIRECT_${target.protocol === "http:" ? "HTTP" : "OTHER"}_${target.hostname === "127.0.0.1" ? "LOOPBACK" : "OTHER"}_${target.port || "DEFAULT"}_FROM_${new URL(origin).port}`);
  }
}

export async function runtimeFetch(origin: string, path: string, init: RequestInit = {}) {
  runtimeOrigin(origin);
  selectRuntimeRoute(init.method ?? "GET", path);
  const response = await fetch(`${origin}${path}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(45000) });
  assertRuntimeRedirect(response, origin);
  return response;
}

export async function startCompletionHttp(fixture: CompletionRuntimeFixture, dispatch: (request: Request, route: ReturnType<typeof selectRuntimeRoute>) => Promise<Response>) {
  runtimeOrigin(fixture.origin);
  let origin = "";
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (incoming.headers.host !== new URL(origin).host) throw new Error("ROUTE_REJECTED");
      if (incoming.headers.origin && incoming.headers.origin !== origin && incoming.headers.origin !== fixture.origin) throw new Error("ROUTE_REJECTED");
      const route = selectRuntimeRoute(incoming.method ?? "", incoming.url ?? "");
      const chunks: Buffer[] = []; let size = 0;
      if (Number(incoming.headers["content-length"] ?? 0) > 12 * 1024 * 1024) { outgoing.writeHead(413).end(); return; }
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 12 * 1024 * 1024) { outgoing.writeHead(413).end(); return; }
        chunks.push(Buffer.from(chunk));
      }
      const headers = new Headers();
      // No caller-controlled forwarding identity, actor, upstream URL or Host.
      for (const name of ["cookie", "content-type", "origin", "if-match", "x-auth-return-redirect"]) {
        const value = incoming.headers[name]; if (typeof value === "string") headers.set(name, value);
      }
      const method = incoming.method!;
      const request = new Request(`${origin}${incoming.url}`, { method, headers, body: method === "GET" ? undefined : new Uint8Array(Buffer.concat(chunks)) });
      const response = route.operation === "forward" ? await runtimeFetch(fixture.origin, incoming.url!, { method, headers, body: method === "GET" ? undefined : await request.arrayBuffer() }) : await dispatch(request, route);
      outgoing.statusCode = response.status;
      for (const [name, value] of response.headers) if (!["set-cookie", "transfer-encoding", "connection", "content-length", "content-encoding"].includes(name)) outgoing.setHeader(name, value);
      const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      outgoing.setHeader("x-orbit-fixture-boundary", route.boundary);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (error instanceof Error && /^(CROSS_ORIGIN_REDIRECT_[A-Z0-9_]+|INVALID_ORIGIN|ROUTE_REJECTED)$/.test(error.message)) fixture.nextDiagnostics.add(`HTTP_${error.message}`);
      else fixture.nextDiagnostics.add("HTTP_ADAPTER_EXCEPTION");
      if (!outgoing.headersSent) outgoing.writeHead(400, { "content-type": "application/json" }); outgoing.end('{"success":false,"error":{"code":"FIXTURE_HTTP_REJECTED"}}');
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 60000;
  server.on("timeout", (socket) => socket.destroy());
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", () => done()); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("HTTP_START_FAILED");
  origin = `http://127.0.0.1:${address.port}`;
  fixture.resources.unshift({ name: "http", close: () => new Promise<void>((done, fail) => { server.close((error) => error ? fail(error) : done()); server.closeAllConnections(); }) });
  return { origin };
}
