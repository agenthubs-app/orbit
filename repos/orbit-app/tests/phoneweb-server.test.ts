import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import test from "node:test";

const serverScript = new URL("../scripts/phoneweb-server.cjs", import.meta.url);

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  server.close();
  await once(server, "close");
}

async function startPhoneweb(input: {
  staticDir: string;
  upstream: string;
}): Promise<{ baseUrl: string; child: ChildProcessWithoutNullStreams }> {
  const child = spawn(process.execPath, [serverScript.pathname], {
    env: {
      ...process.env,
      PHONEWEB_HOST: "127.0.0.1",
      PHONEWEB_PORT: "0",
      PHONEWEB_STATIC_DIR: input.staticDir,
      PHONEWEB_UPSTREAM: input.upstream
    },
    stdio: "pipe"
  });

  const baseUrl = await new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`phoneweb start timeout: ${stderr}`)), 5_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`phoneweb exited before listening (${code}): ${stderr}`));
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const match = chunk.match(/phoneweb listening on (http:\/\/[^\s]+)/u);
      if (!match?.[1]) return;
      clearTimeout(timer);
      resolve(match[1]);
    });
  });

  return { baseUrl, child };
}

async function stopPhoneweb(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}

async function rawGet(baseUrl: string, path: string): Promise<{ body: string; status: number }> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const outgoing = request({
      host: url.hostname,
      method: "GET",
      path,
      port: Number(url.port)
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.once("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        status: incoming.statusCode ?? 0
      }));
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

