import { Pressable, StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import { contactDetailPath } from "../../api/endpoints";
import { markedSegments, type ReferenceBinding, type ReferenceLanguage } from "../../api/compute/agent-references";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { localContactLabel } from "../../view-models/contacts-local";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { KindBadge } from "./ContactMentionPicker";

const referenceNameSchema = z.object({ contact: z.object({ id: z.string(), displayName: z.string() }) });

/**
 * A contact handed to the conversation from another page (no mark in the sentence). Resolve only that contact, never the
 * contact collection. AG11 (D1): shown like the picked chips — kind, name, ×.
 */
export function ContactReferenceChip({ id, knownName, scopeKey, onRemove, style, textStyle }: {
  id: string; knownName?: string | undefined; scopeKey?: string | undefined;
  onRemove: () => void; style: import("react-native").StyleProp<import("react-native").ViewStyle>;
  textStyle: import("react-native").StyleProp<import("react-native").TextStyle>;
}) {
  const locale = useOrbitLocale();
  // Sprint 0116: the device copy of the contacts names the chip; the server is asked only for a contact it lacks.
  const local = useLocalContacts(false);
  const deviceName = local.available && local.freshness.readable ? localContactLabel(local.rows, id)?.name : undefined;
  const state = useApiResource<unknown>(contactDetailPath(id), () => false,
    { ...(scopeKey === undefined ? {} : { scopeKey }), cachePolicy: "network-only", enabled: !knownName && !deviceName });
  const parsed = state.kind === "success" || state.kind === "empty" ? referenceNameSchema.safeParse(state.data) : null;
  const name = knownName ?? deviceName ?? (parsed?.success && parsed.data.contact.id === id ? parsed.data.contact.displayName : id);
  return <Pressable accessibilityLabel={locale.t("aiConversation.removeContact", { name })} accessibilityRole="button" onPress={onRemove} style={[style, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
    <KindBadge kind="contact" language={locale.language as ReferenceLanguage} />
    <Text style={textStyle}>{name} ×</Text>
  </Pressable>;
}

/**
 * AG11 (D1, D7): a record picked with @ or 「＋」 — kind, name, a short line that tells same names apart (only when the
 * name is shared), ×. A record that cannot be opened any more is dashed and says so; it can still be sent.
 */
export function ReferenceChip({ binding, showHint, onRemove }: { binding: ReferenceBinding; showHint: boolean; onRemove: () => void }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  return <View style={[styles.chip, binding.gone ? styles.chipGone : null]} testID={`reference-chip-${binding.type}:${binding.id}`}>
    <KindBadge kind={binding.type} language={locale.language as ReferenceLanguage} />
    <Text numberOfLines={1} style={[styles.name, binding.gone ? styles.nameGone : null]}>{binding.name}</Text>
    {binding.gone ? <Text style={styles.gone}>{locale.t("aiMention.gone")}</Text> : showHint && binding.hint ? <Text style={styles.hint}>{binding.hint}</Text> : null}
    <Pressable accessibilityLabel={locale.t("aiMention.remove", { name: locale.t.literal(binding.name) })} accessibilityRole="button" hitSlop={8} onPress={onRemove}><Text style={styles.x}>×</Text></Pressable>
  </View>;
}

/**
 * AG11 (D1, D2, D7): the draft as nested Text children of the composer's TextInput — the picked 「@名字」 tinted as on Web
 * (plum, semibold), one that cannot be opened struck through; words that no longer match a mark are plain text.
 */
export function MarkedDraft({ text, bindings }: { text: string; bindings: readonly ReferenceBinding[] }) {
  const { styles } = useStyles();
  return <>{markedSegments(text, bindings).map((segment, index) => <Text key={index} style={segment.binding ? (segment.binding.gone ? styles.markGone : styles.mark) : null} testID={segment.binding ? `reference-mark-${segment.binding.type}:${segment.binding.id}` : undefined}>{segment.text}</Text>)}</>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  mark: { color: colors.plum700, fontWeight: "600" },
  markGone: { color: colors.ink3, textDecorationLine: "line-through" },
  chip: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, flexDirection: "row", gap: 4, maxWidth: "100%", paddingHorizontal: 6, paddingVertical: 3 },
  chipGone: { backgroundColor: colors.surface, borderColor: colors.ink3, borderStyle: "dashed", borderWidth: 1 },
  name: { color: colors.ink, flexShrink: 1, fontSize: 13, fontWeight: "600" },
  nameGone: { color: colors.ink2 },
  hint: { color: colors.ink3Text, fontSize: 12 },
  gone: { color: colors.coralText, fontSize: 12, fontWeight: "700" },
  x: { color: colors.ink3Text, fontSize: 15, paddingHorizontal: 2 },
}));
