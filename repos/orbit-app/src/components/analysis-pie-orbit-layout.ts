export type AnalysisPieOrbitZone = "bottom" | "left" | "right" | "top";

export interface AnalysisPieOrbitItemInput {
  color: string;
  countLabel: string;
  id: string;
  label: string;
  percentage: number;
}

export interface AnalysisPieOrbitSlot {
  connectorPath: string;
  copy: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  height: number;
  indicator: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  left: number;
  textAlign: "center" | "left" | "right";
  top: number;
  width: number;
  zone: AnalysisPieOrbitZone;
}

export interface AnalysisPieOrbitLayout {
  chart: {
    left: number;
    size: number;
    top: number;
  };
  height: number;
  slots: AnalysisPieOrbitSlot[];
  width: number;
}

export interface AnalysisPieOrbitLabel {
  accessibilityHint?: string;
  accessibilityLabel: string;
  color: string;
  colors: string[];
  countLabel: string;
  id: string;
  isAggregate: boolean;
  isSelected: boolean;
  itemIds: string[];
  label: string;
  percentage: number;
  selectId: string;
  slot: AnalysisPieOrbitSlot;
}

export interface AnalysisPieOrbitPresentation {
  chartItems: AnalysisPieOrbitItemInput[];
  chartStartAngle: number;
  labels: AnalysisPieOrbitLabel[];
  layout: AnalysisPieOrbitLayout;
  selectedItem: AnalysisPieOrbitItemInput;
}

const MAX_MAJOR_LABELS = 5;
const OTHER_ID = "__other__";
const FULL_CIRCLE = Math.PI * 2;
const COPY_GAP = 4;
const INDICATOR_SIZE = 16;
const SIDE_COPY_GAP = COPY_GAP + 1;

