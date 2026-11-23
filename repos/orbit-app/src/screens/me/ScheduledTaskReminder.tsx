/**
 * agent-design AG16 (approved visual draft 16-1 to 16-3; D16-1, D16-3) on the App:
 *   - `ReminderCard`: 「有新结果时提醒我」 on a task's screen — one switch for the phone and the browser, flipped here it
 *     takes effect at once (no card). With it off nothing about devices is shown and nothing is asked of the phone.
 *     Turned on while this phone has never been asked, the system's own prompt appears (draft 16-3, App).
 *   - `PhoneReminderLine`: with the switch on, whether this phone will show the reminder. Under a confirmed card that
 *     turned a reminder on (16-2) the same line, with 「已打开。」 in front, only when this phone will not show it yet.
 */
import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";

import type { AgentScheduledTaskContract } from "../../api/contract/agent-v1";
import { Card, Toggle, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import type { OrbitApiClient } from "../../api/client";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { nativePhoneReminderDevice, type PhoneReminderDevice, type PhoneReminderState } from "../../notifications/phone-reminder";
import { setScheduledTaskPush } from "./scheduled-tasks-api";

/**
 * The real phone unless a test hands one in (`null`: no phone notifications here). The caller passes its API client
 * (needed to revoke this phone's registration); this module does not take the client hook itself, so the card that
 * shows the line stays loadable on its own.
 */
function usePhone(device: PhoneReminderDevice | null | undefined, client: OrbitApiClient | null): PhoneReminderDevice | null {
  const [phone] = useState(() => (device !== undefined ? device : nativePhoneReminderDevice(client)));
  return phone;
}

export function ReminderCard({ task, client, onChanged, device }: { task: AgentScheduledTaskContract; client: OrbitApiClient; onChanged(): void; device?: PhoneReminderDevice | null }) {
  const { t } = useOrbitLocale();
  const toast = useToast();
  const { styles } = useStyles();
  const phone = usePhone(device, client);
  const [push, setPush] = useState(task.notify.push);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(0);
  useEffect(() => { setPush(task.notify.push); }, [task.notify.push]);
  const flip = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setPush(next);
    const saved = await setScheduledTaskPush(client, task.id, next);
    if (!saved) { setPush(!next); toast.error(t("scheduledTasks.failed")); setBusy(false); return; }
    // Never asked on this phone: switching it on brings up the system's own prompt.
    if (next && phone && (await phone.read().catch(() => null)) === "not_asked") { await phone.allow().catch(() => null); setAsked((value) => value + 1); }
    setBusy(false);
    onChanged();
  };
  return <Card style={styles.card}><View style={styles.card} testID={`scheduled-reminder-${push ? "on" : "off"}`}>
    <View style={styles.head}>
      <View style={styles.main}>
        <UiText style={styles.title}>{t("scheduledTasks.reminderTitle")}</UiText>
        <UiText style={styles.sub}>{push ? t("scheduledTasks.reminderOnSub") : t("scheduledTasks.reminderOffSub")}</UiText>
      </View>
      <Toggle value={push} disabled={busy} accessibilityLabel={t("scheduledTasks.reminderToggle", { title: task.title })} onValueChange={(next) => void flip(next)} />
    </View>
    {push ? <PhoneReminderLine key={asked} device={phone} client={client} /> : null}
  </View></Card>;
}

