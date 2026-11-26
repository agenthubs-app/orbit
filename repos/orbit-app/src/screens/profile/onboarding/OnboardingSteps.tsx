/** The three onboarding pages as drawn (A1–A7); state, saving and AI calls live in ProfileOnboardingScreen. */
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { Platform, TextInput, View, type LayoutChangeEvent } from "react-native";

import { BottomSheet, Icon, UiPressable, UiText } from "../../../components/ui";
import { faceFor } from "../../../components/ui/Text";
import { SENIORITY_LEVEL_LABELS } from "../../../api/compute/seniority-group";
import { industryLabel, secondaryIndustryLabel } from "../../../api/domain/industries";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import type { OnboardingMark, OnboardingMarkedField } from "../../../storage/profile-onboarding-storage";
import {
  basicIndustryValid,
  contactFormatProblem,
  GOAL_LIMIT,
  GOAL_OPTIONS,
  OFFER_LIMIT,
  OFFER_OPTIONS,
  optionLabel,
  optionMatches,
  SEEK_LIMIT,
  SEEK_OPTIONS,
  TOPIC_LIMIT,
  TOPIC_OPTIONS,
  addCustomValue,
  savedOptionLabel,
  type BasicDraft,
  type Copy,
  type OnboardingMissingField,
} from "../../../view-models/profile-onboarding";
import { Emo, KitButton, MarkChip, SelectField, TextField, Toggle, useOnboardingStyles } from "./OnboardingParts";

export type Marks = Partial<Record<OnboardingMarkedField, OnboardingMark>>;
export type ScanState = { kind: "idle" } | { kind: "scanning" } | { kind: "failed"; message: string } | { kind: "done"; card: number; ai: number };
export type TextKey = "name" | "company" | "title" | "homeMarket" | "email" | "phone" | "lineId" | "wechatId";

export interface ProfileStepProps {
  basic: BasicDraft;
  birthLabel: string | null;
  disabled: boolean;
  errors: ReadonlySet<OnboardingMissingField>;
  /** Board samples only: labels that are not in the industry catalogue. */
  industry?: { primary: string; secondary: string };
  inputs: { name: RefObject<TextInput | null>; primary: RefObject<View | null>; secondary: RefObject<View | null> };
  marks: Marks;
  onBirth: () => void;
  onClearBirth: () => void;
  onFieldLayout: (field: OnboardingMissingField, event: LayoutChangeEvent) => void;
  onPick: (which: "primary" | "secondary" | "seniority") => void;
  onScan: (source: "camera" | "library") => void;
  onText: (key: TextKey, value: string) => void;
  /** 迁移账号补资料（UR-R10–R12）：birthDate = 旧生日无效要改；carriedName = 旧系统带来的姓名（没改时带「引き継ぎ」）。 */
  repair?: { birthDate: boolean; carriedName?: string } | null;
  scan: ScanState;
}

