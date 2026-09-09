import assert from "node:assert/strict";
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
