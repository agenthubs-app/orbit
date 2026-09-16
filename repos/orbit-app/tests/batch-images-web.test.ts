import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

test("web batch preparation reads a picker File through its blob URL and still rejects remote URLs", async () => {
  const result = await build({
    stdin: {
      contents: 'import { prepareBatchImage, readPreparedBatchImage } from "./src/api/batch-images"; window.prepareBatchImage = prepareBatchImage; window.readPreparedBatchImage = readPreparedBatchImage;',
      loader: "ts",
      resolveDir: process.cwd()
    },
    bundle: true,
    write: false,
    format: "iife",
    resolveExtensions: [".web.ts", ".web.js", ".ts", ".js", ".json"],
    define: { "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "browser-crypto-boundary",
      setup(plugin) {
        plugin.onResolve({ filter: /^expo-crypto$/ }, () => ({ path: "crypto", namespace: "pw0004" }));
        plugin.onLoad({ filter: /.*/, namespace: "pw0004" }, () => ({
          contents: 'export const CryptoDigestAlgorithm = { SHA256: "SHA-256" }; export const digest = async () => new Uint8Array(32).buffer;',
          loader: "js"
        }));
        plugin.onResolve({ filter: /^expo-file-system$/ }, () => ({ path: "file-system", namespace: "pw0004" }));
      }
    }]
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<main></main>");
    await page.addScriptTag({ content: result.outputFiles[0]!.text });
    const observed = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const file = new File([bytes], "pw0004.png", { type: "image/png" });
      const uri = URL.createObjectURL(file);
      try {
        const prepared = await (window as any).prepareBatchImage({
          uri,
          file,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        });
        const reread = await (window as any).readPreparedBatchImage(prepared);
        let remoteCode = "";
        try {
          await (window as any).prepareBatchImage({ uri: "https://example.invalid/card.png" });
        } catch (error) {
          remoteCode = (error as { code?: string }).code ?? "";
        }
        const originalFetch = window.fetch;
        let oversizedReads = 0;
        window.fetch = async () => ({
          ok: true,
          async blob() {
            return {
              size: 10485761,
              async arrayBuffer() {
                oversizedReads++;
                return new ArrayBuffer(10485761);
              }
            };
          }
        }) as Response;
        let oversizedCode = "";
        try {
          await (window as any).prepareBatchImage({ uri: "blob:oversized" });
        } catch (error) {
          oversizedCode = (error as { code?: string }).code ?? "";
        } finally {
          window.fetch = originalFetch;
        }
        return { prepared, reread: Array.from(reread as Uint8Array), remoteCode, oversizedCode, oversizedReads };
      } finally {
        URL.revokeObjectURL(uri);
      }
    }, PNG_BASE64);
    assert.equal(observed.prepared.fileName, "pw0004.png");
    assert.equal(observed.prepared.mimeType, "image/png");
    assert.equal(observed.prepared.rawSize, 68);
    assert.match(observed.prepared.clientDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(Buffer.from(observed.reread).toString("base64"), PNG_BASE64);
    assert.equal(observed.remoteCode, "INVALID_URI");
    assert.equal(observed.oversizedCode, "FILE_TOO_LARGE");
    assert.equal(observed.oversizedReads, 0);
  } finally {
    await browser.close();
  }
});