export function ProfileStep({ basic, birthLabel, disabled, errors, industry, inputs, marks, onBirth, onClearBirth, onFieldLayout, onPick, onScan, onText, repair, scan }: ProfileStepProps) {
  const { styles, colors } = useOnboardingStyles();
  const { t, language } = useOrbitLocale();
  const busy = scan.kind === "scanning";
  const done = scan.kind === "done";
  const primary = industry?.primary ?? (basic.primaryIndustryId ? industryLabel(basic.primaryIndustryId, language) : null);
  const secondary = industry?.secondary ?? (basic.secondaryIndustryId && basicIndustryValid(basic) ? secondaryIndustryLabel(basic.secondaryIndustryId, language) : null);
  const text = (key: TextKey, label: string, placeholder: string, extra: object = {}) => (
    <TextField accessibilityLabel={t(`onboarding.v3.${key === "title" ? "role" : key}`)} editable={!disabled} label={label} mark={marks[key]} maxLength={key === "email" ? 120 : key === "phone" ? 40 : key === "name" ? 60 : 80} onChangeText={value => onText(key, value)} placeholder={placeholder} value={basic[key] ?? ""} {...extra} />
  );
  const optional = (key: "company" | "role", filled: boolean) => t(filled ? `onboarding.v3.${key}` : key === "company" ? "onboarding.v3.companyOptional" : "onboarding.v3.roleOptional");
  return (
    <>
      {repair ? <>
        <View style={[styles.once, styles.repairNotice]} testID="onboarding-repair-notice">
          <View style={[styles.emo, styles.emoSurface]}><UiText maxFontSizeMultiplier={1.2} style={styles.emoText}>📦</UiText></View>
          <UiText style={styles.onceText}><UiText style={styles.onceStrong}>{t("onboarding.v3.repairNoticeStrong")}</UiText>{t("onboarding.v3.repairNoticeRest")}</UiText>
        </View>
        <UiText accessibilityRole="header" style={styles.h1}>{t("onboarding.v3.repairTitle")}</UiText>
        <UiText style={styles.sub}>{t("onboarding.v3.repairHint")}</UiText>
      </> : done ? (
        <View accessibilityLiveRegion="polite" style={styles.scanDone} testID="onboarding-scan-done">
          <Emo emoji="📇" large tone="surface" />
          <View style={styles.scanDoneText}>
            <UiText style={styles.scanDoneTitle}>{scan.ai ? t("onboarding.v3.scanDone", { card: scan.card, ai: scan.ai }) : t("onboarding.v3.scanDoneCard", { card: scan.card })}</UiText>
            <UiText style={styles.lbl}>{t("onboarding.v3.scanDoneHint")}</UiText>
          </View>
          <KitButton disabled={disabled} label={t("onboarding.v3.scanAgain")} onPress={() => onScan("camera")} size="sm" variant="surface" />
        </View>
      ) : (
        <View style={styles.scan}>
          <View pointerEvents="none" style={styles.scanTint} />
          <UiText maxFontSizeMultiplier={1.2} style={styles.scanEmoji}>📇</UiText>
          <UiText accessibilityLiveRegion="polite" style={styles.scanTitle}>{scan.kind === "scanning" ? t("onboarding.v3.scanning") : t("onboarding.v3.scanTitle")}</UiText>
          <KitButton disabled={disabled || busy} icon="scan" label={t("onboarding.v3.scanTake")} onPress={() => onScan("camera")} size="take" variant="primary" />
          <KitButton disabled={disabled || busy} label={t("onboarding.v3.scanPick")} onPress={() => onScan("library")} size="sm" variant="ghost" />
        </View>
      )}
      {scan.kind === "failed" ? <UiText accessibilityRole="alert" style={styles.errLine}>{scan.message}</UiText> : null}
      <View onLayout={event => onFieldLayout("name", event)}>
        {text("name", t("onboarding.v3.name"), errors.has("name") ? "" : t("onboarding.v3.namePlaceholder"), { inputRef: inputs.name, error: errors.has("name") ? t("onboarding.v3.missName") : undefined, autoComplete: "name", textContentType: "name", ...(repair?.carriedName && basic.name === repair.carriedName ? { mark: "carried" } : {}) })}
      </View>
      {repair ? null : <>
      {text("company", optional("company", done || Boolean(marks.company)), t("onboarding.v3.companyPlaceholder"))}
      {text("title", optional("role", done || Boolean(marks.title)), t("onboarding.v3.rolePlaceholder"))}
      </>}
      <View onLayout={event => { onFieldLayout("primaryIndustry", event); onFieldLayout("secondaryIndustry", event); }} style={repair ? undefined : styles.fieldRow}>
        <SelectField accessibilityLabel={`${t("onboarding.v3.primaryIndustry")}：${primary ?? t("onboarding.v3.select")}`} disabled={disabled} error={errors.has("primaryIndustry") ? t("onboarding.v3.missIndustry") : undefined} icon="down" label={t("onboarding.v3.primaryIndustry")}
          mark={marks.primaryIndustryId} onPress={() => onPick("primary")} placeholder={t("onboarding.v3.select")} pressRef={inputs.primary} style={repair ? {} : styles.fieldHalf} value={primary} />
        <SelectField accessibilityLabel={`${t("onboarding.v3.secondaryIndustry")}：${secondary ?? t("onboarding.v3.select")}`} disabled={disabled || !basic.primaryIndustryId} error={errors.has("secondaryIndustry") ? t("onboarding.v3.missDetail") : undefined} icon="down" label={t("onboarding.v3.secondaryIndustry")}
          mark={marks.secondaryIndustryId} onPress={() => onPick("secondary")} placeholder={basic.primaryIndustryId ? t("onboarding.v3.select") : repair ? t("onboarding.v3.repairDetailHint") : t("onboarding.v3.none")} pressRef={inputs.secondary} style={repair ? {} : styles.fieldHalf} value={secondary} />
      </View>
      {repair ? null : <>
      <SelectField accessibilityLabel={`${t("onboarding.v3.seniority")}：${basic.seniorityLevel ? SENIORITY_LEVEL_LABELS[basic.seniorityLevel][language] : t("onboarding.v3.select")}`} disabled={disabled} icon="down" label={t(marks.seniorityLevel ? "onboarding.v3.seniority" : "onboarding.v3.seniorityOptional")}
        mark={marks.seniorityLevel} onPress={() => onPick("seniority")} placeholder={t("onboarding.v3.select")} value={basic.seniorityLevel ? SENIORITY_LEVEL_LABELS[basic.seniorityLevel][language] : null} />
      {text("homeMarket", t(marks.homeMarket ? "onboarding.v3.homeMarket" : "onboarding.v3.homeMarketOptional"), t("onboarding.v3.homeMarketPlaceholder"))}
      </>}
      {!repair || repair.birthDate ? <View onLayout={event => onFieldLayout("birthDate", event)}>
      <SelectField error={errors.has("birthDate") ? t("onboarding.v3.missBirthDate") : undefined} accessibilityLabel={`${t("onboarding.v3.birthDate")}：${birthLabel ?? t("onboarding.v3.birthDatePlaceholder")}`} disabled={disabled} hint={t("onboarding.v3.birthDateHelp")} icon="calendar" label={t("onboarding.v3.birthDate")} onPress={onBirth} placeholder={t("onboarding.v3.birthDatePlaceholder")} value={birthLabel}
        trailing={basic.birthDate ? <UiPressable accessibilityLabel={t("onboarding.v3.birthDateClear")} accessibilityRole="button" disabled={disabled} hitSlop={10} onPress={onClearBirth} style={styles.clear}><Icon color={colors.ink3Text} name="x" size={16} /></UiPressable> : null} />
      {/* UR-R5/R9：旧生日无效时可以「生年月日を消す」（生日不是必填，谁都看不到）。 */}
      {repair?.birthDate && errors.has("birthDate") ? <View style={styles.clearBirth}><KitButton disabled={disabled} label={t("onboarding.v3.repairClearBirth")} onPress={onClearBirth} size="sm" variant="surface" /></View> : null}
      </View> : null}
      {repair ? null : <ContactGroup basic={basic} disabled={disabled} errors={errors} marks={marks} onLayout={event => onFieldLayout("contact", event)} text={text} />}
    </>
  );
}

