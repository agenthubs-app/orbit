#!/usr/bin/env node

const { createReadStream } = require("node:fs");
const { readdir, realpath, stat } = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const { extname, resolve, sep } = require("node:path");

const API_PREFIX = "/api/";
const ASSET_PROXY_PREFIXES = ["/orbit-covers/", "/orbit-demo-assets/"];
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function failConfiguration(message) {
  process.stderr.write(`phoneweb configuration error: ${message}\n`);
  process.exitCode = 1;
}

function upstreamUrl(value) {
  if (!value) throw new Error("PHONEWEB_UPSTREAM is required.");
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("PHONEWEB_UPSTREAM must be an HTTP(S) origin without credentials or a path.");
  }
  return url;
}

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-length": body.byteLength,
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

function pathnameFromRawUrl(rawUrl) {
  const rawPath = rawUrl.split("?", 1)[0] || "/";
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    decoded.split("/").some((part) => part === "..")
  ) {
    return null;
  }
  try {
    return decodeURIComponent(new URL(rawUrl, "http://phoneweb.invalid").pathname);
  } catch {
    return null;
  }
}

function isApi(pathname) {
  return pathname === "/api" || pathname.startsWith(API_PREFIX);
}

function assetProxyPrefix(pathname) {
  return ASSET_PROXY_PREFIXES.find((prefix) => pathname.startsWith(prefix));
}

function forwardedHeaders(req) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      headers[name] = value;
    }
  }
  const host = req.headers.host ?? "";
  if (host) {
    headers.host = host;
    headers["x-forwarded-host"] = host;
  }
  headers["x-forwarded-proto"] = req.socket.encrypted ? "https" : "http";
  return headers;
}

function responseHeaders(upstreamHeaders, req, upstream) {
  const headers = {};
  for (const [name, value] of Object.entries(upstreamHeaders)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      headers[name] = value;
    }
  }

  if (typeof headers.location === "string") {
    try {
      const location = new URL(headers.location, upstream);
      if (
        location.origin === upstream.origin ||
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1"
      ) {
        const proto = req.socket.encrypted ? "https" : "http";
        headers.location = `${proto}://${req.headers.host}${location.pathname}${location.search}${location.hash}`;
      }
    } catch {
      // Relative locations already target the browser-facing origin.
    }
  }

  headers["x-content-type-options"] = "nosniff";
  return headers;
}

function proxy(req, res, upstream) {
  const transport = upstream.protocol === "https:" ? https : http;
  const outgoing = transport.request({
    headers: forwardedHeaders(req),
    hostname: upstream.hostname,
    method: req.method,
    path: req.url,
    port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
    protocol: upstream.protocol
  }, (incoming) => {
    res.writeHead(
      incoming.statusCode ?? 502,
      responseHeaders(incoming.headers, req, upstream)
    );
    incoming.pipe(res);
  });

  outgoing.once("error", () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    json(res, 502, {
      error: {
        code: "PHONEWEB_UPSTREAM_UNAVAILABLE",
        message: "API service is unavailable."
      },
      success: false
    });
  });
  req.pipe(outgoing);
}

async function fileInsideRoot(root, candidate) {
  try {
    const path = await realpath(candidate);
    if (path !== root && !path.startsWith(`${root}${sep}`)) return null;
    const details = await stat(path);
    return details.isFile() ? { path, size: details.size } : null;
  } catch {
    return null;
  }
}

function sendFile(req, res, file) {
  const contentType = MIME_TYPES.get(extname(file.path).toLowerCase()) ?? "application/octet-stream";
  res.writeHead(200, {
    "cache-control": contentType.startsWith("text/html") ? "no-store" : "public, max-age=3600",
    "content-length": file.size,
    "content-type": contentType,
    "x-content-type-options": "nosniff"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file.path).pipe(res);
}

async function findDynamicRouteFiles(root) {
  const routes = [];
  async function walk(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith("(") || entry.name.startsWith("+")) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(resolve(directory, entry.name), relative);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".html") || !relative.includes("[")) continue;
      const pattern = relative.slice(0, -".html".length).split("/");
      routes.push({
        literalCount: pattern.filter(segment => !segment.startsWith("[")).length,
        path: resolve(root, relative),
        pattern
      });
    }
  }
  await walk(root);
  return routes.sort((left, right) =>
    right.literalCount - left.literalCount || right.pattern.length - left.pattern.length
  );
}

function matchesDynamicRoute(pattern, requestSegments) {
  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index];
    if (/^\[\.\.\.[^\]]+\]$/u.test(segment)) {
      return requestSegments.length > index;
    }
    if (requestSegments[index] === undefined) return false;
    if (!/^\[[^\]]+\]$/u.test(segment) && segment !== requestSegments[index]) return false;
  }
  return requestSegments.length === pattern.length;
}

async function serveStatic(req, res, root, pathname, dynamicRouteFiles) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const requested = await fileInsideRoot(root, resolve(root, relativePath));
  if (requested) {
    sendFile(req, res, requested);
    return;
  }

  for (const routeFile of [
    resolve(root, `${relativePath}.html`),
    resolve(root, relativePath, "index.html")
  ]) {
    const exportedRoute = await fileInsideRoot(root, routeFile);
    if (exportedRoute) {
      sendFile(req, res, exportedRoute);
      return;
    }
  }

  const requestedExtension = extname(relativePath).toLowerCase();
  if (MIME_TYPES.has(requestedExtension)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const requestSegments = relativePath.split("/").filter(Boolean);
  const dynamicRoute = dynamicRouteFiles.find(route =>
    matchesDynamicRoute(route.pattern, requestSegments)
  );
  if (dynamicRoute) {
    const exportedRoute = await fileInsideRoot(root, dynamicRoute.path);
    if (exportedRoute) {
      sendFile(req, res, exportedRoute);
      return;
    }
  }

  if (requestedExtension) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const index = await fileInsideRoot(root, resolve(root, "index.html"));
  if (!index) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Web export is missing index.html");
    return;
  }
  sendFile(req, res, index);
}

async function main() {
  let upstream;
  try {
    upstream = upstreamUrl(process.env.PHONEWEB_UPSTREAM);
  } catch (error) {
    failConfiguration(error instanceof Error ? error.message : String(error));
    return;
  }

  const host = process.env.PHONEWEB_HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.PHONEWEB_PORT ?? "32111");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    failConfiguration("PHONEWEB_PORT must be an integer between 0 and 65535.");
    return;
  }

  let staticRoot;
  let dynamicRouteFiles;
  try {
    staticRoot = await realpath(
      resolve(process.env.PHONEWEB_STATIC_DIR?.trim() || resolve(__dirname, "..", "dist"))
    );
    dynamicRouteFiles = await findDynamicRouteFiles(staticRoot);
  } catch {
    failConfiguration("PHONEWEB_STATIC_DIR must point to a readable Web export.");
    return;
  }

  const server = http.createServer((req, res) => {
    const pathname = pathnameFromRawUrl(req.url ?? "/");
    if (pathname === null) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("Invalid request path");
      return;
    }

    if (isApi(pathname)) {
      proxy(req, res, upstream);
      return;
    }

    if (assetProxyPrefix(pathname)) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { allow: "GET, HEAD" });
        res.end();
        return;
      }
      proxy(req, res, upstream);
      return;
    }

    void serveStatic(req, res, staticRoot, pathname, dynamicRouteFiles).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("Static file service failed");
      } else {
        res.destroy();
      }
    });
  });

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = address && typeof address === "object" ? address.port : port;
    process.stdout.write(`phoneweb listening on http://${host}:${actualPort} upstream=${upstream.origin}\n`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main();
