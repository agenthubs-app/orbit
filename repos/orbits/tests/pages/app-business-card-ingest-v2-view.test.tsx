import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import {
  ReviewPane,
  ingestExtractionHasNoFields,
} from "../../app/(app)/app/contacts/new/batch2/[id]/business-card-ingest-v2-view";

const NOW = "2026-08-26T15:00:00.000Z";

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

function item(overrides: Partial<IngestItemDTO> = {}): IngestItemDTO {
  return {
    attemptCount: 1,
    batchId: "batch-1",
    clientDigest: "sha256:client",
    confirmedContactId: null,
    createdAt: NOW,
    derivativeObjectKey: "derivatives/item-1.jpg",
    derivativeSize: 1024,
    errorCode: null,
    errorStage: null,
    extraction: null,
    extractionSchemaVersion: 1,
    id: "item-1",
    imageDigest: "sha256:abc",
    leaseExpiresAt: null,
    nextRetryAt: null,
    rawMimeType: "image/jpeg",
    rawSize: 2048,
    reviewIssues: [],
    seq: 1,
    sourceFileName: "card.jpg",
    status: "extracted",
    updatedAt: NOW,
    usage: null,
    version: 1,
    ...overrides,
  };
}

const t = (copy: { en: string; zh: string }) => copy.zh;
const noop = () => undefined;

function paneProps(overrides: Partial<Parameters<typeof ReviewPane>[0]> = {}) {
  return {
    batchId: "batch-1",
    busy: false,
    duplicate: false,
    item: item(),
    manual: false,
    onConfirm: noop,
    onManualToggle: noop,
    onReplace: noop,
    onRetry: noop,
    onSkip: noop,
    remaining: 1,
    t,
    ...overrides,
  };
}

test("ingestExtractionHasNoFields judges the V2 prefill, not just the raw extraction", () => {
  assert.equal(ingestExtractionHasNoFields(item({ extraction: EMPTY_EXTRACTION })), true);
  assert.equal(ingestExtractionHasNoFields(item({ extraction: null })), true);
  assert.equal(
    ingestExtractionHasNoFields(item({ extraction: { ...EMPTY_EXTRACTION, nativeFullName: "渡辺 花子" } })),
    false,
  );
  // A WeChat-only contact point never lands in the phone slot, so it counts as nothing read.
  assert.equal(
    ingestExtractionHasNoFields(item({
      extraction: { ...EMPTY_EXTRACTION, contactPoints: [{ label: null, type: "wechat", value: "wx_id" }] },
    })),
    true,
  );
  assert.equal(
    ingestExtractionHasNoFields(item({
      extraction: { ...EMPTY_EXTRACTION, contactPoints: [{ label: null, type: "mobile", value: "090-0000-0000" }] },
    })),
    false,
  );
});

test("an extracted card with no fields shows a hand-fill notice and blocks confirm until a name is typed", async () => {
  const html = renderToStaticMarkup(<ReviewPane {...paneProps({ item: item({ extraction: EMPTY_EXTRACTION }) })} />);
  assert.ok(html.includes("识别没有读到任何字段，请对照卡图手工填写。"));
  assert.ok(html.includes('data-batch-notice="empty-extraction"'));
  assert.ok(html.includes('data-batch-hint="name-required"'));
  assert.ok(html.includes('class="bci-notes"'));

  let submitted: { displayName: string } | null = null;
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<ReviewPane {...paneProps({
      item: item({ extraction: EMPTY_EXTRACTION }),
      onConfirm: (fields) => { submitted = fields; },
    })} />);
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
  const html = renderToStaticMarkup(<ReviewPane {...paneProps({
    item: item({ extraction: { ...EMPTY_EXTRACTION, fullName: "青空 太郎", nativeFullName: "青空 太郎" } }),
  })} />);
  assert.ok(!html.includes("识别没有读到任何字段"));
  assert.ok(!html.includes('data-batch-hint="name-required"'));
  assert.ok(html.includes('type="button">确认并下一张</button>'));
  assert.ok(!html.includes('disabled="" type="button">确认并下一张'));
});

test("the duplicate create-anyway button also waits for a name", async () => {
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<ReviewPane {...paneProps({ duplicate: true, item: item({ extraction: EMPTY_EXTRACTION }) })} />);
  });
  const button = (label: string) => renderer!.root.findAllByType("button").find((entry) => entry.props.children === label)!;
  assert.equal(button("仍然创建").props.disabled, true);
  assert.equal(button("跳过此卡").props.disabled, false);
  const name = renderer!.root.findAllByType("input")[0]!;
  await act(async () => name.props.onChange({ target: { value: "重复联系人" } }));
  assert.equal(button("仍然创建").props.disabled, false);
  await act(async () => renderer!.unmount());
});