/**
 * UR-C 引导 ① 的联系方式（C11–C14）：和上面的栏位同一种样式，不再套卡。LINE、WeChat 直接给出并带「おすすめ」；
 * メール・電話 收在「＋」里，名片读到或已经有值时自动展开（带「名刺から」）。至少一种；缺项时 LINE・WeChat 标红、组下一句；
 * 格式不对只标那一栏并在栏下说明。
 */
function ContactGroup({ basic, disabled, errors, marks, onLayout, text }: {
  basic: BasicDraft; disabled: boolean; errors: ReadonlySet<OnboardingMissingField>; marks: Marks; onLayout: (event: LayoutChangeEvent) => void;
  text: (key: TextKey, label: string, placeholder: string, extra?: object) => ReactNode;
}) {
  const { styles, colors } = useOnboardingStyles();
  const { t } = useOrbitLocale();
  const filled = Boolean(basic.email?.trim() || basic.phone?.trim() || marks.email || marks.phone);
  const [expanded, setExpanded] = useState(filled);
  useEffect(() => { if (filled) setExpanded(true); }, [filled]);
  const shown = errors.has("contact");
  const format = shown ? contactFormatProblem(basic) : null;
  const missing = shown && !format;
  const recommended = t("onboarding.v3.contactRecommended");
  return (
    <View onLayout={onLayout} style={styles.cg} testID="onboarding-contact-methods">
      <View style={styles.cgHead}>
        <UiText accessibilityRole="header" style={styles.cgTitle}>{t("onboarding.v3.contactName")}</UiText>
        <UiText style={styles.cgSmall}>{t("onboarding.v3.contactAtLeastOne")}</UiText>
      </View>
      <UiText style={styles.cgSee}>{t("onboarding.v3.contactSee")}</UiText>
      {text("lineId", t("onboarding.v3.lineId"), t("onboarding.v3.lineIdPlaceholder"), { autoCapitalize: "none", autoCorrect: false, badge: recommended, flagged: missing })}
      {text("wechatId", t("onboarding.v3.wechatId"), t("onboarding.v3.wechatIdPlaceholder"), { autoCapitalize: "none", autoCorrect: false, badge: recommended, flagged: missing })}
      {expanded ? <>
        {text("email", t("onboarding.v3.email"), t("onboarding.v3.emailPlaceholder"), { autoCapitalize: "none", autoComplete: "email", autoCorrect: false, keyboardType: "email-address", textContentType: "emailAddress", error: format === "email" ? t("onboarding.v3.badEmail") : undefined })}
        {text("phone", t("onboarding.v3.phone"), t("onboarding.v3.phonePlaceholder"), { autoComplete: "tel", keyboardType: "phone-pad", textContentType: "telephoneNumber", error: format === "phone" ? t("onboarding.v3.badPhone") : undefined })}
      </> : (
        <UiPressable accessibilityLabel={t("onboarding.v3.contactMore")} accessibilityRole="button" disabled={disabled} onPress={() => setExpanded(true)} pressedScale={0.98} style={[styles.addMore, missing ? styles.addMoreError : null]} testID="onboarding-contact-more">
          <Icon color={colors.ink2} name="plus" size={16} />
          <UiText style={styles.addMoreText}>{t("onboarding.v3.contactMore")}</UiText>
        </UiPressable>
      )}
      {missing ? <UiText accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errLine}>{t("onboarding.v3.missContactOne")}</UiText> : null}
    </View>
  );
}

