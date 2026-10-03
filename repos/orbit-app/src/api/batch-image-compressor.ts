import type { BatchImageInput, OpenedBatchImageForCompression } from "./batch-images";

// Sprint 0140: native boundary for on-device compression. The policy (which
// sizes and qualities to try, and when to stop) lives in batch-images.ts; this
// file only decodes once, re-encodes JPEG copies into the cache directory and
// deletes rejected copies. Modules load lazily so Node tests never import them.
export async function openBatchImageCompressor(input: BatchImageInput): Promise<OpenedBatchImageForCompression> {
  const [{ ImageManipulator, SaveFormat }, { File }] = await Promise.all([
    import("expo-image-manipulator"),
    import("expo-file-system")
  ]);
  const original = await ImageManipulator.manipulate(input.uri).renderAsync();
  return {
    width: original.width,
    height: original.height,
    async encode(size, quality) {
      const context = ImageManipulator.manipulate(input.uri);
      if (size.width !== original.width || size.height !== original.height) context.resize(size);
      const rendered = await context.renderAsync();
      try {
        const saved = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
        return { uri: saved.uri, size: new File(saved.uri).size };
      } finally {
        rendered.release();
        context.release();
      }
    },
    discard(copy) {
      try { new File(copy.uri).delete(); } catch { /* cache cleanup is best effort */ }
    },
    close() {
      original.release();
    }
  };
}
