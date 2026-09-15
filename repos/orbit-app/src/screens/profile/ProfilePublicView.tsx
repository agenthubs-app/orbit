import { StyleSheet, Text, View } from "react-native";
import type { PublicProfileProjectionContract } from "../../api/contract/profile";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { ProfileSection, ProfileTags } from "./ProfilePagePrimitives";

export function ProfilePublicView({ profile }: { profile: PublicProfileProjectionContract }) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const meta = [profile.role, profile.organization].filter(Boolean).join(" · ");
  const headline = profile.headline.trim() === meta.trim() ? "" : profile.headline;
  return <View style={styles.stack}>
    <View style={styles.identity}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{Array.from(profile.displayName.trim())[0] ?? "O"}</Text></View>
      <View style={styles.identityCopy}>
        <Text style={styles.name}>{locale.t.literal(profile.displayName)}</Text>
        {meta ? <Text style={styles.meta}>{locale.t.literal(meta)}</Text> : null}
        {profile.homeMarket ? <Text style={styles.secondary}>{locale.t.literal(profile.homeMarket)}</Text> : null}
        {headline ? <Text style={styles.headline}>{locale.t.literal(headline)}</Text> : null}
      </View>
    </View>
    {profile.bio ? <ProfileSection title={locale.t("profile.currentWork")}><Text style={styles.body}>{locale.t.literal(profile.bio)}</Text></ProfileSection> : null}
    {profile.offering?.length ? <ProfileSection title={locale.t("profile.offering")}><ProfileTags values={profile.offering} /></ProfileSection> : null}
    {profile.seeking?.length ? <ProfileSection title={locale.t("profile.seeking")}><ProfileTags values={profile.seeking} /></ProfileSection> : null}
    {profile.topics?.length ? <ProfileSection title={locale.t("profile.topics")}><ProfileTags values={profile.topics} /></ProfileSection> : null}
    {profile.spokenLanguages?.length ? <ProfileSection title={locale.t("profile.spokenLanguages")}><ProfileTags values={profile.spokenLanguages} /></ProfileSection> : null}
    {profile.preferredIntroChannels.length ? <ProfileSection title={locale.t("profile.contactInformation")}><ProfileTags values={profile.preferredIntroChannels} /></ProfileSection> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  stack: { gap: 24 },
  identity: { alignItems: "center", flexDirection: "row", gap: 16, paddingTop: 8 },
  identityCopy: { flex: 1, gap: 4, minWidth: 0 },
  avatar: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 36, height: 72, justifyContent: "center", width: 72 },
  avatarText: { color: colors.onAccent, fontSize: 30, fontWeight: "800", lineHeight: 36 },
  name: { color: colors.ink, fontSize: 24, fontWeight: "900", letterSpacing: -0.4, lineHeight: 31 },
  meta: { color: colors.text3, fontSize: 14, lineHeight: 20 },
  secondary: { color: colors.text4, fontSize: 13, lineHeight: 19 },
  headline: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22, marginTop: 4 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 24, paddingVertical: 13 },
}));
