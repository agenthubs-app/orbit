import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { checkAgentReferences, searchAgentReferences } from "../../api/agent-v1-client";
import type { AgentReferenceCandidateContract, AgentReferenceSearchKind, AgentReferenceSearchResultContract } from "../../api/contract/agent-v1";
import { atTriggerOf, REFERENCE_KINDS, referenceDetailLine, referenceKindLabel, type ReferenceBinding, type ReferenceLanguage } from "../../api/compute/agent-references";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { radius, spacing } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

/**
 * agent-design AG11（设计稿 §3.6、§10「@ 选择器」；获批视觉稿 2026-11-19，D1–D8）：App iOrbit 输入框的「添加上下文」选择器。
 *
 * - 输入框左边的「＋」打开它（读屏名「添加上下文」，D5）；在句子里打 @ 也打开。打 @ 时选一条就关；点「＋」时可以连选，
 *   底部「完成（N）」（D6）。
 * - 顶上搜索框和分类（全部、联系人、笔记、待办、日程、活动、我去过，D3/D4，可左右滑），结果按类分组、最多占半屏，每条带
 *   类型标签和区分行（人写公司和职位，其他写日期）。
 * - 没联网（D8）：照常打开，只列手机里已有的联系人，其他五类一句「联网后才能搜」，不发请求；联网后自动恢复。
 *
 * 选中只是告诉 Orbit「我说的是这一条」，不允许改它；这里不写任何东西，搜到的结果也不存进手机。
 */

export type MentionMode = { kind: "at" } | { kind: "plus" };

export interface MentionContact {
  id: string;
  name: string;
  organization: string;
  role: string;
}

// QA-A: server-side placeholders stored on contacts created without these fields.
const PLACEHOLDER_DETAILS = new Set(["Unknown organization", "Relationship candidate"]);
const realDetail = (value: string | undefined) => (value && !PLACEHOLDER_DETAILS.has(value.trim()) ? value : "");

const KIND_COLORS: Record<AgentReferenceSearchKind, [string, string]> = {
  attendance: ["accentSoft", "accentText"],
  contact: ["macLav", "macLavText"],
  event: ["macPink", "macPinkText"],
  memo: ["macApricot", "macApricotText"],
  schedule: ["macTeal", "macTealText"],
  todo: ["macBlue", "macBlueText"],
};

export const referenceKey = (item: { type: string; id: string }) => `${item.type}:${item.id}`;

export function KindBadge({ kind, language }: { kind: AgentReferenceSearchKind; language: ReferenceLanguage }) {
  const { colors, styles } = useStyles();
  const [background, ink] = KIND_COLORS[kind];
  return <Text style={[styles.badge, { backgroundColor: (colors as unknown as Record<string, string>)[background], color: (colors as unknown as Record<string, string>)[ink] }]}>{referenceKindLabel(kind, language)}</Text>;
}

/** D8: the contacts on this phone that match the words (the only kind offline). */
function deviceContacts(rows: ReturnType<typeof useLocalContacts>["rows"], query: string): AgentReferenceCandidateContract[] {
  const words = query.trim().toLowerCase();
  return rows.flatMap((row) => (row.card ? [row.card] : []))
    .filter((card) => !words || card.displayName.toLowerCase().includes(words) || card.organization.toLowerCase().includes(words))
    .slice(0, 8)
    .map((card) => ({ detail: { company: realDetail(card.organization) || undefined, role: realDetail(card.role) || undefined }, id: card.id, name: card.displayName, type: "contact" as const }));
}

/**
 * What the picker lists: offline (D8) only the phone's contacts that match, never a request; online the server's six
 * groups. Records already picked are left out.
 */
export function pickerGroups(input: { offline: boolean; rows: ReturnType<typeof useLocalContacts>["rows"]; query: string; result: AgentReferenceSearchResultContract | null; pickedKeys: ReadonlySet<string> }): { type: AgentReferenceSearchKind; items: AgentReferenceCandidateContract[]; more: boolean }[] {
  if (input.offline) return [{ items: deviceContacts(input.rows, input.query).filter((item) => !input.pickedKeys.has(referenceKey(item))), more: false, type: "contact" }];
  return (input.result?.groups ?? []).map((group) => ({ more: group.more, type: group.type, items: group.items.filter((item) => !input.pickedKeys.has(referenceKey(item))) }));
}

