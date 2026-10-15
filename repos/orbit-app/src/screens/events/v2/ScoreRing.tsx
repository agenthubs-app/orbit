// kit .ring（app.html #14 / #30）：surface-3 底圈 + 按分数比例的圆弧（stroke-linecap round，从 12 点顺时针），
// 中间 .score（font-num = SF Pro Rounded 800）。RingChart 把单段当 100% 画，所以分数环单独画。
import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import { UiText } from "../../../components/ui";
import Svg, { Circle } from "../../../components/ui/svg";
import { useOrbitTheme } from "../../../design/theme";

export function ScoreRing({ size, stroke, value, color, label, fontSize, children }: { size: number; stroke: number; value: number; color: string; label: string; fontSize: number; children?: ReactNode }) {
  const { colors } = useOrbitTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, value / 100));
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ alignItems: "center", height: size, justifyContent: "center", width: size }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface3} strokeWidth={stroke} fill="none" />
        {share > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${share * circumference} ${circumference}`} /> : null}
      </Svg>
      {children ?? <UiText style={{ color: colors.ink, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize, fontWeight: "800", lineHeight: fontSize * 1.1 }}>{label}</UiText>}
    </View>
  );
}
