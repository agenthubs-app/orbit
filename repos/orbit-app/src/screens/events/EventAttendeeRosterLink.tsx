import { type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { eventDetailPath } from "../../api/endpoints";
import { publicEventDetailSchema } from "../../api/event-detail-contract";
import { useApiResource } from "../../hooks/useApiResource";
import { createThemedStyles } from "../../design/theme";
import { spacing, textStyles } from "../../design/tokens";

interface RosterLinkProps {
  eventId: string;
  countLabel: string;
  onNavigate: (href: Href) => void;
  scopeKey: string;
  isScopeCurrent: () => boolean;
}

export function EventAttendeeRosterLink(props: RosterLinkProps) {
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { styles } = useStyles();
  if (!auth.signedIn || !auth.actorId) return <Text style={styles.detail}>登录后可确认参会者名单的查看权限。</Text>;
  const scopeKey = JSON.stringify([props.scopeKey, baseUrl, auth.actorId, props.eventId]);
  return <AuthenticatedRosterLink {...props} key={scopeKey} scopeKey={scopeKey} />;
}

function AuthenticatedRosterLink({ eventId, countLabel, onNavigate, scopeKey, isScopeCurrent }: RosterLinkProps) {
  const { styles } = useStyles();
  // The attendee import roster is owner-only. A public detail or old signup
  // preview does not authorize this endpoint. Confirm the existing exact
  // owner lookup without downloading any attendee records or using a cache.
  const state = useApiResource<unknown>(eventDetailPath(eventId), () => false, { scopeKey, cachePolicy: "network-only" });
  const detail = state.kind === "success" ? publicEventDetailSchema.safeParse(state.data) : null;
  const allowed = detail?.success === true && detail.data.event.id === eventId;
  if (allowed) return <Pressable accessibilityRole="button" accessibilityLabel="查看参会者" onPress={() => {
    if (isScopeCurrent()) onNavigate(`/events/${encodeURIComponent(eventId)}/attendees` as Href);
  }} style={styles.link}><Text style={styles.title}>参会者</Text><Text style={styles.detail}>{countLabel} ›</Text></Pressable>;
  if (state.kind === "loading") return <Text style={styles.detail}>正在确认名单查看权限。</Text>;
  if (state.kind === "failure" && [401, 403, 404].includes(state.status)) return <Text style={styles.detail}>
    {state.status === 401 ? "请重新登录后查看参会者名单。" : "当前账号无法查看参会者名单。"}
  </Text>;
  return <View style={styles.notice}><Text style={styles.detail}>暂时无法确认名单查看权限，请重新读取。</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="重新确认名单权限" style={styles.link} onPress={() => { if (isScopeCurrent()) state.refresh(); }}><Text style={styles.detail}>重新读取</Text></Pressable>
  </View>;
}

const useStyles = createThemedStyles(colors => ({
  link: { minHeight: 44, paddingVertical: 11, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, gap: spacing.sm },
  title: { color: colors.ink, ...textStyles.body },
  detail: { color: colors.text3, ...textStyles.small },
  notice: { gap: spacing.xs },
}));
