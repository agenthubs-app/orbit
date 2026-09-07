import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { BUSINESS_CARD_BATCH_MAX_ITEMS, BUSINESS_CARD_BATCH_MAX_PDF_BYTES } from "./business-card-batch-contract";

const MAX_RENDER_EDGE_PX = 3072;
const JPEG_QUALITY = 0.88;

export interface BusinessCardPdfPage {
  page: number;
  pageCount: number;
  jpegBytes: Buffer;
}

/** Render a bounded range, awaiting durable acceptance of each page before
 * allocating the next canvas. Callers can resume at the last committed page + 1.
 * This does not itself persist progress or dispatch background work.
 */
export async function renderBusinessCardPdfPageRange(input: {
  pdfBytes: Buffer;
  maxPages: number;
  firstPage: number;
  pageLimit: number;
  signal?: AbortSignal;
  acceptPage(page: BusinessCardPdfPage): Promise<void>;
}): Promise<{ pageCount: number; renderedPages: number; nextPage: number; complete: boolean }> {
  if (!Number.isInteger(input.maxPages) || input.maxPages < 0 || input.maxPages > BUSINESS_CARD_BATCH_MAX_ITEMS ||
      !Number.isInteger(input.firstPage) || input.firstPage < 1 ||
      !Number.isInteger(input.pageLimit) || input.pageLimit < 1 || input.pageLimit > BUSINESS_CARD_BATCH_MAX_ITEMS) {
    throw new Error("BUSINESS_CARD_PDF_INVALID_RANGE");
  }
  if (!input.pdfBytes.length || input.pdfBytes.length > BUSINESS_CARD_BATCH_MAX_PDF_BYTES) {
    throw new Error("BUSINESS_CARD_PDF_UNREADABLE");
  }
  const checkCancelled = () => {
    if (input.signal?.aborted) throw new Error("BUSINESS_CARD_PDF_CANCELLED");
  };
  checkCancelled();
  // pdf.js requires a Uint8Array, not a Node Buffer. Its task owns this copy.
  const loading = getDocument({ data: new Uint8Array(input.pdfBytes) });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= loading.destroy();
  const abort = () => { void close().catch(() => {}); };
  input.signal?.addEventListener("abort", abort, { once: true });
  try {
    let document;
    try { document = await loading.promise; }
    catch { checkCancelled(); throw new Error("BUSINESS_CARD_PDF_UNREADABLE"); }
    checkCancelled();
    const pageCount = document.numPages;
    if (pageCount > input.maxPages) throw new Error("BUSINESS_CARD_BATCH_TOO_LARGE");
    if (input.firstPage > pageCount + 1) throw new Error("BUSINESS_CARD_PDF_INVALID_RANGE");
    const end = Math.min(pageCount, input.firstPage + input.pageLimit - 1);
    let renderedPages = 0;
    for (let pageNumber = input.firstPage; pageNumber <= end; pageNumber++) {
      checkCancelled();
      const page = await document.getPage(pageNumber);
      let canvas: Canvas | undefined;
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        if (![baseViewport.width, baseViewport.height].every((value) => Number.isFinite(value) && value > 0)) {
          throw new Error("BUSINESS_CARD_PDF_UNREADABLE");
        }
        const scale = Math.min(MAX_RENDER_EDGE_PX / Math.max(baseViewport.width, baseViewport.height), 4);
        const viewport = page.getViewport({ scale });
        canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const rendering = page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport });
        const cancelRender = () => { rendering.cancel(); };
        input.signal?.addEventListener("abort", cancelRender, { once: true });
        try { await rendering.promise; }
        catch { checkCancelled(); throw new Error("BUSINESS_CARD_PDF_UNREADABLE"); }
        finally { input.signal?.removeEventListener("abort", cancelRender); }
        checkCancelled();
        const jpegBytes = canvas.toBuffer("image/jpeg", JPEG_QUALITY);
        // Release the raster before waiting on storage; only the compressed
        // page buffer remains live while the consumer commits its progress.
        canvas.width = 1; canvas.height = 1;
        await input.acceptPage({ page: pageNumber, pageCount, jpegBytes });
        renderedPages++;
        checkCancelled();
      } finally {
        if (canvas) { canvas.width = 1; canvas.height = 1; }
        page.cleanup();
      }
    }
    const nextPage = input.firstPage + renderedPages;
    return { pageCount, renderedPages, nextPage, complete: nextPage > pageCount };
  } finally {
    input.signal?.removeEventListener("abort", abort);
    await close();
  }
}

/** Legacy small-request API. The direct-upload worker will use page ranges
 * instead of retaining every rendered page in this compatibility array.
 */
export async function paginatePdfToCardImages(input: {
  pdfBytes: Buffer;
  maxPages: number;
}): Promise<readonly { page: number; jpegBytes: Buffer }[]> {
  const pages: { page: number; jpegBytes: Buffer }[] = [];
  await renderBusinessCardPdfPageRange({ ...input, firstPage: 1, pageLimit: BUSINESS_CARD_BATCH_MAX_ITEMS,
    async acceptPage({ page, jpegBytes }) { pages.push({ page, jpegBytes }); },
  });
  return pages;
}
