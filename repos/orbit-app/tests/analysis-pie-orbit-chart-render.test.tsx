import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { AnalysisPieOrbitChart } from "../src/components/AnalysisPieOrbitChart";
import { renderedText, renderToHtml } from "./helpers/render";

const items = [
  { color: "#6359E9", countLabel: "19 人", id: "food", label: "餐饮与食品", percentage: 24 },
  { color: "#15A06B", countLabel: "21 人", id: "tech", label: "科技与互联网", percentage: 27 },
  { color: "#2D7FF0", countLabel: "9 人", id: "finance", label: "金融与投资", percentage: 12 },
  { color: "#CE7A00", countLabel: "13 人", id: "services", label: "专业服务", percentage: 17 },
  { color: "#D9385E", countLabel: "2 人", id: "manufacturing", label: "制造与供应链", percentage: 3 },
  { color: "#7B6E5B", countLabel: "1 人", id: "retail", label: "零售与消费", percentage: 1 },
  { color: "#3E8C94", countLabel: "1 人", id: "health", label: "医疗与健康", percentage: 1 },
  { color: "#8B6BB1", countLabel: "1 人", id: "media", label: "文化传媒与创意", percentage: 1 },
  { color: "#666770", countLabel: "11 人", id: "community", label: "社群与非营利", percentage: 14 }
];

test("industry donut renders six readable anchors instead of nine competing labels", () => {
  const text = renderedText(
    <AnalysisPieOrbitChart
      items={items}
      onSelect={() => undefined}
      selectedId="food"
    />
  );

  for (const expected of [
    "餐饮与食品",
    "科技与互联网",
    "专业服务",
    "社群与非营利",
    "金融与投资",
    "其他 4 个",
    "5 人",
    "6%"
  ]) {
    assert.match(text, new RegExp(expected, "u"));
  }
  assert.doesNotMatch(text, /零售与消费/u);
  assert.doesNotMatch(text, /医疗与健康/u);
  assert.doesNotMatch(text, /文化传媒与创意/u);
});

test("selecting an item inside other shows its exact value in the donut center", () => {
  const text = renderedText(
    <AnalysisPieOrbitChart
      items={items}
      onSelect={() => undefined}
      selectedId="manufacturing"
    />
  );

  assert.match(text, /制造与供应链/u);
  assert.match(text, /2 人/u);
  assert.match(text, /3%/u);
  assert.match(text, /其他 4 个/u);
});

test("compact dimensions render all real groups without an other anchor", () => {
  const text = renderedText(
    <AnalysisPieOrbitChart
      items={[
        { color: "#6359E9", countLabel: "29 人", id: "strong", label: "强关系", percentage: 37 },
        { color: "#15A06B", countLabel: "30 人", id: "warm", label: "一般关系", percentage: 38 },
        { color: "#2D7FF0", countLabel: "19 人", id: "weak", label: "弱关系", percentage: 25 }
      ]}
      onSelect={() => undefined}
      selectedId="strong"
    />
  );

  for (const expected of ["强关系", "一般关系", "弱关系", "29 人", "37%"] ) {
    assert.match(text, new RegExp(expected, "u"));
  }
  assert.doesNotMatch(text, /其他/u);
});

test("side metadata can wrap instead of hiding count or percentage", () => {
  const html = renderToHtml(
    <AnalysisPieOrbitChart
      items={[
        { color: "#6359E9", countLabel: "29 人", id: "strong", label: "强关系", percentage: 37 },
        { color: "#15A06B", countLabel: "30 人", id: "warm", label: "保持联系", percentage: 39 },
        { color: "#2D7FF0", countLabel: "19 人", id: "weak", label: "待重新联系", percentage: 24 }
      ]}
      onSelect={() => undefined}
      selectedId="strong"
    />
  );

  assert.match(
    html,
    /style="-webkit-line-clamp:2;text-align:right">19 人 · 24%<\/div>/u
  );
});
