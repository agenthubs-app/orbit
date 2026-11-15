// 「记一笔交流」App 底部弹层（docs/designs/contact-log-2026-11 ⑤；内容与行为同 Web ②–④ 的 ContactLogModal）。
// 方式 4 选 1（默认面谈）· 日期（默认东京今天，可改，不能选以后）· 选「活动上遇到」时列当天活动（可不选）·
// 聊到了：对方行业 → 对方能提供 → 对方在找 → 我能提供 → 我在找 → 我想聊的话题（空组隐藏，每组先显示 4 个，多的收进「+N」）·
// 补充 · 「会记为」预览 · 底部整宽「保存」；关闭靠右上 ✕ 或下滑（BottomSheet 自带；键盘弹出时弹层上移）。
// 保存 = PATCH /api/contacts/:id 的 memo 写入（带 channel／topics），只在联网时可用（联系人域没有设备端写入）。
// 读取：自己的资料走「我的」与首页共用的 self-profile 页面副本（新鲜就不再读）；活动列表只在第一次选「活动上遇到」时读。
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { BottomSheet, Button, CategoryTabs, Icon, IconButton, TextField, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { accountProfilePath } from "../me/account-api";
import { accountScreenResponseSchema } from "../me/account-response";
import { PersonalScheduleDateTimePicker } from "../schedule/PersonalScheduleDateTimePicker";
import {
  CONTACT_LOG_CHANNELS, CONTACT_LOG_GROUP_VISIBLE, buildContactLogPatch, contactLogCanSave, contactLogEventsOn, contactLogGroups, tokyoToday,
  type ContactLogChannel, type ContactLogEventOption, type ContactLogGroupKey, type ContactLogPatch,
} from "./contact-log-model";

export const CONTACT_LOG_EVENT_OPTIONS_PATH = "/api/contacts/memo-event-options";
/** 自己的资料副本在这段时间内算新鲜，打开弹层不再读服务端（与首页问候读同一份副本）。 */
const PROFILE_COPY_FRESH_MS = 5 * 60_000;

const CHANNEL_KEY = { meeting: "network.log.channelMeeting", call: "network.log.channelCall", event: "network.log.channelEvent", other: "network.log.channelOther" } as const;
const GROUP_KEY = {
  theirIndustry: "network.log.groupIndustry", theirOffering: "network.log.groupOffering", theirSeeking: "network.log.groupSeeking",
  myOffering: "network.log.groupOffering", mySeeking: "network.log.groupSeeking", myTopics: "network.log.groupTopics",
} as const;

export interface ContactLogTarget { id: string; displayName: string; industry: string; offering: readonly string[]; seeking: readonly string[] }
type MyProfile = { offering: string[]; seeking: string[]; topics: string[] };

/** 自己资料里能当 chip 的三项。undefined = 还在读；读不到（离线无副本、失败）按空。 */
function useMyProfile(): MyProfile | null | undefined {
  const auth = useOrbitAuthSession();
  const { baseUrl, ready } = useOrbitApiBaseUrl();
  const copy = usePageCopyResource<unknown>(accountProfilePath(undefined, false), () => false, {
    copy: { id: "self-profile" }, scopeKey: JSON.stringify([auth.actorId, auth.cookieHeader, baseUrl]),
    enabled: auth.ready && auth.signedIn && ready, freshForMs: PROFILE_COPY_FRESH_MS,
    accept: (value) => accountScreenResponseSchema.safeParse(value).success,
  });
  if (copy.kind === "loading") return undefined;
  const parsed = copy.kind === "success" || copy.kind === "empty" ? accountScreenResponseSchema.safeParse(copy.data) : null;
  const profile = parsed?.success ? parsed.data.profile : null;
  return profile ? { offering: profile.offering ?? [], seeking: profile.seeking ?? [], topics: profile.topics ?? [] } : null;
}

export function ContactLogSheet({ visible, contact, offline, onClose, onSaved }: {
  visible: boolean; contact: ContactLogTarget; offline: boolean; onClose: () => void; onSaved: (patch: ContactLogPatch) => void;
}) {
  const { t } = useOrbitLocale();
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("network.log.title", { name: contact.displayName })}>
      {visible ? <ContactLogForm contact={contact} offline={offline} onClose={onClose} onSaved={onSaved} /> : null}
    </BottomSheet>
  );
}

