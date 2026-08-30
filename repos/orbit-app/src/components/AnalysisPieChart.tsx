import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, spacing, typography } from "../design/tokens";

export interface AnalysisPieChartItem {
  color: string;
  id: string;
  label: string;
  percentage: number;
}

const SIZE = 208;
const CENTER = SIZE / 2;
const RADIUS = 78;
const SELECTED_OFFSET = 9;

function polarPoint(angle: number, radius = RADIUS) {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle)
  };
}

function slicePath(startAngle: number, endAngle: number): string {
  const safeEnd = Math.min(endAngle, startAngle + Math.PI * 2 - 0.001);
  const start = polarPoint(startAngle);
  const end = polarPoint(safeEnd);
  const largeArc = safeEnd - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z"
  ].join(" ");
}

export function AnalysisPieChart({
  items,
  onActivate,
  onSelect,
  selectedId
}: {
  items: AnalysisPieChartItem[];
  onActivate: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string;
}) {
  const total = items.reduce(
    (sum, item) => sum + Math.max(0, item.percentage),
    0
  );
  let cursor = -Math.PI / 2;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <View
      accessibilityLabel={selected ? `已选择${selected.label}` : "人脉结构饼图"}
      accessibilityRole="imagebutton"
      accessibilityState={{ selected: Boolean(selected) }}
      style={styles.frame}
    >
      <Svg
        accessibilityLabel="人脉结构饼图"
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
      >
        {items.map((item) => {
          const startAngle = cursor;
          const angle = total > 0 ? (item.percentage / total) * Math.PI * 2 : 0;
          const endAngle = startAngle + angle;
          const midAngle = startAngle + angle / 2;
          const isSelected = item.id === selectedId;
          const translateX = isSelected
            ? Math.cos(midAngle) * SELECTED_OFFSET
            : 0;
          const translateY = isSelected
            ? Math.sin(midAngle) * SELECTED_OFFSET
            : 0;
          cursor = endAngle;

          return (
            <Path
              accessibilityLabel={`${item.label}，${item.percentage}%`}
              accessible
              d={slicePath(startAngle, endAngle)}
              fill={item.color}
              key={item.id}
              onPress={() =>
                isSelected ? onActivate(item.id) : onSelect(item.id)
              }
              stroke={colors.surface}
              strokeWidth={isSelected ? 4 : 2}
              transform={`translate(${translateX} ${translateY})`}
            />
          );
        })}
      </Svg>
      <View pointerEvents="none" style={styles.centerLabel}>
        <Text numberOfLines={1} style={styles.centerValue}>
          {selected ? `${selected.percentage}%` : "--"}
        </Text>
        <Text numberOfLines={1} style={styles.centerCaption}>
          {selected?.label ?? "暂无数据"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerCaption: {
    color: colors.text3,
    fontSize: 10,
    lineHeight: 14,
    maxWidth: 72,
    textAlign: "center"
  },
  centerLabel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 44,
    borderWidth: 1,
    gap: spacing.xxs,
    height: 76,
    justifyContent: "center",
    left: (SIZE - 76) / 2,
    position: "absolute",
    top: (SIZE - 76) / 2,
    width: 76
  },
  centerValue: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: "800",
    lineHeight: 22
  },
  frame: {
    alignItems: "center",
    height: SIZE,
    justifyContent: "center",
    width: SIZE
  }
});
