// R15 招待コード: the invite link as a QR code (qrcode-generator 1.4.4, pure JS; DESIGN §7), drawn with
// react-native-svg as one path of dark modules inside a 4-module quiet zone. It is always dark-on-light, also in
// dark mode (white `onImage` ground; ink in light, the page background in dark), so phone cameras read it.
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { useOrbitTheme } from "../../../design/theme";
import { radius } from "../../../design/tokens";

export function inviteQrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) if (qr.isDark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
  }
  return { size: count + 8, path };
}

export function InviteQr({ text, label, size = 168, testID }: { text: string; label: string; size?: number; testID?: string }) {
  const { size: box, path } = useMemo(() => inviteQrPath(text), [text]);
  const { colors, scheme } = useOrbitTheme();
  const ground = colors.onImage;
  const modules = scheme === "dark" ? colors.bg : colors.ink;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.frame, { backgroundColor: ground, height: size, width: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
        <Rect x={0} y={0} width={box} height={box} fill={ground} />
        <Path d={path} fill={modules} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, overflow: "hidden" },
});