/** 每次打开都是新的一份（关掉再开回到默认值）。 */
function ContactLogForm({ contact, offline, onClose, onSaved }: { contact: ContactLogTarget; offline: boolean; onClose: () => void; onSaved: (patch: ContactLogPatch) => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const client = useOrbitApiClient();
  const me = useMyProfile();
  const [channel, setChannel] = useState<ContactLogChannel>("meeting");
  const [today] = useState(() => tokyoToday());
  const [date, setDate] = useState(today);
  const [picking, setPicking] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<ContactLogEventOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<ContactLogGroupKey>>(new Set());
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  // 活动列表只在第一次选「活动上遇到」时读；读失败只是不显示这一行。
  useEffect(() => {
    if (channel !== "event" || events !== null) return;
    let alive = true;
    void client.get<{ options?: unknown }>(CONTACT_LOG_EVENT_OPTIONS_PATH).then((result) => {
      if (!alive) return;
      const options = result.success && Array.isArray(result.data?.options) ? result.data.options as ContactLogEventOption[] : [];
      setEvents(options.filter((item) => item && typeof item.eventId === "string" && typeof item.title === "string" && typeof item.startsAt === "string"));
    }).catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [channel, client, events]);
  useEffect(() => { setEventId(null); }, [date]);

  const groups = useMemo(() => contactLogGroups({
    theirIndustry: [contact.industry], theirOffering: contact.offering, theirSeeking: contact.seeking,
    myOffering: me?.offering ?? [], mySeeking: me?.seeking ?? [], myTopics: me?.topics ?? [],
  }), [contact.industry, contact.offering, contact.seeking, me]);
  const noChips = me !== undefined && groups.length === 0;
  const dayEvents = channel === "event" ? contactLogEventsOn(events ?? [], date) : [];
  const patch = buildContactLogPatch({ channel, date, topics: picked, extra, eventId, copy: { bodyPrefix: t("network.log.bodyPrefix"), joiner: t("network.log.bodyJoiner") } });
  const canSave = !busy && !offline && contactLogCanSave({ topics: picked, extra, date });
  const toggle = (chip: string) => setPicked((current) => current.includes(chip) ? current.filter((item) => item !== chip) : [...current, chip]);

  const save = async () => {
    if (!canSave || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setFailed(false);
    const result = await client.patch(`/api/contacts/${encodeURIComponent(contact.id)}`, { body: patch });
    inFlight.current = false;
    setBusy(false);
    if (!result.success) { setFailed(true); return; }
    onSaved(patch);
  };

  const chip = (key: string, label: string, on: boolean, onPress: () => void, role: "checkbox" | "radio" = "checkbox") => (
    <UiPressable key={key} accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ checked: on }} aria-checked={on} hitSlop={{ top: 4, bottom: 4 }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <UiText numberOfLines={1} style={[styles.chipText, on && styles.chipTextOn]}>{label}</UiText>
    </UiPressable>
  );
  const renderGroup = (group: (typeof groups)[number]) => {
    const open = expanded.has(group.key);
    // 已点中的 chip 即使在「+N」里也一直显示。
    const shown = open ? group.chips : group.chips.filter((item, index) => index < CONTACT_LOG_GROUP_VISIBLE || picked.includes(item));
    const hidden = group.chips.length - shown.length;
    return (
      <View key={group.key} style={styles.group} testID={`contact-log-group-${group.key}`}>
        <UiText style={styles.groupLabel}><UiText style={styles.who}>{t(group.side === "them" ? "network.log.whoThem" : "network.log.whoMe")}</UiText>{` ${t(GROUP_KEY[group.key])}`}</UiText>
        <View style={styles.chips}>
          {shown.map((item) => chip(item, item, picked.includes(item), () => toggle(item)))}
          {hidden > 0 ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("network.log.more", { count: hidden })} hitSlop={{ top: 4, bottom: 4 }} onPress={() => setExpanded((current) => new Set([...current, group.key]))} style={[styles.chip, styles.chipMore]}>
              <UiText style={styles.moreText}>{t("network.log.more", { count: hidden })}</UiText>
            </UiPressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View testID="contact-log-sheet">
      <View style={styles.header}>
        <UiText accessibilityRole="header" numberOfLines={2} style={styles.title}>{t("network.log.title", { name: contact.displayName })}</UiText>
        <IconButton icon="x" accessibilityLabel={t("network.log.close")} onPress={onClose} />
      </View>

      <View style={styles.field}>
        <UiText style={styles.lbl}>{t("network.log.channel")}</UiText>
        <CategoryTabs accessibilityLabel={t("network.log.channel")} value={channel} onChange={setChannel}
          options={CONTACT_LOG_CHANNELS.map((key) => ({ key, label: t(CHANNEL_KEY[key]) }))} />
      </View>

      <View style={styles.field}>
        <UiText style={styles.lbl}>{t("network.log.date")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={`${t("network.log.date")} ${date}`} onPress={() => setPicking(true)} style={styles.date} testID="contact-log-date">
          <UiText style={styles.dateText}>{date}{date === today ? <UiText style={styles.dateToday}>{t("network.log.today")}</UiText> : null}</UiText>
          <Icon name="down" size={16} color={colors.ink3} />
        </UiPressable>
      </View>

      {dayEvents.length ? (
        <View style={styles.field} testID="contact-log-events">
          <UiText style={styles.lbl}>{t("network.log.event")}</UiText>
          <View style={styles.chips}>
            {dayEvents.map((item) => chip(item.eventId, item.title, eventId === item.eventId, () => setEventId(eventId === item.eventId ? null : item.eventId), "radio"))}
          </View>
        </View>
      ) : null}

      {noChips ? (
        <View style={styles.field}>
          <UiText style={styles.lbl}>{t("network.log.topicsPlain")}</UiText>
          <View style={styles.empty} testID="contact-log-empty">
            <UiText style={styles.emptyText}>{t("network.log.empty")}</UiText>
            <UiPressable accessibilityRole="link" accessibilityLabel={t("network.log.completeProfile")} hitSlop={8} onPress={() => { onClose(); router.push("/profile/edit" as Href); }}>
              <UiText style={styles.emptyLink}>{t("network.log.completeProfile")}</UiText>
            </UiPressable>
          </View>
        </View>
      ) : groups.length ? (
        <View style={styles.field}>
          <UiText style={styles.lbl}>{t("network.log.topics")}</UiText>
          {(["them", "me"] as const).map((who) => {
            const side = groups.filter((group) => group.side === who);
            return side.length ? <View key={who} style={styles.side}>{side.map(renderGroup)}</View> : null;
          })}
        </View>
      ) : null}

      <View style={styles.field}>
        <TextField presentation="kit" label={t(noChips ? "network.log.content" : "network.log.extra")} placeholder={t(noChips ? "network.log.contentPlaceholder" : "network.log.extraPlaceholder")}
          value={extra} maxLength={2000} multiline onChangeText={(text) => { setExtra(text); if (failed) setFailed(false); }} />
      </View>

      {patch.note.body ? (
        <View style={styles.preview} testID="contact-log-preview">
          <UiText style={styles.previewText}>{t("network.log.preview")}<UiText style={styles.previewWay}>{t(CHANNEL_KEY[channel])}</UiText>{` · ${patch.note.body.replace(/\n/g, "　")}`}</UiText>
        </View>
      ) : null}
      {failed ? <UiText accessibilityRole="alert" style={styles.error}>{t("network.log.saveFailed")}</UiText> : null}
      {offline ? <UiText style={styles.offline}>{t("network.log.needsNetwork")}</UiText> : null}

      <Button variant="primary" size="lg" block label={t("network.log.save")} loading={busy} disabled={!canSave} onPress={() => void save()} />

      {picking ? <PersonalScheduleDateTimePicker kind="date" value={date} zone="Asia/Tokyo" max={today} disabled={false} title={t("network.log.date")}
        onCancel={() => setPicking(false)} onConfirm={(value) => { setPicking(false); setDate(value); }} /> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  title: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "800" },
  field: { marginBottom: 16 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", marginBottom: 8 },
  date: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface2 },
  dateText: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  dateToday: { color: colors.ink3, fontWeight: "500" },
  side: { gap: 10, marginBottom: 6 },
  group: { gap: 6 },
  groupLabel: { color: colors.ink3, fontSize: 13, fontWeight: "500" },
  who: { color: colors.ink2, fontSize: 12, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { maxWidth: "100%", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2 },
  chipOn: { backgroundColor: colors.ink },
  chipText: { color: colors.ink2, fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: colors.onAccent },
  chipMore: { backgroundColor: "transparent", paddingLeft: 4 },
  moreText: { color: colors.ink3, fontSize: 14, fontWeight: "600" },
  empty: { borderRadius: 12, padding: 12, backgroundColor: colors.surface2, gap: 6 },
  emptyText: { color: colors.ink2, fontSize: 14, lineHeight: 21 },
  emptyLink: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  preview: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface2, marginBottom: 14 },
  previewText: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
  previewWay: { color: colors.ink, fontWeight: "700" },
  error: { color: colors.coralText, fontSize: 14, marginBottom: 10 },
  offline: { color: colors.ink3, fontSize: 13, marginBottom: 10 },
}));
