import assert from "node:assert/strict";
import test from "node:test";
import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import { RegionField, SeniorityField } from "../../app/(app)/app/contacts/card-batch-0918/card-batch-ui";
import {
  buildConfirmationPayload,
  groupIngestItemsByCardId,
  initialCardDraft,
  regionCandidates,
  seniorityCandidates,
  setDraftRegion,
  setDraftSeniority,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
} from "../../app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model";

// W0045：审阅页「职级」（六档下拉 + 派生分组提示）与「地区」（国家 + 城市）两行，标签沿用 fieldTag。

const NOW = "2026-10-02T00:00:00.000Z";
const zh = (copy: { zh: string; en: string }) => copy.zh;

function item(side: "front" | "back", values: Record<string, unknown>): IngestItemDTO {
  return {
    attemptCount: 1, batchId: "batch-1", cardId: "card-1", side, clientDigest: `sha256:${"c".repeat(64)}`,
    confirmedContactId: null, createdAt: NOW, derivativeObjectKey: "d/card.jpg", derivativeSize: 100, errorCode: null, errorStage: null,
    extraction: {
      addresses: [], certifications: [], contactPoints: [], departments: [], detectedLanguages: [], emails: [],
      fullName: "架空 花子", nativeFullName: "架空 花子", organization: "架空商事", romanizedFullName: null, title: "営業本部長", website: null,
      ...values,
    } as IngestItemDTO["extraction"],
    extractionSchemaVersion: 3, id: `item-${side}`, imageDigest: `sha256:${side === "front" ? "a" : "b"}`.padEnd(71, "0"), leaseExpiresAt: null, nextRetryAt: null,
    rawMimeType: "image/jpeg", rawSize: 100, reviewIssues: [], seq: side === "front" ? 1 : 2, sourceFileName: `${side}.jpg`, status: "extracted", updatedAt: NOW,
    usage: null, version: 1,
  };
}

function mount(card: IngestV2CardViewModel) {
  let latest: IngestV2CardDraft = initialCardDraft(card);
  function Harness() {
    const baseline = initialCardDraft(card);
    const [draft, setDraft] = useState(baseline);
    latest = draft;
    return (
      <>
        <SeniorityField baseline={baseline} busy={false} candidates={seniorityCandidates(card)} draft={draft} onChange={value => setDraft(current => setDraftSeniority(current, value))} t={zh} />
        <RegionField baseline={baseline} busy={false} candidates={regionCandidates(card)} draft={draft} onChange={selection => setDraft(current => setDraftRegion(current, selection))} t={zh} />
      </>
    );
  }
  let renderer: ReactTestRenderer;
  act(() => { renderer = create(<Harness />); });
  const field = (name: string) => renderer!.root.findByProps({ "data-review-field": name });
  const select = (label: string) => renderer!.root.findAllByType("select").find(entry => entry.props["aria-label"] === label)!;
  const cityInput = () => renderer!.root.findAllByType("input").find(entry => entry.props["aria-label"] === "城市")!;
  const tag = (name: string) => field(name).findAll(node => typeof node.props.className === "string" && node.props.className.startsWith("cb-rtag "))[0]!.props.children as string;
  const text = (name: string) => JSON.stringify(field(name).findAll(() => true).flatMap(node => [node.props.children].flat()).filter(child => typeof child === "string"));
  return { draft: () => latest, field, select, cityInput, tag, text, renderer: renderer! };
}

test("the seniority row shows the recognized level with its derived group, and an edit is what confirmation submits", () => {
  const card = groupIngestItemsByCardId([item("front", { seniorityLevel: "director", regionCountryCode: "JP", regionCity: "Tokyo" })])[0]!;
  const view = mount(card);
  assert.equal(view.select("职级").props.value, "director");
  assert.deepEqual(view.select("职级").findAllByType("option").map(option => option.props.value), ["", "individual_contributor", "manager", "director", "vp", "c_level", "founder"]);
  assert.match(view.text("seniority"), /决策层/);
  assert.equal(view.tag("seniority"), "已识别");
  act(() => view.select("职级").props.onChange({ target: { value: "manager" } }));
  assert.equal(view.tag("seniority"), "✓ 已修改");
  assert.match(view.text("seniority"), /管理层/);
  assert.equal(buildConfirmationPayload(card, view.draft(), "intent:s").payload!.seniorityLevel, "manager");
});

test("the region row shows country and city; changing the country clears the city, and the city stays editable", () => {
  const card = groupIngestItemsByCardId([item("front", { seniorityLevel: null, regionCountryCode: "JP", regionCity: "Tokyo" })])[0]!;
  const view = mount(card);
  assert.equal(view.select("国家／地区").props.value, "JP");
  assert.equal(view.cityInput().props.value, "Tokyo");
  assert.equal(view.tag("region"), "已识别");
  assert.equal(view.tag("seniority"), "未识别到");
  act(() => view.select("国家／地区").props.onChange({ target: { value: "SG" } }));
  assert.equal(view.cityInput().props.value, "");
  act(() => view.cityInput().props.onChange({ target: { value: "Singapore" } }));
  assert.equal(view.tag("region"), "✓ 已修改");
  const payload = buildConfirmationPayload(card, view.draft(), "intent:r").payload!;
  assert.deepEqual([payload.regionCountryCode, payload.regionCity], ["SG", "Singapore"]);
  act(() => view.select("国家／地区").props.onChange({ target: { value: "" } }));
  assert.equal(view.cityInput().props.disabled, true, "no city without a country");
});

test("disagreeing sides are flagged with both candidates and are resolved by picking or clearing", () => {
  const card = groupIngestItemsByCardId([
    item("front", { seniorityLevel: "director", regionCountryCode: "JP", regionCity: "Tokyo" }),
    item("back", { seniorityLevel: "vp", regionCountryCode: "CN", regionCity: "Shanghai" }),
  ])[0]!;
  const view = mount(card);
  assert.equal(view.tag("seniority"), "请核对");
  assert.equal(view.tag("region"), "请核对");
  assert.equal(view.select("职级").props.value, "");
  const alternatives = (name: string) => view.field(name).findAll(node => node.type === "button").map(button => button.props.children as string);
  assert.deepEqual(alternatives("seniority"), ["总监", "副总裁", "都不对，留空"]);
  assert.deepEqual(alternatives("region"), ["日本 · 东京", "中国 · 上海", "都不对，留空"]);
  act(() => view.field("seniority").findAll(node => node.type === "button")[1]!.props.onClick());
  act(() => view.field("region").findAll(node => node.type === "button")[2]!.props.onClick());
  assert.equal(view.draft().seniority.value, "vp");
  assert.equal(view.draft().seniority.conflicted, false);
  assert.deepEqual([view.draft().region.countryCode, view.draft().region.conflicted], [null, false]);
});
