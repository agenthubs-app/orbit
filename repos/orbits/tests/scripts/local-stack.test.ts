import assert from "node:assert/strict";
import test from "node:test";

// 0127 local worker script: the guards that keep regression runs on this machine.
import { STACK_PORT, SERVICES, buildStackEnv, isLocalDatabaseUrl } from "../../scripts/local-stack.mjs";

const neon = "postgresql://user:pw@ep-example-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const local = "postgresql://xzhao@127.0.0.1:5432/orbit_events";

test("only Postgres on this machine counts as local", () => {
  for (const url of [local, "postgres://u@localhost/db", "postgresql://u@[::1]:5432/db", "postgresql:///orbit_events?host=/tmp"]) {
    assert.equal(isLocalDatabaseUrl(url), true, url);
  }
  for (const url of [neon, "postgresql://u@db.internal/db", "postgresql://u@10.0.0.5/db", "mysql://u@127.0.0.1/db", "", undefined, "not a url", "postgresql:///db?host=db.example.com"]) {
    assert.equal(isLocalDatabaseUrl(url), false, String(url));
  }
});

test("every child is pinned to the local database even when .env points at Neon", () => {
  const files = { ORBIT_EVENT_DATABASE_URL: neon, ORBIT_LOCAL_DATABASE_URL: local, DEEPSEEK_API_KEY: "sk-file" };
  const env = buildStackEnv({ PATH: "/usr/bin", DEEPSEEK_API_KEY: "sk-shell", ORBIT_EVENT_DATABASE_URL: neon }, files);
  for (const child of [env.server, env.worker]) {
    assert.equal(child.ORBIT_DATABASE_TARGET, "local");
    for (const key of ["ORBIT_LOCAL_DATABASE_URL", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"]) {
      assert.equal(child[key], local, key);
    }
  }
  assert.equal(env.server.DEEPSEEK_API_KEY, "sk-shell", "the web server keeps its key for user-triggered AI");
  assert.equal(env.worker.DEEPSEEK_API_KEY, "", "workers make no paid model calls");
  assert.equal(env.worker.ORBIT_EXPO_PUSH_ACCESS_TOKEN, "", "workers send no pushes");
  assert.equal(env.server.PORT, "3100");
});

test("a missing or remote local URL refuses to start", () => {
  assert.throws(() => buildStackEnv({}, {}), /refusing to start/);
  assert.throws(() => buildStackEnv({ ORBIT_LOCAL_DATABASE_URL: neon }, {}), /refusing to start/);
  assert.throws(() => buildStackEnv({ VERCEL_ENV: "production" }, { ORBIT_LOCAL_DATABASE_URL: local }), /production/);
});

test("the stack uses port 3100 only and never mentions 3000", () => {
  assert.equal(STACK_PORT, 3100);
  const commands = SERVICES.map((service: { args: string[] }) => service.args.join(" "));
  assert.ok(commands.some((command: string) => command.includes("start -p 3100")));
  assert.equal(commands.some((command: string) => /\b3000\b/.test(command)), false);
  assert.deepEqual(SERVICES.map((service: { name: string }) => service.name), ["web-3100", "event-operations-worker", "notification-delivery-worker"]);
});

test("--no-paid-ai blanks every paid provider key for the web server too, and reports names only", async () => {
  const module = await import("../../scripts/local-stack.mjs");
  const shell = { PATH: "/usr/bin", DEEPSEEK_API_KEY: "sk-shell", GEMINI_API_KEY: "g-shell", OPENAI_API_KEY: "o-shell", GOOGLE_API_KEY: "go-shell" };
  const env = buildStackEnv(shell, { ORBIT_LOCAL_DATABASE_URL: local }, { noPaidAi: true });
  for (const child of [env.server, env.worker]) {
    for (const key of module.PAID_PROVIDER_KEYS) assert.equal(child[key], "", key);
  }
  assert.deepEqual([...module.PAID_PROVIDER_KEYS].sort(), ["DEEPSEEK_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"]);
  const report = module.describeProviderKeys(env.server);
  assert.equal(report, "DEEPSEEK_API_KEY=empty GEMINI_API_KEY=empty GOOGLE_API_KEY=empty OPENAI_API_KEY=empty");
  assert.ok(!module.describeProviderKeys(shell).includes("sk-shell"), "values are never printed");
  assert.equal(module.describeProviderKeys(shell), "DEEPSEEK_API_KEY=set GEMINI_API_KEY=set GOOGLE_API_KEY=set OPENAI_API_KEY=set");
});

test("--port runs a second isolated stack on another port; 3000 is refused and 3100 stays the default (0134)", async () => {
  const module = await import("../../scripts/local-stack.mjs");
  assert.equal(module.parsePort([]), 3100);
  assert.equal(module.parsePort(["--build", "--port", "3300", "--no-paid-ai"]), 3300);
  assert.equal(module.parsePort(["--port=3301"]), 3301);
  for (const bad of [["--port", "3000"], ["--port", "abc"], ["--port"], ["--port", "80"], ["--port", "70000"]]) assert.throws(() => module.parsePort(bad), /port/u, bad.join(" "));
  const services = module.servicesFor(3300);
  assert.ok(services[0].args.join(" ").includes("start -p 3300"));
  assert.equal(services[0].name, "web-3300");
  assert.equal(buildStackEnv({}, { ORBIT_LOCAL_DATABASE_URL: local }, { port: 3300 }).server.PORT, "3300");
  assert.equal(buildStackEnv({}, { ORBIT_LOCAL_DATABASE_URL: local }).server.PORT, "3100");
});
