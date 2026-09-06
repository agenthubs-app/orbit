import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisPieOrbitLayout,
  analysisPieOrbitPresentation,
  type AnalysisPieOrbitItemInput
} from "../src/components/analysis-pie-orbit-layout";

const industryItems: AnalysisPieOrbitItemInput[] = [
  {
    color: "#6359E9",
    countLabel: "19 人",
    id: "food",
    label: "餐饮与食品",
    percentage: 24
  },
  {
    color: "#15A06B",
    countLabel: "21 人",
    id: "tech",
    label: "科技与互联网",
    percentage: 27
  },
  {
    color: "#2D7FF0",
    countLabel: "9 人",
    id: "finance",
    label: "金融与投资",
    percentage: 12
  },
  {
    color: "#CE7A00",
    countLabel: "13 人",
    id: "services",
    label: "专业服务",
    percentage: 17
  },
  {
    color: "#D9385E",
    countLabel: "2 人",
    id: "manufacturing",
    label: "制造与供应链",
    percentage: 3
  },
  {
    color: "#7B6E5B",
    countLabel: "1 人",
    id: "retail",
    label: "零售与消费",
    percentage: 1
  },
  {
    color: "#3E8C94",
    countLabel: "1 人",
    id: "health",
    label: "医疗与健康",
    percentage: 1
  },
  {
    color: "#8B6BB1",
    countLabel: "1 人",
    id: "media",
    label: "文化传媒与创意",
    percentage: 1
  },
  {
    color: "#666770",
    countLabel: "11 人",
    id: "community",
    label: "社群与非营利",
    percentage: 14
  }
];

test("mobile orbit presentation keeps the true nine-slice donut but limits visible anchors to five industries and other", () => {
  const presentation = analysisPieOrbitPresentation({
    items: industryItems,
    selectedId: "food",
    width: 327
  });

  assert.deepEqual(
    presentation.chartItems.map((item) => item.id),
    [
      "food",
      "tech",
      "services",
      "community",
      "finance",
      "manufacturing",
      "retail",
      "health",
      "media"
    ]
  );
  assert.deepEqual(
    presentation.labels.map((item) => item.label),
    [
      "餐饮与食品",
      "科技与互联网",
      "专业服务",
      "社群与非营利",
      "金融与投资",
      "其他 4 个"
    ]
  );
  assert.equal(presentation.labels.at(-1)?.countLabel, "5 人");
  assert.equal(presentation.labels.at(-1)?.percentage, 6);
  assert.deepEqual(presentation.labels.at(-1)?.itemIds, [
    "manufacturing",
    "retail",
    "health",
    "media"
  ]);
  assert.equal(presentation.selectedItem.id, "food");
  assert.ok(
    Math.abs(presentation.chartStartAngle + 2.324778563656447) < 0.000001
  );
});

test("selecting a small sector exposes its exact value while marking the other anchor selected", () => {
  const presentation = analysisPieOrbitPresentation({
    items: industryItems,
    selectedId: "manufacturing",
    width: 327
  });

  assert.deepEqual(
    {
      countLabel: presentation.selectedItem.countLabel,
      label: presentation.selectedItem.label,
      percentage: presentation.selectedItem.percentage
    },
    { countLabel: "2 人", label: "制造与供应链", percentage: 3 }
  );
  assert.deepEqual(
    presentation.labels.map((item) => item.isSelected),
    [false, false, false, false, false, true]
  );
  assert.match(
    presentation.labels.at(-1)?.accessibilityLabel ?? "",
    /包含制造与供应链、零售与消费、医疗与健康、文化传媒与创意/u
  );
});

test("the other anchor cycles through every hidden real group", () => {
  const selections = ["food", "manufacturing", "retail", "health", "media"];
  const expectedNextIds = [
    "manufacturing",
    "retail",
    "health",
    "media",
    "manufacturing"
  ];

  selections.forEach((selectedId, index) => {
    const presentation = analysisPieOrbitPresentation({
      items: industryItems,
      selectedId,
      width: 327
    });
    const other = presentation.labels.find((item) => item.isAggregate);

    assert.equal(other?.selectId, expectedNextIds[index]);
    assert.equal(other?.accessibilityHint, "重复轻触，依次查看其中每个分组");
  });
});

test("small industry sets render only their real anchors without inventing other", () => {
  const presentation = analysisPieOrbitPresentation({
    items: industryItems.slice(0, 3),
    selectedId: "food",
    width: 327
  });

  assert.deepEqual(
    presentation.labels.map((item) => item.id),
    ["food", "tech", "finance"]
  );
  assert.equal(presentation.labels.some((item) => item.isAggregate), false);
  assert.equal(presentation.chartItems.length, 3);
});

test("exactly five industries do not render an empty other anchor", () => {
  const presentation = analysisPieOrbitPresentation({
    items: industryItems.slice(0, 5),
    selectedId: "food",
    width: 327
  });

  assert.equal(presentation.labels.length, 5);
  assert.equal(presentation.labels.some((item) => item.isAggregate), false);
  assert.equal(presentation.layout.slots.length, 5);
});