export interface GoalsStepProps {
  disabled: boolean;
  error: boolean;
  focus: string;
  goals: readonly string[];
  /** Board samples only: the chips shown unselected, instead of the option lists. */
  rest?: { offer: readonly string[]; seek: readonly string[]; topics: readonly string[] };
  marks: Marks;
  offer: readonly string[];
  onFocus: (value: string) => void;
  onGoal: (label: string, selected: string | undefined) => void;
  onGoalsLayout: (event: LayoutChangeEvent) => void;
  onGroup: (group: "offer" | "seek" | "topics", values: string[]) => void;
  /** Changes when AI fills the rows. */
  revision?: number;
  seek: readonly string[];
  seekSuggestions: readonly string[];
  topics: readonly string[];
}

export function GoalsStep({ disabled, error, focus, goals, marks, offer, onFocus, onGoal, onGoalsLayout, onGroup, rest, revision = 0, seek, seekSuggestions, topics }: GoalsStepProps) {
  const { styles } = useOnboardingStyles();
  const { t, language } = useOrbitLocale();
  const rows = [GOAL_OPTIONS.slice(0, 2), GOAL_OPTIONS.slice(2, 4), GOAL_OPTIONS.slice(4, 6)];
  return (
    <>
      <UiText accessibilityRole="header" style={styles.h1}>{t("onboarding.v3.goalsTitle")}</UiText>
      <UiText style={styles.sub}>{t("onboarding.v3.goalsLead")}</UiText>
      <View onLayout={onGoalsLayout} style={styles.goals} testID="onboarding-goals">
        {error ? <View pointerEvents="none" style={styles.goalsError} /> : null}
        {rows.map(row => (
          <View key={row[0]!.id} style={styles.goalRow}>
            {row.map(option => {
              const selected = goals.find(goal => optionMatches(option, goal));
              const full = !selected && goals.length >= GOAL_LIMIT;
              return (
                <UiPressable accessibilityHint={error ? t("onboarding.v3.missGoals") : undefined} accessibilityLabel={optionLabel(option, language)} accessibilityRole="button" accessibilityState={{ disabled: disabled || full, selected: Boolean(selected) }} aria-selected={Boolean(selected)} disabled={disabled || full}
                  key={option.id} onPress={() => onGoal(optionLabel(option, language), selected)} style={[styles.goal, selected ? styles.goalOn : null]}>
                  <Emo emoji={option.emoji} tone={option.tone} />
                  <UiText style={styles.goalText}>{optionLabel(option, language)}</UiText>
                  <UiText style={styles.goalSub}>{option.sub[language]}</UiText>
                  {selected ? <View style={styles.order}><UiText style={styles.orderText}>{String(goals.indexOf(selected) + 1)}</UiText></View> : null}
                </UiPressable>
              );
            })}
          </View>
        ))}
      </View>
      {error ? <UiText accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errLine}>{t("onboarding.v3.missGoals")}</UiText> : null}
      <TextField accessibilityLabel={t("onboarding.v3.focus")} editable={!disabled} label={t("onboarding.v3.focus")} maxLength={80} onChangeText={onFocus} placeholder={t("onboarding.v3.focusPlaceholder")} value={focus} />
      <UiText accessibilityRole="header" style={styles.h1Second}>{t("onboarding.v3.personaTitle")}</UiText>
      <UiText style={styles.subSecond}>{t("onboarding.v3.personaLead")}</UiText>
      <TagGroup disabled={disabled} emoji="🎁" first key={`offer-${revision}`} limit={OFFER_LIMIT} mark={marks.offer} onChange={values => onGroup("offer", values)} options={OFFER_OPTIONS} rest={rest?.offer} shown={5} title={t("onboarding.v3.offer")} tone="teal" values={offer} />
      <TagGroup disabled={disabled} emoji="🔎" limit={SEEK_LIMIT} onChange={values => onGroup("seek", values)} options={SEEK_OPTIONS} rest={rest?.seek} shown={3} suggestions={seekSuggestions} title={t("onboarding.v3.seek")} tone="pink" values={seek} />
      <TagGroup disabled={disabled} emoji="☕" key={`topics-${revision}`} limit={TOPIC_LIMIT} mark={marks.topics} onChange={values => onGroup("topics", values)} options={TOPIC_OPTIONS} rest={rest?.topics} shown={6} title={t("onboarding.v3.topics")} tone="apricot" values={topics} />
    </>
  );
}

