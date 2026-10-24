// R15 招待コード: the invite link as a QR code (qrcode-generator 1.4.4, pure JS; DESIGN §7), drawn with
// react-native-svg as one path of dark modules. b11 .qr: a square with an 8pt frame, radius 16, a hairline ring and
// the Orbit 「O」 in the middle — so the code uses the highest error correction (H, 30%) and the badge covers well
// under that; two modules of quiet zone sit inside the frame. It is always dark-on-light, also in dark mode (white
// `onImage` ground; ink in light, the page background in dark), so phone cameras read it (决定表 §20).
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { UiText } from "../../../components/ui";
import { useOrbitTheme } from "../../../design/theme";

export function inviteQrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "H");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) if (qr.isDark(row, col)) path += `M${col + 2} ${row + 2}h1v1h-1z`;
  }
  return { size: count + 4, path };
}

const FRAME = 8;

export function InviteQr({ text, label, size = 196, testID }: { text: string; label: string; size?: number; testID?: string }) {
  const { size: box, path } = useMemo(() => inviteQrPath(text), [text]);
  const { colors, scheme } = useOrbitTheme();
  const ground = colors.onImage;
  const modules = scheme === "dark" ? colors.bg : colors.ink;
  const inner = size - FRAME * 2;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label}
      style={[styles.ring, { borderColor: colors.line }]}>
      <View style={[styles.frame, { backgroundColor: ground, borderColor: ground, height: size, width: size }]}>
      <Svg width={inner} height={inner} viewBox={`0 0 ${box} ${box}`}>
        <Rect x={0} y={0} width={box} height={box} fill={ground} />
        <Path d={path} fill={modules} />
      </Svg>
      <View style={[styles.badge, { backgroundColor: modules, borderColor: ground }]}>
        <UiText style={[styles.badgeText, { color: ground }]}>O</UiText>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // .qr: border 8 (the ground colour), radius 16; box-shadow 0 0 0 1px var(--line) = a 1pt ring just outside.
  ring: { borderRadius: 17, borderWidth: 1, margin: -1 },
  frame: { alignItems: "center", borderRadius: 16, borderWidth: FRAME, justifyContent: "center" },
  // .qr::after: 36 square, radius 10, ring 4 in the ground colour, 900 weight 「O」.
  badge: { alignItems: "center", borderRadius: 14, borderWidth: 4, height: 44, justifyContent: "center", position: "absolute", width: 44 },
  badgeText: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
});
