import { useColorScheme } from "react-native";
import { colors, darkColors, type OrbitColors, type OrbitColorScheme } from "./tokens";

const themes: Record<OrbitColorScheme, { colors: OrbitColors; scheme: OrbitColorScheme }> = {
  light: { colors, scheme: "light" },
  dark: { colors: darkColors, scheme: "dark" }
};

export function useOrbitTheme() {
  const scheme = useColorScheme();
  return themes[scheme === "dark" ? "dark" : "light"];
}

// Each file keeps its existing StyleSheet structure. Build the two immutable
// variants once, then select during render so an OS appearance change updates
// mounted screens without discarding input, selection or navigation state.
export function createThemedStyles<Styles>(createStyles: (colors: OrbitColors) => Styles) {
  const variants = {
    light: createStyles(colors),
    dark: createStyles(darkColors)
  };

  return function useStyles() {
    const theme = useOrbitTheme();
    return { colors: theme.colors, styles: variants[theme.scheme] };
  };
}
