import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  BusinessCardBatchDTO,
  BusinessCardBatchItemDTO,
} from "../../features/acquisition/business-card-batch-contract";
import { BusinessCardBatchViewPure } from "../../app/(app)/app/contacts/new/batch/[id]/business-card-batch-view";

const NOW = "2026-08-26T15:00:00.000Z";

function batch(overrides: Partial<BusinessCardBatchDTO> = {}): BusinessCardBatchDTO {
  return {
    actorId: "account:test",
    confirmedItems: 0,
    createdAt: NOW,
    expiresAt: "2026-09-02T15:00:00.000Z",
    failedItems: 0,
    id: "batch-1",
    processedItems: 0,
    skippedItems: 0,
    sourceFiles: [{ fileName: "cards.pdf", itemCount: 2, kind: "pdf" }],
    status: "processing",
    totalItems: 2,
    updatedAt: NOW,
    ...overrides,
  };
}

function item(overrides: Partial<BusinessCardBatchItemDTO> = {}): BusinessCardBatchItemDTO {
  return {
    actorId: "account:test",
    attempts: 0,
    batchId: "batch-1",
    confirmedContactId: null,
    createdAt: NOW,
    errorCode: null,
    extraction: null,
    id: "item-1",
    imageDigest: "sha256:abc",
    imagePath: "/tmp/item-1.jpg",
    leaseOwner: null,
    leasedAt: null,
    reviewIssues: [],
    seq: 1,
    sourceFileName: "cards.pdf",
    sourcePage: 1,
    status: "pending",
    updatedAt: NOW,
    uploadMimeType: "application/pdf",
    usage: null,
    ...overrides,
  };
}

const noop = () => undefined;

function render(
  props: Partial<Parameters<typeof BusinessCardBatchViewPure>[0]>,
): string {
  return renderToStaticMarkup(
    <BusinessCardBatchViewPure
      batch={batch()}
      busy={false}
      duplicateItemId={null}
      items={[]}
      nowMs={Date.parse(NOW)}
      onConfirm={noop}
      onFinish={noop}
      onRetry={noop}
      onSkip={noop}
      {...props}
    />,
  );
}

test("processing view shows progress, per-card cells, and a stalled-worker warning", () => {
  const staleUpdatedAt = new Date(Date.parse(NOW) - 120_000).toISOString();
  const html = render({
    batch: batch({ processedItems: 1, updatedAt: staleUpdatedAt }),
    items: [item({ status: "extracted" }), item({ id: "item-2", seq: 2 })],
    nowMs: Date.parse(NOW),
  });

  assert.ok(html.includes("正在识别名片"));
  assert.ok(html.includes("1/2"));
  assert.ok(html.includes("run-business-card-batch-worker"));
  assert.ok(html.includes("cards.pdf"));
  assert.ok(html.includes("卡图保留至你完成确认"));
});

test("review view prefills fixed fields and the aggregated notes textarea", () => {
  const html = render({
    batch: batch({ processedItems: 2, status: "ready_for_review" }),
    items: [
      item({
        extraction: {
          addresses: [{ label: "本社", value: "東京都テスト区1-2-3" }],
          certifications: [],
          contactPoints: [
            { label: "TEL", type: "phone", value: "03-0000-1111" },
            { label: "FAX", type: "fax", value: "03-0000-2222" },
          ],
          departments: ["事業開発室"],
          detectedLanguages: ["ja"],
          emails: [{ label: null, value: "taro@example.test" }],
          fullName: "青空 太郎",
          nativeFullName: "青空 太郎",
          organization: "架空技研株式会社",
          romanizedFullName: null,
          title: "室長",
          website: null,
        },
        status: "extracted",
      }),
    ],
  });

  assert.ok(html.includes('value="青空 太郎"'));
  assert.ok(html.includes('value="架空技研株式会社"'));
  assert.ok(html.includes("传真(FAX): 03-0000-2222"));
  assert.ok(html.includes("地址(本社): 東京都テスト区1-2-3"));
  assert.ok(html.includes("确认并下一张"));
});

test("a duplicate flag switches the actions to skip or create-anyway", () => {
  const extracted = item({
    extraction: {
      addresses: [],
      certifications: [],
      contactPoints: [],
      departments: [],
      detectedLanguages: ["ja"],
      emails: [],
      fullName: "青空 太郎",
      nativeFullName: "青空 太郎",
      organization: "架空技研株式会社",
      romanizedFullName: null,
      title: "室長",
      website: null,
    },
    status: "extracted",
  });
  const html = render({
    batch: batch({ processedItems: 1, status: "ready_for_review", totalItems: 1 }),
    duplicateItemId: extracted.id,
    items: [extracted],
  });

  assert.ok(html.includes("该联系人似乎已存在"));
  assert.ok(html.includes("仍然创建"));
  assert.ok(html.includes("跳过此卡"));
});

test("failed cards offer retry, and a fully settled batch offers finish", () => {
  const failedHtml = render({
    batch: batch({ failedItems: 1, status: "ready_for_review", totalItems: 1 }),
    items: [item({ errorCode: "OCR_PROVIDER_TIMEOUT", status: "failed" })],
  });
  assert.ok(failedHtml.includes("识别失败"));
  assert.ok(failedHtml.includes("重试识别"));

  const finishHtml = render({
    batch: batch({ confirmedItems: 1, processedItems: 1, status: "ready_for_review", totalItems: 1 }),
    items: [item({ status: "confirmed", imagePath: null })],
  });
  assert.ok(finishHtml.includes("完成批次"));
});
