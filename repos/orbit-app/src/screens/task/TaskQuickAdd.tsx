import * as Crypto from "expo-crypto";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";

import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { Icon } from "../../components/ui/Icon";
import { useToast } from "../../components/ui/Toast";
import { UiText } from "../../components/ui/Text";
import { buildOfflineTaskMutation } from "../../data/sync/task-outbox-mutation";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";

export type TaskQuickAddHandle = { focus: () => void };

function dateKey(timeZone: string, now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" })
    .formatToParts(now).map((item) => [item.type, item.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// R05 (RD-20): the To-do segment's add box — the same write as the Today page's
// box (a task planned for today; offline on the device it goes to the task
// outbox and syncs later). The 「＋」 in the Task header focuses it.
export const TaskQuickAdd = forwardRef<TaskQuickAddHandle, { onCreated: () => void }>(function TaskQuickAdd({ onCreated }, ref) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const { timeZone, canSave } = useOrbitTimeZone();
  const client = useOrbitApiClient();
  const taskMirror = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const outbox = useOfflineTaskOutbox(taskMirror, Platform.OS !== "web");
  const input = useRef<TextInput>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  async function submit() {
    const title = draft.trim();
    if (!title || saving) return;
    if (!canSave) { toast.error(locale.t("today.timezoneUnavailable")); return; }
    setSaving(true);
    const idempotencyKey = `ios:create-task:${Crypto.randomUUID()}`;
    const plannedDate = dateKey(timeZone);
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.tasks, { body: { category: "other", idempotencyKey, plannedDate, title } });
    if (result.success) {
      setDraft("");
      onCreated();
    } else if (result.error.code === "ORBIT_APP_NETWORK_ERROR" && Platform.OS !== "web") {
      try {
        await outbox.enqueueOfflineMutation(buildOfflineTaskMutation({
          mutationId: idempotencyKey, entityId: `local:${Crypto.randomUUID()}`, operation: "create", baseRevision: null,
          requestBody: { category: "other", idempotencyKey, plannedDate, title }, createdAt: new Date().toISOString(),
        }));
        setDraft("");
        toast.info(copy.toast.savedOffline, { sub: copy.toast.syncLater });
        onCreated();
      } catch {
        toast.error(copy.toast.saveFailed);
      }
    } else {
      toast.error(result.error.message || copy.toast.saveFailed);
    }
    setSaving(false);
  }

  return (
    <View style={styles.box}>
      <Icon name="plus" size={20} color={colors.ink3Text} />
      <TextInput
        ref={input}
        accessibilityLabel={locale.t("shell.task.quickAddLabel")}
        blurOnSubmit={false}
        editable={!saving}
        onChangeText={setDraft}
        onSubmitEditing={() => void submit()}
        placeholder={locale.t("shell.task.quickAddPlaceholder")}
        placeholderTextColor={colors.ink3Text}
        returnKeyType="done"
        style={styles.input}
        value={draft}
      />
      {saving ? <UiText style={styles.saving}>{locale.t("today.creating")}</UiText> : null}
    </View>
  );
});

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 4, borderRadius: 14, backgroundColor: colors.surface2 },
  input: { flex: 1, minHeight: 44, padding: 0, color: colors.ink, fontSize: 15 },
  saving: { color: colors.ink3Text, fontSize: 12 },
}));