/** .grp: chosen values first, then options up to the board's count, AI candidates as dashed chips, and 「追加」. */
function TagGroup({ disabled, emoji, first = false, limit, mark, onChange, options, rest, shown, suggestions = [], title, tone, values }: {
  disabled: boolean;
  emoji: string;
  first?: boolean;
  limit: number;
  mark?: OnboardingMark | undefined;
  onChange: (values: string[]) => void;
  options: readonly Copy[];
  rest?: readonly string[] | undefined;
  shown: number;
  suggestions?: readonly string[];
  title: string;
  tone: "teal" | "pink" | "apricot";
  values: readonly string[];
}) {
  const { styles } = useOnboardingStyles();
  const { t, language } = useOrbitLocale();
  const [adding, setAdding] = useState(false);
  // Chips keep their place while they are switched on and off; only values from elsewhere (a card, 「追加」) join the row.
  const [order, setOrder] = useState<readonly string[]>(() => [...values, ...(rest ?? options.map(option => optionLabel(option, language))).filter(label => !values.some(value => same(options, value, label))).slice(0, Math.max(0, shown - values.length))]);
  const row = [...order, ...values.filter(value => !order.some(label => same(options, value, label)))];
  const full = values.length >= limit;
  const ai = suggestions.filter(label => !row.some(item => same(options, item, label)));
  const toggle = (label: string) => {
    const selected = values.find(value => same(options, value, label));
    setOrder(row);
    onChange(selected ? values.filter(value => value !== selected) : full ? [...values] : [...values, label]);
  };
  return (
    <View style={[styles.group, first && styles.groupFirst]}>
      <View style={styles.groupHead}>
        <Emo emoji={emoji} tone={tone} />
        <UiText style={styles.groupTitle}>{title}</UiText>
        {mark ? <View style={styles.groupChip}><MarkChip mark={mark} /></View> : null}
      </View>
      <View style={styles.togs}>
        {row.map(label => {
          const on = values.some(value => same(options, value, label));
          return <Toggle disabled={disabled || (!on && full)} key={label} kind={on ? "on" : "plain"} label={savedOptionLabel(options, label, language)} onPress={() => toggle(label)} />;
        })}
        {ai.map(label => <Toggle disabled={disabled || full} key={label} kind="ai" label={savedOptionLabel(options, label, language)} onPress={() => toggle(label)} />)}
        <Toggle accessibilityLabel={`${title}：${t("onboarding.v3.add")}`} disabled={disabled || full} kind="add" label={t("onboarding.v3.add")} onPress={() => setAdding(true)} />
      </View>
      <AddSheet limit={limit} onChange={next => { setOrder(row); onChange(next); }} onClose={() => setAdding(false)} options={options} title={title} values={values} visible={adding} />
    </View>
  );
}

