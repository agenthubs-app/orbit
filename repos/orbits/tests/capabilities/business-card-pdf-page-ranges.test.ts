import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { paginatePdfToCardImages, renderBusinessCardPdfPageRange } from "../../features/acquisition/business-card-pdf-pagination";

function pdf(pageCount: number, unusedBytes = 0): Buffer {
  const objects: Buffer[] = [];
  const add = (value: string | Buffer) => objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(" ")}] /Count ${pageCount} >>`);
  for (let i = 0; i < pageCount; i++) add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${48 + i % 3} 32] /Resources << >> /Contents ${3 + pageCount + i} 0 R >>`);
  for (let i = 0; i < pageCount; i++) {
    const content = `${(i % 10) / 10} 0.3 0.7 rg 0 0 40 30 re f\n`;
    add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  }
  if (unusedBytes) add(Buffer.concat([Buffer.from(`<< /Length ${unusedBytes} >>\nstream\n`), Buffer.alloc(unusedBytes), Buffer.from("\nendstream")]));
  const parts = [Buffer.from("%PDF-1.4\n")]; const offsets = [0]; let offset = parts[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const object = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), objects[i], Buffer.from("\nendobj\n")]);
    parts.push(object); offset += object.length;
  }
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return Buffer.concat(parts);
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("bounded PDF ranges resume with exactly the same pages as the compatibility renderer", async () => {
  const bytes = pdf(5), all = await paginatePdfToCardImages({ pdfBytes: bytes, maxPages: 500 });
  const rendered: { page: number; digest: string }[] = [];
  const acceptPage = async ({ page, pageCount, jpegBytes }: { page: number; pageCount: number; jpegBytes: Buffer }) => {
    assert.equal(pageCount, 5);
    const metadata = await sharp(jpegBytes).metadata();
    assert.equal(metadata.format, "jpeg"); assert.equal(metadata.width, (48 + (page - 1) % 3) * 4);
    rendered.push({ page, digest: digest(jpegBytes) });
  };
  const first = await renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: 2, pageLimit: 2, acceptPage });
  assert.deepEqual(first, { pageCount: 5, renderedPages: 2, nextPage: 4, complete: false });
  const last = await renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: first.nextPage, pageLimit: 2, acceptPage });
  assert.deepEqual(last, { pageCount: 5, renderedPages: 2, nextPage: 6, complete: true });
  assert.deepEqual(rendered, all.slice(1).map(({ page, jpegBytes }) => ({ page, digest: digest(jpegBytes) })));
});

test("a page waits for durable acceptance and failed persistence resumes from the uncommitted page", async () => {
  const bytes = pdf(3); let release!: () => void; let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const accepted: number[] = [];
  const rendering = renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: 1, pageLimit: 3,
    async acceptPage({ page }) { if (page === 1) { entered(); await waiting; } accepted.push(page); },
  });
  await started; await new Promise((resolve) => setImmediate(resolve)); assert.deepEqual(accepted, []);
  release(); await rendering; assert.deepEqual(accepted, [1, 2, 3]);
  let committed = 0;
  await assert.rejects(renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: 1, pageLimit: 3,
    async acceptPage({ page }) { if (page === 2) throw new Error("storage unavailable"); committed = page; },
  }), /storage unavailable/);
  assert.equal(committed, 1);
  const resumed: number[] = [];
  await renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: committed + 1, pageLimit: 3,
    async acceptPage({ page }) { resumed.push(page); },
  });
  assert.deepEqual(resumed, [2, 3]);
});

test("cancellation stops page delivery and a fresh range remains usable", async () => {
  const controller = new AbortController(), bytes = pdf(3), accepted: number[] = [];
  await assert.rejects(renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: 1, pageLimit: 3, signal: controller.signal,
    async acceptPage({ page }) { accepted.push(page); controller.abort(); },
  }), /BUSINESS_CARD_PDF_CANCELLED/);
  assert.deepEqual(accepted, [1]);
  const result = await renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: 2, pageLimit: 2, async acceptPage() {} });
  assert.equal(result.complete, true);
});

test("500-page PDFs stay supported without accumulating output pages, and oversized batches reject before delivery", async () => {
  let count = 0, totalBytes = 0;
  const result = await renderBusinessCardPdfPageRange({ pdfBytes: pdf(500), maxPages: 500, firstPage: 1, pageLimit: 500,
    async acceptPage({ page, jpegBytes }) { assert.equal(page, ++count); totalBytes += jpegBytes.length; },
  });
  assert.equal(result.complete, true); assert.equal(count, 500); assert.ok(totalBytes > 0);
  await assert.rejects(renderBusinessCardPdfPageRange({ pdfBytes: pdf(501), maxPages: 500, firstPage: 1, pageLimit: 1,
    async acceptPage() { assert.fail("no page may be delivered from an oversized PDF"); },
  }), /BUSINESS_CARD_BATCH_TOO_LARGE/);
});

test("a valid PDF near the 50 MiB limit renders a bounded page range", async () => {
  const bytes = pdf(1, 49 * 1024 * 1024);
  assert.ok(bytes.length > 49 * 1024 * 1024 && bytes.length < 50 * 1024 * 1024);
  let pageBytes = 0;
  const result = await renderBusinessCardPdfPageRange({ pdfBytes: bytes, maxPages: 500, firstPage: 1, pageLimit: 1,
    async acceptPage({ jpegBytes }) { pageBytes = jpegBytes.length; },
  });
  assert.ok(pageBytes > 0); assert.equal(result.complete, true);
});
