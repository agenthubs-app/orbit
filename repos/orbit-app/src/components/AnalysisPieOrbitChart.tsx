import { useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, radius, spacing } from "../design/tokens";
import { AnalysisPieChart } from "./AnalysisPieChart";
import {
  analysisPieOrbitPresentation,
  type AnalysisPieOrbitItemInput
} from "./analysis-pie-orbit-layout";

const INITIAL_FRAME_WIDTH = 327;

export function AnalysisPieOrbitChart({
  items,
  onSelect,
  selectedId
}: {
  items: AnalysisPieOrbitItemInput[];
  onSelect: (id: string) => void;
  selectedId: string;
}) {
  const [frameWidth, setFrameWidth] = useState(INITIAL_FRAME_WIDTH);
  const { fontScale } = useWindowDimensions();
  const presentation = analysisPieOrbitPresentation({
    fontScale,
    items,
    selectedId,
    width: frameWidth
  });
  const { layout } = presentation;

  function updateFrameWidth(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);

    if (nextWidth > 0 && nextWidth !== frameWidth) {
      setFrameWidth(nextWidth);
    }
  }

  return (
    <View
      onLayout={updateFrameWidth}
      style={[styles.frame, { height: layout.height }]}
    >
      <Svg
        accessibilityElementsHidden
        height={layout.height}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width={layout.width}
      >
        {presentation.labels.map((item) => (
          <Path
            d={item.slot.connectorPath}
            fill="none"
            key={item.id}
            opacity={item.isSelected ? 1 : 0.72}
            stroke={item.color}
            strokeLinecap="round"
            strokeWidth={item.isSelected ? 1.4 : 0.9}
          />
        ))}
      </Svg>

      <View
        style={[
          styles.chart,
          {
            height: layout.chart.size,
            left: layout.chart.left,
            top: layout.chart.top,
            width: layout.chart.size
          }
        ]}
      >
        <AnalysisPieChart
          items={presentation.chartItems}
          onSelect={onSelect}
          plotRadius={88}
          selectedId={selectedId}
          selectedOffset={7}
          showCountLabel
          size={layout.chart.size}
          startAngle={presentation.chartStartAngle}
        />
      </View>

      {presentation.labels.map((item) => (
        <Pressable
          accessibilityHint={item.accessibilityHint}
          accessibilityLabel={item.accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ selected: item.isSelected }}
          key={item.id}
          onPress={() => onSelect(item.selectId)}
          style={({ pressed }) => [
            styles.label,
            {
              height: item.slot.height,
              left: item.slot.left,
              top: item.slot.top,
              width: item.slot.width
            },
            pressed ? styles.labelPressed : null
          ]}
        >
          <View style={[styles.labelDots, item.slot.indicator]}>
            {item.colors.slice(0, 4).map((color, index) => (
              <View
                key={`${item.id}-${color}-${index}`}
                style={[
                  item.isAggregate ? styles.labelDotSmall : styles.labelDot,
                  { backgroundColor: color }
                ]}
              />
            ))}
          </View>
          <View style={[styles.labelCopy, item.slot.copy]}>
            <Text
              maxFontSizeMultiplier={1.6}
              numberOfLines={2}
              style={[styles.labelTitle, { textAlign: item.slot.textAlign }]}
            >
              {item.label}
            </Text>
            <Text
              maxFontSizeMultiplier={1.6}
              numberOfLines={2}
              style={[styles.labelMeta, { textAlign: item.slot.textAlign }]}
            >
              {item.countLabel} · {item.percentage}%
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    position: "absolute"
  },
  frame: {
    position: "relative",
    width: "100%"
  },
  label: {
    position: "absolute"
  },
  labelCopy: {
    gap: spacing.xxs,
    justifyContent: "center",
    minWidth: 0,
    position: "absolute"
  },
  labelDot: {
    borderRadius: radius.pill,
    height: 9,
    width: 9
  },
  labelDots: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1,
    justifyContent: "center",
    position: "absolute"
  },
  labelDotSmall: {
    borderRadius: radius.pill,
    height: 5,
    width: 5
  },
  labelMeta: {
    color: colors.text3,
    fontSize: 12,
    lineHeight: 17
  },
  labelPressed: {
    opacity: 0.62
  },
  labelTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  }
});
