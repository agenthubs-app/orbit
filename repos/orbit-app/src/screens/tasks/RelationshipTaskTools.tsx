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
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
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
  const locale = useOrbitLocale();
  const router = useRouter();
  const { timeZone } = useOrbitTimeZone();
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const actorId = auth.actorId;
  const scopeKey = JSON.stringify([actorId, server.baseUrl]);
  const notifications = useApiResource<unknown>(ORBIT_API_ENDPOINTS.notifications, () => false, { scopeKey, cachePolicy: "network-only" });
  const view = followupsToView({
    tasksPayload: followupsPageToView(tasksPayload, { contacts }).candidatesPayload,
    notificationsPayload: notifications.kind === "success" || notifications.kind === "empty" ? notifications.data : {},
  }, locale.language);
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
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);

  function openTemplate(template: ReturnType<typeof contactFollowupTemplate> | ReturnType<typeof followupCandidateTemplate>) {
    if (!ready || !actorId) { setTemplateError(locale.t("relationshipTasks.signIn")); return; }
    setTemplateError(null);
    const prefillIntent = registerAiTemplatePrefill({ actorId, baseUrl: server.baseUrl, ...template });
    router.push({ pathname: "/ai/[id]", params: { id: "new", prefillIntent } } as Href);
  }

  function draftFor(channel: "chat" | "email") {
    if (!selected) { setTemplateError(locale.t("relationshipTasks.selectFirst")); return; }
    openTemplate(contactFollowupTemplate({ channel, contactId: selected.contact.id, contactName: selected.contact.name, organization: selected.contact.organization, recommendedAction: selected.task?.title ?? locale.t("relationshipTasks.confirmNext"), rationale: selected.task?.notes ?? "" }));
  }

  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("relationshipTasks.sectionTitle")}</Text>
    <Text style={styles.body}>{locale.t("relationshipTasks.helper")}</Text>
    {selected ? <Text accessibilityLiveRegion="polite" style={styles.body}>{locale.t("relationshipTasks.selected", { label: selected.label })}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={locale.t("relationshipTasks.choose")} onPress={() => setChoosing(true)} style={styles.button}>
      <Text style={styles.buttonText}>{locale.t(selected ? "relationshipTasks.change" : "relationshipTasks.choose")}</Text>
    </Pressable>
    {choosing ? <View style={styles.options}>
      {options.length === 0 ? <Text style={styles.body}>{locale.t("relationshipTasks.emptyOptions")}</Text> : null}
      {options.map(option => <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={option.label} onPress={() => { setSelectedKey(option.key); setChoosing(false); }} style={styles.option}>
        <Text style={styles.body}>{option.label}</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => setChoosing(false)} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.cancelSelection")}</Text></Pressable>
    </View> : null}
    <Text style={styles.detail}>{locale.t("relationshipTasks.modifyBeforeSend")}</Text>
    <Pressable accessibilityRole="button" disabled={!ready || !selected} onPress={() => draftFor("chat")} style={[styles.button, !selected && styles.disabled]}><Text style={styles.buttonText}>{locale.t("relationshipTasks.aiDraft")}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready || !selected} onPress={() => draftFor("email")} style={[styles.button, !selected && styles.disabled]}><Text style={styles.buttonText}>{locale.t("relationshipTasks.draftMessage")}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready} onPress={() => openTemplate(followupCandidateTemplate("task"))} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.generateCandidates")}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready} onPress={() => openTemplate(followupCandidateTemplate("reminder"))} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.generateReminderCandidate")}</Text></Pressable>
    {templateError ? <Text accessibilityRole="alert" style={styles.error}>{templateError}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => router.push("/ai?drawer=1" as Href)} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.viewExisting")}</Text></Pressable>
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("relationshipTasks.pendingSuggestions", { count: view.tasks.length })}</Text>
    {view.tasks.length === 0 ? <Text style={styles.body}>{locale.t("relationshipTasks.emptySuggestions")}</Text> : null}
    {view.tasks.map(task => <View key={task.id} style={styles.option}>
      <Text style={styles.body}>{task.title}</Text>
      <Text style={styles.body}>{task.recommendedAction}</Text>
      <Text style={styles.detail}>{[task.contactName, task.organization, task.sourceLabel].filter(Boolean).join(" · ")}</Text>
    </View>)}
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("relationshipTasks.reminderQueue", { count: notifications.kind === "success" || notifications.kind === "empty" ? ` ${view.reminders.length}` : "" })}</Text>
    {notifications.kind === "loading" ? <Text style={styles.detail}>{locale.t("relationshipTasks.reminderLoading")}</Text> : null}
    {notifications.kind === "failure" || notifications.kind === "offline" ? <ErrorState title={locale.t("relationshipTasks.remindersUnavailable")} message={notifications.error.message} /> : null}
    {(notifications.kind === "success" || notifications.kind === "empty") && view.reminders.length === 0 ? <Text style={styles.body}>{locale.t("relationshipTasks.emptyReminders")}</Text> : null}
    {view.reminders.map(reminder => <View key={reminder.id} style={styles.option}>
      <Text style={styles.body}>{reminder.title}</Text>
      <Text style={styles.detail}>{[reminder.organization, reminderDates.get(reminder.id) ?? reminder.dueLabel, reminder.windowLabel, reminder.queueLabel].filter(Boolean).join(" · ")}</Text>
    </View>)}
    <Pressable accessibilityRole="button" onPress={notifications.refresh} disabled={notifications.refreshing} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.refreshReminders")}</Text></Pressable>
    <Text style={styles.detail}>{locale.t("relationshipTasks.disclaimer")}</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push("/schedule" as Href)} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.backSchedule")}</Text></Pressable>
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
