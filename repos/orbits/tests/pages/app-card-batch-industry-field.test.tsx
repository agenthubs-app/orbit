import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import { IndustryField, useReviewEnterConfirm } from "../../app/(app)/app/contacts/card-batch-0918/card-batch-ui";
import {
  buildConfirmationPayload,
  groupIngestItemsByCardId,
  industryCandidates,
  initialCardDraft,
  setDraftIndustry,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
} from "../../app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model";

// W0013：确认页「行业」一行（一级 › 二级）可改、可清空，修改值随确认提交。

const NOW = "2026-09-28T00:00:00.000Z";
const zh = (copy: { zh: string; en: string }) => copy.zh;

function item(industry: { primaryIndustryId: string | null; secondaryIndustryId: string | null } | null): IngestItemDTO {
  return {
    attemptCount: 1, batchId: "batch-1", cardId: "card-1", side: "front", clientDigest: `sha256:${"c".repeat(64)}`,
    confirmedContactId: null, createdAt: NOW, derivativeObjectKey: "d/card.jpg", derivativeSize: 100, errorCode: null, errorStage: null,
    extraction: {
      addresses: [], certifications: [], contactPoints: [], departments: [], detectedLanguages: [], emails: [],
      fullName: "青空 太郎", nativeFullName: "青空 太郎", organization: "架空法律事務所", romanizedFullName: null, title: "弁護士", website: null,
      ...(industry ?? {}),
    } as IngestItemDTO["extraction"],
    extractionSchemaVersion: industry ? 2 : 1, id: "item-1", imageDigest: `sha256:${"a".repeat(64)}`, leaseExpiresAt: null, nextRetryAt: null,
    rawMimeType: "image/jpeg", rawSize: 100, reviewIssues: [], seq: 1, sourceFileName: "card.jpg", status: "extracted", updatedAt: NOW,
    usage: null, version: 1,
  };
}

function mount(card: IngestV2CardViewModel) {
  let latest: IngestV2CardDraft = initialCardDraft(card);
  function Harness() {
    const baseline = initialCardDraft(card);
    const [draft, setDraft] = useState(baseline);
    latest = draft;
    return <IndustryField baseline={baseline} busy={false} candidates={industryCandidates(card)} draft={draft} onChange={selection => setDraft(current => setDraftIndustry(current, selection))} t={zh} />;
  }
  let renderer: ReactTestRenderer;
  act(() => { renderer = create(<Harness />); });
  const select = (label: string) => renderer!.root.findAllByType("select").find(entry => entry.props["aria-label"] === label)!;
  const tag = () => renderer!.root.findAll(node => typeof node.props.className === "string" && node.props.className.startsWith("cb-rtag "))[0]!.props.children as string;
  return { draft: () => latest, renderer: renderer!, select, tag };
}

