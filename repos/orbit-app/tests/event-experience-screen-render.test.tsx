import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { EventExperienceContent, type EventExperienceContentProps } from "../src/screens/events/EventExperienceContent";
import { initialEventExperienceConfiguration } from "../src/view-models/event-experience";
import { renderToHtml, renderedText } from "./helpers/render";

const props: EventExperienceContentProps = {
  configuration: initialEventExperienceConfiguration(), snapshot: null, preview: null, authorized: true, loading: false, busy: null, dirty: false, error: null, notice: null,
  freeze: { frozen: false, blocked: false, canRestore: false },
  onChange() {}, onSave() {}, onPreview() {}, onPublish() {}, onReload() {}, onBack() {}, onRestore() {},
};

test("editor renders display fields and standard questions without internal labels or configurable covers", () => {
  const text = renderedText(<EventExperienceContent {...props} />);
  for (const label of ["活动简介", "强调色", "标准问题", "自选问题", "想认识谁", "能提供什么", "保存草稿", "发布题集", "返回活动运营台"]) assert.ok(text.includes(label));
  assert.doesNotMatch(text, /v1|v2|actor|provider|hash|coverAssetId|上传|模板/u);
  const html = renderToHtml(<EventExperienceContent {...props} />);
  assert.match(html, /aria-label="问题 1"/u);
  assert.match(html, /aria-label="问题 1 选项 1"/u);
});

test("unauthorized/load failure hides editing while keeping error/retry/back", () => {
  const html = renderToHtml(<EventExperienceContent {...props} authorized={false} error="无法读取" />);
  assert.match(html, /role="alert"/u); assert.match(html, /重新读取/u); assert.match(html, /返回活动运营台/u);
  assert.doesNotMatch(html, /textarea|aria-label="保存草稿"/u);
  assert.match(renderedText(<EventExperienceContent {...props} authorized={false} loading />), /正在读取/u);
});

test("frozen question controls remain locked while display controls and restore action remain available", () => {
  const html = renderToHtml(<EventExperienceContent {...props} dirty freeze={{ frozen: true, blocked: true, canRestore: true }} />);
  assert.match(html, /恢复已发布问题/u); assert.match(html, /尚未保存/u);
  assert.match(html.match(/<[^>]+aria-label="问题 1"[^>]*>/u)?.[0] ?? "", /readonly/iu);
  assert.doesNotMatch(html.match(/<[^>]+aria-label="活动简介"[^>]*>/u)?.[0] ?? "", /readonly/iu);
});
