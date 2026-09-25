import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { contactCardPageSchema } from "../../api/schema/contact-card-page";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { useApiResource } from "../../hooks/useApiResource";
import { radius, spacing } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export interface MentionContact {
  id: string;
  name: string;
  organization: string;
  role: string;
}

export function ContactMentionPicker({ onSelect, selectedIds, scopeKey }: {
  scopeKey?: string | undefined;
  onSelect: (contact: MentionContact) => void;
  selectedIds: readonly string[];
}) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const [query, setQuery] = useState("");
  const scope = JSON.stringify([scopeKey, server.baseUrl, auth.actorId, auth.cookieHeader, query.trim()]);
  const [position, setPosition] = useState<{ scope: string; cursor: string | null }>({ scope, cursor: null });
  const cursor = position.scope === scope ? position.cursor : null;
  const params = new URLSearchParams({ limit: "8" });
  if (query.trim()) params.set("query", query.trim());
  if (cursor) params.set("cursor", cursor);
  const raw = useApiResource<unknown>(`/api/contacts/page?${params}`, data => contactCardPageSchema.safeParse(data).data?.items.length === 0,
    { scopeKey: JSON.stringify([scope, cursor]), cachePolicy: "network-only", enabled: auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId) });
  const state = validateApiResourceState(raw, contactCardPageSchema);
  const page = state.kind === "success" || state.kind === "empty" ? state.data : null;
  const results = page?.items.filter(contact => !selectedIds.includes(contact.id)).map(contact => ({ id: contact.id, name: contact.displayName, organization: contact.organization, role: contact.role })) ?? [];
  return <View style={styles.panel}>
    <Text style={styles.title}>{locale.t("aiMention.title")}</Text>
    <TextInput accessibilityLabel={locale.t("aiMention.searchLabel")} onChangeText={setQuery} placeholder={locale.t("aiMention.searchPlaceholder")} style={styles.input} value={query} />
    {results.map(contact => <Pressable
      accessibilityLabel={locale.t("aiMention.selectContact", { name: locale.t.literal(contact.name), organization: locale.t.literal(contact.organization || locale.t("aiMention.companyMissing")), role: locale.t.literal(contact.role || locale.t("aiMention.roleMissing")) })}
      accessibilityRole="button"
      key={contact.id}
      onPress={() => { onSelect(contact); setQuery(""); }}
      style={styles.row}
    >
      <Text style={styles.name}>{contact.name}</Text>
      <Text style={styles.detail}>{[contact.organization, contact.role].filter(Boolean).join(" · ") || locale.t("aiMention.detailsMissing")}</Text>
    </Pressable>)}
    {state.kind === "loading" ? <Text style={styles.empty}>{locale.t("aiConversation.contactsLoading")}</Text> : null}
    {state.kind === "failure" || state.kind === "offline" ? <View>
      <Text style={styles.empty}>{locale.t("aiConversation.contactsUnavailable")}</Text>
      <Pressable accessibilityRole="button" onPress={state.refresh}><Text style={styles.name}>{locale.t("common.retry")}</Text></Pressable>
    </View> : null}
    {page && results.length === 0 ? <Text style={styles.empty}>{locale.t("aiMention.empty")}</Text> : null}
    {page?.hasMore && page.nextCursor ? <Pressable accessibilityRole="button" onPress={() => setPosition({ scope, cursor: page.nextCursor })}><Text style={styles.name}>{locale.t("contacts.nextPage")}</Text></Pressable> : null}
    {cursor ? <Pressable accessibilityRole="button" onPress={() => setPosition({ scope, cursor: null })}><Text style={styles.name}>{locale.t("contacts.firstPage")}</Text></Pressable> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  title: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  input: { backgroundColor: colors.bg, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, color: colors.ink, minHeight: 44, paddingHorizontal: spacing.sm },
  row: { borderTopColor: colors.border, borderTopWidth: 1, minHeight: 52, paddingVertical: spacing.xs },
  name: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  detail: { color: colors.text3, fontSize: 12, marginTop: 2 },
  empty: { color: colors.text3, fontSize: 12, paddingVertical: spacing.xs },
}));
