import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { openMainTab } from "../../components/shell-navigation";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createTranslator } from "../../i18n/messages";
import { localizeAuthMessage } from "../../view-models/account-auth";

export function WelcomeScreen() {
  const { colors, styles } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [slide, setSlide] = useState(0);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  const samples = [
    [t("auth.welcomeSampleCards"), t("auth.welcomeSamplePlan"), t("auth.welcomeSampleDraft")],
    [t("auth.welcomeSampleGoals"), t("auth.welcomeSampleNext"), t("auth.welcomeSampleEvent")],
    [t("auth.welcomeSamplePair"), t("auth.welcomeSampleNotes"), t("auth.welcomeSampleReview")]
  ];
  const headlines = [
    [t("auth.welcomeTitle"), t("auth.welcomeDescription")],
    [t("auth.welcomeTitleGoals"), t("auth.welcomeDescriptionGoals")],
    [t("auth.welcomeTitleFollow"), t("auth.welcomeDescriptionFollow")]
  ];

  function showSlide(index: number) {
    setSlide(index);
    pager.current?.scrollTo({ x: index * width, animated: true });
  }

  function onPageSettled(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    setSlide(Math.min(Math.max(index, 0), samples.length - 1));
  }

  async function continueWithGoogle() {
    if (googlePending) return;
    setGooglePending(true);
    setGoogleError(null);
    try {
      const result = await auth.startGoogleSignIn({ redirectTo: "/home" });
      if (result.success) openMainTab(router, "/home");
      else setGoogleError(result.message === createTranslator("zh")("auth.googleCancelled") ? t("auth.googleCancelled") : localizeAuthMessage(result.message, t) ?? t("auth.googleIncomplete"));
    } finally {
      setGooglePending(false);
    }
  }

  return <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.brand}><Text allowFontScaling={false} style={styles.brandMark}>O</Text><Text style={styles.brandText}>Orbit</Text></View>
      <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onPageSettled} style={styles.pager}>
        {samples.map((lines, index) => <View key={index} style={[styles.page, { width }]}>
          <View style={styles.sample}>
            <Text style={styles.sampleLabel}>{t("auth.welcomeSample")}</Text>
            {lines.map((line) => <Text key={line} style={styles.sampleCard}>{line}</Text>)}
          </View>
          <Text accessibilityRole="header" style={styles.title}>{headlines[index]![0]}</Text>
          <Text style={styles.description}>{headlines[index]![1]}</Text>
        </View>)}
      </ScrollView>
      <View style={styles.dots}>
        {samples.map((_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${index + 1} / ${samples.length}`} accessibilityState={{ selected: index === slide }} hitSlop={8} onPress={() => showSlide(index)} style={[styles.dot, index === slide && styles.dotActive]} />)}
      </View>
      <View style={styles.spacer} />
      <Pressable accessibilityRole="button" onPress={() => router.push("/account/signup")} style={styles.primary}><Text style={styles.primaryText}>{t("auth.welcomeStart")}</Text></Pressable>
      {auth.googleEnabled ? <Pressable accessibilityRole="button" disabled={googlePending} onPress={continueWithGoogle} style={styles.secondary}><Text style={styles.secondaryText}>{t("auth.welcomeGoogle")}</Text></Pressable> : null}
      {googleError ? <Text accessibilityRole="alert" style={styles.error}>{googleError}</Text> : null}
      <Pressable accessibilityRole="link" onPress={() => router.push("/account/login")} style={styles.login}><Text style={styles.loginText}>{t("auth.welcomeLogin")}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingBottom: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 36, marginBottom: 28 },
  pager: { flexGrow: 0 },
  page: { paddingHorizontal: 18 },
  brandMark: { width: 36, height: 36, overflow: "hidden", borderRadius: 12, backgroundColor: colors.ink, color: colors.surface, textAlign: "center", textAlignVertical: "center", fontSize: 24, fontWeight: "900" },
  brandText: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  sample: { marginHorizontal: 18, borderRadius: 26, padding: 20, paddingTop: 27, paddingBottom: 50, gap: 20, backgroundColor: colors.accentSoft },
  sampleLabel: { color: colors.accentText, fontSize: 14, fontWeight: "700", marginLeft: 8, marginBottom: 2 },
  sampleCard: { overflow: "hidden", borderRadius: 24, paddingHorizontal: 18, paddingVertical: 18, backgroundColor: colors.surface, color: colors.ink, fontSize: 17, lineHeight: 27 },
  title: { marginHorizontal: 18, marginTop: 10, color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: "800" },
  description: { marginHorizontal: 18, marginTop: 10, color: colors.ink2, fontSize: 15, lineHeight: 24 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 20, marginTop: 24 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: colors.plum500 },
  dotActive: { backgroundColor: colors.plum700 },
  spacer: { flexGrow: 1, minHeight: 55 },
  primary: { minHeight: 50, marginHorizontal: 18, borderRadius: 24, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.surface, fontSize: 17, fontWeight: "700" },
  secondary: { minHeight: 50, borderRadius: 24, marginHorizontal: 18, marginTop: 10, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  error: { color: colors.coralText, marginTop: 10, marginHorizontal: 18 },
  login: { minHeight: 44, marginTop: 6, marginHorizontal: 18, justifyContent: "center", alignItems: "center" },
  loginText: { color: colors.ink, fontSize: 16, fontWeight: "600" }
}));
