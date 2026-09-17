import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import {
  IngestV2PrivateImage,
  isPrivateImageExpiredStatus,
} from "../../app/(app)/app/contacts/new/batch2/ingest-v2-private-image";

const source = readFileSync(
  "app/(app)/app/contacts/new/batch2/ingest-v2-private-image.tsx",
  "utf8",
);

test("private image expiry is limited to missing/expired server responses", () => {
  assert.equal(isPrivateImageExpiredStatus(404), true);
  assert.equal(isPrivateImageExpiredStatus(410), true);
  assert.equal(isPrivateImageExpiredStatus(401), false);
  assert.equal(isPrivateImageExpiredStatus(500), false);
});

test("private image fetch stays session-bound and rejects cross-origin or redirect targets", () => {
  assert.match(source, /credentials:\s*["']same-origin["']/u);
  assert.match(source, /redirect:\s*["']error["']/u);
  assert.match(source, /resolved\.origin !== window\.location\.origin/u);
  assert.match(source, /response\.url/u);
  assert.doesNotMatch(source, /OrbitProgressiveImage/u);
  assert.doesNotMatch(source, /next\/image/u);
});

test("private image builds local variants/LQIP, reserves a contain box, and gates reveal on decode", () => {
  assert.match(source, /createImageBitmap\(blob\)/u);
  assert.match(source, /createObjectURL\(variant\)/u);
  assert.match(source, /toDataURL\(["']image\/webp["']/u);
  assert.match(source, /srcSet=\{variantSrcSet\}/u);
  assert.match(source, /sizes=\{resolvedSizes\}/u);
  assert.match(source, /DEFAULT_PRIVATE_IMAGE_SIZES/u);
  assert.match(source, /ref=\{containerRef\}/u);
  assert.match(source, /getBoundingClientRect\(\)/u);
  assert.match(source, /new ResizeObserver/u);
  assert.match(source, /window\.addEventListener\("resize", onResize\)/u);
  assert.match(source, /objectFit:\s*["']contain["']/u);
  assert.match(source, /await image\.decode\(\)/u);
  assert.match(source, /opacity 220ms/u);
  assert.match(source, /reducedMotion \? ["']none["']/u);
  assert.match(source, /naturalWidth <= 0/u);
});

test("private image aborts and revokes every generated object URL on source change/unmount", () => {
  assert.match(source, /new AbortController\(\)/u);
  assert.match(source, /controller\.abort\(\)/u);
  assert.match(source, /URL\.revokeObjectURL\(url\)/u);
  assert.match(source, /ownedUrls\.push\(src\)/u);
  assert.match(source, /generationRef/u);
});

test("private image exposes loading, expired and unavailable states without claiming SSR LQIP", () => {
  assert.match(source, /data-ingest-private-image-loading/u);
  assert.match(source, /data-ingest-private-image=["']expired["']/u);
  assert.match(source, /data-ingest-private-image=["']error["']/u);
  assert.match(source, /src:\s*string \| Blob/u);
  assert.doesNotMatch(source, /blurDataURL/u);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function settleEffects(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await tick();
}

test("mounted source changes ignore late bitmap work and revoke every owned URL", async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  const urlConstructor = globalThis.URL;
  const originalCreateObjectURL = urlConstructor.createObjectURL;
  const originalRevokeObjectURL = urlConstructor.revokeObjectURL;
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const originalUrls = new Map<Blob, string>();
  const oldBitmap = deferred<{ width: number; height: number; close: () => void }>();
  const oldBlob = new Blob(["old"], { type: "image/jpeg" });
  const nextBlob = new Blob(["next"], { type: "image/jpeg" });
  let sequence = 0;
  let renderer: ReactTestRenderer | undefined;

  try {
    (globalThis as { window: unknown }).window = {
      location: { href: "http://w2.localhost:4612/app/contacts/new/batch2", origin: "http://w2.localhost:4612" },
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => "data:image/webp;base64,lqip",
      toBlob: (callback: BlobCallback) => callback(new Blob([`variant-${sequence++}`], { type: "image/webp" })),
    } as unknown as HTMLCanvasElement;
    (globalThis as { document: Document }).document = {
      createElement: () => canvas,
    } as unknown as Document;
    Object.defineProperty(urlConstructor, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        const url = `blob:test-${createdUrls.length}-${blob.size}`;
        createdUrls.push(url);
        if (blob === oldBlob || blob === nextBlob) originalUrls.set(blob, url);
        return url;
      },
    });
    Object.defineProperty(urlConstructor, "revokeObjectURL", {
      configurable: true,
      value: (url: string) => revokedUrls.push(url),
    });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      const blob = href.endsWith("/old") ? oldBlob : nextBlob;
      return { ok: true, status: 200, url: href, blob: async () => blob } as Response;
    }) as typeof fetch;
    globalThis.createImageBitmap = (async (blob: Blob) => {
      if (blob === oldBlob) return oldBitmap.promise;
      return { width: 100, height: 60, close() {} };
    }) as typeof createImageBitmap;

    await act(async () => {
      renderer = create(<IngestV2PrivateImage alt="old" src="/old" />);
      await settleEffects();
    });
    await act(async () => {
      renderer!.update(<IngestV2PrivateImage alt="next" src="/next" />);
      await settleEffects();
    });
    // The old request resolves after cleanup. Its bitmap must close without
    // creating a variant or changing the new source's state.
    await act(async () => {
      oldBitmap.resolve({ width: 100, height: 60, close() {} });
      await settleEffects();
    });
    assert.equal(renderer!.root.findByProps({ "data-ingest-private-image": "ready" }).props["data-ingest-private-image"], "ready");
    assert.equal(renderer!.root.findByProps({ "data-ingest-private-image-content": "" }).props.src, originalUrls.get(nextBlob));

    // A late error event from the unmounted image must not tear down the new
    // generation or revoke its URLs.
    const lateOldError = renderer!.root.findByProps({ "data-ingest-private-image-content": "" }).props.onError as () => void;
    await act(async () => {
      renderer!.update(<IngestV2PrivateImage alt="latest" src="/latest" />);
      await settleEffects();
    });
    const revokedBeforeLateError = revokedUrls.length;
    lateOldError();
    assert.equal(revokedUrls.length, revokedBeforeLateError);
    assert.equal(renderer!.root.findByProps({ "data-ingest-private-image": "ready" }).props["data-ingest-private-image"], "ready");

    await act(async () => renderer!.unmount());
    assert.equal(new Set(createdUrls).size, createdUrls.length);
    assert.deepEqual(new Set(revokedUrls), new Set(createdUrls));
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = originalWindow;
    if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document: unknown }).document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalBitmap;
    Object.defineProperty(urlConstructor, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(urlConstructor, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  }
});

test("mounted private image reports expired and unauthorized responses", async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalFetch = globalThis.fetch;
  let renderer: ReactTestRenderer | undefined;
  try {
    (globalThis as { window: unknown }).window = {
      location: { href: "http://w2.localhost:4612/app/contacts/new/batch2", origin: "http://w2.localhost:4612" },
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      const status = href.endsWith("/gone") ? 410 : 401;
      return { ok: false, status, url: href, blob: async () => new Blob() } as Response;
    }) as typeof fetch;
    await act(async () => {
      renderer = create(<IngestV2PrivateImage alt="gone" src="/gone" />);
      await settleEffects();
    });
    assert.equal(renderer!.root.findByProps({ "data-ingest-private-image": "expired" }).props["data-ingest-private-image"], "expired");
    await act(async () => {
      renderer!.update(<IngestV2PrivateImage alt="unauthorized" src="/unauthorized" />);
      await settleEffects();
    });
    assert.equal(renderer!.root.findByProps({ "data-ingest-private-image": "error" }).props["data-ingest-private-image"], "error");
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
