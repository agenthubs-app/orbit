import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const path = "app/(app)/app/contacts/business-card-batch-entry.tsx";
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "BusinessCardBatchEntry")!;
const submit = component.body!.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "submitBatch")!;
const code = ts.transpileModule(submit.getText(source) + "\nglobalThis.submit = submitBatch;", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(upload: (files: File[]) => Promise<unknown>, request: typeof fetch) {
  const state = { error: null as string | null, uploading: false, needsLogin: false, progress: { done: 0, total: 0 } };
  let selected = true;
  const file = new File(["card"], "card.jpg", { type: "image/jpeg" });
  // Clearing a real input invalidates its live FileList. The submitted array
  // must have been captured before resetting the picker for reselection.
  const list = { get length() { return selected ? 1 : 0; }, *[Symbol.iterator]() { if (selected) yield file; } };
  const input = { set value(_value: string) { selected = false; } };
  const context = vm.createContext({ fetch: request, FormData, Array, busy: { current: false }, selectedFiles: { current: [] },
    photoInputRef: { current: input }, pdfInputRef: { current: input }, window: { location: { href: "" } },
    uploadV1CardFiles: upload, cardImportError: (value: string) => value, t: (value: { zh: string }) => value.zh,
    setUploading: (value: boolean) => { state.uploading = value; }, setError: (value: string | null) => { state.error = value; },
    setNeedsLogin: (value: boolean) => { state.needsLogin = value; }, setUploadProgress: (value: { done: number; total: number }) => { state.progress = value; },
  });
  vm.runInContext(code, context);
  return { run: context.submit as (files: unknown) => Promise<void>, list, state, context };
}

test("resetting the picker preserves the selected files for both direct and local upload", async () => {
  for (const direct of [true, false]) {
    let posts = 0;
    const f = harness(async (files) => { assert.equal(files.length, 1); return direct ? { kind: "created", jobId: "job" } : { kind: "legacy" }; },
      async (_url, init) => { posts++; assert.equal((init!.body as FormData).getAll("files").length, 1); return Response.json({ data: { batch: { id: "batch" } } }); });
    await f.run(f.list);
    assert.equal(f.state.progress.total, 1); assert.equal(f.state.uploading, false);
    assert.equal(posts, direct ? 0 : 1);
    assert.equal(f.context.window.location.href, direct ? "/app/contacts/new/import/job" : "/app/contacts/new/batch/batch");
  }
});

test("rapid repeated submissions are guarded and an authentication failure retains files for retry", async () => {
  let finish!: (value: unknown) => void, calls = 0;
  const wait = new Promise((resolve) => { finish = resolve; });
  const f = harness(async () => { calls++; return wait; }, async () => { assert.fail("must not fall back"); });
  const first = f.run(f.list); await f.run(f.context.selectedFiles.current);
  assert.equal(calls, 1); assert.equal(f.state.uploading, true);
  finish({ kind: "error", code: "UNAUTHORIZED" }); await first;
  assert.equal(f.state.needsLogin, true); assert.equal(f.state.error, "UNAUTHORIZED");
  assert.equal(f.context.selectedFiles.current.length, 1); assert.equal(f.state.uploading, false);
  assert.equal(f.context.window.location.href, "");
});
