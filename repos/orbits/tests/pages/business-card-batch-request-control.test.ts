import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual request functions from the page, rather than maintaining
// a second implementation of its timeout, refresh ordering or action guard.
const path = "app/(app)/app/contacts/new/batch/[id]/business-card-batch-view.tsx";
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "BusinessCardBatchView")!;
function named(name: string) {
  const node = [...source.statements, ...component.body!.statements].find((node) =>
    ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === name) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)));
  assert.ok(node, `missing actual page function ${name}`); return node.getText(source);
}
const code = ts.transpileModule(["BatchRequestFailure", "requestBatchJson", "refresh", "post", "withBusy"].map(named).join("\n") +
  "\nglobalThis.api = { requestBatchJson, refresh, post, withBusy };", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

type Api = {
  requestBatchJson(path: string): Promise<unknown>; refresh(afterAction?: boolean): Promise<void>;
  post(path: string, body?: unknown): Promise<unknown>; withBusy(action: () => Promise<void>): Promise<void>;
};
function harness(fetcher: typeof fetch, timers: Record<string, unknown> = {}) {
  const state = { batch: null as any, items: [] as any[], loadError: null as number | null, actionError: null as number | null, busy: false };
  const context = vm.createContext({ fetch: fetcher, AbortController, setTimeout, clearTimeout, Date,
    batchId: "qa", requestSequence: { current: 0 }, actionInFlight: { current: false }, useCallback: (fn: unknown) => fn,
    setBatch: (value: any) => { state.batch = value; }, setItems: (value: any[]) => { state.items = value; },
    setLoadError: (value: number | null) => { state.loadError = value; }, setActionError: (value: number | null) => { state.actionError = value; },
    setBusy: (value: boolean) => { state.busy = value; }, setNowMs: () => {}, ...timers,
  });
  vm.runInContext(code, context); return { api: context.api as Api, state };
}
const response = (status: string) => Response.json({ data: { batch: { id: "qa", status }, items: [] } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; }

test("HTTP action failure is reported, does not run success logic, and retains state if refresh also fails", async () => {
  const { api, state } = harness(async () => new Response("private provider detail", { status: 503 }));
  state.batch = { id: "qa", status: "ready_for_review" }; let continued = false;
  await api.withBusy(async () => { await api.post("/confirm", {}); continued = true; });
  assert.equal(continued, false); assert.equal(state.actionError, 503); assert.equal(state.loadError, 503);
  assert.equal(state.batch.status, "ready_for_review"); assert.equal(state.busy, false);
});

test("initial read failure is observable and a successful retry clears it", async () => {
  let count = 0; const { api, state } = harness(async () => ++count === 1 ? new Response(null, { status: 401 }) : response("processing"));
  await api.refresh(); assert.equal(state.batch, null); assert.equal(state.loadError, 401);
  await api.refresh(); assert.equal(state.batch.status, "processing"); assert.equal(state.loadError, null);
});

test("old polling responses cannot overwrite the result of a completed action", async () => {
  const old = deferred<Response>(); let count = 0;
  const { api, state } = harness(async () => ++count === 1 ? old.promise : response("cancelled"));
  const polling = api.refresh(); await api.withBusy(async () => {});
  assert.equal(state.batch.status, "cancelled");
  old.resolve(response("processing")); await polling;
  assert.equal(state.batch.status, "cancelled");
});

test("duplicate clicks and polling stay suppressed through mutation and its final refresh", async () => {
  const mutation = deferred<void>(), refresh = deferred<Response>(); let actions = 0, reads = 0;
  const { api, state } = harness(async () => { reads++; return refresh.promise; });
  const first = api.withBusy(async () => { actions++; await mutation.promise; });
  await api.withBusy(async () => { actions++; }); await api.refresh();
  assert.equal(actions, 1); assert.equal(reads, 0);
  mutation.resolve(); await new Promise((r) => setImmediate(r));
  assert.equal(reads, 1); assert.equal(state.busy, true);
  await api.withBusy(async () => { actions++; }); await api.refresh();
  assert.equal(actions, 1); assert.equal(reads, 1);
  refresh.resolve(response("cancelled")); await first; assert.equal(state.busy, false);
});

test("the request deadline covers response body reading and always clears its timer", async () => {
  let timeout!: () => void, clears = 0, delay = 0;
  const { api } = harness(async (_url, init) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
    if (init!.signal!.aborted) reject(new Error("aborted"));
    else init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }) }) as Response, { setTimeout: (fn: () => void, ms: number) => { timeout = fn; delay = ms; return 1; }, clearTimeout: () => { clears++; } });
  const pending = api.requestBatchJson("/batch"); await Promise.resolve(); timeout();
  await assert.rejects(pending, /aborted/); assert.equal(delay, 15_000); assert.equal(clears, 1);
});

test("malformed or foreign batch responses preserve the prior state and surface a load error", async () => {
  const { api, state } = harness(async () => Response.json({ data: { batch: { id: "foreign" }, items: [] } }));
  state.batch = { id: "qa", status: "processing" }; await api.refresh();
  assert.equal(state.batch.id, "qa"); assert.equal(state.loadError, 502);
});
