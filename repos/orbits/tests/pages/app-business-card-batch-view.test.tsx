import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";

import type {
  BusinessCardBatchDTO,
  BusinessCardBatchItemDTO,
} from "../../features/acquisition/business-card-batch-contract";
import { BusinessCardBatchViewPure, type BusinessCardBatchFixedFields } from "../../app/(app)/app/contacts/new/batch/[id]/business-card-batch-view";

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
      onCancel={noop}
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
  assert.ok(html.includes("取消剩余导入"));
  assert.ok(!html.includes("run-business-card-batch-worker"));
  assert.ok(html.includes("cards.pdf"));
  assert.ok(html.includes("确认后卡图不再可访问，并由后台删除"));
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
  assert.ok(failedHtml.includes("手工录入"));

  const finishHtml = render({
    batch: batch({ confirmedItems: 1, processedItems: 1, status: "ready_for_review", totalItems: 1 }),
    items: [item({ status: "confirmed", imagePath: null })],
  });
  assert.ok(finishHtml.includes("完成批次"));
});

test("failed cards can be typed in and submitted only after a name is provided", async () => {
  let submitted: { fields: BusinessCardBatchFixedFields; manual?: boolean } | null = null;
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<BusinessCardBatchViewPure
      batch={batch({ failedItems: 1, status: "ready_for_review", totalItems: 1 })}
      busy={false}
      duplicateItemId={null}
      items={[item({ errorCode: "OCR_PROVIDER_FAILED", status: "failed" })]}
      nowMs={Date.parse(NOW)}
      onCancel={noop}
      onConfirm={(_item, fields, _allowDuplicate, manual) => { submitted = { fields, manual }; }}
      onFinish={noop}
      onRetry={noop}
      onSkip={noop}
    />);
  });
  const button = (label: string) => renderer!.root.findAllByType("button").find((entry) => entry.props.children === label)!;
  await act(async () => button("手工录入").props.onClick());
  assert.equal(button("保存手工录入").props.disabled, true);
  const name = renderer!.root.findAllByType("input")[0]!;
  await act(async () => name.props.onChange({ target: { value: "手工联系人" } }));
  assert.equal(button("保存手工录入").props.disabled, false);
  await act(async () => button("保存手工录入").props.onClick());
  assert.deepEqual(submitted, {
    fields: {
      displayName: "手工联系人", email: "", notes: "", organization: "", phone: "",
      relationshipContext: "批量导入 · cards.pdf · 第1页", role: "",
    },
    manual: true,
  });
  await act(async () => renderer!.unmount());
});


test("cancelled view distinguishes pending deletion from completed cleanup and offers no import actions", () => {
  const pending = render({ batch: batch({ status: "cancelled" }) });
  assert.ok(pending.includes("批次已取消"));
  assert.ok(pending.includes("正在后台删除卡图"));
  assert.ok(!pending.includes("取消剩余导入"));
  const deleted = render({ batch: batch({ status: "cancelled", imagesDeletedAt: NOW }) });
  assert.ok(deleted.includes("卡图已删除"));
  assert.ok(!deleted.includes("正在后台删除卡图"));
});

const EMPTY_EXTRACTION = {
  addresses: [],
  certifications: [],
  contactPoints: [],
  departments: [],
  detectedLanguages: [],
  emails: [],
  fullName: null,
  nativeFullName: null,
  organization: null,
  romanizedFullName: null,
  title: null,
  website: null,
} as const;

