import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

// Explicit native boundary: no browser/Simulator or native-success claim.
async function nativeAdapter(alert: (...args: any[]) => void) {
  const result = await build({
    stdin: { contents: 'import { confirmEventCancellation } from "./src/platform/confirm-event-cancellation";globalThis.cancel = confirmEventCancellation;', resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife",
    plugins: [{ name: "native-alert-boundary", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export const Platform={OS:"ios"};export const Alert={alert:(...args)=>globalThis.alert(...args)};' }));
    } }]
  });
  const context: any = { alert };
  runInNewContext(result.outputFiles[0]!.text, context);
  return context.cancel as (input: { title: string; message: string; keepLabel: string; cancelLabel: string; onConfirm(): void; onUnavailable(): void }) => void;
}

test("native confirmation keeps the original two buttons and consumes approval once", async () => {
  let call: any[] = []; let writes = 0; let unavailable = 0;
  const cancel = await nativeAdapter((...args) => { call = args; });
  cancel({ title: "取消报名", message: "确认取消？", keepLabel: "保留报名", cancelLabel: "取消报名", onConfirm: () => { writes++; }, onUnavailable: () => { unavailable++; } });
  assert.deepEqual(call.slice(0, 2), ["取消报名", "确认取消？"]);
  assert.deepEqual(Array.from(call[2], (button: any) => ({ text: button.text, style: button.style })), [{ text: "保留报名", style: "cancel" }, { text: "取消报名", style: "destructive" }]);
  assert.equal(call[2][0].onPress, undefined);
  assert.equal(writes, 0);
  call[2][1].onPress(); call[2][1].onPress();
  assert.equal(writes, 1); assert.equal(unavailable, 0);
});

test("native confirmation failure reports unavailable without authorizing a write", async () => {
  let writes = 0; let unavailable = 0;
  const cancel = await nativeAdapter(() => { throw new Error("Unavailable"); });
  cancel({ title: "取消报名", message: "确认取消？", keepLabel: "保留报名", cancelLabel: "取消报名", onConfirm: () => { writes++; }, onUnavailable: () => { unavailable++; } });
  assert.equal(writes, 0); assert.equal(unavailable, 1);
});
