import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitTheme } from "../design/theme";
import Svg, { Defs, RadialGradient, Rect, Stop } from "./ui/svg";

// kit .phone background (ui.css:65): two fog ellipses over --bg —
//   radial-gradient(420px 320px at 0% 0%,   var(--fog-a), transparent 70%),
//   radial-gradient(380px 300px at 100% 8%, var(--fog-b), transparent 70%), var(--bg)
// The page lays it behind everything (absolute, not scrolling), like the frame does.
const FOGS = [
  { id: "fogA", rx: 420, ry: 320, x: 0, y: 0 },
  { id: "fogB", rx: 380, ry: 300, x: 1, y: 0.08 },
] as const;

export function ShellBackground() {
  const { colors } = useOrbitTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (!size || size.width !== width || size.height !== height) setSize({ width, height });
      }}>
      {size ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            {FOGS.map((fog) => {
              // CSS `transparent` fades the alpha in premultiplied space: same colour, alpha → 0 at 70%.
              // react-native-svg ignores the alpha inside stopColor, so it goes into stopOpacity.
              const { hex, alpha } = splitAlpha(colors[fog.id]);
              return (
                <RadialGradient key={fog.id} id={fog.id} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={fog.rx}
                  gradientTransform={`translate(${fog.x * size.width} ${fog.y * size.height}) scale(1 ${fog.ry / fog.rx})`}>
                  <Stop offset={0} stopColor={hex} stopOpacity={alpha} />
                  <Stop offset={0.7} stopColor={hex} stopOpacity={0} />
                </RadialGradient>
              );
            })}
          </Defs>
          {FOGS.map((fog) => <Rect key={fog.id} x={0} y={0} width={size.width} height={size.height} fill={`url(#${fog.id})`} />)}
        </Svg>
      ) : null}
    </View>
  );
}

/** The fog tokens carry an alpha; split them into an opaque #rrggbb and its alpha. */
function splitAlpha(value: string): { hex: string; alpha: number } {
  const [r = 0, g = 0, b = 0, a = 1] = (value.match(/[\d.]+/gu) ?? []).map(Number);
  return { hex: "#" + [r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join(""), alpha: a };
}