test("an extracted card with no fields shows a hand-fill notice and blocks confirm until a name is typed", async () => {
  const html = render({
    batch: batch({ processedItems: 1, status: "ready_for_review", totalItems: 1 }),
    items: [item({ extraction: EMPTY_EXTRACTION, status: "extracted" })],
  });
  assert.ok(html.includes("识别没有读到任何字段，请对照卡图手工填写。"));
  assert.ok(html.includes('data-batch-hint="name-required"'));

  let submitted: BusinessCardBatchFixedFields | null = null;
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<BusinessCardBatchViewPure
      batch={batch({ processedItems: 1, status: "ready_for_review", totalItems: 1 })}
      busy={false}
      duplicateItemId={null}
      items={[item({ extraction: EMPTY_EXTRACTION, status: "extracted" })]}
      nowMs={Date.parse(NOW)}
      onCancel={noop}
      onConfirm={(_item, fields) => { submitted = fields; }}
      onFinish={noop}
      onRetry={noop}
      onSkip={noop}
    />);
  });
  const button = (label: string) => renderer!.root.findAllByType("button").find((entry) => entry.props.children === label)!;
  assert.equal(button("确认并下一张").props.disabled, true);
  assert.equal(button("跳过").props.disabled, false);
  assert.equal(renderer!.root.findAllByProps({ "data-batch-hint": "name-required" }).length > 0, true);

  const name = renderer!.root.findAllByType("input")[0]!;
  await act(async () => name.props.onChange({ target: { value: "   " } }));
  assert.equal(button("确认并下一张").props.disabled, true);
  await act(async () => name.props.onChange({ target: { value: "手填姓名" } }));
  assert.equal(button("确认并下一张").props.disabled, false);
  assert.equal(renderer!.root.findAllByProps({ "data-batch-hint": "name-required" }).length, 0);
  // The empty-OCR notice stays as context while the reviewer fills the card in.
  assert.equal(renderer!.root.findAllByProps({ "data-batch-notice": "empty-extraction" }).length > 0, true);

  await act(async () => button("确认并下一张").props.onClick());
  assert.equal(submitted!.displayName, "手填姓名");
  await act(async () => renderer!.unmount());
});

test("a recognized card with a name shows neither the empty notice nor the name hint", () => {
  const html = render({
    batch: batch({ processedItems: 1, status: "ready_for_review", totalItems: 1 }),
    items: [item({ extraction: { ...EMPTY_EXTRACTION, fullName: "青空 太郎", nativeFullName: "青空 太郎" }, status: "extracted" })],
  });
  assert.ok(!html.includes("识别没有读到任何字段"));
  assert.ok(!html.includes('data-batch-hint="name-required"'));
  assert.ok(html.includes('type="button">确认并下一张</button>'));
  assert.ok(!html.includes('disabled="" type="button">确认并下一张'));
});

// The review action row is the last child of .bcb-review-form, so `position: sticky;
// bottom: 0` has zero travel there — measured at 375x812 the row sat at top=937, only
// reachable after scrolling the whole page. It has to be a genuinely pinned bar, with
// the same height reserved in the flow so nothing below it becomes unreachable.
test("narrow screens pin the review action row and reserve its height in the flow", () => {
  const source = readFileSync(
    "app/(app)/app/contacts/new/batch/[id]/business-card-batch-view.tsx",
    "utf8",
  );
  const narrow = [...source.matchAll(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1]!)
    .find((block) => block.includes(".bcb-actions-review"));
  assert.ok(narrow, "the narrow-screen block must style .bcb-actions-review");

  // Only the review row is pinned, and it is marked as such in the markup.
  assert.ok(source.includes('className="bcb-actions bcb-actions-review"'));
  assert.match(narrow, /\.bcb-actions-review \{[^}]*position: fixed/);
  assert.match(narrow, /\.bcb-actions-review \{[^}]*bottom: 0/);
  assert.match(narrow, /\.bcb-actions-review \{[^}]*left: 0/);
  assert.match(narrow, /\.bcb-actions-review \{[^}]*right: 0/);
  assert.ok(!/\.bcb-actions[^{]*\{[^}]*position: sticky/.test(narrow));
  // Above page content, below dropdowns/overlays/modals/toasts.
  assert.match(narrow, /\.bcb-actions-review \{[^}]*z-index: \$\{ORBIT_Z\.sticky\}/);
  assert.match(source, /import \{ ORBIT_Z \} from "\.\.\/\.\.\/\.\.\/\.\.\/orbit-z"/);
  // A fixed bar leaves the flow, so the reserve has to sit at the END of the
  // scrollable content (the shell) — measured: padding inside .bcb-review-form moves
  // the tail down with the extra scroll range and leaves it just as trapped.
  assert.match(narrow, /\.bcb-shell:has\(\.bcb-actions-review\) \{[^}]*padding-bottom: calc\(var\(--bcb-pinned-bar-h\) \+ 12px\)/);
  assert.ok(!/\.bcb-review-form \{[^}]*padding-bottom/.test(narrow));
  assert.match(narrow, /--bcb-pinned-bar-h: 118px/);
  assert.match(narrow, /env\(safe-area-inset-bottom/);
  // The 3-row notes cap from the same narrow-screen pass stays.
  assert.match(narrow, /textarea\.bcb-notes \{ height: calc\(4\.5em \+ 20px\)/);
  // Desktop layout untouched: the base rule keeps the row in normal flow.
  assert.ok(source.includes(".bcb-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }"));
});
