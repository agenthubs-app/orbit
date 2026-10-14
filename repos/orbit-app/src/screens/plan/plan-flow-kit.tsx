// R23 生成流程 · 像素返工（RD-16）：b10 ②–⑥ 与 b12 A-R23-09a / N17a / 20a 的 iOrbit 对话式页面，
// 照 kit 源码搬：.topbar（☰ · iOrbit + 「プランを作る · 段階」 · ✕）、.chat（gap 10）、.fm 五段、
// .bubble.me / .ai、.bstack / .bsec（open · done · draft）、.bsk 下書き骨架、.known 読んでいるもの、
// .degrade、.seg、.mem、.ghost-row、.caprow + .avt、.stair / .str、.aisay、.foot（底部渐隐主按钮）。
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ShellBackground } from "../../components/ShellBackground";
import { ShellTopBar, SHELL_GUTTER, useShellTopGap } from "../../components/ShellTopBar";
import { Icon, IconButton, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { KitButton, KitChip, KitGradient, KitStages, kitText, type KitTone } from "./plan-kit";

type FootSetter = (node: ReactNode) => void;
const FootContext = createContext<FootSetter | null>(null);
/** 打开时滚到「最新一段」：子元素报自己在 .chat 里的 y，框架只滚第一次。 */
const ScrollContext = createContext<((y: number) => void) | null>(null);

/**
 * 生成流程 / 見直し 的整页框架（无 tab bar）：kit .topbar + 滚动的 .chat + 底部 .foot 槽。
 * 正文里任何位置放 <FlowFoot> 就把主按钮挂到底栏（渐隐盖在正文上，同 kit .phone .foot）。
 */
export function PlanChatFrame({ title = "iOrbit", subtitle, stage, stageKeys, onClose, onMenu, right, scrollRef, children }: {
  /** 默认「iOrbit」（生成流程 / 見直し）；完了页等传自己的标题，并且不传 onMenu（✕ 在左）。 */
  title?: string;
  subtitle?: string;
  stage: 0 | 1 | 2 | 3 | 4 | 5 | null;
  /** 見直し的三段（前提 / AI 修正 / 手動編集）。 */
  stageKeys?: Parameters<typeof KitStages>[0]["keys"];
  onClose: () => void;
  onMenu?: () => void;
  /** 顶栏右侧（不传 onMenu 时）：如手動編集的「元に戻す」。 */
  right?: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const topGap = useShellTopGap();
  const [foot, setFoot] = useState<ReactNode>(null);
  const own = useRef<ScrollView>(null);
  const ref = scrollRef ?? own;
  const scrolled = useRef(false);
  const scrollOnce = useCallback((y: number) => {
    if (scrolled.current) return;
    scrolled.current = true;
    requestAnimationFrame(() => ref.current?.scrollTo({ animated: false, y: Math.max(0, y) }));
  }, [ref]);
  return (
    <FootContext.Provider value={setFoot}>
      <ScrollContext.Provider value={scrollOnce}>
        <SafeAreaView edges={["top"]} style={[styles.frame, { paddingTop: topGap }]}>
          <ShellBackground />
          <View style={styles.header}>
            <ShellTopBar title={title} subtitle={subtitle}
              left={onMenu
                ? <IconButton icon="menu" accessibilityLabel={t("plan.flow.menu")} onPress={onMenu} />
                : <IconButton icon="x" accessibilityLabel={t("plan.frame.close")} onPress={onClose} />}
              right={onMenu ? <IconButton icon="x" accessibilityLabel={t("plan.frame.close")} onPress={onClose} /> : right ?? null} />
            {/* kit：.fm 在 .chat 的第一格；会话往下长时它留在顶栏下（设计稿「chat tall」各板都从它下面接着画）。 */}
            {stage === null ? null : <KitStages stage={stage} style={styles.fm} {...(stageKeys ? { keys: stageKeys } : {})} />}
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
            <ScrollView ref={ref} style={stage === null ? null : styles.scrollTop} contentContainerStyle={styles.scroll} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
              <View style={styles.chat}>{children}</View>
            </ScrollView>
            {foot ? <View pointerEvents="box-none" style={styles.foot}>{foot}</View> : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ScrollContext.Provider>
    </FootContext.Provider>
  );
}

/**
 * kit `<i class="scrollto">`：.chat 里一个空格子（前后各占一个 gap 10）。`scroll` 时打开页面就滚到这里
 * （它停在五段进度下 12px，后面的内容接在 22px 处，同设计稿）。
 */
export function ChatMark({ scroll = false, shift = 0 }: { scroll?: boolean; shift?: number }) {
  const go = useContext(ScrollContext);
  // shift：画板 data-off 比默认 70 小多少（如 64 → 6），就多滚多少。
  return <View pointerEvents="none" style={markStyle} onLayout={scroll && go ? (event) => go(event.nativeEvent.layout.y + shift) : undefined} />;
}
const markStyle = { height: 0 } as const;

/** 打开页面就滚到这个块（它停在五段进度下 12px）。只滚一次，之后由用户自己滚。 */
export function ChatScrollTarget({ active, children }: { active: boolean; children: ReactNode }) {
  const go = useContext(ScrollContext);
  return <View onLayout={active && go ? (event) => go(event.nativeEvent.layout.y) : undefined}>{children}</View>;
}

/** 把主按钮（或输入栏）挂到 PlanChatFrame 的底栏；卸载时清掉。 */
export function FlowFoot({ children }: { children: ReactNode }) {
  const set = useContext(FootContext);
  useLayoutEffect(() => { set?.(children); });
  useLayoutEffect(() => () => set?.(null), [set]);
  return null;
}

/** .foot：padding 22 18 30，linear-gradient(to bottom, transparent, bg 26%)，里面 .btn.primary.block.xl。 */
export function FootButton({ label, onPress, disabled = false, primary = true, loading = false, testID }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; loading?: boolean; testID?: string | undefined }) {
  const { styles } = useStyles();
  return (
    <View style={styles.footInner}>
      <FootFade />
      <KitButton xl primary={primary} label={label} onPress={onPress} disabled={disabled || loading} style={!primary ? styles.xlPlain : undefined} {...(testID ? { testID } : {})} />
    </View>
  );
}

export function FootFade() {
  const { colors } = useOrbitTheme();
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><KitGradient id="flow-foot" from={colors.bg} fromOpacity={0} to={colors.bg} stop={0.26} vertical /></View>;
}

/* ---------- .bubble ---------- */

export function Bubble({ me = false, children, style }: { me?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { styles } = useStyles();
  return (
    <View style={[styles.bubble, me ? styles.bubbleMe : styles.bubbleAi, style]}>
      {typeof children === "string" ? <UiText style={[styles.bubbleText, me && styles.bubbleTextMe]}>{children}</UiText> : children}
    </View>
  );
}

/* ---------- .bsec ---------- */

export function BlockNumber({ n, state }: { n: number; state: "open" | "done" | "draft" }) {
  const { styles, colors } = useStyles();
  return (
    <View style={[styles.bsn, state === "open" && styles.bsnOpen, state === "done" && styles.bsnDone]}>
      {state === "done" ? <Icon name="check" size={16} color={colors.onAccent} /> : <UiText style={[styles.bsnText, state === "open" && styles.bsnTextOpen]}>{String(n)}</UiText>}
    </View>
  );
}

/** 背景的一块：open（白卡 + 「確認中」+ 正文）/ done（✓ · 名 · 摘要 · ✎）/ draft（虚线 · 「下書き：…」）。 */
export function BlockSection({ n, title, state, summary, chip, onEdit, editLabel, children, testID }: {
  n: number;
  title: string;
  state: "open" | "done" | "draft";
  summary?: string;
  chip?: string;
  onEdit?: (() => void) | undefined;
  editLabel?: string;
  children?: ReactNode;
  testID?: string;
}) {
  const { styles, colors } = useStyles();
  return (
    <View accessibilityLabel={title} style={[styles.bsec, state === "draft" && styles.bsecDraft]} testID={testID}>
      <View style={styles.bsh}>
        <BlockNumber n={n} state={state} />
        <UiText accessibilityRole="header" style={styles.bshTitle}>{title}</UiText>
        {summary ? <UiText numberOfLines={1} style={styles.bss}>{summary}</UiText> : <View style={styles.grow} />}
        {chip ? <KitChip label={chip} tone="lav" /> : null}
        {onEdit ? (
          <UiPressable accessibilityRole="button" accessibilityLabel={editLabel ?? title} hitSlop={8} onPress={onEdit} style={styles.lbtn}>
            <Icon name="pen" size={16} color={colors.ink2} />
          </UiPressable>
        ) : null}
      </View>
      {children ? <View style={styles.bsb}>{children}</View> : null}
    </View>
  );
}

export function BlockStack({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  return <View style={styles.bstack}>{children}</View>;
}

/** .lbl 粗体小标题（「この目標での、あなたの立場」）。 */
export function FieldLabel({ children, chip }: { children: string; chip?: string }) {
  const { styles } = useStyles();
  return (
    <View style={styles.fieldLabel}>
      <UiText style={styles.fieldLabelText}>{children}</UiText>
      {chip ? <KitChip label={chip} tone="lav" style={styles.fieldChip} /> : null}
    </View>
  );
}

/** .fopt 选项（单选 / 多选）：选中 plum-500 边 + accent-soft 底 + 「✓」。 */
export function Fopt({ label, on, onPress, role = "radio", disabled = false }: { label: string; on: boolean; onPress: () => void; role?: "radio" | "checkbox"; disabled?: boolean }) {
  const { styles } = useStyles();
  return (
    <UiPressable accessibilityRole={role} accessibilityState={{ checked: on, disabled, selected: on }} aria-checked={on} disabled={disabled} hitSlop={5} onPress={onPress} style={[styles.fopt, on && styles.foptOn]}>
      {on ? <UiText style={styles.foptCheck}>✓</UiText> : null}
      <UiText style={[styles.foptText, on && styles.foptTextOn]}>{label}</UiText>
    </UiPressable>
  );
}

export function FoptRow({ children, label }: { children: ReactNode; label?: string }) {
  const { styles } = useStyles();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.foptRow}>{children}</View>;
}

/** .seg.full（一人 / チーム）。 */
export function SegFull<K extends string>({ value, options, onChange, label }: { value: K; options: { key: K; label: string }[]; onChange: (key: K) => void; label: string }) {
  const { styles } = useStyles();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.seg}>
      {options.map((option) => {
        const on = option.key === value;
        return (
          <UiPressable key={option.key} hitSlop={7} accessibilityRole="radio" accessibilityState={{ checked: on, selected: on }} aria-checked={on} onPress={() => onChange(option.key)} style={[styles.segBtn, on && styles.segBtnOn]}>
            <UiText style={[styles.segText, on && styles.segTextOn]}>{option.label}</UiText>
          </UiPressable>
        );
      })}
    </View>
  );
}

/** .ghost-row（虚线 + 图标 + 灰字），可点。 */
export function GhostRow({ label, onPress, height = 46, icon = "plus" }: { label: string; onPress: () => void; height?: number; icon?: "plus" | "user-plus" }) {
  const { styles, colors } = useStyles();
  return (
    <UiPressable accessibilityRole="button" onPress={onPress} style={[styles.ghostRow, { height }]}>
      <Icon name={icon} size={16} color={colors.ink4} />
      <UiText style={styles.ghostText}>{label}</UiText>
    </UiPressable>
  );
}

/** .chip 的语气对照（plan-kit KitChip 的 tone）。 */
export type ChipTone = KitTone;

/** .str 目的阶梯一级。 */
export function StairRow({ level, text, small, tag, tagTone = "lav", on, onPress, index }: { level: number; text: string; small?: string | null; tag?: string | null; tagTone?: KitTone; on: boolean; onPress: () => void; index: number }) {
  const { styles, colors } = useStyles();
  return (
    <UiPressable accessibilityRole="radio" accessibilityLabel={`${level} ${text}`} accessibilityState={{ checked: on, selected: on }} aria-checked={on} onPress={onPress} style={[styles.str, on && styles.strOn, { marginRight: index * 10 }]}>
      <View style={[styles.lv, on && styles.lvOn]}><UiText style={[styles.lvText, on && styles.lvTextOn]}>{String(level)}</UiText></View>
      <View style={styles.grow}>
        <UiText style={styles.stx}>{text}</UiText>
        {small ? <UiText style={styles.stxSmall}>{small}</UiText> : null}
        {tag ? <KitChip label={tag} tone={tagTone} style={styles.tg} /> : null}
      </View>
      <View style={[styles.ckr, on && styles.ckrOn]}>{on ? <Icon name="check" size={16} color={colors.surface} /> : null}</View>
    </UiPressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: SHELL_GUTTER },
  // .fm margin 2 + .chat gap 10 = 第一格离进度条 12。放在滚动区外面：滚到 ChatMark 时它上面的卡片
  // （如「背景を確認しました」的下边框）不会从这 12 里露出来，同设计稿「chat tall」。
  scrollTop: { marginTop: 12 },
  scroll: { paddingHorizontal: 18, paddingBottom: 190 },
  chat: { gap: 10 },
  fm: { marginTop: 2 },
  foot: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footInner: { paddingTop: 22, paddingHorizontal: 18, paddingBottom: 30 },
  xlPlain: { opacity: 0.5 },

  bubble: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18, maxWidth: "86%" },
  bubbleMe: { backgroundColor: colors.ink, alignSelf: "flex-end", borderBottomRightRadius: 6, maxWidth: "88%" },
  bubbleAi: { backgroundColor: colors.surface, alignSelf: "flex-start", borderBottomLeftRadius: 6 },
  bubbleText: { color: colors.ink, ...kitText(13, "400", 1.6) },
  bubbleTextMe: { color: colors.bg },

  bstack: { gap: 8 },
  bsec: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16 },
  bsecDraft: { backgroundColor: "transparent", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.surface3, paddingVertical: 10, paddingHorizontal: 16 },
  bsh: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  bshTitle: { color: colors.ink, ...kitText(14, "700") },
  bss: { flex: 1, minWidth: 0, color: colors.ink3, ...kitText(11.5, "700") },
  bsn: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  bsnOpen: { backgroundColor: colors.plum700 },
  bsnDone: { backgroundColor: colors.plum300 },
  bsnText: { color: colors.ink3, ...kitText(11, "900") },
  bsnTextOpen: { color: colors.onAccent },
  bsb: { marginTop: 12 },
  lbtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },

  fieldLabel: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 6 },
  fieldLabelText: { color: colors.ink2, ...kitText(11.5, "800") },
  fieldChip: { marginLeft: 4 },
  foptRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fopt: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  foptOn: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  foptCheck: { color: colors.plum700, ...kitText(12.5, "900") },
  foptText: { color: colors.ink2, ...kitText(12.5, "700") },
  foptTextOn: { color: colors.ink },

  seg: { flexDirection: "row", padding: 3, borderRadius: 999, backgroundColor: colors.surface2, gap: 2 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 6, paddingHorizontal: 13, borderRadius: 999 },
  segBtnOn: { backgroundColor: colors.surface },
  segText: { color: colors.ink2, ...kitText(12, "600") },
  segTextOn: { color: colors.ink },

  ghostRow: { borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.surface3, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  ghostText: { color: colors.ink4, ...kitText(12, "400") },

  str: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  strOn: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  lv: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  lvOn: { backgroundColor: colors.plum700 },
  lvText: { color: colors.ink2, ...kitText(12, "900") },
  lvTextOn: { color: colors.onAccent },
  stx: { color: colors.ink, ...kitText(12.5, "700", 1.45) },
  stxSmall: { color: colors.ink3, ...kitText(10.5, "700", 1.45), marginTop: 1 },
  tg: { marginTop: 5 },
  ckr: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.8, borderColor: colors.ink4, alignItems: "center", justifyContent: "center" },
  ckrOn: { backgroundColor: colors.plum500, borderColor: colors.plum500 },
}));
