// R15 `i` 招待コードを入力 (DESIGN add-and-invite §2.5 第 7 条): typing a code by hand. It is tidied as it is
// typed (upper case, the hyphen after the 4th character, at most 8), characters outside the code alphabet
// say 「使えない文字が含まれています」, and 開く goes to `i/<code>` only for a complete code.
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { formatInviteCode, formatInviteCodeInput, inviteCodeInputHint } from "../../../api/compute/invite-code-format";
import { AppScreen } from "../../../components/AppScreen";
import { Button, Card, TextField } from "../../../components/ui";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { Caption, FadeIn, useAddStyles } from "../add-ui";

export function InviteCodeEntryScreen() {
  const router = useRouter();
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);
  const hint = inviteCodeInputHint(value);
  const code = formatInviteCode(value);
  const showHint = hint === "invalid_char" || (tried && hint !== "ok");
  const message = hint === "invalid_char" ? t("add.inviteIn.hintInvalidChar") : t("add.inviteIn.hintLength");
  const open = () => {
    setTried(true);
    if (code) router.push(`/i/${code}` as Href);
  };
  return (
    <AppScreen title={t("add.inviteIn.manualTitle")}>
      <FadeIn testID="invite-entry">
        <View style={styles.stack}>
          <Caption>{t("add.inviteIn.manualSub")}</Caption>
          <Card>
            <TextField
              label={t("add.inviteIn.manualField")}
              value={value}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={12}
              returnKeyType="go"
              onChangeText={(next) => setValue(formatInviteCodeInput(next))}
              onSubmitEditing={open}
              testID="invite-entry-field"
              {...(showHint ? { error: message } : {})}
            />
          </Card>
          <View testID="invite-entry-open"><Button label={t("add.inviteIn.manualOpen")} variant="primary" block disabled={!code} onPress={open} /></View>
        </View>
      </FadeIn>
    </AppScreen>
  );
}