test("the presentation boundary rejects an empty series while the screen owns the empty state", () => {
  assert.throws(
    () =>
      analysisPieOrbitPresentation({
        items: [],
        selectedId: "",
        width: 327
      }),
    /requires at least one item/u
  );
});

test("six-anchor mobile layout connects each sector midpoint to its label edge", () => {
  const angles = [-Math.PI / 2, 0, Math.PI / 2, 2.3, Math.PI, -2.3];
  const layout = analysisPieOrbitLayout({
    angles,
    width: 327
  });

  assert.equal(layout.slots.length, 6);
  const chartCenterX = layout.chart.left + layout.chart.size / 2;
  const chartCenterY = layout.chart.top + layout.chart.size / 2;

  layout.slots.forEach((slot, index) => {
    assert.ok(slot.left >= 0);
    assert.ok(slot.left + slot.width <= layout.width);
    assert.ok(slot.top >= 0);
    assert.ok(slot.top + slot.height <= layout.height);
    assert.match(
      slot.connectorPath,
      /^M -?\d+ -?\d+ L -?\d+ -?\d+$/u
    );
    const coordinates = slot.connectorPath.match(/-?\d+/gu)?.map(Number) ?? [];
    const [startX, startY, endX, endY] = coordinates;
    assert.ok(startX !== undefined && startY !== undefined);
    assert.ok(endX !== undefined && endY !== undefined);
    const indicator = (
      slot as typeof slot & {
        indicator?: { height: number; left: number; top: number; width: number };
      }
    ).indicator;
    assert.ok(indicator, "each label must expose the indicator reached by its line");
    assert.equal(
      endX,
      Math.round(slot.left + indicator.left + indicator.width / 2)
    );
    assert.equal(
      endY,
      Math.round(slot.top + indicator.top + indicator.height / 2)
    );
    const angle = angles[index] ?? 0;
    const radialCrossProduct =
      (startX - chartCenterX) * Math.sin(angle) -
      (startY - chartCenterY) * Math.cos(angle);
    assert.ok(
      Math.abs(radialCrossProduct) <= 2,
      "connector must begin on its sector midpoint ray"
    );

    if (slot.zone === "right") {
      assert.ok(endX >= slot.left && endX <= slot.left + 20);
    } else if (slot.zone === "left") {
      assert.ok(
        endX >= slot.left + slot.width - 20 &&
          endX <= slot.left + slot.width
      );
    } else if (slot.zone === "top") {
      assert.ok(
        endY >= slot.top + slot.height - 20 &&
          endY <= slot.top + slot.height
      );
    } else {
      assert.ok(endY >= slot.top && endY <= slot.top + 20);
    }
  });
});

test("each label follows its own sector angle instead of its array slot", () => {
  const layout = analysisPieOrbitLayout({
    angles: [0, Math.PI, -Math.PI / 2, Math.PI / 2],
    width: 327
  });

  assert.deepEqual(
    layout.slots.map((slot) => slot.zone),
    ["right", "left", "top", "bottom"]
  );
});

test("default callout layout keeps the donut centered in a compact frame", () => {
  const layout = analysisPieOrbitLayout({
    angles: [-Math.PI / 2, 0, Math.PI / 2, Math.PI],
    width: 327
  });

  assert.ok(layout.height <= 390);
  assert.ok(
    Math.abs(layout.chart.left + layout.chart.size / 2 - layout.width / 2) <= 1
  );
  assert.ok(
    Math.abs(layout.chart.top + layout.chart.size / 2 - layout.height / 2) <= 1
  );
});

test("one through six anchors keep their full text regions outside the donut", () => {
  for (let count = 1; count <= 6; count += 1) {
    const layout = analysisPieOrbitLayout({
      angles: Array.from(
        { length: count },
        (_, index) => -Math.PI / 2 + (index / count) * Math.PI * 2
      ),
      width: 327
    });
    const chartCenterX = layout.chart.left + layout.chart.size / 2;
    const chartCenterY = layout.chart.top + layout.chart.size / 2;
    const protectedRadius = layout.chart.size * 0.46;

    for (const slot of layout.slots) {
      const copy = (
        slot as typeof slot & {
          copy?: { height: number; left: number; top: number; width: number };
        }
      ).copy;
      assert.ok(copy, "each label must expose its exact text region");
      const copyLeft = slot.left + copy.left;
      const copyTop = slot.top + copy.top;
      const closestX = Math.max(
        copyLeft,
        Math.min(chartCenterX, copyLeft + copy.width)
      );
      const closestY = Math.max(
        copyTop,
        Math.min(chartCenterY, copyTop + copy.height)
      );
      assert.ok(
        Math.hypot(closestX - chartCenterX, closestY - chartCenterY) >=
          protectedRadius,
        `${count}-anchor label text must not cover the rendered donut`
      );
    }
  }
});