/**
 * The picker panel. `query` is the words after the @ (at mode) or the panel's own search words (plus mode).
 * `offline` is what the screen knows; a search that cannot reach the server is offline too.
 */
export function ContactMentionPicker({ mode, query, onQuery, onPick, onDone, onClose, pickedKeys, offline, scopeKey }: {
  mode: MentionMode;
  query: string;
  onQuery: (query: string) => void;
  onPick: (candidate: AgentReferenceCandidateContract) => void;
  onDone: (candidates: AgentReferenceCandidateContract[]) => void;
  onClose: () => void;
  pickedKeys: ReadonlySet<string>;
  offline: boolean;
  scopeKey?: string | undefined;
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const language = locale.language as ReferenceLanguage;
  const client = useOrbitApiClient(scopeKey === undefined ? {} : { scopeKey });
  const local = useLocalContacts(false);
  const { height } = useWindowDimensions();
  const [kind, setKind] = useState<AgentReferenceSearchKind | null>(null);
  const [chosen, setChosen] = useState<AgentReferenceCandidateContract[]>([]);
  const [result, setResult] = useState<{ status: "loading" | "ready" | "unreachable" | "error"; data: AgentReferenceSearchResultContract | null; client: unknown }>({ client, data: null, status: "loading" });
  const deviceOffline = offline || (local.available && local.freshness.offline);
  const isOffline = deviceOffline || result.status === "unreachable";
  useEffect(() => {
    if (deviceOffline) return undefined;
    let current = true;
    // Another account (a new client): its rows are never shown; an older search's answer is dropped.
    setResult((previous) => ({ client, data: previous.client === client ? previous.data : null, status: "loading" }));
    const timer = setTimeout(() => {
      void searchAgentReferences(client, query, kind).then((answer) => {
        if (!current) return;
        setResult(answer.kind === "ok" ? { client, data: answer.value, status: "ready" } : { client, data: null, status: answer.kind === "offline" ? "unreachable" : "error" });
      });
    }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [client, query, kind, deviceOffline]);

  const groups = useMemo(() => pickerGroups({ offline: isOffline, pickedKeys, query, result: result.data, rows: local.rows }), [isOffline, local.rows, query, pickedKeys, result.data]);
  const any = groups.some((group) => group.items.length);
  const choose = (candidate: AgentReferenceCandidateContract) => {
    if (mode.kind === "at") onPick(candidate);
    else setChosen((current) => (current.some((item) => referenceKey(item) === referenceKey(candidate)) ? current.filter((item) => referenceKey(item) !== referenceKey(candidate)) : [...current, candidate]));
  };
  return <View style={styles.panel} testID="reference-picker" accessibilityLabel={locale.t("aiMention.pickerTitle")}>
    <View style={styles.head}>
      <Text accessibilityRole="header" style={styles.title}>{locale.t("aiMention.pickerTitle")}</Text>
      <Pressable accessibilityLabel={locale.t("aiMention.close")} accessibilityRole="button" hitSlop={10} onPress={onClose}><Text style={styles.close}>×</Text></Pressable>
    </View>
    <TextInput accessibilityLabel={locale.t("aiMention.recordSearch")} editable={mode.kind === "plus"} onChangeText={onQuery} placeholder={locale.t("aiMention.recordSearch")} style={styles.input} value={query} />
    {isOffline ? null : <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" accessibilityLabel={locale.t("aiMention.kinds")} contentContainerStyle={styles.filters}>
      {([null, ...REFERENCE_KINDS] as const).map((item) => <Pressable key={item ?? "all"} accessibilityRole="button" accessibilityState={{ selected: kind === item }} onPress={() => setKind(item)} style={[styles.filter, kind === item ? styles.filterOn : null]}>
        <Text style={[styles.filterText, kind === item ? styles.filterTextOn : null]}>{item ? referenceKindLabel(item, language) : locale.t("aiMention.all")}</Text>
      </Pressable>)}
    </ScrollView>}
    {isOffline ? <Text style={styles.offline}>{locale.t("aiMention.offlineTitle")}</Text> : null}
    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: Math.round(height * 0.5) - 160 }}>
      {groups.filter((group) => group.items.length).map((group) => <View key={group.type} accessibilityLabel={referenceKindLabel(group.type, language)} testID={`reference-group-${group.type}`}>
        <Text style={styles.group}>{referenceKindLabel(group.type, language)}</Text>
        {group.items.map((item) => {
          const detail = referenceDetailLine(item, language);
          const selected = chosen.some((entry) => referenceKey(entry) === referenceKey(item));
          return <Pressable key={referenceKey(item)} testID={`reference-option-${referenceKey(item)}`}
            accessibilityLabel={locale.t("aiMention.selectRecord", { detail: locale.t.literal(detail || locale.t("aiMention.detailsMissing")), kind: locale.t.literal(referenceKindLabel(item.type, language)), name: locale.t.literal(item.name) })}
            accessibilityRole="button" accessibilityState={{ selected }} onPress={() => choose(item)} style={[styles.row, selected ? styles.rowOn : null]}>
            <View style={styles.rowText}><Text numberOfLines={1} style={styles.name}>{item.name}</Text>{detail ? <Text numberOfLines={1} style={styles.detail}>{detail}</Text> : null}</View>
            <KindBadge kind={item.type} language={language} />
          </Pressable>;
        })}
      </View>)}
      {!isOffline && result.status === "loading" && !any ? <Text style={styles.empty}>{locale.t("aiMention.loading")}</Text> : null}
      {(isOffline || result.status === "ready") && !any ? <Text style={styles.empty}>{locale.t("aiMention.noRecord")}</Text> : null}
      {!isOffline && result.status === "error" ? <Text accessibilityRole="alert" style={styles.empty}>{locale.t("aiMention.unavailable")}</Text> : null}
      {isOffline ? <Text style={styles.empty}>{locale.t("aiMention.offlineOthers")}</Text> : null}
    </ScrollView>
    {mode.kind === "plus" ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: !chosen.length }} disabled={!chosen.length} onPress={() => onDone(chosen)} style={[styles.done, chosen.length ? null : styles.doneOff]}>
      <Text style={styles.doneText}>{locale.t("aiMention.done", { n: chosen.length })}</Text>
    </Pressable> : null}
  </View>;
}

