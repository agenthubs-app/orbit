import { useRouter } from "expo-router";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { ProfileNotice, ProfilePageFrame, ProfilePrimaryButton } from "./ProfilePagePrimitives";
import { profilePreviewFromSession } from "./profile-page-model";
import { ProfilePublicView } from "./ProfilePublicView";
import { useProfileEditSessionScreen } from "./useProfileEditSessionScreen";

export function ProfilePreviewScreen() {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const largeText = useWindowDimensions().fontScale > 1.3;
  const state = useProfileEditSessionScreen();
  const preview = state.session && state.baseProfile
    ? profilePreviewFromSession(state.session, state.baseProfile)
    : null;
  const footer = preview ? <View style={[styles.actions, largeText && styles.actionsLarge]}>
    <ProfilePrimaryButton disabled label={locale.t("profile.previewMessage")} />
    <ProfilePrimaryButton disabled label={locale.t("profile.previewConnect")} secondary />
  </View> : undefined;
  return <ProfilePageFrame backLabel={locale.t("profile.backToEdit")} footer={footer} onBack={() => router.back()} title={locale.t("profile.previewTitle")}>
    <View style={styles.notice}><ProfileNotice>{locale.t("profile.previewNotice")}</ProfileNotice></View>
    {preview ? <ProfilePublicView profile={preview} /> : <ProfileNotice error>{locale.t("profile.noEditSession")}</ProfileNotice>}
  </ProfilePageFrame>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  actions: { flexDirection: "row", gap: 10 },
  actionsLarge: { flexDirection: "column" },
  notice: { alignSelf: "stretch", backgroundColor: colors.surface2, borderRadius: 8, flexDirection: "row", padding: 12 },
}));
