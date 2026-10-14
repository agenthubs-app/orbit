// R12 手入力 ④ 保存したあと (b11 A3 #18, App): the person just added — avatar, name, company, density,
// 手入力 / 出会った場所 chips — then 情報を濃くする (名刺を撮る / 招待コードを送る / 面談のメモを書く, any one),
// and where the person went (人脈 › すべて, newest first; 「情報が少ない人」 = ●○○ only, as on app.html 人脈). The 元に戻す toast comes from the save itself.
// ‹ goes back to 人脈; ⋯ opens the person's page.
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { ContactDensityLevel } from "../../api/compute/contact-density";
import { AppScreen } from "../../components/AppScreen";
import { ActionSheet, Avatar, Icon, IconButton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { KitChip, KitEmo } from "../plan/plan-kit";
import { DensityDots, FadeIn, KIT_PAGE_INSET } from "./add-ui";
import { densityMarks } from "./manual-model";

export type ManualSaved = { contactId: string; name: string; organization: string; metLabel: string | null; density: ContactDensityLevel };

export function ManualSavedView({ saved }: { saved: ManualSaved }) {
  const router = useRouter();
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const [menu, setMenu] = useState(false);
  const profile = `/contacts/${encodeURIComponent(saved.contactId)}` as Href;
  const next = Math.min(3, saved.density + 1) as ContactDensityLevel;
  const rows = [
    { key: "card", emoji: "📇", tone: "apricot" as const, title: t("add.manual.enrichCard"), sub: t("add.manual.enrichCardSub", { from: densityMarks(saved.density), to: densityMarks(next) }), href: "/contacts/new/scan" as Href },
    { key: "invite", emoji: "🤝", tone: "pink" as const, title: t("add.manual.enrichInvite"), sub: t("add.manual.enrichInviteSub"), href: "/contacts/new/invite" as Href },
    { key: "note", emoji: "📝", tone: "lav" as const, title: t("add.manual.enrichNote"), sub: t("add.manual.enrichNoteSub"), href: `/notes/new?contactId=${encodeURIComponent(saved.contactId)}` as Href },
  ];
  return (
    <AppScreen title="" onBack={() => router.replace("/contacts" as Href)}
      headerActions={<IconButton icon="more" accessibilityLabel={t("add.manual.savedMenu")} onPress={() => setMenu(true)} />}>
      <FadeIn testID="add-manual-saved" style={KIT_PAGE_INSET}>
        <View style={styles.head}>
          <Avatar name={saved.name} size="lg" />
          <UiText style={styles.name}>{saved.name}</UiText>
          {saved.organization ? <UiText style={styles.lbl}>{saved.organization}</UiText> : null}
          <View style={styles.chips}>
            <DensityDots level={saved.density} />
            <View style={styles.src}>
              <Icon name="pen" size={16} color={colors.ink2} />
              <UiText style={styles.srcText}>{t("add.manual.sourceManual")}</UiText>
            </View>
            {saved.metLabel ? <KitChip label={saved.metLabel} /> : null}
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.cardH}>
            <UiText style={styles.h3}>{t("add.manual.enrichTitle")}</UiText>
            <UiText style={styles.lbl}>{t("add.manual.enrichAny")}</UiText>
          </View>
          {rows.map((row, index) => (
            <UiPressable key={row.key} accessibilityRole="button" accessibilityLabel={`${row.title}、${row.sub}`} onPress={() => router.push(row.href)}
              style={[styles.nx, index > 0 && styles.nxLine]} testID={`add-manual-enrich-${row.key}`}>
              <KitEmo emoji={row.emoji} tone={row.tone} sm />
              <View style={styles.meta}>
                <UiText numberOfLines={1} style={styles.nxTitle}>{row.title}</UiText>
                <UiText numberOfLines={1} style={styles.nxSub}>{row.sub}</UiText>
              </View>
              <Icon name="right" size={16} color={colors.ink3} />
            </UiPressable>
          ))}
        </View>
        <View style={styles.flat}>
          <UiText style={styles.where}>
            {t("add.manual.savedWhereBefore")}<UiText style={styles.whereStrong}>{t("add.manual.savedWhereStrong")}</UiText>{t("add.manual.savedWhereAfter")}{saved.density === 1 ? t("add.manual.savedWhereThin") : ""}
          </UiText>
        </View>
      </FadeIn>
      <ActionSheet visible={menu} title={saved.name} options={[{ key: "profile", label: t("add.manual.savedOpenProfile") }]}
        onSelect={() => { setMenu(false); router.push(profile); }} onClose={() => setMenu(false)} />
    </AppScreen>
  );
}

// kit .center / .av.lg / .card / .card-h / .nx / .card.flat（数值照 b11 #18）。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  head: { alignItems: "center", marginTop: 2 },
  name: { marginTop: 8, fontSize: 20, fontWeight: "800", lineHeight: 30, color: colors.ink },
  lbl: { fontSize: 11.5, fontWeight: "500", lineHeight: 17.25, color: colors.ink3Text },
  chips: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  src: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.surface2 },
  srcText: { fontSize: 11, fontWeight: "700", lineHeight: 16.5, color: colors.ink2 },
  card: { marginTop: 14, backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 6, paddingHorizontal: 16 },
  cardH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, marginBottom: 2 },
  h3: { fontSize: 14.5, fontWeight: "800", lineHeight: 21.75, color: colors.ink },
  nx: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  nxLine: { borderTopWidth: 1, borderTopColor: colors.line },
  meta: { flex: 1, minWidth: 0 },
  nxTitle: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink },
  nxSub: { fontSize: 11.5, lineHeight: 17.25, color: colors.ink3Text },
  flat: { marginTop: 14, backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  where: { fontSize: 11.5, fontWeight: "500", lineHeight: 18.4, color: colors.ink2 },
  whereStrong: { fontWeight: "700", color: colors.ink },
}));
