import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { createThemedStyles } from "../design/theme";

export interface AnalysisPieChartItem {
  color: string;
  countLabel?: string;
  id: string;
  label: string;
  percentage: number;
}

const VIEWBOX_SIZE = 208;
const CENTER = VIEWBOX_SIZE / 2;
const DEFAULT_RADIUS = 78;
const DEFAULT_SELECTED_OFFSET = 9;

function polarPoint(angle: number, radius: number) {
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle)
  };
}

function slicePath(
  startAngle: number,
  endAngle: number,
  radius: number
): string {
  const safeEnd = Math.min(endAngle, startAngle + Math.PI * 2 - 0.001);
  const start = polarPoint(startAngle, radius);
  const end = polarPoint(safeEnd, radius);
  const largeArc = safeEnd - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z"
  ].join(" ");
}

export function AnalysisPieChart({
  items,
  onSelect,
  plotRadius = DEFAULT_RADIUS,
  selectedId,
  selectedOffset = DEFAULT_SELECTED_OFFSET,
  showCountLabel = false,
  size = 164,
  startAngle = -Math.PI / 2
}: {
  items: AnalysisPieChartItem[];
  onSelect: (id: string) => void;
  plotRadius?: number;
  selectedId: string;
  selectedOffset?: number;
  showCountLabel?: boolean;
  size?: number;
  startAngle?: number;
}) {
  const { colors, styles } = useStyles();
  const total = items.reduce(
    (sum, item) => sum + Math.max(0, item.percentage),
    0
  );
  let cursor = startAngle;
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const centerLabelSize = Math.max(72, Math.round(size * 0.5));

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { height: size, width: size }]}
    >
      <Svg
        height={size}
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        width={size}
      >
        {items.map((item) => {
          const startAngle = cursor;
          const angle = total > 0 ? (item.percentage / total) * Math.PI * 2 : 0;
          const endAngle = startAngle + angle;
          const midAngle = startAngle + angle / 2;
          const isSelected = item.id === selectedId;
          const translateX = isSelected
            ? Math.cos(midAngle) * selectedOffset
            : 0;
          const translateY = isSelected
            ? Math.sin(midAngle) * selectedOffset
            : 0;
          cursor = endAngle;

          return (
            <Path
              accessible={false}
              d={slicePath(startAngle, endAngle, plotRadius)}
              fill={item.color}
              key={item.id}
              onPress={() => onSelect(item.id)}
              stroke={colors.surface}
              strokeWidth={isSelected ? 4 : 2}
              transform={`translate(${translateX} ${translateY})`}
            />
          );
        })}
      </Svg>
      <View
        style={[
          styles.centerLabel,
          {
            borderRadius: centerLabelSize / 2,
            height: centerLabelSize,
            left: (size - centerLabelSize) / 2,
            top: (size - centerLabelSize) / 2,
            width: centerLabelSize
          }
        ]}
      >
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={styles.centerValue}
        >
          {selected ? `${selected.percentage}%` : "--"}
        </Text>
        <Text
          allowFontScaling={false}
          numberOfLines={2}
          style={[styles.centerCaption, { maxWidth: centerLabelSize - 12 }]}
        >
          {selected?.label ?? "暂无数据"}
        </Text>
        {showCountLabel && selected?.countLabel ? (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={styles.centerMeta}
          >
            {selected.countLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  centerCaption: {
    color: colors.text3,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center"
  },
  centerLabel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    gap: 1,
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute"
  },
  centerValue: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30
  },
  centerMeta: {
    color: colors.text4,
    fontSize: 10,
    lineHeight: 13
  },
  frame: {
    alignItems: "center",
    justifyContent: "center"
  }
}));
