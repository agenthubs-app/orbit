import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { MEMORY_TASKS, memoryEditorInput, memoryExpiryAfter, memorySettingsView, memoryTaskLabel, isStandingRule, type MemoryRowView } from "../../api/compute/agent-memory-view";
import type { AgentMemoryEntryContract, AgentMemoryTaskContract } from "../../api/contract/agent-v1";
import { BottomSheet, Card, Icon, Toggle, UiText } from "../../components/ui";
import { UiPressable } from "../../components/ui/Pressable";
import { createThemedStyles } from "../../design/theme";
import { standardCopy } from "../../i18n/standard-copy";
import { PersonalScheduleDateTimePicker } from "../schedule/PersonalScheduleDateTimePicker";
import type { AccountMemoryList, MemorySaveInput } from "./settings-api";

/**
 * agent-design AG14 (approved visual draft 2026-11-20, boards 6–7; D7, D9, D10): the memory part of 「我的 › iOrbit 使用的
 * 信息」 on the App. Three cards — the switches, 「一直遵守的」, 「酌情参考的」 (and 「还没说用在哪的」 when there are any) —
 * from api/compute/agent-memory-view.ts, the rule the web runs too. A row opens a bottom sheet (D9): change the words,
 * where it is used, its group and its last day, or delete it; adding uses the same sheet, empty. Offline the list is the
 * last one read: everything is shown and nothing can be pressed (「现在离线，只能看。」).
 */
type Language = "zh" | "ja" | "en";
type Editing = { entry: AgentMemoryEntryContract | null; content: string; task: AgentMemoryTaskContract | null; rule: boolean; validUntil: string | null; picking: boolean; failed: boolean };

