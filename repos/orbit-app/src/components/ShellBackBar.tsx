import { usePathname, useRouter, type Href } from "expo-router";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../design/theme";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../i18n/standard-copy";
import { parentForPath } from "../view-models/app-navigation";
import { ListRow } from "./ui/ListRow";
import { Icon } from "./ui/Icon";
import { UiPressable } from "./ui/Pressable";
import { UiText } from "./ui/Text";

// R05 secondary-page rule for the pages that draw their own layout instead of
// AppScreen (マイページ): a ← that goes back in history, or — opened directly —
// to the page it belongs to, named like AppScreen's back button.
export function ShellBackBar() {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const parent = parentForPath(usePathname(), locale.t);
  const canGoBack = router.canGoBack();
  return (
    <View style={styles.bar}>
      <UiPressable accessibilityRole="button" accessibilityLabel={canGoBack ? copy.nav.back : fillCopy(copy.nav.backTo, { label: parent.label })}
        onPress={() => canGoBack ? router.back() : router.replace(parent.href as Href)} style={styles.back}>
        <Icon name="left" size={20} color={colors.accentText} />
        <UiText numberOfLines={1} style={styles.label}>{canGoBack ? copy.nav.back : parent.label}</UiText>
      </UiPressable>
    </View>
  );
}

/** マイページ keeps a 受信箱 row as the second way in (the first is the home 🔔). */
export function ShellInboxRow() {
  const { colors } = useStyles();
  const router = useRouter();
  const copy = useStandardCopy();
  return <ListRow leading={<Icon name="inbox" size={20} color={colors.ink2} />} title={copy.nav.inbox}
    trailing={<Icon name="right" size={16} color={colors.ink3Text} />} onPress={() => router.push("/inbox" as Href)} />;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: 8 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, minWidth: 44, paddingHorizontal: 6 },
  label: { color: colors.accentText, fontSize: 14, lineHeight: 20 },
}));
