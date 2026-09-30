import { Pressable, Text } from "react-native";
import { z } from "zod";
import { contactDetailPath } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { localContactLabel } from "../../view-models/contacts-local";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

const referenceNameSchema = z.object({ contact: z.object({ id: z.string(), displayName: z.string() }) });

/** Resolve only the explicitly selected contact, never the contact collection. */
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
  return <Pressable accessibilityLabel={locale.t("aiConversation.removeContact", { name })} accessibilityRole="button" onPress={onRemove} style={style}>
    <Text style={textStyle}>@{name} ×</Text>
  </Pressable>;
}