test("mobile side anchors reserve enough copy space to show full statistics", () => {
  const presentation = analysisPieOrbitPresentation({
    items: industryItems,
    selectedId: "food",
    width: 327
  });
  const sideSlots = presentation.labels
    .map((label) => label.slot)
    .filter((slot) => slot.zone === "left" || slot.zone === "right");

  assert.ok(sideSlots.length > 0);

  for (const slot of sideSlots) {
    assert.ok(
      slot.copy.width >= 74,
      "side copy must fit a complete count and percentage at the default text size"
    );
    assert.ok(
      slot.copy.height >= 74,
      "side copy must retain two title lines and two metadata lines when text grows"
    );
  }
});

test("six-anchor layout grows for large text without overlapping labels", () => {
  const layout = analysisPieOrbitLayout({
    angles: [-Math.PI / 2, 0, Math.PI / 2, 2.3, Math.PI, -2.3],
    fontScale: 1.6,
    width: 311
  });

  assert.ok(layout.height > 500);

  for (let index = 0; index < layout.slots.length; index += 1) {
    const current = layout.slots[index];
    assert.ok(current);

    for (
      let candidateIndex = index + 1;
      candidateIndex < layout.slots.length;
      candidateIndex += 1
    ) {
      const candidate = layout.slots[candidateIndex];
      assert.ok(candidate);
      const overlaps: boolean =
        current.left < candidate.left + candidate.width &&
        current.left + current.width > candidate.left &&
        current.top < candidate.top + candidate.height &&
        current.top + current.height > candidate.top;

      assert.equal(
        overlaps,
        false,
        `slots ${index} and ${candidateIndex} should not overlap`
      );
    }
  }
});

test("dense same-side sectors keep every text region separated", () => {
  const percentages = [4.41, 1.47, 2.26, 34.65, 3.52, 2.8, 6.08, 2.35, 42.47];
  const presentation = analysisPieOrbitPresentation({
    items: percentages.map((percentage, index) => ({
      color: "#6359E9",
      countLabel: `${index + 1} 人`,
      id: `dense-${index}`,
      label: `分组 ${index + 1}`,
      percentage
    })),
    selectedId: "dense-0",
    width: 327
  });
  const regions = presentation.labels.map(({ slot }) => ({
    height: slot.copy.height,
    left: slot.left + slot.copy.left,
    top: slot.top + slot.copy.top,
    width: slot.copy.width
  }));

  for (let index = 0; index < regions.length; index += 1) {
    const current = regions[index];
    assert.ok(current);

    for (
      let candidateIndex = index + 1;
      candidateIndex < regions.length;
      candidateIndex += 1
    ) {
      const candidate = regions[candidateIndex];
      assert.ok(candidate);
      const overlaps: boolean =
        current.left < candidate.left + candidate.width &&
        current.left + current.width > candidate.left &&
        current.top < candidate.top + candidate.height &&
        current.top + current.height > candidate.top;

      assert.equal(
        overlaps,
        false,
        `text regions ${index} and ${candidateIndex} should not overlap`
      );
    }
  }
});

test("dense same-side connectors do not cross while reaching separated labels", () => {
  const percentages = [43.821, 2.551, 5.137, 3.033, 27.65, 17.808];
  const presentation = analysisPieOrbitPresentation({
    items: percentages.map((percentage, index) => ({
      color: "#6359E9",
      countLabel: `${index + 1} 人`,
      id: `crossing-${index}`,
      label: `分组 ${index + 1}`,
      percentage
    })),
    selectedId: "crossing-0",
    width: 327
  });
  const paths = presentation.layout.slots.map((slot) => {
    const values = slot.connectorPath.match(/-?\d+/gu)?.map(Number) ?? [];

    return [
      { x: values[0] ?? 0, y: values[1] ?? 0 },
      { x: values.at(-2) ?? 0, y: values.at(-1) ?? 0 }
    ];
  });

  function segmentsCross(
    firstStart: { x: number; y: number },
    firstEnd: { x: number; y: number },
    secondStart: { x: number; y: number },
    secondEnd: { x: number; y: number }
  ): boolean {
    function orientation(
      start: { x: number; y: number },
      end: { x: number; y: number },
      point: { x: number; y: number }
    ) {
      return (
        (end.x - start.x) * (point.y - start.y) -
        (end.y - start.y) * (point.x - start.x)
      );
    }

    const firstSecondStart = orientation(firstStart, firstEnd, secondStart);
    const firstSecondEnd = orientation(firstStart, firstEnd, secondEnd);
    const secondFirstStart = orientation(secondStart, secondEnd, firstStart);
    const secondFirstEnd = orientation(secondStart, secondEnd, firstEnd);

    return (
      firstSecondStart * firstSecondEnd < 0 &&
      secondFirstStart * secondFirstEnd < 0
    );
  }

  for (let index = 0; index < paths.length; index += 1) {
    const current = paths[index];
    assert.ok(current);

    for (
      let candidateIndex = index + 1;
      candidateIndex < paths.length;
      candidateIndex += 1
    ) {
      const candidate = paths[candidateIndex];
      assert.ok(candidate);

      assert.equal(
        segmentsCross(
          current[0]!,
          current[1]!,
          candidate[0]!,
          candidate[1]!
        ),
        false,
        `connector ${index} must not cross connector ${candidateIndex}`
      );
    }
  }
});
