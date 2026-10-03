#!/usr/bin/env node
// Local regression stack (Sprint 0127): the port-3100 production server plus the
// background workers that turn event actions into contacts and notifications.
//
//   node scripts/local-stack.mjs start [--build]   # or: npm run local:stack -- start [--build]
//   node scripts/local-stack.mjs status
//   node scripts/local-stack.mjs stop
//
// Guarantees:
// - Every process gets ORBIT_DATABASE_TARGET=local and all database URLs pinned to
//   ORBIT_LOCAL_DATABASE_URL, which must point at this machine (127.0.0.1 / localhost /
//   ::1 / a Unix socket). Anything else refuses to start: .env's Neon URL is never used.
// - Port 3000 (the user's dev server) is never used or touched; stop only signals the
//   process groups this script started, by the PIDs it recorded.
// - Workers run with the paid AI keys blanked and Expo push unconfigured, so they make
//   no paid model calls and send no pushes. Web (3100) keeps its keys for user actions.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = path.join(ROOT, "build", "local-stack");
const PID_FILE = path.join(STATE_DIR, "pids.json");
export const STACK_PORT = 3100;
const FORBIDDEN_PORTS = new Set([3000]);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DATABASE_URL_KEYS = ["ORBIT_LOCAL_DATABASE_URL", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"];
export const PAID_PROVIDER_KEYS = ["DEEPSEEK_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"];
const WORKER_BLANKED_KEYS = [...PAID_PROVIDER_KEYS, "ORBIT_EXPO_PUSH_ENDPOINT", "ORBIT_EXPO_PUSH_ACCESS_TOKEN", "ORBIT_EXPO_PUSH_RECEIPT_ENDPOINT"];

/** "NAME=set|empty" for each paid provider key; never the value. */
export function describeProviderKeys(env) {
  return PAID_PROVIDER_KEYS.map((key) => `${key}=${env[key] ? "set" : "empty"}`).join(" ");
}

/** Services started, in order. `marker` must appear in the process command line before stop signals it. */
export const SERVICES = [
  { name: "web-3100", role: "server", marker: "next", args: ["node_modules/.bin/next", "start", "-p", String(STACK_PORT), "-H", "127.0.0.1"] },
  // Event operations: card exchange / contact requests → contacts + in-app notifications,
  // appointment projection and the human-encounter projector (all in one worker).
  { name: "event-operations-worker", role: "worker", marker: "run-event-operations-worker", args: ["node_modules/.bin/tsx", "scripts/run-event-operations-worker.ts"] },
  // Notification delivery passes (push is unconfigured locally, so nothing leaves the machine).
  { name: "notification-delivery-worker", role: "worker", marker: "run-notification-delivery-worker", args: ["node_modules/.bin/tsx", "scripts/run-notification-delivery-worker.ts"] },
];

export function isLocalDatabaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return false;
  if (LOCAL_HOSTS.has(url.hostname)) return true;
  // postgresql:///db?host=/tmp — a Unix socket on this machine.
  const socket = url.searchParams.get("host");
  return url.hostname === "" && Boolean(socket) && socket.startsWith("/");
}

/** .env then .env.local (later wins), the same precedence Next uses; process env wins over both. */
export function readEnvFiles(root = ROOT) {
  const merged = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) Object.assign(merged, parseEnv(fs.readFileSync(file, "utf8")));
  }
  return merged;
}

/**
 * Child environments. Throws before anything starts if the database is not local.
 * @param {Record<string, string | undefined>} processEnv
 * @param {Record<string, string | undefined>} files
 * @param {{ noPaidAi?: boolean }} [options] noPaidAi also blanks the web server's provider keys (QA runs).
 * @returns {{ server: Record<string, string | undefined>, worker: Record<string, string | undefined> }}
 */
export function buildStackEnv(processEnv = process.env, files = readEnvFiles(), options = {}) {
  const localUrl = processEnv.ORBIT_LOCAL_DATABASE_URL?.trim() || files.ORBIT_LOCAL_DATABASE_URL?.trim() || "";
  if (!isLocalDatabaseUrl(localUrl)) {
    throw new Error("ORBIT_LOCAL_DATABASE_URL must point at a Postgres on this machine (127.0.0.1, localhost, ::1 or a Unix socket); refusing to start.");
  }
  if (processEnv.VERCEL_ENV === "production") throw new Error("Refusing to run the local stack with VERCEL_ENV=production.");
  /** @type {Record<string, string>} */
  const pinned = { ORBIT_DATABASE_TARGET: "local" };
  for (const key of DATABASE_URL_KEYS) pinned[key] = localUrl;
  const server = { ...processEnv, ...pinned, PORT: String(STACK_PORT) };
  const worker = { ...processEnv, ...pinned };
  for (const key of WORKER_BLANKED_KEYS) worker[key] = "";
  if (options.noPaidAi) for (const key of PAID_PROVIDER_KEYS) server[key] = "";
  for (const env of [server, worker]) {
    for (const key of DATABASE_URL_KEYS) {
      if (!isLocalDatabaseUrl(env[key])) throw new Error(`${key} is not local; refusing to start.`);
    }
  }
  return { server, worker };
}

