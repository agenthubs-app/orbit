import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_RENDER_EDGE_PX = 3072;
const JPEG_QUALITY = 0.88;

/**
 * Rasterizes a card-per-page PDF into JPEG images for the batch pipeline.
 * Throws "BUSINESS_CARD_BATCH_TOO_LARGE" when the page count exceeds the
 * remaining batch allowance and "BUSINESS_CARD_PDF_UNREADABLE" for bytes
 * pdf.js cannot parse.
 */
export async function paginatePdfToCardImages(input: {
  pdfBytes: Buffer;
  maxPages: number;
}): Promise<readonly { page: number; jpegBytes: Buffer }[]> {
  let document;

  try {
    document = await getDocument({
      data: new Uint8Array(input.pdfBytes),
      disableWorker: true,
    }).promise;
  } catch {
    throw new Error("BUSINESS_CARD_PDF_UNREADABLE");
  }

  if (document.numPages > input.maxPages) {
    throw new Error("BUSINESS_CARD_BATCH_TOO_LARGE");
  }

  const pages: { page: number; jpegBytes: Buffer }[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      MAX_RENDER_EDGE_PX / Math.max(baseViewport.width, baseViewport.height),
      4,
    );
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    // pdf.js expects a DOM CanvasRenderingContext2D; the napi-rs context is
    // API-compatible at runtime but nominally a different type.
    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    pages.push({
      jpegBytes: canvas.toBuffer("image/jpeg", JPEG_QUALITY),
      page: pageNumber,
    });
  }

  return pages;
}