test("manual entry on a failed card shows the name hint and enables save once a name is typed", async () => {
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<ReviewPane {...paneProps({
      item: item({ errorCode: "OCR_PROVIDER_FAILED" as IngestItemDTO["errorCode"], status: "terminal_failed" }),
      manual: true,
    })} />);
  });
  const button = (label: string) => renderer!.root.findAllByType("button").find((entry) => entry.props.children === label)!;
  assert.equal(button("保存手工录入").props.disabled, true);
  assert.equal(renderer!.root.findAllByProps({ "data-batch-hint": "name-required" }).length > 0, true);
  // Failed cards are not "empty extractions" — no OCR ran to completion.
  assert.equal(renderer!.root.findAllByProps({ "data-batch-notice": "empty-extraction" }).length, 0);
  const name = renderer!.root.findAllByType("input")[0]!;
  await act(async () => name.props.onChange({ target: { value: "手工联系人" } }));
  assert.equal(button("保存手工录入").props.disabled, false);
  assert.equal(renderer!.root.findAllByProps({ "data-batch-hint": "name-required" }).length, 0);
  await act(async () => renderer!.unmount());
});

test("a failed card outside manual mode shows no hint and no editor", () => {
  const html = renderToStaticMarkup(<ReviewPane {...paneProps({
    item: item({ status: "terminal_failed" }),
  })} />);
  assert.ok(!html.includes('data-batch-hint="name-required"'));
  assert.ok(!html.includes('class="bci-notes"'));
  assert.ok(html.includes("重试识别"));
});

// Same defect and same fix as the V1 batch view: the review action row is the last
// child of .bci-review-form, so `position: sticky; bottom: 0` has zero travel and can
// never lift the row into a 812px-tall viewport. It must be a pinned bar, and only the
// review row — the batch-level .bci-actions stays in flow.
test("narrow screens pin the review action row and reserve its height in the flow", () => {
  const source = readFileSync(
    "app/(app)/app/contacts/new/batch2/[id]/business-card-ingest-v2-view.tsx",
    "utf8",
  );
  const narrow = [...source.matchAll(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1]!)
    .find((block) => block.includes(".bci-actions-review"));
  assert.ok(narrow, "the narrow-screen block must style .bci-actions-review");

  assert.ok(source.includes('className="bci-actions bci-actions-review"'));
  assert.match(narrow, /\.bci-actions-review \{[^}]*position: fixed/);
  assert.match(narrow, /\.bci-actions-review \{[^}]*bottom: 0/);
  assert.match(narrow, /\.bci-actions-review \{[^}]*left: 0/);
  assert.match(narrow, /\.bci-actions-review \{[^}]*right: 0/);
  assert.ok(!/\.bci-actions[^{]*\{[^}]*position: sticky/.test(narrow));
  // Above page content, below dropdowns/overlays/modals/toasts.
  assert.match(narrow, /\.bci-actions-review \{[^}]*z-index: \$\{ORBIT_Z\.sticky\}/);
  assert.match(source, /import \{ ORBIT_Z \} from "\.\.\/\.\.\/\.\.\/\.\.\/orbit-z"/);
  // The reserve sits at the END of the scrollable content (the shell), not inside the
  // review form — padding inside the form moves the tail down with the extra scroll
  // range and leaves the last elements just as trapped (measured at 375x812).
  assert.match(narrow, /\.bci-shell:has\(\.bci-actions-review\) \{[^}]*padding-bottom: calc\(var\(--orbit-pinned-bar-h\) \+ 12px\)/);
  assert.ok(!/\.bci-review-form \{[^}]*padding-bottom/.test(narrow));
  assert.match(narrow, /body:has\(\.bci-actions-review\) \{ --orbit-pinned-bar-h: calc\(54px \+ max\(12px, env\(safe-area-inset-bottom, 0px\)\)\); \}/);
  assert.match(narrow, /env\(safe-area-inset-bottom/);
  // The 3-row notes cap from the same narrow-screen pass stays.
  assert.match(narrow, /textarea\.bci-notes \{ height: calc\(4\.5em \+ 20px\)/);
  // The batch-level action row (cancel batch / re-attach) is never pinned.
  assert.ok(source.includes(".bci-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 4px; }"));
  assert.ok(!narrow.includes(".bci-actions {"));
});
