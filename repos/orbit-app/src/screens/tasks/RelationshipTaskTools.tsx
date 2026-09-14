import { useState } from "react";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TaskItemContract } from "../../api/contract/tasks";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { ErrorState } from "../../components/ErrorState";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { spacing, textStyles } from "../../design/tokens";
import { contactFollowupTemplate, followupCandidateTemplate, registerAiTemplatePrefill } from "../../data/ai-template-prefill";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts } from "../../time/date-time";
import type { ContactSummary } from "../../view-models/contacts";
import { followupsPageToView } from "../../view-models/followups-page";
import { followupsToView } from "../../view-models/followups";
import { isRelationshipTask } from "../../view-models/task-list-scope";

export function RelationshipTaskTools({ tasks, contacts, tasksPayload }: {
  tasks: readonly TaskItemContract[];
  contacts: readonly ContactSummary[];
  tasksPayload: unknown;
}) {
  const { styles } = useStyles();
  const router = useRouter();
  const { timeZone } = useOrbitTimeZone();
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([auth.user?.id, server.baseUrl]);
  const notifications = useApiResource<unknown>(ORBIT_API_ENDPOINTS.notifications, () => false, { scopeKey, cachePolicy: "network-only" });
  const view = followupsToView({
    tasksPayload: followupsPageToView(tasksPayload, { contacts }).candidatesPayload,
    notificationsPayload: notifications.kind === "success" || notifications.kind === "empty" ? notifications.data : {},
  });
  const notificationData = notifications.kind === "success" || notifications.kind === "empty" ? notifications.data : null;
  const rawReminders = typeof notificationData === "object" && notificationData !== null && "reminders" in notificationData && Array.isArray(notificationData.reminders) ? notificationData.reminders : [];
  const reminderDates = new Map<string, string>();
  for (const reminder of rawReminders) {
    if (typeof reminder !== "object" || reminder === null || typeof reminder.reminderId !== "string" || typeof reminder.dueAt !== "string" || !Number.isFinite(Date.parse(reminder.dueAt))) continue;
    const parts = localParts(reminder.dueAt, timeZone);
    reminderDates.set(reminder.reminderId, `${parts.date} ${parts.time}`);
  }
  const [choosing, setChoosing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const contactsById = new Map(contacts.map(contact => [contact.id, contact]));
  const options = [
    ...tasks.filter(isRelationshipTask).flatMap(task => {
      const contact = task.relatedContactId ? contactsById.get(task.relatedContactId) : null;
      return contact ? [{ key: `task:${task.id}`, contact, task, label: [contact.name, contact.organization, task.title].filter(Boolean).join(" · ") }] : [];
    }),
    ...contacts.map(contact => ({ key: `contact:${contact.id}`, contact, task: null, label: [contact.name, contact.organization].filter(Boolean).join(" · ") })),
  ];
  const selected = options.find(option => option.key === selectedKey) ?? null;
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id);

  function openTemplate(template: ReturnType<typeof contactFollowupTemplate> | ReturnType<typeof followupCandidateTemplate>) {
    if (!ready || !auth.user?.id) { setTemplateError("请先登录后再打开 IORBIT。"); return; }
    setTemplateError(null);
    const prefillIntent = registerAiTemplatePrefill({ actorId: auth.user.id, baseUrl: server.baseUrl, ...template });
    router.push({ pathname: "/ai/[id]", params: { id: "new", prefillIntent } } as Href);
  }

  function draftFor(channel: "chat" | "email") {
    if (!selected) { setTemplateError("请先选择可读取的联系人或关联事项。"); return; }
    openTemplate(contactFollowupTemplate({ channel, contactId: selected.contact.id, contactName: selected.contact.name, organization: selected.contact.organization, recommendedAction: selected.task?.title ?? "确认下一步", rationale: selected.task?.notes ?? "" }));
  }

  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>建议与草稿</Text>
    <Text style={styles.body}>为联系人准备下一步时，请先选择联系人或关联事项。</Text>
    {selected ? <Text accessibilityLiveRegion="polite" style={styles.body}>已选择：{selected.label}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="选择联系人或事项" onPress={() => setChoosing(true)} style={styles.button}>
      <Text style={styles.buttonText}>{selected ? "更换联系人或事项" : "选择联系人或事项"}</Text>
    </Pressable>
    {choosing ? <View style={styles.options}>
      {options.length === 0 ? <Text style={styles.body}>暂无可选择的人脉，请先添加联系人。</Text> : null}
      {options.map(option => <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={option.label} onPress={() => { setSelectedKey(option.key); setChoosing(false); }} style={styles.option}>
        <Text style={styles.body}>{option.label}</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => setChoosing(false)} style={styles.button}><Text style={styles.buttonText}>取消选择</Text></Pressable>
    </View> : null}
    <Text style={styles.detail}>进入 IORBIT 后可修改内容，点击发送才会生成。</Text>
    <Pressable accessibilityRole="button" disabled={!ready || !selected} onPress={() => draftFor("chat")} style={[styles.button, !selected && styles.disabled]}><Text style={styles.buttonText}>AI 起草</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready || !selected} onPress={() => draftFor("email")} style={[styles.button, !selected && styles.disabled]}><Text style={styles.buttonText}>起草联系消息</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready} onPress={() => openTemplate(followupCandidateTemplate("task"))} style={styles.button}><Text style={styles.buttonText}>生成候选</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready} onPress={() => openTemplate(followupCandidateTemplate("reminder"))} style={styles.button}><Text style={styles.buttonText}>生成提醒候选</Text></Pressable>
    {templateError ? <Text accessibilityRole="alert" style={styles.error}>{templateError}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => router.push("/ai?drawer=1" as Href)} style={styles.button}><Text style={styles.buttonText}>查看已有草稿与候选</Text></Pressable>
    <Text accessibilityRole="header" style={styles.heading}>待确认建议 {view.tasks.length}</Text>
    {view.tasks.length === 0 ? <Text style={styles.body}>暂无待确认建议。</Text> : null}
    {view.tasks.map(task => <View key={task.id} style={styles.option}>
      <Text style={styles.body}>{task.title}</Text>
      <Text style={styles.body}>{task.recommendedAction}</Text>
      <Text style={styles.detail}>{[task.contactName, task.organization, task.sourceLabel].filter(Boolean).join(" · ")}</Text>
    </View>)}
    <Text accessibilityRole="header" style={styles.heading}>{notifications.kind === "success" || notifications.kind === "empty" ? `提醒队列 ${view.reminders.length}` : "提醒队列"}</Text>
    {notifications.kind === "loading" ? <Text style={styles.detail}>正在读取提醒。</Text> : null}
    {notifications.kind === "failure" || notifications.kind === "offline" ? <ErrorState title="提醒暂不可用" message={notifications.error.message} /> : null}
    {(notifications.kind === "success" || notifications.kind === "empty") && view.reminders.length === 0 ? <Text style={styles.body}>暂无待复核提醒。</Text> : null}
    {view.reminders.map(reminder => <View key={reminder.id} style={styles.option}>
      <Text style={styles.body}>{reminder.title}</Text>
      <Text style={styles.detail}>{[reminder.organization, reminderDates.get(reminder.id) ?? reminder.dueLabel, reminder.windowLabel, reminder.queueLabel].filter(Boolean).join(" · ")}</Text>
    </View>)}
    <Pressable accessibilityRole="button" onPress={notifications.refresh} disabled={notifications.refreshing} style={styles.button}><Text style={styles.buttonText}>刷新提醒</Text></Pressable>
    <Text style={styles.detail}>建议与提醒候选需要复核，不计入已保存的待办。</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push("/schedule" as Href)} style={styles.button}><Text style={styles.buttonText}>回到日程</Text></Pressable>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: spacing.lg, gap: spacing.md },
  heading: { ...textStyles.listTitle, color: colors.ink },
  body: { ...textStyles.body, color: colors.text },
  detail: { ...textStyles.small, color: colors.text3 },
  error: { ...textStyles.small, color: colors.rose },
  disabled: { opacity: 0.5 },
  button: { ...createControlStyles(colors).secondaryButton },
  buttonText: { ...createControlStyles(colors).secondaryButtonText },
  options: { gap: spacing.sm },
  option: { minHeight: 44, justifyContent: "center", paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
}));