const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function AccountMemorySection({ list, language, offline, busy, openMemoryId = null, onSwitch, onSave, onRemove }: {
  list: AccountMemoryList; language: Language; offline: boolean; busy: boolean; openMemoryId?: string | null;
  onSwitch(key: "enabled" | "allowConversationLearning", on: boolean): void;
  onSave(input: MemorySaveInput, memoryId: string | null): Promise<boolean>;
  onRemove(entry: AgentMemoryEntryContract): Promise<boolean>;
}) {
  const { styles } = useStyles();
  const words = standardCopy[language].memorySettings;
  const today = localDay();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removeFailed, setRemoveFailed] = useState<string | null>(null);
  const view = memorySettingsView({ entries: list.memories, expanded, language, ruleLimit: list.ruleLimit ?? null, settings: list.settings, today, words });
  const locked = offline || busy;
  const open = (entry: AgentMemoryEntryContract | null) => {
    if (offline) return;
    setRemoveFailed(null);
    setEditing(entry
      ? { content: entry.content, entry, failed: false, picking: false, rule: isStandingRule(entry.category), task: entry.appliesTo[0] ?? null, validUntil: entry.validUntil }
      : { content: "", entry: null, failed: false, picking: false, rule: false, task: "event.recommend", validUntil: null });
  };
  // D5: 「修改 ›」 of an answer's memory chip lands here with that entry's sheet open.
  useEffect(() => {
    const entry = openMemoryId ? list.memories.find((item) => item.memoryId === openMemoryId) : null;
    if (entry && !offline) open(entry);
  }, [openMemoryId]); // once per link

  const save = async () => {
    if (!editing || busy || !editing.content.trim()) return;
    const input = memoryEditorInput({ before: editing.entry, content: editing.content, rule: editing.rule, task: editing.task, validUntil: editing.validUntil });
    const ok = await onSave(input, editing.entry?.memoryId ?? null);
    // Board 7: a failed save keeps the sheet and the words typed, with one red line.
    setEditing((current) => (ok ? null : current ? { ...current, failed: true } : current));
  };
  const remove = async (entry: AgentMemoryEntryContract) => {
    const ok = await onRemove(entry);
    if (ok) setEditing(null);
    else setRemoveFailed(entry.memoryId);
  };

  const row = (item: MemoryRowView, action: "open" | "keep") => {
    const keep = view.conflicts.find((pair) => pair.rows.some((other) => other.memoryId === item.memoryId))?.rows.find((other) => other.memoryId !== item.memoryId)?.entry ?? null;
    return (
      <UiPressable key={item.memoryId} accessibilityRole="button" accessibilityLabel={item.content} accessibilityState={{ disabled: locked }} disabled={locked || action === "keep"} onPress={() => open(item.entry)} style={styles.row} testID={`memory-row-${item.memoryId}`}>
        <View style={styles.rowBody}>
          <UiText style={[styles.rowTitle, (item.expired || view.dim) && styles.faded]}>{item.content}</UiText>
          {item.expired && item.metaLead ? <UiText style={styles.meta}><UiText style={view.dim ? styles.faded : null}>{item.metaLead}</UiText><UiText style={styles.warn}>{item.expiredText}</UiText></UiText>
            : <UiText style={[styles.meta, view.dim && styles.faded]}>{item.meta}</UiText>}
          {removeFailed === item.memoryId ? <UiText accessibilityRole="alert" style={styles.warn}>{words.deleteFailed}</UiText> : null}
        </View>
        {action === "keep" && keep ? <UiPressable accessibilityRole="button" disabled={locked} onPress={() => void remove(keep)} style={styles.act}><UiText style={styles.actText}>{words.keepThis}</UiText></UiPressable>
          : item.unsorted ? <View style={styles.act}><UiText style={styles.actText}>{words.fillIn}</UiText></View>
            : <View style={styles.chevron} />}
      </UiPressable>
    );
  };

  const pill = (label: string, on: boolean, onPress: () => void, disabled = false) => (
    <UiPressable key={label} accessibilityRole="button" accessibilityState={{ disabled, selected: on }} disabled={disabled} onPress={onPress} style={[styles.pill, on && styles.pillOn, disabled && styles.faded]}>
      <UiText style={[styles.pillText, on && styles.pillTextOn]}>{label}</UiText>
    </UiPressable>
  );
  const month = memoryExpiryAfter(today, 1);
  const three = memoryExpiryAfter(today, 3);
  const custom = Boolean(editing?.validUntil && editing.validUntil !== month && editing.validUntil !== three);
  const ruleDisabled = view.rulesFull && !(editing?.entry && isStandingRule(editing.entry.category));

  return (
    <View style={styles.stack} testID="memory-settings">
      <Card style={styles.card}>
        <View style={styles.head}>
          <UiText style={styles.title}>{words.title}</UiText>
          <UiPressable accessibilityRole="button" accessibilityState={{ disabled: locked }} disabled={locked} onPress={() => open(null)} style={[styles.add, locked && styles.faded]} testID="memory-add">
            <Icon name="plus" size={13} /><UiText style={styles.addText}>{words.add}</UiText>
          </UiPressable>
        </View>
        {offline ? <UiText style={[styles.strip, styles.stripGrey]}>{words.offline}</UiText> : null}
        {view.switches.map((item) => (
          <View key={item.key} style={styles.switchRow} testID={`memory-switch-${item.key}`}>
            <View style={styles.grow}><UiText style={styles.switchTitle}>{item.title}</UiText><UiText style={styles.meta}>{item.note}</UiText></View>
            <Toggle value={item.on} accessibilityLabel={item.title} disabled={locked} onValueChange={(next) => onSwitch(item.key, next)} />
          </View>
        ))}
        {view.empty ? <View style={styles.empty}><UiText style={styles.switchTitle}>{view.empty.title}</UiText><UiText style={[styles.meta, styles.center]}>{view.empty.note}</UiText></View> : null}
      </Card>
      {view.conflicts.map((pair) => (
        <Card key={pair.rows.map((item) => item.memoryId).join("|")} style={styles.card}>
          <UiText style={styles.strip}>{pair.note}</UiText>
          {pair.rows.map((item) => row(item, "keep"))}
        </Card>
      ))}
      {view.groups.map((group) => (
        <Card key={group.key} style={styles.card}>
          <View style={styles.groupHead}><UiText style={[styles.groupTitle, view.dim && styles.faded]}>{group.title}</UiText><UiText style={[styles.meta, view.dim && styles.faded]}>{group.note}</UiText></View>
          {group.full ? <UiText style={styles.strip}>{group.full}</UiText> : null}
          {group.rows.slice(0, group.shown).map((item) => row(item, "open"))}
          {group.moreLabel ? <UiPressable accessibilityRole="button" accessibilityState={{ expanded: expanded.has(group.key) }} onPress={() => setExpanded((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })} style={styles.more}>
            <UiText style={styles.moreText}>{group.moreLabel}</UiText>
          </UiPressable> : null}
        </Card>
      ))}
      <BottomSheet visible={editing !== null} onClose={() => setEditing(null)} accessibilityLabel={editing?.entry ? words.editTitle : words.addTitle}>
        {editing ? <View style={styles.sheet} testID="memory-sheet">
          <UiText style={styles.sheetTitle}>{editing.entry ? words.editTitle : words.addTitle}</UiText>
          {editing.failed ? <UiText accessibilityRole="alert" style={[styles.strip, styles.stripRed]}>{words.saveFailed}</UiText> : null}
          <TextInput accessibilityLabel={words.content} placeholder={words.contentPlaceholder} value={editing.content} onChangeText={(content) => setEditing({ ...editing, content })} style={styles.field} multiline />
          <View style={styles.fieldRow}><UiText style={styles.fieldLabel}>{words.usedIn.replace(/[：:]\s*\{where\}$/u, "")}</UiText>
            <View style={styles.pills}>{MEMORY_TASKS.map((task) => pill(memoryTaskLabel(task, words), editing.task === task, () => setEditing({ ...editing, task })))}</View></View>
          <View style={styles.fieldRow}><UiText style={styles.fieldLabel}>{words.group}</UiText>
            <View style={styles.pills}>{pill(words.rules, editing.rule, () => setEditing({ ...editing, rule: true }), ruleDisabled)}{pill(words.weighed, !editing.rule, () => setEditing({ ...editing, rule: false }))}</View></View>
          <View style={styles.fieldRow}><UiText style={styles.fieldLabel}>{words.expiry}</UiText>
            <View style={styles.pills}>
              {pill(words.noExpiry, !editing.validUntil, () => setEditing({ ...editing, picking: false, validUntil: null }))}
              {pill(words.oneMonth, editing.validUntil === month, () => setEditing({ ...editing, picking: false, validUntil: month }))}
              {pill(words.threeMonths, editing.validUntil === three, () => setEditing({ ...editing, picking: false, validUntil: three }))}
              {pill(custom && editing.validUntil ? editing.validUntil : words.pickDay, custom, () => setEditing({ ...editing, picking: true }))}
            </View></View>
          {editing.picking ? <PersonalScheduleDateTimePicker kind="date" embedded value={editing.validUntil ?? month} zone="Asia/Tokyo" disabled={busy} title={words.pickDay} onCancel={() => setEditing({ ...editing, picking: false })} onConfirm={(value) => setEditing({ ...editing, picking: false, validUntil: value.slice(0, 10) })} /> : null}
          <View style={styles.buttons}>
            {editing.entry ? <UiPressable accessibilityRole="button" disabled={busy} onPress={() => void remove(editing.entry!)} style={styles.deleteButton} testID="memory-sheet-delete"><UiText style={styles.deleteText}>{words.deleteThis}</UiText></UiPressable> : null}
            <UiPressable accessibilityRole="button" accessibilityState={{ disabled: busy || !editing.content.trim() }} disabled={busy || !editing.content.trim()} onPress={() => void save()} style={[styles.saveButton, (busy || !editing.content.trim()) && styles.faded]} testID="memory-sheet-save"><UiText style={styles.saveText}>{words.save}</UiText></UiPressable>
          </View>
          {editing.entry && removeFailed === editing.entry.memoryId ? <UiText accessibilityRole="alert" style={styles.warn}>{words.deleteFailed}</UiText> : null}
        </View> : null}
      </BottomSheet>
    </View>
  );
}

