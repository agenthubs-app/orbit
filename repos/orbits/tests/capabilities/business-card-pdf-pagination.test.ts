import assert from "node:assert/strict";
import test from "node:test";

import { paginatePdfToCardImages } from "../../features/acquisition/business-card-pdf-pagination";

// 手写最小两页空白 PDF（Letter 尺寸），pdfjs 可解析（探针已验证）。
const TWO_PAGE_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 5
0000000000 65535 f
trailer << /Size 5 /Root 1 0 R >>
startxref
0
%%EOF`,
  "latin1",
);

test("a two-page PDF becomes two JPEG card images", async () => {
  const pages = await paginatePdfToCardImages({ maxPages: 500, pdfBytes: TWO_PAGE_PDF });

  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((entry) => entry.page), [1, 2]);
  for (const entry of pages) {
    assert.equal(entry.jpegBytes[0], 0xff);
    assert.equal(entry.jpegBytes[1], 0xd8);
  }
});

test("page count above maxPages rejects as batch-too-large", async () => {
  await assert.rejects(
    paginatePdfToCardImages({ maxPages: 1, pdfBytes: TWO_PAGE_PDF }),
    /BUSINESS_CARD_BATCH_TOO_LARGE/,
  );
});

test("garbage bytes reject as unreadable", async () => {
  await assert.rejects(
    paginatePdfToCardImages({ maxPages: 500, pdfBytes: Buffer.from("not a pdf") }),
    /BUSINESS_CARD_PDF_UNREADABLE/,
  );
});
