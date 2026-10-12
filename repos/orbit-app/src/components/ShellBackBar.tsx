import { usePathname, useRouter, type Href } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../design/theme";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { fillCopy, useStandardCopy } from "../i18n/standard-copy";
import { parentForPath } from "../view-models/app-navigation";
import { ListRow } from "./ui/ListRow";
import { SHELL_GUTTER, ShellTopBar } from "./ShellTopBar";
import { Icon } from "./ui/Icon";
import { IconButton } from "./ui/IconButton";

// R05 secondary-page rule for the pages that draw their own layout instead of
// AppScreen (マイページ): kit .topbar with a ‹ round button that goes back in
// history, or — opened directly — to the page it belongs to (VoiceOver names it).
export function ShellBackBar({ title = "", subtitle, right }: { title?: string; subtitle?: string | undefined; right?: ReactNode }) {
  const { styles } = useStyles();
  const router = useRouter();
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const parent = parentForPath(usePathname(), locale.t);
  const canGoBack = router.canGoBack();
  return (
    <View style={styles.bar}>
      <ShellTopBar title={title} subtitle={subtitle} right={right}
        left={<IconButton icon="left" accessibilityLabel={canGoBack ? copy.nav.back : fillCopy(copy.nav.backTo, { label: parent.label })}
          onPress={() => canGoBack ? router.back() : router.replace(parent.href as Href)} />} />
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

const useStyles = createThemedStyles(() => StyleSheet.create({
  bar: { paddingHorizontal: SHELL_GUTTER },
}));
