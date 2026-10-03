import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

// Sprint 0140: phoneweb path with a real, generated >10 MiB business-card
// photo. Uses the actual browser canvas encoder (batch-image-compressor.web.ts),
// not a fake: the copy that is digested is the copy that would be uploaded.
async function bundle() {
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
        plugin.onResolve({ filter: /^expo-crypto$/ }, () => ({ path: "crypto", namespace: "s0140" }));
        plugin.onLoad({ filter: /.*/, namespace: "s0140" }, () => ({
          contents: 'export const CryptoDigestAlgorithm = { SHA256: "SHA-256" }; export const digest = (_algorithm, bytes) => crypto.subtle.digest("SHA-256", bytes);',
          loader: "js"
        }));
      }
    }]
  });
  return result.outputFiles[0]!.text;
}

test("a real >10 MiB card photo is compressed in the browser and the uploaded copy matches size, type and digest", { timeout: 120_000 }, async () => {
  const script = await bundle();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // crypto.subtle needs a secure context, so serve the page from an https origin.
    await page.route("https://s0140.test/", route => route.fulfill({ contentType: "text/html", body: "<main></main>" }));
    await page.goto("https://s0140.test/");
    await page.addScriptTag({ content: script });
    const observed = await page.evaluate(async () => {
      // A 4800x3200 photo of a card on a noisy desk; PNG keeps it lossless and large.
      const canvas = document.createElement("canvas");
      canvas.width = 4800; canvas.height = 3200;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(4800, 3200);
      let seed = 1405;
      for (let index = 0; index < image.data.length; index += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const value = 90 + (seed % 60);
        image.data[index] = value; image.data[index + 1] = value; image.data[index + 2] = value; image.data[index + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      context.fillStyle = "#f7f7f5"; context.fillRect(900, 700, 3000, 1800);
      context.fillStyle = "#111111";
      context.font = "bold 160px sans-serif"; context.fillText("Lin Mu", 1100, 1050);
      context.font = "90px sans-serif";
      context.fillText("Product Designer", 1100, 1220);
      context.fillText("lin.mu@example.com", 1100, 1900);
      context.fillText("010-5550-0123", 1100, 2080);
      const original = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
      const file = new File([original], "IMG_0140.PNG", { type: "image/png" });
      const uri = URL.createObjectURL(file);
      const prepared = await (window as any).prepareBatchImage({ uri, file, fileName: file.name, fileSize: file.size, mimeType: file.type });
      const bytes: Uint8Array = await (window as any).readPreparedBatchImage(prepared);
      const decoded = await createImageBitmap(new Blob([bytes as BlobPart], { type: prepared.mimeType }));
      // Legibility probe: the text line must still be dark on the light card after resampling.
      const probe = document.createElement("canvas");
      probe.width = decoded.width; probe.height = decoded.height;
      const probeContext = probe.getContext("2d")!;
      probeContext.drawImage(decoded, 0, 0);
      const scale = decoded.width / 4800;
      const line = probeContext.getImageData(Math.round(1100 * scale), Math.round(1900 * scale) - Math.round(60 * scale), Math.round(1500 * scale), Math.round(70 * scale)).data;
      let dark = 0;
      for (let index = 0; index < line.length; index += 4) if (line[index]! < 80) dark++;
      const small = new File([new Uint8Array(await (await new Promise<Blob>(resolve => {
        const tiny = document.createElement("canvas"); tiny.width = 64; tiny.height = 40;
        tiny.getContext("2d")!.fillRect(0, 0, 10, 10);
        tiny.toBlob(blob => resolve(blob!), "image/png");
      })).arrayBuffer())], "small.png", { type: "image/png" });
      const smallUri = URL.createObjectURL(small);
      const smallPrepared = await (window as any).prepareBatchImage({ uri: smallUri, file: small, fileName: small.name, fileSize: small.size });
      return {
        originalSize: file.size,
        prepared,
        uploadedBase64: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")),
        width: decoded.width,
        height: decoded.height,
        darkRatio: dark / (line.length / 4),
        sameUri: prepared.uri === uri,
        small: { uriKept: smallPrepared.uri === smallUri, size: smallPrepared.rawSize, originalSize: small.size, mimeType: smallPrepared.mimeType }
      };
    });
    const uploaded = Buffer.from(observed.uploadedBase64, "base64");
    assert.ok(observed.originalSize > 10 * 1024 * 1024, `sample must exceed 10 MiB, got ${observed.originalSize}`);
    assert.equal(observed.sameUri, false);
    assert.match(observed.prepared.uri, /^blob:/u);
    assert.equal(observed.prepared.fileName, "IMG_0140.jpg");
    assert.equal(observed.prepared.mimeType, "image/jpeg");
    assert.ok(observed.prepared.rawSize <= 10 * 1024 * 1024);
    assert.equal(uploaded.byteLength, observed.prepared.rawSize);
    assert.equal(`sha256:${createHash("sha256").update(uploaded).digest("hex")}`, observed.prepared.clientDigest);
    assert.equal(uploaded[0], 0xff); assert.equal(uploaded[1], 0xd8);
    assert.equal(Math.max(observed.width, observed.height), 4096);
    assert.ok(observed.darkRatio > 0.05, `text strokes should survive compression, dark ratio ${observed.darkRatio}`);
    assert.deepEqual(observed.small, { uriKept: true, size: observed.small.originalSize, originalSize: observed.small.originalSize, mimeType: "image/png" });
  } finally {
    await browser.close();
  }
});
