/** A sentence with {terms} and {privacy} as links to the two texts (VA6 and the sign-up checkbox). */
import { type Href, useRouter } from "expo-router";
import type { StyleProp, TextStyle } from "react-native";

import { UiText } from "../components/ui/Text";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import type { MessageKey } from "../i18n/messages";
import { useOrbitTheme } from "../design/theme";

export function LinkedTerms({ textKey, style, onPress }: { textKey: MessageKey; style: StyleProp<TextStyle>; onPress?: () => void }) {
  const { t } = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const router = useRouter();
  const link = (part: string, label: MessageKey, href: string) =>
    <UiText accessibilityRole="link" key={part} onPress={() => router.push(href as Href)} style={{ color: colors.accentText, fontWeight: "700" }} suppressHighlighting>{t(label)}</UiText>;
  return <UiText {...(onPress ? { onPress, suppressHighlighting: true } : {})} style={style}>
    {t(textKey, { terms: "{terms}", privacy: "{privacy}" }).split(/(\{terms\}|\{privacy\})/u).map(part =>
      part === "{terms}" ? link(part, "publicInfo.signupTerms", "/legal/terms") : part === "{privacy}" ? link(part, "publicInfo.signupPrivacy", "/legal/privacy") : part)}
  </UiText>;
}
