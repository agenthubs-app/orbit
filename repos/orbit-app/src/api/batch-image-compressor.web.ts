import type { BatchImageInput, OpenedBatchImageForCompression } from "./batch-images";

// Sprint 0140: browser (phoneweb) boundary for on-device compression. Decodes
// the picked File once and re-encodes JPEG copies through a canvas; each copy
// is a blob: URL so the existing browser source reader can digest and upload it.
export async function openBatchImageCompressor(input: BatchImageInput): Promise<OpenedBatchImageForCompression> {
  const blob: Blob = input.file && typeof (input.file as Blob).slice === "function"
    ? input.file as Blob
    : await (await fetch(input.uri)).blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  return {
    width: bitmap.width,
    height: bitmap.height,
    async encode(size, quality) {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const encoded = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      canvas.width = 0;
      canvas.height = 0;
      if (!encoded) throw new Error("JPEG encoding failed");
      return { uri: URL.createObjectURL(encoded), size: encoded.size, file: encoded };
    },
    discard(copy) {
      URL.revokeObjectURL(copy.uri);
    },
    close() {
      bitmap.close();
    }
  };
}
