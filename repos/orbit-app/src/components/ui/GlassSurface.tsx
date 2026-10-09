import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useOrbitTheme } from "../../design/theme";

// kit glass (tab bar, push cards): blurred backdrop + the glass tint and line.
// Web and Android without blur fall back to the solid glass tint.
export function GlassSurface({ children, style, radius = 22 }: { children: ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  const { colors, scheme } = useOrbitTheme();
  const frame = [styles.frame, { borderRadius: radius, borderColor: colors.glassLine }, style];
  if (Platform.OS === "web") return <View style={[frame, { backgroundColor: colors.glass }]}>{children}</View>;
  return (
    <View style={frame}>
      <BlurView intensity={40} tint={scheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: "hidden", borderWidth: 1 } });