function same(options: readonly Copy[], a: string, b: string): boolean {
  if (a === b) return true;
  return options.some(option => optionMatches(option, a) && optionMatches(option, b));
}

/** 「追加」: the full list plus a field for something of one's own. */
function AddSheet({ limit, onChange, onClose, options, title, values, visible }: { limit: number; onChange: (values: string[]) => void; onClose: () => void; options: readonly Copy[]; title: string; values: readonly string[]; visible: boolean }) {
  const { colors, styles } = useOnboardingStyles();
  const { t, language } = useOrbitLocale();
  const [text, setText] = useState("");
  const full = values.length >= limit;
  const add = () => {
    const option = options.find(item => optionMatches(item, text.trim()));
    onChange(addCustomValue(values, option ? optionLabel(option, language) : text, limit));
    setText("");
  };
  return (
    <BottomSheet accessibilityLabel={title} onClose={onClose} visible={visible}>
      <UiText accessibilityRole="header" style={styles.sheetTitle}>{`${title} · ${t("onboarding.v3.upTo", { count: limit })}`}</UiText>
      <TextInput accessibilityLabel={t("onboarding.v3.customPlaceholder")} editable={!full} maxLength={24} onChangeText={setText} onSubmitEditing={add} placeholder={t("onboarding.v3.customPlaceholder")} placeholderTextColor={colors.ink3Text} returnKeyType="done" style={[styles.sheetInput, Platform.OS === "ios" && language === "ja" ? { fontFamily: faceFor("400") } : null]} value={text} />
      {options.map(option => {
        const label = optionLabel(option, language);
        const selected = values.find(value => optionMatches(option, value));
        return <SheetRow disabled={!selected && full} key={option.en} label={label} on={Boolean(selected)} onPress={() => onChange(selected ? values.filter(value => value !== selected) : [...values, label])} />;
      })}
      <KitButton block label={t("onboarding.v3.addDone")} onPress={() => { if (text.trim()) add(); onClose(); }} variant="primary" />
    </BottomSheet>
  );
}

export function SheetRow({ disabled = false, label, on, onPress }: { disabled?: boolean; label: string; on: boolean; onPress: () => void }) {
  const { colors, styles } = useOnboardingStyles();
  return (
    <UiPressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled, selected: on }} disabled={disabled} onPress={onPress} pressedScale={1} style={[styles.sheetRow, on && styles.sheetRowOn, disabled && styles.disabled]}>
      <UiText style={styles.sheetRowText}>{label}</UiText>
      {on ? <Icon color={colors.ink} name="check" size={16} /> : null}
    </UiPressable>
  );
}

export type IntroStatus = "idle" | "generating" | "ready" | "error" | "limit";
/** Same two as Web: the interface language's business tone, and English. */
export type IntroTone = "native" | "en";

export interface IntroStepProps {
  bio: string;
  bioCount: { count: number; limit: number; over: boolean };
  disabled: boolean;
  editing: boolean;
  error: string | null;
  goals: number;
  input: RefObject<TextInput | null>;
  message: string | null;
  offer: number;
  onBio: (value: string) => void;
  onCardLayout: (event: LayoutChangeEvent) => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onTone: (tone: IntroTone) => void;
  regenerationsLeft: number;
  status: IntroStatus;
  tone: IntroTone;
  topics: number;
}

