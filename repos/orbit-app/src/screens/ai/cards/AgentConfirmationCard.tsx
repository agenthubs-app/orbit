import { Fragment, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { agentCardView, type AgentCardView } from "../../../api/compute/agent-card-view";
import { cardTurnedReminderOn } from "../../../api/compute/agent-reminder";
import { PhoneReminderLine } from "../../me/ScheduledTaskReminder";
import type { AgentActionPreviewContract, AgentAnswerBasisContract, AgentAnswerMemoryUseContract, AgentClarificationContract, AgentResultDocument } from "../../../api/contract/agent-v1";
import { agentLinkHref, memorySettingsHref } from "../../../api/agent-v1-client";
import { createThemedStyles } from "../../../design/theme";
import type { OrbitColors } from "../../../design/tokens";
import { standardCopy } from "../../../i18n/standard-copy";

/**
 * agent-design AG07 (approved visual draft, App 375): the confirmation card and the four small changes of a
 * protocol-3 turn. The card is shown through api/compute/agent-card-view.ts — the rule the web runs too — with the
 * fixed words of the card's own language; the App formats no date and assembles no difference. Offline a waiting
 * card shows only how many changes wait ("联网后才能确认") and nothing can be pressed; a press is never queued.
 */
type Language = "zh" | "ja" | "en";
type Decision = "confirm" | "reject" | "retry" | "mark_done" | "abandon";

/** The draft's colours, from the design tokens (light and dark). */
const paletteOf = (c: OrbitColors) => ({
  apricotBg: c.macApricot, apricotInk: c.macApricotText, border: c.line, coral: c.coralText, coralSoft: c.coralSoft, disabled: c.ink3Text, edge: c.macApricotInk, greyBg: c.surface3, greyInk: c.ink2,
  ink: c.ink, item: c.surface2, lavBg: c.macLav, lavInk: c.macLavText, muted: c.ink2, onInk: c.onAccent, plumBg: c.plum100, plumInk: c.plum900, tealBg: c.macTeal, tealInk: c.macTealText, white: c.surface,
});
type Palette = ReturnType<typeof paletteOf>;
const toneOf = (C: Palette, tone: string) => (tone === "apricot" ? { bg: C.apricotBg, ink: C.apricotInk } : tone === "grey" ? { bg: C.greyBg, ink: C.greyInk } : tone === "teal" ? { bg: C.tealBg, ink: C.tealInk } : { bg: C.plumBg, ink: C.plumInk });
const itemToneOf = (C: Palette, tone: string) => (tone === "apricot" ? C.apricotInk : tone === "coral" ? C.coral : tone === "teal" ? C.tealInk : C.plumInk);

export interface AgentConfirmationCardProps {
  card: AgentActionPreviewContract;
  language: Language;
  online: boolean;
  /** `<collection>:<id>` of records with an edit on this device not synced yet. */
  pendingTargets: readonly string[];
  onDecide(decision: Decision, operationId?: string): Promise<boolean>;
  onRegenerate(): Promise<boolean>;
  /** AG15 (D15-6): open the card that replaced this one. */
  onOpenCard?(actionId: string): void;
}

/** AG15: this device's time zone, so a scheduled task's card names its own zone only when it differs. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function AgentConfirmationCard({ card, language, online, pendingTargets, onDecide, onRegenerate, onOpenCard }: AgentConfirmationCardProps) {
  const { colors, styles } = useCardStyles();
  const C = paletteOf(colors);
  const words = standardCopy[card.locale ?? language].aiCard;
  const ui = standardCopy[language].aiCard;
  const [timeZone] = useState(deviceTimeZone);
  const view: AgentCardView = agentCardView(card, { online, pendingTargets, timeZone }, words);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try { if (!(await action())) setFailed(true); } finally { setBusy(false); }
  };
  if (view.kind === "offline") {
    return (
      <View accessibilityRole="summary" style={styles.offline} testID="agent-card-offline">
        <Text style={styles.offlineTitle}>{view.summary}</Text>
        <Text style={styles.muted}>{view.hint}</Text>
      </View>
    );
  }
  const chip = toneOf(C, view.chip.tone);
  // AG16 (draft 16-2): the card is unchanged; once it has turned a task's reminder on, a line under it says whether this
  // phone will show the reminder, with the way to allow it when it does not yet.
  const reminderOn = cardTurnedReminderOn(card);
  return (
    <>
    <View style={styles.card} testID={`agent-card-${view.status}`} accessibilityLabel={view.title}>
      <View style={styles.head}>
        <Text style={[styles.chip, { backgroundColor: chip.bg, color: chip.ink }]}>{view.chip.label}</Text>
        <Text style={styles.title}>{view.title}</Text>
      </View>
      {view.banner ? <Text accessibilityRole="alert" style={styles.banner}>{view.banner}</Text> : null}
      {view.items.map((item) => (
        <View key={item.operationId} style={[styles.item, item.rows.some((row) => row.changed) && styles.itemChanged, view.dim && styles.dim]} testID={`agent-card-item-${item.operationId}`}>
          <View style={styles.itemHead}>
            <Text style={[styles.badge, item.change === "create" ? styles.badgeCreate : item.change === "delete" ? styles.badgeDelete : styles.badgeUpdate]}>{item.badge}</Text>
            <Text style={styles.record}>{item.record}</Text>
            {item.status ? <Text style={[styles.itemStatus, { color: itemToneOf(C, item.status.tone) }]}>{item.status.label}</Text> : null}
          </View>
          {item.pendingEdit ? <Text style={styles.note}>{item.pendingEdit}</Text> : null}
          {item.rows.map((row) => row.sideBySide && row.before !== null ? (
            // AG14 (D1): 原来 and 改成 side by side, each in a white box.
            <View key={row.field} style={[styles.pair, row.changed && styles.rowChanged]} testID={`agent-card-pair-${row.field}`}>
              <View style={styles.pairCell}><Text style={styles.label}>{words.memoryWas}</Text><Text style={[styles.pairText, styles.old]}>{row.before}</Text></View>
              <View style={styles.pairCell}><Text style={styles.label}>{words.memoryNow}</Text><Text style={[styles.pairText, styles.strong]}>{row.after}</Text></View>
            </View>
          ) : (
            <View key={row.field} style={[styles.row, row.changed && styles.rowChanged]}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value}>
                {row.before !== null && row.changed ? <Fragment><Text style={styles.muted}>{words.nowIs} </Text><Text style={styles.strong}>{row.before}</Text><Text style={styles.muted}> → {words.changeTo} </Text><Text style={styles.strong}>{row.after}</Text></Fragment>
                  : row.before !== null ? <Fragment><Text style={styles.old}>{row.before}</Text><Text style={styles.muted}> → </Text><Text style={styles.strong}>{row.after}</Text></Fragment>
                    : <Text style={styles.strong}>{row.after}</Text>}
              </Text>
            </View>
          ))}
          {item.note ? <Text style={styles.muted}>{item.note}</Text> : null}
          {item.review && view.reviewButtons ? (
            <View style={styles.buttons}>
              <SmallButton label={view.reviewButtons.retry} primary disabled={busy || !online} onPress={() => void run(() => onDecide("retry", item.operationId))} />
              <SmallButton label={view.reviewButtons.markDone} disabled={busy || !online} onPress={() => void run(() => onDecide("mark_done", item.operationId))} />
              <SmallButton label={view.reviewButtons.abandon} disabled={busy || !online} onPress={() => void run(() => onDecide("abandon", item.operationId))} />
            </View>
          ) : null}
        </View>
      ))}
      {view.buttons ? (
        <View style={styles.actions}>
          <View style={styles.buttons}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !view.buttons.confirmEnabled }} disabled={busy || !view.buttons.confirmEnabled} onPress={() => void run(() => onDecide("confirm"))} style={[styles.confirm, (busy || !view.buttons.confirmEnabled) && styles.confirmDisabled]} testID="agent-card-confirm">
              <Text style={[styles.confirmText, (busy || !view.buttons.confirmEnabled) && styles.confirmTextDisabled]}>{view.buttons.confirm}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !view.buttons.dismissEnabled }} disabled={busy || !view.buttons.dismissEnabled} onPress={() => void run(() => onDecide("reject"))} style={styles.dismiss} testID="agent-card-dismiss">
              <Text style={styles.dismissText}>{view.buttons.dismiss}</Text>
            </Pressable>
          </View>
          {view.blocked ? <Text style={styles.blocked}>{view.blocked}</Text> : null}
          {view.hint ? <Text style={styles.hint}>{view.hint}</Text> : null}
        </View>
      ) : null}
      {view.footer ? <Text style={styles.footer}>{view.footer}</Text> : null}
      {view.expiredNote ? (
        <View style={styles.actions} testID="agent-card-expired-note">
          <Text style={styles.footer}>{view.expiredNote}</Text>
          {view.replacedBy && onOpenCard ? <View style={styles.buttons}><SmallButton label={ui.openNewCard} disabled={false} onPress={() => onOpenCard(view.replacedBy!)} /></View> : null}
        </View>
      ) : null}
      {view.regenerate ? (
        <View style={styles.actions}>
          <Text style={styles.regen}>{view.regenerate.question}</Text>
          <View style={styles.buttons}><SmallButton label={view.regenerate.label} primary disabled={busy || !online} onPress={() => void run(onRegenerate)} /></View>
        </View>
      ) : null}
      {failed ? <Text accessibilityRole="alert" style={styles.error}>{ui.actionFailed}</Text> : null}
    </View>
    {reminderOn ? <View style={styles.afterCard} testID="agent-card-reminder"><PhoneReminderLine afterCard /></View> : null}
    </>
  );
}

function SmallButton({ label, primary = false, disabled, onPress }: { label: string; primary?: boolean; disabled: boolean; onPress(): void }) {
  const { styles } = useCardStyles();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.small, primary && styles.smallPrimary, disabled && styles.dim]}><Text style={[styles.smallText, primary && styles.smallPrimaryText]}>{label}</Text></Pressable>;
}

/** Small change 2: the basis line at the top of the answer, opening the record it rests on. */
export function AgentBasisLine({ basis, language, onOpenHref, cardsBelow = false }: { basis: AgentAnswerBasisContract; language: Language; onOpenHref(href: string): void; /** AG19: the answer shows these records as cards, so the row of small labels is not repeated. */ cardsBelow?: boolean }) {
  const { styles } = useCardStyles();
  const ui = standardCopy[language].aiCard;
  if (cardsBelow && basis.links.length !== 1) return <View style={styles.basisRow} testID="agent-basis"><View style={styles.basis}><Text style={styles.basisText}>{basis.text}</Text></View></View>;
  const links = basis.links.map((link) => ({ href: agentLinkHref(link), link }));
  if (links.length === 1) {
    const href = links[0]?.href ?? null;
    return (
      <Pressable accessibilityRole={href ? "link" : "text"} disabled={!href} onPress={() => href && onOpenHref(href)} style={styles.basis} testID="agent-basis">
        <Text style={styles.basisText}>{basis.text}{href ? <Text style={styles.basisOpen}>  {ui.open} ›</Text> : null}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.basisRow} testID="agent-basis">
      <View style={styles.basis}><Text style={styles.basisText}>{basis.text}</Text></View>
      {links.map(({ href, link }) => (href ? <Pressable key={`${link.type}:${link.id}`} accessibilityRole="link" onPress={() => onOpenHref(href)} style={styles.basis}><Text style={styles.basisText}>{link.label}<Text style={styles.basisOpen}> ›</Text></Text></Pressable> : null))}
    </View>
  );
}

/**
 * AG14 (approved draft board 5, D4–D6): the memory chips under the basis chip — 「按你存的偏好「周末上午」挑的 修改 ›」 opens
 * that entry in the iOrbit settings (D5); 「只这一次：……」 has no 「修改」. The words are the server's.
 */
export function AgentMemoryChips({ memoryUse, language, onOpenHref }: { memoryUse: readonly AgentAnswerMemoryUseContract[]; language: Language; onOpenHref(href: string): void }) {
  const { styles } = useCardStyles();
  const ui = standardCopy[language].aiCard;
  return (
    <View style={styles.basisRow} testID="agent-memory-chips">
      {memoryUse.map((chip) => chip.kind === "skipped"
        ? <View key={`${chip.kind}:${chip.memoryId}`} style={styles.memoryChip} testID={`agent-memory-chip-${chip.kind}`}><Text style={styles.basisText}>{chip.text}</Text></View>
        : <Pressable key={`${chip.kind}:${chip.memoryId}`} accessibilityRole="link" onPress={() => onOpenHref(memorySettingsHref(chip.memoryId))} style={styles.memoryChip} testID={`agent-memory-chip-${chip.kind}`}><Text style={styles.basisText}>{chip.text}<Text style={styles.basisOpen}>  {ui.memoryEdit} ›</Text></Text></Pressable>)}
    </View>
  );
}

/** Small change 3: the options under a question, one per line; a tap answers it. */
export function AgentQuestionOptions({ clarifications, language, disabled, onSelect }: { clarifications: readonly AgentClarificationContract[]; language: Language; disabled: boolean; onSelect(clarification: AgentClarificationContract, optionId: string): void }) {
  const { styles } = useCardStyles();
  const shown = clarifications.filter((item) => item.options.length > 0 && item.kind !== "entry");
  if (!shown.length) return null;
  return (
    <View style={styles.options} testID="agent-options">
      {shown.flatMap((set) => set.options.map((option) => {
        const picked = set.selectedOptionId === option.optionId;
        return <Pressable key={`${set.clarificationId}:${option.optionId}`} accessibilityRole="button" accessibilityState={{ disabled: disabled || set.state !== "open", selected: picked }} disabled={disabled || set.state !== "open"} onPress={() => onSelect(set, option.optionId)} style={[styles.option, picked && styles.optionPicked]}><Text style={styles.optionText}>{option.label}</Text></Pressable>;
      }))}
      {shown.some((set) => set.state === "open") ? <Text style={styles.hint}>{standardCopy[language].aiCard.typeToAnswer}</Text> : null}
    </View>
  );
}

/** Small changes 1 and 4: a queued message waits for the one before; a running one says its step. */
export function AgentProgress({ language, queued, action }: { language: Language; queued: boolean; action?: ReactNode }) {
  const { styles } = useCardStyles();
  const ui = standardCopy[language].aiCard;
  if (queued) return <Text accessibilityLiveRegion="polite" style={styles.hint} testID="agent-queued">{ui.queued}</Text>;
  return <View accessibilityLiveRegion="polite" testID="agent-progress"><View style={styles.buttons}><Text style={styles.progress}>{ui.progressComposing}</Text>{action}</View><Text style={styles.hint}>{ui.progressNote}</Text></View>;
}

/** The answer text without the part that stands for the card (the card is shown instead). */
export function answerTextOf(document: AgentResultDocument, showsCard: boolean): string {
  let text = document.answer?.text ?? "";
  // Coordinator note: with the basis line shown, the footnote saying the same is not repeated (documents stored
  // before the server stopped writing it still carry it).
  if (document.answer?.basis) for (const footnote of NOTES_FOOTNOTES) text = text.split(footnote).join("");
  const line = document.answer?.cardLine;
  if (showsCard && line && text.includes(line)) text = text.replace(line, "");
  return text.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

/** The server's footnote that the answer came from the notes (orbits features/agent-v1/answer/gap-copy.ts fromNotes). */
const NOTES_FOOTNOTES = (["zh", "ja", "en"] as const).map((language) => standardCopy[language].aiCard.notesFootnote);

const useCardStyles = createThemedStyles((colors) => { const C = paletteOf(colors); return StyleSheet.create({
  actions: { gap: 6 },
  badge: { borderRadius: 6, fontSize: 11, fontWeight: "700", overflow: "hidden", paddingHorizontal: 7, paddingVertical: 2 },
  badgeCreate: { backgroundColor: C.tealBg, color: C.tealInk },
  badgeUpdate: { backgroundColor: C.lavBg, color: C.lavInk },
  badgeDelete: { backgroundColor: C.coralSoft, color: C.coral },
  memoryChip: { alignSelf: "flex-start", backgroundColor: C.white, borderColor: C.border, borderRadius: 999, borderWidth: 1, marginBottom: 8, minHeight: 30, paddingHorizontal: 12, paddingVertical: 6 },
  pair: { flexDirection: "row", gap: 8 },
  pairCell: { backgroundColor: C.white, borderRadius: 8, flex: 1, gap: 2, minWidth: 0, paddingHorizontal: 10, paddingVertical: 8 },
  pairText: { fontSize: 13, lineHeight: 19 },
  banner: { backgroundColor: C.apricotBg, borderRadius: 10, color: C.apricotInk, fontSize: 13, fontWeight: "700", overflow: "hidden", paddingHorizontal: 12, paddingVertical: 8 },
  basis: { alignSelf: "flex-start", backgroundColor: C.white, borderColor: C.border, borderRadius: 999, borderWidth: 1, marginBottom: 8, minHeight: 30, paddingHorizontal: 12, paddingVertical: 6 },
  basisOpen: { color: C.plumInk, fontWeight: "700" },
  basisRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  basisText: { color: C.muted, fontSize: 12.5 },
  blocked: { color: C.apricotInk, fontSize: 13, fontWeight: "700" },
  buttons: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { backgroundColor: C.white, borderColor: C.border, borderRadius: 20, borderWidth: 1, gap: 12, marginTop: 12, padding: 16, shadowColor: C.ink, shadowOffset: { height: 10, width: 0 }, shadowOpacity: 0.12, shadowRadius: 18 },
  afterCard: { marginTop: 8 },
  chip: { borderRadius: 999, fontSize: 12, fontWeight: "700", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 3 },
  confirm: { alignItems: "center", backgroundColor: C.ink, borderRadius: 999, flex: 1, height: 44, justifyContent: "center", paddingHorizontal: 18 },
  confirmDisabled: { backgroundColor: C.greyBg },
  confirmText: { color: C.onInk, fontSize: 14, fontWeight: "700" },
  confirmTextDisabled: { color: C.disabled },
  dim: { opacity: 0.55 },
  dismiss: { alignItems: "center", backgroundColor: C.item, borderRadius: 999, height: 44, justifyContent: "center", paddingHorizontal: 18 },
  dismissText: { color: C.ink, fontSize: 14, fontWeight: "700" },
  error: { color: C.coral, fontSize: 12.5 },
  footer: { color: C.muted, fontSize: 13, lineHeight: 19 },
  head: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hint: { color: C.muted, fontSize: 12 },
  item: { backgroundColor: C.item, borderRadius: 14, gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  itemChanged: { backgroundColor: C.apricotBg, borderColor: C.edge, borderWidth: 1.5 },
  itemHead: { alignItems: "center", flexDirection: "row", gap: 8 },
  itemStatus: { fontSize: 12, fontWeight: "700" },
  label: { color: C.muted, fontSize: 12, lineHeight: 18, width: 56 },
  muted: { color: C.muted },
  note: { backgroundColor: C.apricotBg, borderRadius: 8, color: C.apricotInk, fontSize: 12, fontWeight: "600", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  offline: { backgroundColor: C.item, borderRadius: 14, gap: 2, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  offlineTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  old: { color: C.muted, textDecorationLine: "line-through" },
  option: { backgroundColor: C.white, borderColor: C.border, borderRadius: 14, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 16, paddingVertical: 8 },
  optionPicked: { borderColor: C.plumInk, borderWidth: 2 },
  optionText: { color: C.ink, fontSize: 15 },
  options: { gap: 8, marginTop: 8 },
  progress: { color: C.ink, fontSize: 16 },
  record: { color: C.ink, flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  regen: { color: C.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  row: { alignItems: "baseline", flexDirection: "row", gap: 8 },
  rowChanged: { backgroundColor: C.apricotBg, borderRadius: 8, marginHorizontal: -6, paddingHorizontal: 6, paddingVertical: 4 },
  small: { alignItems: "center", backgroundColor: C.white, borderColor: C.border, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: "center", paddingHorizontal: 14 },
  smallPrimary: { backgroundColor: C.ink, borderWidth: 0 },
  smallPrimaryText: { color: C.onInk, fontWeight: "700" },
  smallText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  strong: { color: C.ink, fontWeight: "700" },
  title: { color: C.ink, fontSize: 16, fontWeight: "700", lineHeight: 22 },
  value: { color: C.ink, flex: 1, fontSize: 13, lineHeight: 19 },
}); });