interface ConnectorPoint {
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function countFromLabel(label: string): number {
  const match = label.replaceAll(",", "").match(/\d+/u);
  return match ? Number(match[0]) : 0;
}

function roundedPoint(value: number): number {
  return Math.round(value);
}

function connectorSegmentsCross(
  firstStart: ConnectorPoint,
  firstEnd: ConnectorPoint,
  secondStart: ConnectorPoint,
  secondEnd: ConnectorPoint
): boolean {
  function orientation(
    start: ConnectorPoint,
    end: ConnectorPoint,
    point: ConnectorPoint
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

export function analysisPieOrbitLayout({
  angles,
  fontScale = 1,
  width
}: {
  angles: number[];
  fontScale?: number;
  width: number;
}): AnalysisPieOrbitLayout {
  const safeWidth = Math.max(280, Math.round(width));
  const safeFontScale = clamp(fontScale, 1, 1.6);
  const height = Math.round(390 + (safeFontScale - 1) * 190);
  const chartSize = Math.round(clamp(safeWidth * 0.56, 156, 184));
  const chartLeft = Math.round((safeWidth - chartSize) / 2);
  const chartTop = Math.round((height - chartSize) / 2);
  const sideSlotHeight = Math.round(74 * safeFontScale);
  const verticalSlotHeight = Math.round(60 * safeFontScale);
  const sideSlotWidth = Math.round(clamp(safeWidth * 0.29, 84, 96));
  const verticalSlotWidth = Math.round(
    Math.min(
      clamp(safeWidth * 0.46, 128, 152),
      Math.max(104, safeWidth - sideSlotWidth * 2 - 8)
    )
  );
  const chartCenterX = chartLeft + chartSize / 2;
  const chartCenterY = chartTop + chartSize / 2;
  const connectorRadius = chartSize * 0.47;
  let topIndex = -1;
  let bottomIndex = -1;
  let topDistance = Number.POSITIVE_INFINITY;
  let bottomDistance = Number.POSITIVE_INFINITY;

  angles.forEach((angle, index) => {
    const cosineDistance = Math.abs(Math.cos(angle));

    if (Math.sin(angle) < -0.6 && cosineDistance < topDistance) {
      topIndex = index;
      topDistance = cosineDistance;
    }

    if (Math.sin(angle) > 0.6 && cosineDistance < bottomDistance) {
      bottomIndex = index;
      bottomDistance = cosineDistance;
    }
  });

  const slots = angles.map((angle, index) => {
    const zone: AnalysisPieOrbitZone =
      index === topIndex
        ? "top"
        : index === bottomIndex
          ? "bottom"
          : Math.cos(angle) >= 0
            ? "right"
            : "left";
    const slotWidth =
      zone === "top" || zone === "bottom"
        ? verticalSlotWidth
        : sideSlotWidth;
    const slotHeight =
      zone === "top" || zone === "bottom"
        ? verticalSlotHeight
        : sideSlotHeight;
    const left = Math.round(
      clamp(
        zone === "top" || zone === "bottom"
          ? (safeWidth - slotWidth) / 2
          : zone === "right"
            ? safeWidth - slotWidth
            : 0,
        0,
        safeWidth - slotWidth
      )
    );
    const top = Math.round(
      clamp(
        zone === "top"
          ? height * 0.02
          : zone === "bottom"
            ? height * 0.86
            : chartCenterY + Math.sin(angle) * chartSize * 0.64 - slotHeight / 2,
        0,
        height - slotHeight
      )
    );
    const indicator = {
      height: INDICATOR_SIZE,
      left:
        zone === "right"
          ? 0
          : zone === "left"
            ? slotWidth - INDICATOR_SIZE
            : (slotWidth - INDICATOR_SIZE) / 2,
      top:
        zone === "bottom"
          ? 0
          : zone === "top"
            ? slotHeight - INDICATOR_SIZE
            : (slotHeight - INDICATOR_SIZE) / 2,
      width: INDICATOR_SIZE
    };
    const copy = {
      height:
        zone === "top" || zone === "bottom"
          ? slotHeight - INDICATOR_SIZE - COPY_GAP
          : slotHeight,
      left: zone === "right" ? INDICATOR_SIZE + SIDE_COPY_GAP : 0,
      top: zone === "bottom" ? INDICATOR_SIZE + COPY_GAP : 0,
      width:
        zone === "left" || zone === "right"
          ? slotWidth - INDICATOR_SIZE - SIDE_COPY_GAP
          : slotWidth
    };
    return {
      connectorPath: "",
      copy,
      height: slotHeight,
      indicator,
      left,
      textAlign:
        zone === "top" || zone === "bottom"
          ? "center"
          : zone === "right"
            ? "left"
            : "right",
      top,
      width: slotWidth,
      zone
    } satisfies AnalysisPieOrbitSlot;
  });

  const collisionGap = Math.round(4 * safeFontScale);

  for (const zone of ["left", "right"] as const) {
    const sideSlots = slots
      .filter((slot) => slot.zone === zone)
      .sort((left, right) => left.top - right.top);
    let nextTop = 0;

    sideSlots.forEach((slot) => {
      slot.top = Math.max(slot.top, nextTop);
      nextTop = slot.top + slot.height + collisionGap;
    });

    const lastSlot = sideSlots.at(-1);
    const overflow = lastSlot
      ? Math.max(0, lastSlot.top + lastSlot.height - height)
      : 0;

    if (overflow > 0) {
      sideSlots.forEach((slot) => {
        slot.top -= overflow;
      });
    }

    const firstSlot = sideSlots[0];
    const underflow = firstSlot ? Math.max(0, -firstSlot.top) : 0;

    if (underflow > 0) {
      sideSlots.forEach((slot) => {
        slot.top += underflow;
      });
    }
  }

  const connectorStarts = slots.map((_, index) => {
    const angle = angles[index] ?? 0;
    return {
      x: roundedPoint(chartCenterX + Math.cos(angle) * connectorRadius),
      y: roundedPoint(chartCenterY + Math.sin(angle) * connectorRadius)
    };
  });

  for (const zone of ["left", "right"] as const) {
    const slotIndexes = slots
      .map((slot, index) => (slot.zone === zone ? index : -1))
      .filter((index) => index >= 0)
      .sort((left, right) => slots[left]!.top - slots[right]!.top);
    const candidates = slotIndexes.map((index) => {
      const slot = slots[index]!;
      const start = connectorStarts[index]!;
      const minimumX =
        slot.left + (zone === "left" ? slot.width - INDICATOR_SIZE : INDICATOR_SIZE / 2);
      const maximumX =
        slot.left + (zone === "left" ? slot.width - INDICATOR_SIZE / 2 : INDICATOR_SIZE);
      const minimumY = slot.top + INDICATOR_SIZE / 2;
      const maximumY = slot.top + slot.height - INDICATOR_SIZE / 2;
      const preferredY = clamp(start.y, minimumY, maximumY);
      const xValues = [minimumX, (minimumX + maximumX) / 2, maximumX];
      const yValues = [
        minimumY,
        preferredY,
        (minimumY + maximumY) / 2,
        maximumY
      ];
      const points = xValues.flatMap((x) =>
        yValues.map((y) => ({ x: roundedPoint(x), y: roundedPoint(y) }))
      );

      return points
        .filter(
          (point, pointIndex) =>
            points.findIndex(
              (candidate) => candidate.x === point.x && candidate.y === point.y
            ) === pointIndex
        )
        .sort(
          (left, right) =>
            Math.abs(left.y - start.y) * 10 + Math.abs(left.x - start.x) -
            (Math.abs(right.y - start.y) * 10 + Math.abs(right.x - start.x))
        );
    });
    const chosen: ConnectorPoint[] = [];

    function chooseConnectorEnd(index: number): boolean {
      if (index === slotIndexes.length) {
        return true;
      }

      const slotIndex = slotIndexes[index]!;
      const start = connectorStarts[slotIndex]!;

      for (const candidate of candidates[index] ?? []) {
        const crossesChosen = chosen.some((chosenEnd, chosenIndex) => {
          const chosenSlotIndex = slotIndexes[chosenIndex]!;
          return connectorSegmentsCross(
            start,
            candidate,
            connectorStarts[chosenSlotIndex]!,
            chosenEnd
          );
        });

        if (crossesChosen) {
          continue;
        }

        chosen.push(candidate);
        if (chooseConnectorEnd(index + 1)) {
          return true;
        }
        chosen.pop();
      }

      return false;
    }

    if (chooseConnectorEnd(0)) {
      slotIndexes.forEach((slotIndex, index) => {
        const slot = slots[slotIndex]!;
        const end = chosen[index]!;
        slot.indicator.left = end.x - slot.left - slot.indicator.width / 2;
        slot.indicator.top = end.y - slot.top - slot.indicator.height / 2;
      });
    }
  }

  slots.forEach((slot, index) => {
    const start = connectorStarts[index]!;
    const endX = roundedPoint(
      slot.left + slot.indicator.left + slot.indicator.width / 2
    );
    const endY = roundedPoint(
      slot.top + slot.indicator.top + slot.indicator.height / 2
    );

    slot.connectorPath = `M ${start.x} ${start.y} L ${endX} ${endY}`;
  });

  return {
    chart: { left: chartLeft, size: chartSize, top: chartTop },
    height,
    slots,
    width: safeWidth
  };
}

export function analysisPieOrbitPresentation({
  fontScale = 1,
  items,
  selectedId,
  width
}: {
  fontScale?: number;
  items: AnalysisPieOrbitItemInput[];
  selectedId: string;
  width: number;
}): AnalysisPieOrbitPresentation {
  if (items.length === 0) {
    throw new Error("AnalysisPieOrbitChart requires at least one item.");
  }

  const ranked = items
    .map((item, index) => ({ index, item }))
    .sort(
      (left, right) =>
        right.item.percentage - left.item.percentage || left.index - right.index
    )
    .map(({ item }) => item);
  const majorSet = new Set(
    ranked.slice(0, MAX_MAJOR_LABELS).map((item) => item.id)
  );
  const preferredFirst = majorSet.has(items[0]?.id ?? "") ? items[0] : ranked[0];
  const majorItems = preferredFirst
    ? [
        preferredFirst,
        ...ranked
          .slice(0, MAX_MAJOR_LABELS)
          .filter((item) => item.id !== preferredFirst.id)
      ]
    : [];
  const remainderItems = items.filter((item) => !majorSet.has(item.id));
  const chartItems = [...majorItems, ...remainderItems];
  const total = chartItems.reduce(
    (sum, item) => sum + Math.max(0, item.percentage),
    0
  );
  const firstAngle =
    total > 0 ? (Math.max(0, chartItems[0]?.percentage ?? 0) / total) * FULL_CIRCLE : 0;
  const chartStartAngle = -Math.PI / 2 - firstAngle / 2;
  const midAngles = new Map<string, number>();
  let cursor = chartStartAngle;

  for (const item of chartItems) {
    const angle =
      total > 0 ? (Math.max(0, item.percentage) / total) * FULL_CIRCLE : 0;
    midAngles.set(item.id, cursor + angle / 2);
    cursor += angle;
  }

  const aggregateStart = remainderItems[0]
    ? (midAngles.get(remainderItems[0].id) ?? chartStartAngle) -
      ((Math.max(0, remainderItems[0].percentage) / Math.max(total, 1)) * FULL_CIRCLE) /
        2
    : chartStartAngle;
  const aggregatePercentage = remainderItems.reduce(
    (sum, item) => sum + Math.max(0, item.percentage),
    0
  );
  const aggregateAngle =
    aggregateStart +
    ((aggregatePercentage / Math.max(total, 1)) * FULL_CIRCLE) / 2;
  const labelAngles = [
    ...majorItems.map((item) => midAngles.get(item.id) ?? 0),
    ...(remainderItems.length > 0 ? [aggregateAngle] : [])
  ];
  const layout = analysisPieOrbitLayout({ angles: labelAngles, fontScale, width });
  const selectedItem =
    chartItems.find((item) => item.id === selectedId) ?? chartItems[0]!;
  const labels: AnalysisPieOrbitLabel[] = majorItems.map((item, index) => ({
    accessibilityLabel: `${item.label}，${item.countLabel}，${item.percentage}%`,
    color: item.color,
    colors: [item.color],
    countLabel: item.countLabel,
    id: item.id,
    isAggregate: false,
    isSelected: item.id === selectedItem.id,
    itemIds: [item.id],
    label: item.label,
    percentage: item.percentage,
    selectId: item.id,
    slot: layout.slots[index]!
  }));

  if (remainderItems.length > 0) {
    const selectedRemainder = remainderItems.find(
      (item) => item.id === selectedItem.id
    );
    const selectedRemainderIndex = selectedRemainder
      ? remainderItems.findIndex((item) => item.id === selectedRemainder.id)
      : -1;
    const nextRemainder =
      remainderItems[(selectedRemainderIndex + 1) % remainderItems.length]!;
    const slot = layout.slots[labels.length]!;
    labels.push({
      accessibilityHint: "重复轻触，依次查看其中每个分组",
      accessibilityLabel: `其他 ${remainderItems.length} 个，${remainderItems.reduce((sum, item) => sum + countFromLabel(item.countLabel), 0)} 人，${aggregatePercentage}%，包含${remainderItems.map((item) => item.label).join("、")}`,
      color: remainderItems[0]!.color,
      colors: remainderItems.map((item) => item.color),
      countLabel: `${remainderItems.reduce((sum, item) => sum + countFromLabel(item.countLabel), 0)} 人`,
      id: OTHER_ID,
      isAggregate: true,
      isSelected: Boolean(selectedRemainder),
      itemIds: remainderItems.map((item) => item.id),
      label: `其他 ${remainderItems.length} 个`,
      percentage: aggregatePercentage,
      selectId: nextRemainder.id,
      slot
    });
  }

  return {
    chartItems,
    chartStartAngle,
    labels,
    layout,
    selectedItem
  };
}