test("the industry row shows the recognized primary › secondary pair", () => {
  const card = groupIngestItemsByCardId([item({ primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" })])[0]!;
  const view = mount(card);
  const field = view.renderer.root.findByProps({ "data-review-field": "industry" });
  assert.ok(field.findAll(node => node.type === "span" && node.props.children === "行业").length > 0);
  assert.equal(view.select("一级行业").props.value, "professional_services");
  assert.equal(view.select("二级行业").props.value, "professional_services.legal");
  assert.equal(view.renderer.root.findAll(node => node.props.className === "cb-rindustry-sep")[0]!.props.children, "›");
  const secondaryOptions = view.select("二级行业").findAllByType("option").map(option => option.props.value);
  assert.ok(secondaryOptions.includes("professional_services.legal"));
  assert.ok(secondaryOptions.every(value => value === "" || String(value).startsWith("professional_services.")), "only children of the primary are offered");
  assert.equal(view.tag(), "已识别");
});

test("changing the primary clears the secondary, and the edited pair is what confirmation submits", () => {
  const card = groupIngestItemsByCardId([item({ primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" })])[0]!;
  const view = mount(card);
  act(() => view.select("一级行业").props.onChange({ target: { value: "finance_investment" } }));
  assert.equal(view.select("二级行业").props.value, "");
  act(() => view.select("二级行业").props.onChange({ target: { value: "finance_investment.insurance" } }));
  assert.equal(view.tag(), "✓ 已修改");
  const payload = buildConfirmationPayload(card, view.draft(), "intent:edited").payload!;
  assert.equal(payload.primaryIndustryId, "finance_investment");
  assert.equal(payload.secondaryIndustryId, "finance_investment.insurance");
});

test("the reviewer can clear the industry; an old card without industry starts empty with the secondary disabled", () => {
  const card = groupIngestItemsByCardId([item({ primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" })])[0]!;
  const view = mount(card);
  act(() => view.select("一级行业").props.onChange({ target: { value: "" } }));
  assert.equal(view.select("二级行业").props.disabled, true);
  const payload = buildConfirmationPayload(card, view.draft(), "intent:cleared").payload!;
  assert.equal(payload.primaryIndustryId, null);
  assert.equal(payload.secondaryIndustryId, null);

  const legacy = mount(groupIngestItemsByCardId([item(null)])[0]!);
  assert.equal(legacy.select("一级行业").props.value, "");
  assert.equal(legacy.select("二级行业").props.disabled, true);
  assert.equal(legacy.tag(), "未识别到");
});

test("the review screen renders the industry row between the fixed fields and the notes", () => {
  const source = readFileSync("app/(app)/app/contacts/card-batch-0918/card-batch-ui.tsx", "utf8");
  const review = source.slice(source.indexOf("{INGEST_V2_FIELDS.map(field =>"));
  assert.ok(review.indexOf("<IndustryField") > 0);
  assert.ok(review.indexOf("<IndustryField") < review.indexOf("cb-rfield-notes"));
  assert.match(source, /setDraftIndustry\(current\[active\.cardId\] \?\? draft, selection\)/);
});

function twoSided(front: [string, string | null], back: [string, string | null]): IngestV2CardViewModel {
  const side = (which: "front" | "back", [primaryIndustryId, secondaryIndustryId]: [string, string | null]): IngestItemDTO => ({
    ...item({ primaryIndustryId, secondaryIndustryId }), id: `item-${which}`, side: which, seq: which === "front" ? 1 : 2,
    imageDigest: `sha256:${(which === "front" ? "a" : "b").repeat(64)}`,
  });
  return groupIngestItemsByCardId([side("front", front), side("back", back)])[0]!;
}

test("different industries on two sides show 请核对 with no preselected value until the reviewer picks or clears", () => {
  const card = twoSided(["technology_internet", "technology_internet.ai_data"], ["finance_investment", "finance_investment.fintech"]);
  const view = mount(card);
  assert.equal(view.tag(), "请核对");
  assert.equal(view.select("一级行业").props.value, "");
  assert.equal(view.draft().industry.conflicted, true);
  const choices = () => view.renderer.root.findByProps({ "data-industry-conflict": true }).findAllByType("button");
  assert.deepEqual(choices().map(button => button.props.children), ["科技与互联网 › 人工智能与数据", "金融与投资 › 金融科技", "都不对，留空"]);

  act(() => choices()[1]!.props.onClick());
  assert.equal(view.draft().industry.conflicted, false);
  assert.equal(view.select("一级行业").props.value, "finance_investment");
  assert.equal(view.select("二级行业").props.value, "finance_investment.fintech");
  assert.equal(view.renderer.root.findAllByProps({ "data-industry-conflict": true }).length, 0);
  assert.equal(buildConfirmationPayload(card, view.draft(), "intent:picked").payload?.primaryIndustryId, "finance_investment");

  const clearing = mount(card);
  act(() => clearing.renderer.root.findByProps({ "data-industry-conflict": true }).findAllByType("button").at(-1)!.props.onClick());
  assert.deepEqual(clearing.draft().industry, { primaryIndustryId: null, secondaryIndustryId: null, edited: true, conflicted: false });
});

test("Enter on the industry select (or any listbox/combobox) never confirms the card; Enter in a text field still does", () => {
  // 客户端运行时总有 window；测试提供一个最小 window 记录 keydown 监听器，事件形状与浏览器 KeyboardEvent 一致。
  const listeners: ((event: KeyboardEvent) => void)[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => { if (type === "keydown") listeners.push(listener); },
    removeEventListener: (_type: string, listener: (event: KeyboardEvent) => void) => { listeners.splice(listeners.indexOf(listener), 1); },
  };
  try {
    const card = groupIngestItemsByCardId([item({ primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" })])[0]!;
    let confirms = 0;
    function Review() {
      useReviewEnterConfirm(true, () => { confirms += 1; });
      const baseline = initialCardDraft(card);
      return <IndustryField baseline={baseline} busy={false} draft={baseline} onChange={() => undefined} t={zh} />;
    }
    let renderer: ReactTestRenderer;
    act(() => { renderer = create(<Review />); });
    assert.equal(listeners.length, 1);
    const press = (target: unknown) => {
      let prevented = false;
      act(() => listeners[0]!({ key: "Enter", isComposing: false, target, preventDefault: () => { prevented = true; } } as unknown as KeyboardEvent));
      return prevented;
    };
    // 真实渲染出的行业下拉：以它的元素类型作为事件目标（DOM 里 tagName 为大写）。
    const select = renderer!.root.findAllByType("select")[0]!;
    assert.equal(press({ tagName: String(select.type).toUpperCase(), getAttribute: () => null }), false);
    assert.equal(press({ tagName: "OPTION", getAttribute: () => null }), false);
    assert.equal(press({ tagName: "DIV", getAttribute: (name: string) => (name === "role" ? "combobox" : null) }), false);
    assert.equal(press({ tagName: "LI", getAttribute: () => "option", closest: () => ({}) }), false);
    assert.equal(press({ tagName: "TEXTAREA" }), false);
    assert.equal(press({ tagName: "BUTTON" }), false);
    assert.equal(confirms, 0, "none of the control-owned Enter presses confirm the card");

    assert.equal(press({ tagName: "INPUT", getAttribute: () => null, closest: () => null }), true);
    assert.equal(press({ tagName: "BODY", getAttribute: () => null, closest: () => null }), true);
    assert.equal(confirms, 2, "the existing shortcut still confirms from a text field or the page");
    act(() => renderer!.unmount());
    assert.equal(listeners.length, 0);
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("the review screen wires the shared Enter shortcut instead of an inline listener", () => {
  const source = readFileSync("app/(app)/app/contacts/card-batch-0918/card-batch-ui.tsx", "utf8");
  assert.match(source, /useReviewEnterConfirm\(reviewing && !finished, \(\) => void act\("confirm"\)\);/);
  assert.equal(source.match(/addEventListener\("keydown"/g)?.length, 1);
});