test("phoneweb server handles SPA, static, API, browser cookies, and asset proxy boundaries", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "orbit-phoneweb-server-"));
  const staticDir = join(tempRoot, "dist");
  await mkdir(join(staticDir, "assets"), { recursive: true });
  await writeFile(join(staticDir, "index.html"), "<!doctype html><main>orbit-spa</main>");
  await mkdir(join(staticDir, "contacts"), { recursive: true });
  await writeFile(join(staticDir, "contacts", "demo.html"), "<!doctype html><main>orbit-route</main>");
  await writeFile(join(staticDir, "contacts", "[id].html"), "<!doctype html><main>orbit-contact-detail</main>");
  await writeFile(join(staticDir, "[...legacy].html"), "<!doctype html><main>orbit-legacy</main>");
  await writeFile(join(staticDir, "assets", "app.js"), "globalThis.orbitLoaded=true;");
  await writeFile(join(staticDir, "assets", "wa-sqlite-test.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  await writeFile(join(tempRoot, "secret.txt"), "must-not-leak");

  const observed: Array<{
    forwardedHost: string | undefined;
    origin: string | undefined;
    path: string | undefined;
  }> = [];
  const upstream = createServer((incoming, response) => {
    observed.push({
      forwardedHost: incoming.headers["x-forwarded-host"] as string | undefined,
      origin: incoming.headers.origin,
      path: incoming.url
    });
    if (incoming.url === "/api/auth/callback/credentials") {
      response.writeHead(302, {
        location: "/profile",
        "set-cookie": "authjs.session-token=real-secret; Path=/; HttpOnly; SameSite=Lax"
      });
      response.end();
      return;
    }
    if (incoming.url === "/orbit-covers/demo.svg") {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end("<svg></svg>");
      return;
    }
    response.writeHead(418, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "UPSTREAM_TEST" }, success: false }));
  });
  const upstreamPort = await listen(upstream);
  let phoneweb: Awaited<ReturnType<typeof startPhoneweb>> | null = null;
  t.after(async () => {
    if (phoneweb) await stopPhoneweb(phoneweb.child);
    await close(upstream);
    await rm(tempRoot, { force: true, recursive: true });
  });
  phoneweb = await startPhoneweb({
    staticDir,
    upstream: `http://127.0.0.1:${upstreamPort}`
  });

  const deepLink = await fetch(`${phoneweb.baseUrl}/contacts/demo?tab=notes`);
  assert.equal(deepLink.status, 200);
  assert.match(await deepLink.text(), /orbit-route/u);

  const dynamicDeepLink = await fetch(`${phoneweb.baseUrl}/contacts/person.v2?tab=notes`);
  assert.equal(dynamicDeepLink.status, 200);
  assert.match(await dynamicDeepLink.text(), /orbit-contact-detail/u);

  for (const missingAsset of ["/assets/missing.js", "/_expo/static/js/web/missing.js"]) {
    const missing: Response = await fetch(`${phoneweb.baseUrl}${missingAsset}`);
    assert.equal(missing.status, 404);
    assert.doesNotMatch(await missing.text(), /orbit-legacy/u);
  }

  const spaFallback = await fetch(`${phoneweb.baseUrl}/client-only-route`);
  assert.equal(spaFallback.status, 200);
  assert.match(await spaFallback.text(), /orbit-legacy/u);

  const asset = await fetch(`${phoneweb.baseUrl}/assets/app.js`);
  assert.match(asset.headers.get("content-type") ?? "", /javascript/u);
  assert.match(await asset.text(), /orbitLoaded/u);

  // expo-sqlite's web worker streams its wasm; the file must be served as application/wasm.
  const wasm: Response = await fetch(`${phoneweb.baseUrl}/assets/wa-sqlite-test.wasm`);
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get("content-type"), "application/wasm");

  const apiFailure = await fetch(`${phoneweb.baseUrl}/api/missing`);
  assert.equal(apiFailure.status, 418);
  assert.deepEqual(await apiFailure.json(), {
    error: { code: "UPSTREAM_TEST" },
    success: false
  });

  const login = await fetch(`${phoneweb.baseUrl}/api/auth/callback/credentials`, {
    body: new URLSearchParams({ email: "demo@example.test", password: "secret" }),
    headers: { "content-type": "application/x-www-form-urlencoded", origin: phoneweb.baseUrl },
    method: "POST",
    redirect: "manual"
  });
  assert.equal(login.status, 302);
  assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/u);
  assert.equal(login.headers.get("location"), `${phoneweb.baseUrl}/profile`);

  const cover = await fetch(`${phoneweb.baseUrl}/orbit-covers/demo.svg`);
  assert.equal(cover.status, 200);
  assert.match(cover.headers.get("content-type") ?? "", /image\/svg\+xml/u);
  assert.equal(await cover.text(), "<svg></svg>");

  const blockedAssetWrite = await fetch(`${phoneweb.baseUrl}/orbit-demo-assets/demo.png`, {
    method: "POST"
  });
  assert.equal(blockedAssetWrite.status, 405);

  const traversal = await rawGet(phoneweb.baseUrl, "/%2e%2e/secret.txt");
  assert.equal(traversal.status, 400);
  assert.doesNotMatch(traversal.body, /must-not-leak/u);

  assert.equal(observed.some((entry) => entry.path === "/contacts/demo?tab=notes"), false);
  assert.equal(observed.some((entry) => entry.path === "/assets/app.js"), false);
  assert.equal(observed.some((entry) => entry.path === "/orbit-covers/demo.svg"), true);
  const loginRequest = observed.find((entry) => entry.path === "/api/auth/callback/credentials");
  assert.equal(loginRequest?.origin, phoneweb.baseUrl);
  assert.equal(loginRequest?.forwardedHost, new URL(phoneweb.baseUrl).host);
});

test("phoneweb server returns JSON 502 when the configured API upstream is unavailable", async (t) => {
  const tempRoot = await mkdtemp(join(tmpdir(), "orbit-phoneweb-unavailable-"));
  await writeFile(join(tempRoot, "index.html"), "<!doctype html><main>orbit-spa</main>");
  const reserve = createServer();
  const unavailablePort = await listen(reserve);
  await close(reserve);
  let phoneweb: Awaited<ReturnType<typeof startPhoneweb>> | null = null;
  t.after(async () => {
    if (phoneweb) await stopPhoneweb(phoneweb.child);
    await rm(tempRoot, { force: true, recursive: true });
  });
  phoneweb = await startPhoneweb({
    staticDir: tempRoot,
    upstream: `http://127.0.0.1:${unavailablePort}`
  });

  const response = await fetch(`${phoneweb.baseUrl}/api/health`);
  assert.equal(response.status, 502);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/u);
  assert.deepEqual(await response.json(), {
    error: { code: "PHONEWEB_UPSTREAM_UNAVAILABLE", message: "API service is unavailable." },
    success: false
  });
});

test("phoneweb server refuses to start without an explicit upstream", () => {
  const result = spawnSync(process.execPath, [serverScript.pathname], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHONEWEB_STATIC_DIR: "/tmp/orbit-phoneweb-missing-upstream"
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PHONEWEB_UPSTREAM/u);
});