export function PhoneReminderLine({ afterCard = false, device, client = null }: { afterCard?: boolean; device?: PhoneReminderDevice | null; client?: OrbitApiClient | null }) {
  const { t } = useOrbitLocale();
  const toast = useToast();
  const { styles } = useStyles();
  const phone = usePhone(device, client);
  const [state, setState] = useState<PhoneReminderState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!phone) return;
    let alive = true;
    const refresh = () => void phone.read().then((next) => { if (alive) setState(next); }).catch(() => undefined);
    refresh();
    // Back from the Settings app: say what it is now.
    const subscription = AppState.addEventListener("change", (next) => { if (next === "active") refresh(); });
    return () => { alive = false; subscription.remove(); };
  }, [phone]);
  if (!phone || !state || (afterCard && state === "on")) return null;
  const act = async (action: () => Promise<PhoneReminderState | void>) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await action();
      if (next) setState(next);
    } catch {
      toast.error(t("scheduledTasks.failed"));
    } finally {
      setBusy(false);
    }
  };
  const line = phoneLine(state, afterCard);
  if (!line) return null;
  if (state === "on") {
    return <View style={[styles.dev]} testID="phone-reminder-on">
      <UiText style={[styles.icon, styles.iconOk]}>✓</UiText>
      <View style={styles.text}>
        <UiText style={styles.devTitle}>{t(line.title)}</UiText>
        <UiText style={styles.devBody}>{t("scheduledTasks.phoneStopLead")}<UiText accessibilityRole="button" style={styles.link} onPress={() => void act(() => phone.stop())}>{t(line.action)}</UiText></UiText>
      </View>
    </View>;
  }
  const blocked = state === "blocked";
  return <View style={styles.dev} testID={`phone-reminder-${state}`}>
    <UiText style={[styles.icon, blocked && styles.iconNo]}>{blocked ? "!" : "?"}</UiText>
    <View style={styles.text}>
      <UiText style={styles.devTitle}>{line.lead ? t(line.lead) : ""}{t(line.title)}</UiText>
      {line.body ? <UiText style={styles.devBody}>{t(line.body)}</UiText> : null}
      <UiPressable accessibilityRole="button" disabled={busy} style={[styles.button, blocked && styles.buttonLine]} onPress={() => void act(blocked ? () => phone.openSettings() : () => phone.allow())}>
        <UiText style={blocked ? styles.buttonLineText : styles.buttonText}>{t(line.action)}</UiText>
      </UiPressable>
    </View>
  </View>;
}

type PhoneLineKey = "scheduledTasks.turnedOn" | "scheduledTasks.phoneOn" | "scheduledTasks.phoneStop" | "scheduledTasks.phoneBlocked" | "scheduledTasks.phoneBlockedBody" | "scheduledTasks.phoneSettings" | "scheduledTasks.phoneOff" | "scheduledTasks.phoneOffBody" | "scheduledTasks.phoneTurnOn" | "scheduledTasks.turnedOnNotAsked" | "scheduledTasks.phoneNotAsked" | "scheduledTasks.phoneNotAskedBody" | "scheduledTasks.phoneAllow";

/** What this phone's line says in each state (draft 16-3, App; 16-2 under a card). Null: no line. */
export function phoneLine(state: PhoneReminderState, afterCard: boolean): { lead: PhoneLineKey | null; title: PhoneLineKey; body: PhoneLineKey | null; action: PhoneLineKey } | null {
  const lead = afterCard ? "scheduledTasks.turnedOn" : null;
  if (state === "on") return afterCard ? null : { action: "scheduledTasks.phoneStop", body: null, lead: null, title: "scheduledTasks.phoneOn" };
  if (state === "blocked") return { action: "scheduledTasks.phoneSettings", body: "scheduledTasks.phoneBlockedBody", lead, title: "scheduledTasks.phoneBlocked" };
  if (state === "off") return { action: "scheduledTasks.phoneTurnOn", body: "scheduledTasks.phoneOffBody", lead, title: "scheduledTasks.phoneOff" };
  return { action: "scheduledTasks.phoneAllow", body: "scheduledTasks.phoneNotAskedBody", lead, title: afterCard ? "scheduledTasks.turnedOnNotAsked" : "scheduledTasks.phoneNotAsked" };
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { gap: 12 },
  head: { alignItems: "center", flexDirection: "row", gap: 12 },
  main: { flex: 1, gap: 4 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  sub: { color: colors.ink2, fontSize: 14, lineHeight: 21 },
  dev: { alignItems: "flex-start", backgroundColor: colors.surface2, borderRadius: 14, flexDirection: "row", gap: 10, padding: 14 },
  icon: { backgroundColor: colors.surface3, borderRadius: 12, color: colors.ink2, fontSize: 13, fontWeight: "700", height: 24, lineHeight: 24, overflow: "hidden", textAlign: "center", width: 24 },
  iconOk: { backgroundColor: colors.macTeal, color: colors.macTealText },
  iconNo: { backgroundColor: colors.coralSoft, color: colors.coralText },
  text: { flex: 1, gap: 4 },
  devTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  devBody: { color: colors.ink2, fontSize: 13, lineHeight: 20 },
  link: { color: colors.accentText, fontSize: 13, fontWeight: "700" },
  button: { alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 20, marginTop: 6, minHeight: 40, justifyContent: "center", paddingHorizontal: 16 },
  buttonLine: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth },
  buttonText: { color: colors.surface, fontSize: 14, fontWeight: "700" },
  buttonLineText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
}));