function readPids() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
  } catch {
    return null;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandOf(pid) {
  const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function stop({ quiet = false } = {}) {
  const state = readPids();
  if (!state?.services?.length) {
    if (!quiet) console.log("local-stack: nothing recorded as running.");
    return;
  }
  for (const service of [...state.services].reverse()) {
    if (!alive(service.pid)) {
      console.log(`local-stack: ${service.name} (pid ${service.pid}) already stopped.`);
      continue;
    }
    // Never signal a PID that has been reused by something else.
    if (!commandOf(service.pid).includes(service.marker)) {
      console.log(`local-stack: pid ${service.pid} is no longer ${service.name}; not touching it.`);
      continue;
    }
    try { process.kill(-service.pid, "SIGTERM"); } catch { process.kill(service.pid, "SIGTERM"); }
    console.log(`local-stack: SIGTERM ${service.name} (process group ${service.pid}).`);
  }
  await wait(3_000);
  for (const service of state.services) {
    if (alive(service.pid) && commandOf(service.pid).includes(service.marker)) {
      try { process.kill(-service.pid, "SIGKILL"); } catch { process.kill(service.pid, "SIGKILL"); }
      console.log(`local-stack: SIGKILL ${service.name} (process group ${service.pid}).`);
    }
  }
  fs.rmSync(PID_FILE, { force: true });
  if (await portInUse(STACK_PORT)) console.log(`local-stack: warning — port ${STACK_PORT} is still in use by another process.`);
  console.log("local-stack: stopped.");
}

async function start({ build, noPaidAi }) {
  if (FORBIDDEN_PORTS.has(STACK_PORT)) throw new Error("The local stack never uses port 3000.");
  const existing = readPids();
  if (existing?.services?.some((service) => alive(service.pid) && commandOf(service.pid).includes(service.marker))) {
    throw new Error("local-stack is already running; run `node scripts/local-stack.mjs stop` first.");
  }
  if (await portInUse(STACK_PORT)) throw new Error(`Port ${STACK_PORT} is already in use; not starting.`);
  const env = buildStackEnv(process.env, readEnvFiles(), { noPaidAi });
  console.log(`local-stack: provider keys — web: ${describeProviderKeys(env.server)}; workers: ${describeProviderKeys(env.worker)}`);
  fs.mkdirSync(path.join(STATE_DIR, "logs"), { recursive: true });

  if (build) {
    console.log("local-stack: building (next build --webpack, ORBIT_DATABASE_TARGET=local)…");
    const result = spawnSync("node_modules/.bin/next", ["build", "--webpack"], { cwd: ROOT, env: env.server, stdio: "inherit" });
    if (result.status !== 0) throw new Error("next build failed.");
  } else if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("No production build found; run with --build.");
  }

  const started = [];
  const record = () => fs.writeFileSync(PID_FILE, JSON.stringify({ startedAt: new Date().toISOString(), port: STACK_PORT, services: started }, null, 2));
  try {
    for (const service of SERVICES) {
      const logPath = path.join(STATE_DIR, "logs", `${service.name}.log`);
      const log = fs.openSync(logPath, "a");
      const child = spawn(service.args[0], service.args.slice(1), {
        cwd: ROOT, detached: true, env: env[service.role], stdio: ["ignore", log, log],
      });
      fs.closeSync(log);
      child.unref();
      started.push({ name: service.name, pid: child.pid, marker: service.marker, log: path.relative(ROOT, logPath) });
      record();
      console.log(`local-stack: started ${service.name} pid ${child.pid} → ${path.relative(ROOT, logPath)}`);
    }
    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${STACK_PORT}/api/health`)).ok; } catch { return false; }
    }, 90_000, `http://127.0.0.1:${STACK_PORT}/api/health`);
    const eventLog = path.join(STATE_DIR, "logs", "event-operations-worker.log");
    await waitFor(() => fs.readFileSync(eventLog, "utf8").includes("event_operations_worker_started"), 90_000, "the event-operations worker");
    await wait(3_000);
    const dead = started.filter((service) => !alive(service.pid));
    if (dead.length) throw new Error(`Exited early: ${dead.map((service) => `${service.name} (see ${service.log})`).join(", ")}`);
  } catch (error) {
    console.error(`local-stack: start failed — ${error instanceof Error ? error.message : error}. Stopping what was started.`);
    await stop({ quiet: true });
    throw error;
  }
  console.log(`local-stack: ready. Web http://127.0.0.1:${STACK_PORT} (ORBIT_DATABASE_TARGET=local); workers running. Stop with: node scripts/local-stack.mjs stop`);
}

async function status() {
  const state = readPids();
  if (!state?.services?.length) {
    console.log("local-stack: not running.");
    return;
  }
  for (const service of state.services) {
    const running = alive(service.pid) && commandOf(service.pid).includes(service.marker);
    console.log(`${service.name.padEnd(30)} pid ${String(service.pid).padEnd(7)} ${running ? "running" : "stopped"}  ${service.log}`);
  }
  let healthy = false;
  try { healthy = (await fetch(`http://127.0.0.1:${STACK_PORT}/api/health`)).ok; } catch { healthy = false; }
  console.log(`health http://127.0.0.1:${STACK_PORT}/api/health: ${healthy ? "ok" : "unreachable"}`);
}

async function main(argv) {
  const [command, ...flags] = argv;
  if (command === "start") return start({ build: flags.includes("--build"), noPaidAi: flags.includes("--no-paid-ai") });
  if (command === "stop") return stop();
  if (command === "status") return status();
  console.log("usage: node scripts/local-stack.mjs start [--build] [--no-paid-ai] | status | stop");
  process.exitCode = command ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