// The draft's App sizes: card 24 radius, 16/18 padding; rows 15 / 12; strips 14 radius; pills 34 high.
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  stack: { gap: 12 },
  card: { borderRadius: 24, paddingHorizontal: 18, paddingVertical: 16 },
  head: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", paddingBottom: 6 },
  title: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: "800", lineHeight: 24 },
  add: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, flexDirection: "row", gap: 4, height: 34, paddingHorizontal: 12 },
  addText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  switchRow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 12, paddingVertical: 11 },
  switchTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  grow: { flex: 1, gap: 1, minWidth: 0 },
  meta: { color: colors.ink3Text, fontSize: 12, lineHeight: 17 },
  center: { textAlign: "center" },
  faded: { opacity: 0.5 },
  warn: { color: colors.coralText, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  groupHead: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 8 },
  groupTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 22 },
  row: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 10, minHeight: 44, paddingVertical: 11 },
  rowBody: { flex: 1, gap: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: "600", lineHeight: 21 },
  chevron: { borderColor: colors.ink4, borderRightWidth: 2, borderTopWidth: 2, height: 7, marginRight: 3, transform: [{ rotate: "45deg" }], width: 7 },
  act: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  actText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  more: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 14, justifyContent: "center", marginTop: 4, minHeight: 40 },
  moreText: { color: colors.ink2, fontSize: 14, fontWeight: "700" },
  strip: { backgroundColor: colors.macApricot, borderRadius: 14, color: colors.macApricotText, fontSize: 13, fontWeight: "600", lineHeight: 19, marginBottom: 6, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 10 },
  stripRed: { backgroundColor: colors.coralSoft, color: colors.coralText },
  stripGrey: { backgroundColor: colors.surface2, color: colors.ink2 },
  empty: { borderColor: colors.ink4, borderRadius: 16, borderStyle: "dashed", borderWidth: 1, gap: 4, marginTop: 6, paddingHorizontal: 14, paddingVertical: 22, alignItems: "center" },
  sheet: { gap: 14, paddingBottom: 12 },
  sheetTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  field: { borderColor: colors.plum700, borderRadius: 14, borderWidth: 1.5, color: colors.ink, fontSize: 16, lineHeight: 23, minHeight: 48, paddingHorizontal: 13, paddingVertical: 11 },
  fieldRow: { gap: 6 },
  fieldLabel: { color: colors.ink3Text, fontSize: 12, fontWeight: "600" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 999, borderWidth: 1, height: 34, justifyContent: "center", paddingHorizontal: 13 },
  pillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { color: colors.ink, fontSize: 13.5, fontWeight: "500" },
  pillTextOn: { color: colors.surface, fontWeight: "700" },
  buttons: { alignItems: "center", flexDirection: "row", gap: 8 },
  deleteButton: { justifyContent: "center", minHeight: 46, paddingHorizontal: 10 },
  deleteText: { color: colors.coralText, fontSize: 15, fontWeight: "700" },
  saveButton: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 999, flex: 1, height: 46, justifyContent: "center" },
  saveText: { color: colors.surface, fontSize: 15, fontWeight: "700" },
}));