export function IntroStep({ bio, bioCount, disabled, editing, error, goals, input, message, offer, onBio, onCardLayout, onEdit, onRegenerate, onTone, regenerationsLeft, status, tone, topics }: IntroStepProps) {
  const { styles } = useOnboardingStyles();
  const { t } = useOrbitLocale();
  const [why, setWhy] = useState(false);
  const generating = status === "generating";
  const failed = status === "error" || status === "limit";
  const writing = editing || failed;
  const tones = [{ key: "native", label: t("onboarding.v3.toneNative") }, { key: "en", label: t("onboarding.v3.toneEnglish") }] as const;
  return (
    <>
      <UiText accessibilityRole="header" style={styles.h1}>{generating ? t("onboarding.v3.introGenerating") : t("onboarding.v3.introTitle")}</UiText>
      <UiText style={styles.sub}>{t("onboarding.v3.introLead")}</UiText>
      <View accessibilityLabel={t("onboarding.v3.tone")} accessibilityRole="radiogroup" style={styles.seg}>
        {tones.map(item => {
          const on = item.key === tone;
          return <UiPressable accessibilityLabel={item.label} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: disabled || generating }} aria-checked={on} disabled={disabled || generating || (!on && failed)} hitSlop={{ top: 7, bottom: 7 }} key={item.key} onPress={() => onTone(item.key)} pressedScale={0.97} style={[styles.segItem, on && styles.segOn]}>
            <UiText style={[styles.segText, on && styles.segTextOn]}>{item.label}</UiText>
          </UiPressable>;
        })}
      </View>
      {failed ? <UiText accessibilityRole="alert" style={[styles.errLine, { marginTop: 0, marginBottom: 12 }]}>{t(status === "limit" ? "onboarding.v3.introLimit" : "onboarding.v3.introFailed")}</UiText> : null}
      {message ? <UiText accessibilityLiveRegion="polite" style={[styles.errLine, { marginTop: 0, marginBottom: 12 }]}>{message}</UiText> : null}
      <View onLayout={onCardLayout} style={[styles.card, error ? styles.boxError : null, error ? { borderWidth: 1, padding: 17 } : null]} testID="onboarding-intro-card">
        {generating ? <View accessibilityLabel={t("onboarding.v3.introGenerating")} accessible><View style={[styles.bone, { width: "92%" }]} /><View style={[styles.bone, { width: "86%" }]} /><View style={[styles.bone, { width: "64%" }]} /></View>
          : writing ? <TextInput accessibilityHint={error ?? undefined} accessibilityLabel={t("onboarding.v3.bio")} editable={!disabled} multiline onChangeText={onBio} ref={input} scrollEnabled={false} style={styles.introInput} value={bio} />
            : <UiText style={styles.introText}>{bio}</UiText>}
        {generating ? null : (
          <View style={styles.introMeta}>
            <UiText style={[styles.lbl, bioCount.over && styles.over]}>{bioCount.over ? t("onboarding.v3.charOver", { count: bioCount.count, limit: bioCount.limit }) : t("onboarding.v3.charCount", { count: bioCount.count })}</UiText>
            <UiPressable accessibilityLabel={t("onboarding.v3.introLead")} accessibilityRole="button" accessibilityState={{ expanded: why }} hitSlop={13} onPress={() => setWhy(open => !open)} style={[styles.why, styles.push]}><UiText style={styles.whyText}>?</UiText></UiPressable>
            {failed ? null : <KitButton disabled={disabled} icon="pen" label={editing ? t("onboarding.v3.editDone") : t("onboarding.v3.edit")} onPress={onEdit} size="sm" />}
          </View>
        )}
        {why && !generating ? <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{t("onboarding.v3.introWhy", { goals, offer, topics })}</UiText></View> : null}
      </View>
      {error ? <UiText accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errLine}>{error}</UiText> : null}
      {status === "limit" ? null : <View style={styles.regenerate}>
        <KitButton badge={failed ? undefined : t("onboarding.v3.regenerateLeft", { count: regenerationsLeft })} block disabled={disabled || generating || (!failed && regenerationsLeft <= 0)} icon="refresh" label={t(failed ? "onboarding.v3.retry" : "onboarding.v3.regenerate")} onPress={onRegenerate} />
      </View>}
      <UiText style={styles.private}>{t("onboarding.v3.introPrivate")}</UiText>
    </>
  );
}
