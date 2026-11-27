import { useState } from "react";
import { PROFILE_CONTACT_METHODS, type ProfileContactMethod } from "../../api/compute/profile-contact-methods";
import { StyleSheet, View } from "react-native";
import { Avatar, Button, Card, Chip, Icon, ListRow, TextField, Toggle, UiText } from "../../components/ui";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../api/contract/industries";
import { INDUSTRY_CATALOG, industryLabel, listSecondaryIndustries, secondaryIndustryLabel } from "../../api/domain/industries";
import { profileBioLimit, profileVisibleLength } from "../../api/schema/profile-bio";
import type { ProfileEditDraft } from "../../data/profile-edit-session";
import { createThemedStyles } from "../../design/theme";
import { spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { isValidProfileBirthDate } from "../../view-models/profile-onboarding";
import { PersonalScheduleDateTimePicker } from "../schedule/PersonalScheduleDateTimePicker";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * UR-P9–P15（2026-11-27，同 Web 44c694152）：自己紹介 之后「連絡先」——与引导第①步同一份文案、占位与格式校验；选填、不写「1つ以上」；
 * LINE / WeChat 直接给出，メール・電話收在「＋」里（有值或有错时展开）；点保存后格式不对只标那一栏（`contactErrors`，由保存时算出）。
 * 「公開する項目」里原来固定的「メール・電話 · 名刺交換した相手のみ」一行去掉（谁能看写在这个分组里）。
 */
export function AccountEditorContent({ draft, t, patch, onTags, contactErrors = [] }: { draft: ProfileEditDraft; t: OrbitTranslator; patch: (fields: Partial<ProfileEditDraft>) => void; onTags: (field: "offering" | "seeking") => void; contactErrors?: readonly ("email" | "phone")[] }) {
  const { colors, styles } = useStyles();
  const { language } = useOrbitLocale();
  const { timeZone } = useOrbitTimeZone();
  // QA-D: the same industry pair and birthday that onboarding saves (they were missing here; 「業界」 was an unrelated free-text box).
  const [picker, setPicker] = useState<"primary" | "secondary" | null>(null);
  const [birthOpen, setBirthOpen] = useState(false);
  const today = localToday();
  const primaryId = draft.primaryIndustryId ?? null;
  const secondaryId = primaryId && draft.secondaryIndustryId && listSecondaryIndustries(primaryId).some(item => item.id === draft.secondaryIndustryId) ? draft.secondaryIndustryId : null;
  const options = picker === "primary"
    ? INDUSTRY_CATALOG.map(item => ({ id: item.id as string, label: item.labels[language] }))
    : picker === "secondary" && primaryId ? listSecondaryIndustries(primaryId).map(item => ({ id: item.id as string, label: item.labels[language] })) : [];
  const birthDate = isValidProfileBirthDate(draft.birthDate, today) ? draft.birthDate : null;
  const birthLabel = birthDate ? new Intl.DateTimeFormat(language, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${birthDate}T12:00:00Z`)) : t("onboarding.birthDatePlaceholder");
  function choose(id: string) {
    if (picker === "primary") patch(id === primaryId ? {} : { primaryIndustryId: id as IndustryIdCode, secondaryIndustryId: null });
    else patch({ secondaryIndustryId: id as SecondaryIndustryIdCode });
    setPicker(null);
  }
  const chevron = (open: boolean) => <Icon name={open ? "up" : "down"} size={16} color={colors.ink3Text} />;
  const visibility = draft.publicFields ?? { companyRole: true, offeringSeeking: true, intro: true };
  const [more, setMore] = useState(false);
  const handles = draft.handles ?? {};
  const value = (key: ProfileContactMethod) => (typeof handles[key] === "string" ? handles[key] : "");
  const openMore = more || Boolean(value("email").trim() || value("phone").trim()) || contactErrors.length > 0;
  const setContact = (key: ProfileContactMethod, text: string) => patch({ handles: { ...handles, [key]: text } });
  const contactField = (key: ProfileContactMethod) => {
    const meta = { email: ["onboarding.v3.email", "onboarding.v3.emailPlaceholder", "email-address", 120], lineId: ["onboarding.v3.lineId", "onboarding.v3.lineIdPlaceholder", "default", 80], phone: ["onboarding.v3.phone", "onboarding.v3.phonePlaceholder", "phone-pad", 40], wechatId: ["onboarding.v3.wechatId", "onboarding.v3.wechatIdPlaceholder", "default", 80] } as const;
    const [label, placeholder, keyboardType, maxLength] = meta[key];
    const error = key === "email" && contactErrors.includes("email") ? t("onboarding.v3.badEmail") : key === "phone" && contactErrors.includes("phone") ? t("onboarding.v3.badPhone") : undefined;
    return <TextField key={key} label={t(label)} value={value(key)} placeholder={t(placeholder)} keyboardType={keyboardType} autoCapitalize="none" autoCorrect={false} maxLength={maxLength} testID={`profile-contact-${key}`}
      {...(error ? { error } : {})} onChangeText={text => setContact(key, text)} />;
  };
  return <View style={styles.stack}>
    <View style={styles.avatar}><Avatar name={draft.displayName} size="lg" /></View>
    <Card style={styles.stack}>
      <TextField label={t("profile.name")} value={draft.displayName} onChangeText={value => patch({ displayName: value })} />
      <TextField label={t("me.company")} value={draft.organization} onChangeText={value => patch({ organization: value })} />
      <TextField label={t("me.role")} value={draft.role} onChangeText={value => patch({ role: value })} />
      <TextField label={t("me.location")} value={draft.homeMarket} onChangeText={value => patch({ homeMarket: value })} />
    </Card>
    <Card>
      <ListRow title={t("onboarding.primaryIndustry")} subtitle={primaryId ? industryLabel(primaryId, language) : t("onboarding.select")} trailing={chevron(picker === "primary")} onPress={() => setPicker(current => current === "primary" ? null : "primary")} />
      <ListRow title={t("onboarding.secondaryIndustry")} subtitle={secondaryId ? secondaryIndustryLabel(secondaryId, language) : t(primaryId ? "onboarding.select" : "onboarding.selectPrimaryFirst")} {...(primaryId ? { trailing: chevron(picker === "secondary"), onPress: () => setPicker(current => current === "secondary" ? null : "secondary") } : {})} />
      {options.map(option => <ListRow key={option.id} title={option.label} {...(option.id === (picker === "primary" ? primaryId : secondaryId) ? { trailing: <Icon name="check" size={20} color={colors.accentText} /> } : {})} onPress={() => choose(option.id)} />)}
      <ListRow title={t("onboarding.birthDate")} subtitle={birthLabel} trailing={<Icon name="calendar" size={16} color={colors.ink3Text} />} onPress={() => setBirthOpen(true)} />
      {birthDate ? <Button label={t("onboarding.birthDateClear")} variant="ghost" size="sm" onPress={() => patch({ birthDate: null })} /> : null}
      <UiText style={styles.secondary}>{t("onboarding.birthDateHelp")}</UiText>
    </Card>
    {birthOpen ? <PersonalScheduleDateTimePicker kind="date" value={birthDate ?? ""} zone={timeZone} disabled={false} yearJump max={today} title={t("onboarding.birthDate")}
      initialMonth={`${Number(today.slice(0, 4)) - 30}-01`} onCancel={() => setBirthOpen(false)} onConfirm={value => { setBirthOpen(false); patch({ birthDate: value }); }} /> : null}
    <Card style={styles.stack}>
      <TextField label={t("me.intro")} multiline value={draft.bio} placeholder={t("me.bioHint")} onChangeText={value => patch({ bio: value })} />
      <UiText style={styles.secondary}>{t("me.introLimit", { count: profileVisibleLength(draft.bio), limit: profileBioLimit(draft.bio) })}</UiText>
    </Card>
    <View testID="profile-contacts"><Card style={styles.stack}>
      <UiText style={styles.heading} accessibilityRole="header">{t("me.contactTitle")}</UiText>
      <UiText style={styles.secondary}>{t("onboarding.v3.contactSee")}</UiText>
      {(openMore ? PROFILE_CONTACT_METHODS : PROFILE_CONTACT_METHODS.filter(key => key === "lineId" || key === "wechatId")).map(contactField)}
      {openMore ? null : <Button label={t("onboarding.v3.contactMore")} icon="plus" variant="ghost" size="sm" onPress={() => setMore(true)} />}
    </Card></View>
    <Card>{(["offering", "seeking"] as const).map(field => <View key={field} style={styles.tags}>
      <ListRow title={t(field === "offering" ? "me.offering" : "me.seeking")} trailing={
      <Button label={t("me.edit")} variant="ghost" size="sm" onPress={() => onTags(field)} />} />
      <View style={styles.wrap}>{draft[field].map(value => <Chip key={value} label={value} tone={field === "offering" ? "lav" : "pink"} />)}</View>
    </View>)}</Card>
    <Card><UiText style={styles.heading}>{t("me.publicFields")}</UiText>
      {(["companyRole", "offeringSeeking", "intro"] as const).map((field, index) => {
        const title = t((["me.publicCompany", "me.publicTags", "me.publicIntro"] as const)[index]!);
        return <ListRow key={field} title={title} trailing={
      <Toggle accessibilityLabel={title} value={visibility[field]} onValueChange={value => patch({ publicFields: { ...visibility, [field]: value } })} />} />;
      })}
    </Card>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ stack: { gap: spacing.md }, avatar: { alignItems: "center", padding: spacing.md }, secondary: { color: colors.ink3, fontSize: typography.label }, heading: { color: colors.ink, fontSize: typography.cardTitle, fontWeight: "700" }, tags: { paddingBottom: spacing.md }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs } }));
