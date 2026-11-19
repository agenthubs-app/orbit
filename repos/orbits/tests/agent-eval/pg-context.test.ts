import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)), "preload", "eval-preload.cjs");

/**
 * harness/eval-parallel-workers (coordinator, AG07 run-03): `server-preload` read.result / db.write events in
 * 30+ cases carried AE-AMB-004's requestId. pg answers a query on its socket's callbacks, and a pooled
 * connection's socket keeps the async context it was opened in, so reading the trace context when the result
 * arrives tags the result with whichever request opened the connection. The preload now takes requestId, node
 * and device when the query is made and carries them to its result.
 *
 * No database: the query stays queued on a client that never connects, and the test delivers its result from
 * another request's async context, as the pooled socket did.
 */
function runWithPreload(script: string) {
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-pg-context-"));
  const result = spawnSync(process.execPath, ["--require", PRELOAD, "-e", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ORBIT_AGENT_EVAL: "1", ORBIT_AGENT_TRACE_DIR: traceDir } as unknown as NodeJS.ProcessEnv,
    timeout: 20_000,
  });
  const traceFile = path.join(traceDir, "server.jsonl");
  const events = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  fs.rmSync(traceDir, { force: true, recursive: true });
  return { events, result };
}

const SCRIPT = `
  const { AsyncLocalStorage } = require("node:async_hooks");
  const store = new AsyncLocalStorage();
  globalThis.__orbitAgentTraceContext = store;
  const pg = require("pg");
  const client = new pg.Client({ connectionString: "postgres://127.0.0.1:1/never" });
  const socketContext = { requestId: "agreq_socket_owner", node: "deliver" };
  const deliver = (index, result) => store.run(socketContext, () => client._queryQueue[index].callback(null, result));
  // 0: a read made inside request A
  store.run({ requestId: "agreq_A", node: "read" }, () => client.query("select * from orbit_records where record_id = $1", ["x"], () => {}));
  // 1: a read made outside any request
  client.query("select * from orbit_records", [], () => {});
  // 2: a write made inside request A
  store.run({ requestId: "agreq_A", node: "execute" }, () => client.query("insert into orbit_records (record_id) values ($1)", ["y"], () => {}));
  deliver(0, { rows: [{ record_id: "x", collection_name: "tasks" }], rowCount: 1 });
  deliver(1, { rows: [], rowCount: 0 });
  deliver(2, { rows: [], rowCount: 1 });
  console.log("done");
`;

test("a pg result carries the requestId and node of the request that made the query, not of the socket that answered", () => {
  const { events, result } = runWithPreload(SCRIPT);
  assert.equal(result.status, 0, result.stderr);
  const queries = events.filter((event) => event.type === "read.query");
  const results = events.filter((event) => event.type === "read.result");
  const writes = events.filter((event) => event.type === "db.write");
  assert.equal(queries.length, 2);
  assert.equal(results.length, 2);
  assert.equal(writes.length, 1);
  // The read made inside request A: query and result both belong to A.
  assert.equal(queries[0].requestId, "agreq_A");
  assert.equal(results[0].queryId, queries[0].queryId);
  assert.equal(results[0].requestId, "agreq_A");
  assert.equal(results[0].node, "read");
  // The read made outside any request belongs to none, though its result arrived inside another request's context.
  assert.equal("requestId" in queries[1], false);
  assert.equal("requestId" in results[1], false);
  assert.equal("node" in results[1], false);
  // The write likewise.
  assert.equal(writes[0].requestId, "agreq_A");
  assert.equal(writes[0].node, "execute");
  assert.equal(events.some((event) => event.requestId === "agreq_socket_owner"), false);
});

test("a pg result of the tested system is not tagged as the other device's when the socket was opened by the other device", () => {
  const { events, result } = runWithPreload(`
    const { AsyncLocalStorage } = require("node:async_hooks");
    globalThis.__orbitAgentTraceContext = new AsyncLocalStorage();
    const pg = require("pg");
    const client = new pg.Client({ connectionString: "postgres://127.0.0.1:1/never" });
    client.query("select * from orbit_records", [], () => {});
    // The preload's device context is entered for a request with x-agent-eval-device: other; emulate it by
    // delivering the result from inside such a request.
    const http = require("node:http");
    const server = http.createServer((req, res) => {
      client._queryQueue[0].callback(null, { rows: [{ record_id: "t1", collection_name: "tasks" }], rowCount: 1 });
      res.end("ok");
    }).listen(0, "127.0.0.1", () => {
      http.get({ host: "127.0.0.1", port: server.address().port, path: "/x", headers: { "x-agent-eval-device": "other" } }, (res) => { res.resume(); res.on("end", () => server.close()); });
    });
  `);
  assert.equal(result.status, 0, result.stderr);
  const read = events.find((event) => event.type === "read.result");
  assert.ok(read, "the read was observed");
  assert.equal("device" in read, false);
});
