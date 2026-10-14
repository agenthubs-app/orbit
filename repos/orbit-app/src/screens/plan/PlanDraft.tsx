// R23 ④⑤ the plan card (初版 / after revisions), each revision's diff card and the
// AI-fix bar fixed above the keyboard. Citations sit behind the card's 「?」 on the App (UI-SPEC).
// 像素返工（RD-16）：照 b10 ④ #11、⑤ #15 / #16 的 kit 源码搬——.card（🧭 · 「AI の初版 · 方案」· 方案名 · ?）、
// .jsec 見立て（修正后 4 行折叠 +「全文を読む」）、.jsec.ketsu 進め方の結論 + .flow、AI 修正卡（.dl 差分 /
// .same-line）、最后一张卡下的「AI 修正 あと N 回」+ .grid2（手動で編集 / この内容で確定）、
// 用完后的 .card.flat 总结，以及底部 .revbar + .composer。
import { useState, type ReactNode } from "react";
import { Linking, StyleSheet, TextInput, View } from "react-native";

import type { PlanDraftTurn, PlanDraftView } from "../../api/contract/plan-v2";
import { Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { KitButton, KitCard, KitChip, KitEmo, kitText, useKitStyles, useKitWhy } from "./plan-kit";
import { Bubble, ChatMark } from "./plan-flow-kit";
import { turnChipText } from "./plan-model";

/** 初版 / 方案卡。`clamp`：見立て 4 行折叠（AI 修正之后，b10 ⑤）；`footer`：卡底部的回数 + 两个按钮。 */
export function PlanDraftCard({ draft, clamp = false, footer }: { draft: PlanDraftView; clamp?: boolean; footer?: ReactNode | undefined }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const { content } = draft;
  const [full, setFull] = useState(false);
  const basis = [content.basis.map((item) => item.label).join(" · "), ...draft.citations.map((citation) => `${citation.id} ${citation.title}`)].filter(Boolean).join("\n");
  const why = useKitWhy(basis || null);
  const folded = clamp && !full;
  return (
    <KitCard style={styles.card} testID="draft-card">
      <View accessibilityLabel={t("plan.draft.eyebrow")} style={styles.head}>
        <KitEmo emoji="🧭" tone="teal" sm />
        <View style={kit.grow}>
          <UiText style={kit.lbl}>{t("plan.draft.eyebrow")}</UiText>
          <UiText accessibilityRole="header" style={styles.name}>{draft.purposeText ?? draft.goal}</UiText>
        </View>
        {why.button}
      </View>
      <View style={styles.jsec}>
        <UiText style={styles.jsecLabel}>{t("plan.draft.diagnosis")}</UiText>
        <UiText numberOfLines={folded ? 4 : undefined} style={styles.jsecText}>{content.diagnosis}</UiText>
        {folded ? (
          <UiPressable accessibilityRole="button" hitSlop={8} onPress={() => setFull(true)} style={styles.v2go}>
            <UiText style={styles.v2goText}>{t("plan.draft.readMore")}</UiText>
            <Icon name="down" size={16} color={colors.ink2} />
          </UiPressable>
        ) : null}
      </View>
      {why.body}
      {why.open && draft.citations.length ? (
        <View style={styles.citations}>
          {draft.citations.map((citation) => (
            <UiPressable key={`${citation.id}@${citation.version}`} accessibilityRole="link" onPress={() => void Linking.openURL(citation.sourceUrl)}>
              <UiText style={styles.citation}>{t("plan.draft.citationSource", { label: `${citation.title} · ${citation.sourceLabel}` })}</UiText>
            </UiPressable>
          ))}
        </View>
      ) : null}
      <View style={[styles.jsec, styles.ketsu]}>
        <UiText style={styles.jsecLabel}>{t("plan.draft.conclusion")}</UiText>
        <UiText style={styles.ketsuText}>{content.conclusion}</UiText>
        {content.flow && content.flow.length > 0 ? (
          <View style={styles.flow}>
            {content.flow.flatMap((cell, index) => [
              index > 0 ? <View key={`ar${index}`} style={styles.ar}><Icon name="right" size={16} color={colors.ink4} /></View> : null,
              <View key={`${cell.label}-${index}`} style={[styles.flowCell, index === 0 && styles.pay]}>
                <UiText style={styles.flowEmoji}>{cell.emoji}</UiText>
                <UiText numberOfLines={1} style={styles.flowLabel}>{cell.label}</UiText>
                <UiText style={styles.flowNote}>{cell.note}</UiText>
              </View>,
            ])}
          </View>
        ) : null}
      </View>
      {footer}
    </KitCard>
  );
}

/** One revision: the user's words on the right, then only what changed (.dl) or why nothing did (.same-line). */
export function PlanTurn({ turn, limit, footer, mark = false }: { turn: PlanDraftTurn; limit: number; footer?: ReactNode | undefined; mark?: boolean }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const changed = turn.changes.length > 0 && !turn.noChangeReason;
  const why = useKitWhy(turn.changes.map((change) => change.reason).filter(Boolean).join("\n") || null);
  return (
    <>
      {mark ? <ChatMark /> : null}
      <Bubble me>{turn.input}</Bubble>
      <KitCard style={styles.card} testID="draft-turn">
        <View accessibilityLabel={t("plan.turn.title", { limit, n: turn.n })} style={styles.head}>
          <KitEmo emoji="🧭" tone="teal" sm />
          <View style={kit.grow}>
            <UiText style={kit.lbl}>{t("plan.turn.title", { limit, n: turn.n })}</UiText>
            <UiText accessibilityRole="header" style={styles.name}>{changed ? t("plan.turn.updated") : t("plan.turn.unchangedTitle")}</UiText>
          </View>
          {why.button ?? <View style={styles.whySpace} />}
        </View>
        {changed ? (
          <View style={styles.diff}>
            {turn.changes.map((change, index) => (
              <View key={change.path} style={[styles.dl, index > 0 && styles.line]}>
                <View style={styles.chgtag}><UiText style={styles.chgtagText}>{t("plan.turn.changed")}</UiText></View>
                <View style={kit.grow}>
                  <UiText style={kit.lbl}>{change.label}</UiText>
                  {change.before ? <UiText style={styles.before}>{change.before}</UiText> : null}
                  {change.after ? <View style={styles.nw}><UiText style={styles.nwText}>{change.after}</UiText></View> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {changed && turn.unchanged.length ? <View style={styles.sameLine}><UiText style={styles.sameText}>{t("plan.turn.unchanged", { items: turn.unchanged.join(" · ") })}</UiText></View> : null}
        {!changed ? <View style={[styles.sameLine, styles.noChange]}><UiText style={styles.sameText}>{turn.noChangeReason ?? t("plan.turn.unchangedTitle")}</UiText></View> : null}
        {why.body}
        {footer}
      </KitCard>
    </>
  );
}

/** 最后一张卡下面：「AI 修正 あと N 回」（初版另加「初版は回数に含みません」）+ 手動で編集 / この内容で確定。 */
export function DraftActions({ draft, first, onManual, onConfirm, confirming }: { draft: PlanDraftView; first: boolean; onManual: () => void; onConfirm: () => void; confirming: boolean }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  const left = Math.max(0, draft.aiFixLimit - draft.aiFixUsed);
  return (
    <>
      <View style={styles.leftRow}>
        <KitChip label={t("plan.fix.chipLeft", { count: left })} tone="lav" />
        {first ? <UiText style={[kit.lbl, styles.leftNote]}>{t("plan.fix.firstFree")}</UiText> : null}
      </View>
      <View style={styles.grid2}>
        <KitButton sm icon="pen" label={t("plan.fix.manual")} onPress={onManual} disabled={!draft.manualEditAvailable} style={styles.grid2Btn} testID="draft-manual" />
        <KitButton sm primary label={t("plan.fix.confirm")} onPress={onConfirm} disabled={confirming} style={styles.grid2Btn} testID="draft-confirm" />
      </View>
    </>
  );
}

/** AI 修正を使い切った（b10 ⑤ #16 .card.flat）：说明 + 每回一句的 chip + 手動で編集 / この内容で確定。 */
export function DraftUsedUp({ draft, onManual, onConfirm, confirming, onTurn }: { draft: PlanDraftView; onManual: () => void; onConfirm: () => void; confirming: boolean; onTurn: (n: number) => void }) {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t } = useOrbitLocale();
  return (
    <View style={styles.flat} testID="draft-used-up">
      <View style={styles.row8}>
        <UiText style={styles.usedTitle}>{t("plan.fix.allUsed")}</UiText>
        <KitChip label={t("plan.fix.chipLeft", { count: 0 })} />
      </View>
      <UiText style={[kit.lbl, styles.usedBody]}>{t("plan.fix.allUsedBody")}</UiText>
      <View style={styles.hist}>
        {draft.turns.map((turn) => (
          <UiPressable key={turn.n} accessibilityRole="button" hitSlop={11} onPress={() => onTurn(turn.n)}>
            <KitChip label={t("plan.turn.chip", { n: turn.n, text: turn.changes.length === 0 || turn.noChangeReason ? t("plan.turn.noChangeChip") : turnChipText(turn.input) })} />
          </UiPressable>
        ))}
      </View>
      <View style={[styles.grid2, styles.usedActs]}>
        <KitButton icon="pen" label={t("plan.fix.manual")} onPress={onManual} disabled={!draft.manualEditAvailable} style={styles.grid2Btn} testID="draft-manual" />
        <KitButton primary label={t("plan.fix.confirm")} onPress={onConfirm} disabled={confirming} style={styles.grid2Btn} testID="draft-confirm" />
      </View>
    </View>
  );
}

/**
 * 底部（kit .revbar + .composer）：「AI 修正 あと N 回」+ 提示与例句，下面是输入栏（送信）。0 回时变灰、不可输入。
 * 设计里的「＋」（添付）与 🎤 没有对应功能，先不画（见 REWORK-REPORT-app 待拍板）。
 */
export function PlanFixBar({ draft, text, onText, onSend, sending }: {
  draft: PlanDraftView;
  text: string;
  onText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const left = Math.max(0, draft.aiFixLimit - draft.aiFixUsed);
  const out = left === 0;
  return (
    <View pointerEvents="box-none" style={styles.bar}>
      <View style={styles.revbar}>
        <View accessibilityLabel={t("plan.fix.leftLabel", { count: left })} style={[styles.rvn, out && styles.rvnZero]}>
          <UiText style={[styles.rvnSmall, out && styles.rvnSmallZero]}>{t("plan.fix.label")}</UiText>
          <UiText style={styles.rvnB}>{t("plan.fix.leftPre")}<UiText style={styles.rvnEm}>{String(left)}</UiText>{t("plan.fix.leftPost")}</UiText>
        </View>
        <View style={styles.rvt}>
          <UiText style={styles.rvtText}>{out ? t("plan.fix.usedUp") : t("plan.fix.hint")}</UiText>
          <UiText numberOfLines={1} style={styles.ex}>{out ? t("plan.fix.countsNoChange") : t("plan.fix.example")}</UiText>
        </View>
      </View>
      <View style={[styles.composer, out && styles.composerOff]}>
        <TextInput
          accessibilityLabel={t("plan.fix.inputLabel")}
          editable={!out && !sending}
          onChangeText={onText}
          placeholder={out ? t("plan.fix.usedUpShort") : t("plan.fix.placeholder")}
          placeholderTextColor={colors.ink3}
          selectionColor={colors.plum700}
          style={styles.composerInput}
          value={text}
        />
        <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.fix.send")} disabled={out || sending || !text.trim()} hitSlop={5} onPress={onSend} style={styles.send}>
          <Icon name="up" size={16} color={colors.bg} />
        </UiPressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row8: { flexDirection: "row", alignItems: "center", gap: 8 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  card: { paddingVertical: 14, paddingHorizontal: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: colors.ink, ...kitText(14.5, "700") },
  whySpace: { width: 18 },
  jsec: { marginTop: 10 },
  jsecLabel: { color: colors.ink3, ...kitText(11.5, "700", 1.75) },
  jsecText: { color: colors.ink2, ...kitText(12.5, "400", 1.75) },
  v2go: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, alignSelf: "flex-start" },
  v2goText: { color: colors.ink2, ...kitText(12, "700") },
  citations: { marginTop: 6, gap: 4 },
  citation: { color: colors.accentText, ...kitText(11.5, "600"), textDecorationLine: "underline" },
  ketsu: { backgroundColor: colors.accentSoft, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  ketsuText: { color: colors.ink, ...kitText(13.5, "700", 1.6) },
  flow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  flowCell: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center" },
  pay: { backgroundColor: colors.accentSoft },
  flowEmoji: { fontSize: 17, lineHeight: 26 },
  flowLabel: { color: colors.ink, ...kitText(12, "700", 1.75) },
  flowNote: { color: colors.ink3, ...kitText(10.5, "500", 1.4), textAlign: "center" },
  ar: { width: 22, alignItems: "center" },
  diff: { marginTop: 6 },
  dl: { flexDirection: "row", gap: 10, paddingVertical: 9 },
  chgtag: { alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, backgroundColor: colors.macLav },
  chgtagText: { color: colors.macLavInk, ...kitText(10, "800") },
  before: { color: colors.ink3, ...kitText(12.5, "400", 1.55), textDecorationLine: "line-through", marginTop: 4 },
  nw: { alignSelf: "flex-start", marginTop: 4, backgroundColor: colors.macLav, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 },
  nwText: { color: colors.ink, ...kitText(12.5, "800", 1.55) },
  sameLine: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface2 },
  noChange: { marginTop: 10 },
  sameText: { color: colors.ink2, ...kitText(12, "400", 1.6) },
  leftRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  leftNote: { marginLeft: "auto" },
  grid2: { flexDirection: "row", gap: 12, marginTop: 8 },
  grid2Btn: { flex: 1 },
  flat: { backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16 },
  usedTitle: { flex: 1, color: colors.ink, ...kitText(13.5, "700") },
  usedBody: { marginTop: 4, lineHeight: 18.4 },
  hist: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  usedActs: { marginTop: 12 },

  bar: { paddingHorizontal: 12, paddingBottom: 26, gap: 14 },
  revbar: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.surface },
  rvn: { alignItems: "center", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.accentSoft },
  rvnZero: { backgroundColor: colors.surface2 },
  rvnSmall: { color: colors.plum700, ...kitText(9.5, "800") },
  rvnSmallZero: { color: colors.ink3 },
  rvnB: { color: colors.ink, ...kitText(12, "700") },
  rvnEm: { ...kitText(22, "900") },
  rvt: { flex: 1, minWidth: 0 },
  rvtText: { color: colors.ink, ...kitText(11.5, "700") },
  ex: { color: colors.ink3, ...kitText(11.5, "600"), marginTop: 2 },
  composer: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 26, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassLine },
  composerOff: { opacity: 0.55 },
  composerInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 13, lineHeight: 19.5, paddingLeft: 6, paddingVertical: 7 },
  send: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
}));