/** The @ opens the picker when it is typed at a word start outside the marks (shared rule). */
export function atPickerQuery(text: string, caret: number, bindings: readonly ReferenceBinding[]): { start: number; query: string } | null {
  return atTriggerOf(text, caret, bindings);
}

/** D7: the picked records that cannot be opened now ("type:id"). */
export function useGoneReferences(bindings: readonly ReferenceBinding[], enabled: boolean, scopeKey: string | undefined, onGone: (keys: Set<string>) => void) {
  const client = useOrbitApiClient(scopeKey === undefined ? {} : { scopeKey });
  const key = bindings.filter((binding) => !binding.gone).map(referenceKey).sort().join(",");
  useEffect(() => {
    if (!enabled || !key) return undefined;
    let current = true;
    void checkAgentReferences(client, bindings.filter((binding) => !binding.gone)).then((gone) => { if (current && gone.size) onGone(gone); });
    return () => { current = false; };
  }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.xl, borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  head: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  title: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  close: { color: colors.ink3Text, fontSize: 20, paddingHorizontal: 4 },
  input: { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.ink, minHeight: 40, paddingHorizontal: spacing.sm },
  filters: { gap: 6, paddingVertical: 2 },
  filter: { backgroundColor: colors.surface2, borderRadius: 999, minHeight: 28, justifyContent: "center", paddingHorizontal: 10 },
  filterOn: { backgroundColor: colors.ink },
  filterText: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  filterTextOn: { color: colors.bg },
  group: { color: colors.ink3Text, fontSize: 12, fontWeight: "700", paddingTop: 6 },
  row: { alignItems: "center", borderRadius: 10, flexDirection: "row", gap: spacing.xs, minHeight: 48, paddingHorizontal: 4, paddingVertical: 6 },
  rowOn: { backgroundColor: colors.surface2 },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  detail: { color: colors.ink3Text, fontSize: 12, marginTop: 1 },
  badge: { borderRadius: 6, fontSize: 11, fontWeight: "700", overflow: "hidden", paddingHorizontal: 6, paddingVertical: 1 },
  offline: { backgroundColor: colors.macApricot, borderRadius: 8, color: colors.macApricotText, fontSize: 12, fontWeight: "700", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4 },
  empty: { color: colors.ink3Text, fontSize: 13, paddingVertical: spacing.xs },
  done: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 999, justifyContent: "center", minHeight: 40 },
  doneOff: { opacity: 0.45 },
  doneText: { color: colors.bg, fontSize: 14, fontWeight: "700" },
}));
