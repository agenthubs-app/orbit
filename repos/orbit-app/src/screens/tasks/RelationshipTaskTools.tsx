import { useState } from "react";
import { type Href, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TaskListEntry } from "./task-list-source";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { INBOX_NOTIFICATIONS_PATH, notificationInboxData } from "../../api/inbox-notifications";
import { ErrorState } from "../../components/ErrorState";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { spacing, textStyles } from "../../design/tokens";
import { contactFollowupTemplate, followupCandidateTemplate, registerAiTemplatePrefill } from "../../data/ai-template-prefill";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { localParts } from "../../time/date-time";
import { useContactLabels,type ContactLabel } from "../../hooks/useContactLabels";
import { TaskContactPicker } from "./TaskContactPicker";
import { PendingTaskSuggestions } from "./PendingTaskSuggestions";
import { isRelationshipTask } from "../../view-models/task-list-scope";

interface RelationshipTaskToolsProps {
  tasks: readonly TaskListEntry[];
  contacts: readonly ContactLabel[];
  /** Legacy caller compatibility only; never use a task list as a suggestion source. */
  tasksPayload?: unknown;
}

/**
 * The task page/mirror provides saved task cards only. Suggestions use their
 * own bounded canonical source; AI draft artifacts remain in the AI drawer.
 */
export function RelationshipTaskTools(props: RelationshipTaskToolsProps) {
  return <RelationshipTaskToolsView {...props} />;
}

function RelationshipTaskToolsView({ tasks, contacts }: RelationshipTaskToolsProps) {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const { timeZone } = useOrbitTimeZone();
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const actorId = auth.actorId;
  const scopeKey = JSON.stringify([actorId, server.baseUrl]);
  const notifications = useApiResource<unknown>(`${INBOX_NOTIFICATIONS_PATH}?kind=reminder&limit=20`, () => false, { scopeKey, cachePolicy: "network-only" });
  const notificationData = notifications.kind === "success" || notifications.kind === "empty" ? notifications.data : null;
  const reminders = actorId && notificationData ? notificationInboxData(notificationData, actorId)?.items ?? [] : [];
  const reminderDates = new Map<string, string>();
  for (const reminder of reminders) {
    if (typeof reminder.dueAt !== "string" || !Number.isFinite(Date.parse(reminder.dueAt))) continue;
    const parts = localParts(reminder.dueAt, timeZone);
    reminderDates.set(reminder.id, `${parts.date} ${parts.time}`);
  }
  const [choosing, setChoosing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchingContacts,setSearchingContacts]=useState(false);
  const [pickedId,setPickedId]=useState<string|null>(null);
  const picked=useContactLabels(pickedId?[pickedId]:[],scopeKey);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const contactsById = new Map(contacts.map(contact => [contact.id, contact]));
  const options = [
    ...tasks.filter(isRelationshipTask).flatMap(task => {
      const contact = task.relatedContactId ? contactsById.get(task.relatedContactId) : null;
      return contact ? [{ key: `task:${task.id}`, contact, task, label: [contact.name, contact.organization, task.title].filter(Boolean).join(" · ") }] : [];
    }),
    ...contacts.map(contact => ({ key: `contact:${contact.id}`, contact, task: null, label: [contact.name, contact.organization].filter(Boolean).join(" · ") })),
  ];
  const selected = pickedId ? (picked.items[0]?{contact:picked.items[0],task:null,label:[picked.items[0].name,picked.items[0].organization].filter(Boolean).join(" · ")}:null) : options.find(option => option.key === selectedKey) ?? null;
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
      {options.map(option => <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={option.label} onPress={() => { setPickedId(null);setSelectedKey(option.key); setChoosing(false); }} style={styles.option}>
        <Text style={styles.body}>{option.label}</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" onPress={()=>setSearchingContacts(true)} style={styles.button}><Text style={styles.buttonText}>{locale.language==="zh"?"搜索其他联系人":locale.language==="ja"?"他の連絡先を検索":"Find another contact"}</Text></Pressable>
      {searchingContacts?<TaskContactPicker onChoose={id=>{setPickedId(id);setSelectedKey(null);setSearchingContacts(false);setChoosing(false);}}/>:null}
      <Pressable accessibilityRole="button" onPress={() => setChoosing(false)} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.cancelSelection")}</Text></Pressable>
    </View> : null}
    <Text style={styles.detail}>{locale.t("relationshipTasks.modifyBeforeSend")}</Text>
    <Pressable accessibilityRole="button" disabled={!ready || !selected} onPress={() => draftFor("chat")} style={[styles.button, !selected && styles.disabled]}><Text style={styles.buttonText}>{locale.t("relationshipTasks.aiDraft")}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready || !selected} onPress={() => draftFor("email")} style={[styles.button, !selected && styles.disabled]}><Text style={styles.buttonText}>{locale.t("relationshipTasks.draftMessage")}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready} onPress={() => openTemplate(followupCandidateTemplate("task"))} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.generateCandidates")}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!ready} onPress={() => openTemplate(followupCandidateTemplate("reminder"))} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.generateReminderCandidate")}</Text></Pressable>
    {templateError ? <Text accessibilityRole="alert" style={styles.error}>{templateError}</Text> : null}
    {pickedId&&!picked.loading&&!picked.items.length?<View><Text accessibilityRole="alert" style={styles.error}>{locale.t("tasks.contactUnavailable")}</Text><Pressable accessibilityRole="button" onPress={picked.refresh} style={styles.button}><Text style={styles.buttonText}>{locale.language==="zh"?"重新确认联系人":locale.language==="ja"?"連絡先を再確認":"Recheck contact"}</Text></Pressable></View>:null}
    <Pressable accessibilityRole="button" onPress={() => router.push("/ai?drawer=1" as Href)} style={styles.button}><Text style={styles.buttonText}>{locale.t("relationshipTasks.viewExisting")}</Text></Pressable>
    <PendingTaskSuggestions />
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("relationshipTasks.reminderQueue", { count: notifications.kind === "success" || notifications.kind === "empty" ? ` ${reminders.length}` : "" })}</Text>
    {notifications.kind === "loading" ? <Text style={styles.detail}>{locale.t("relationshipTasks.reminderLoading")}</Text> : null}
    {notifications.kind === "failure" || notifications.kind === "offline" ? <ErrorState title={locale.t("relationshipTasks.remindersUnavailable")} message={notifications.error.message} /> : null}
    {(notifications.kind === "success" || notifications.kind === "empty") && reminders.length === 0 ? <Text style={styles.body}>{locale.t("relationshipTasks.emptyReminders")}</Text> : null}
    {reminders.map(reminder => <View key={reminder.id} style={styles.option}>
      <Text style={styles.body}>{reminder.title}</Text>
      <Text style={styles.detail}>{[reminder.object?.name, reminderDates.get(reminder.id), reminder.reason].filter(Boolean).join(" · ")}</Text>
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
