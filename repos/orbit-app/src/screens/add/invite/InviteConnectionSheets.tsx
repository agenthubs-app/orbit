// R15 招待でつながった相手 (DESIGN add-and-invite §2.6, §9 #32; b9 A5 ④⑤): two sheets for R11's contact detail
// (「⋯ › 共有する項目」 and 「⋯ › つながりを解除」). R15 only provides them (shown on /showcase/components);
// R11 mounts them on the detail page.
//   - InviteShareSheet: what I share with this person (名前 always; switches for what my profile has),
//     loaded from GET /api/invite-codes/connections/<contactId>; 保存 = PUT …/share (keys only, idempotent;
//     the next sync round updates their side). Fields I rewrote myself are listed as no longer synced.
//   - InviteUnlinkSheet: the consequences (their network too, no notification; no more updates; my notes
//     can stay), 「名前と会社だけの連絡先として残す」 on by default, POST …/unlink. A backdrop tap or a drag does
//     not close it, and screen-reader focus starts on キャンセル.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, View } from "react-native";

import type { InviteConnectionView, InviteSharedFieldKey, InviteSharedFields, InviteUnlinkResult } from "../../../api/contract/invite-codes";
import { BottomSheet, Button, Checkbox, Icon, RetryCard, Skeleton, UiText, useToast, type IconName } from "../../../components/ui";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../../i18n/standard-copy";
import { Caption, useAddColors, useAddStyles } from "../add-ui";
import { useInviteApi, type InviteApi } from "./invite-api";
import { INVITE_KEY_COPY, inviteFieldsFromProfile, inviteKeysWithValues, newInviteKey, orderedInviteKeys, toggleInviteKey } from "./invite-model";
import { InviteKeySwitches } from "./InviteSenderScreen";

type ShareState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "notLinked" }
  | { kind: "ready"; connection: InviteConnectionView; mine: InviteSharedFields | null };

export function InviteShareSheet({ visible, contactId, name, onClose, onSaved, api: injected }: {
  visible: boolean;
  contactId: string;
  /** The other person's name (「〇〇さんに見せる情報」). */
  name: string;
  onClose: () => void;
  onSaved?: (connection: InviteConnectionView) => void;
  api?: InviteApi;
}) {
  const fallbackApi = useInviteApi();
  const api = injected ?? fallbackApi;
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const { styles } = useAddStyles();
  const [state, setState] = useState<ShareState>({ kind: "loading" });
  const [keys, setKeys] = useState<InviteSharedFieldKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"sample" | null>(null);
  const saveKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setNotice(null);
    const [connection, me] = await Promise.all([api.connection(contactId), api.profile()]);
    if (!connection.ok) {
      setState(connection.status === 404 ? { kind: "notLinked" } : { kind: "failed" });
      return;
    }
    setKeys(orderedInviteKeys(connection.data.sharedByMe));
    setState({ connection: connection.data, kind: "ready", mine: me.ok ? inviteFieldsFromProfile(me.data.profile) : null });
  }, [api, contactId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const ready = state.kind === "ready" ? state : null;
  // A key already shared stays switchable even when the profile no longer has a value behind it.
  const available = useMemo(() => (ready ? orderedInviteKeys([...inviteKeysWithValues(ready.mine), ...ready.connection.sharedByMe]) : []), [ready]);
  const paused = ready?.connection.pausedFields ?? [];

  const save = async () => {
    setBusy(true);
    setNotice(null);
    saveKey.current ??= newInviteKey("invite-share");
    const result = await api.updateShare(contactId, { idempotencyKey: saveKey.current, sharedKeys: orderedInviteKeys(keys) });
    setBusy(false);
    saveKey.current = null;
    if (result.ok) {
      toast.success(t("add.inviteConn.shareSaved"));
      onSaved?.(result.data);
      onClose();
      return;
    }
    if (result.reason === "SAMPLE_READ_ONLY") setNotice("sample");
    else toast.error(t("add.inviteConn.shareFailed"));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("add.inviteConn.shareTitle")}>
      <View style={styles.stack} testID="invite-share-sheet">
        <UiText accessibilityRole="header" style={styles.title}>{t("add.inviteConn.shareTitle")}</UiText>
        <Caption>{t("add.inviteConn.shareSub", { name })}</Caption>
        {state.kind === "loading" ? <Skeleton lines={3} /> : null}
        {state.kind === "failed" ? <RetryCard title={t("add.inviteConn.loadFailed")} onRetry={() => void load()} /> : null}
        {state.kind === "notLinked" ? <View testID="invite-share-not-linked"><UiText style={styles.body}>{t("add.inviteConn.notLinked")}</UiText></View> : null}
        {ready ? (
          <>
            <InviteKeySwitches name={ready.mine?.displayName ?? ""} fields={ready.mine} available={available} keys={keys} onToggle={(key, on) => setKeys((current) => toggleInviteKey(current, key, on))} />
            {paused.length ? (
              <View testID="invite-share-paused"><Caption>{t("add.inviteConn.paused", { labels: paused.map((key) => t(INVITE_KEY_COPY[key])).join(t("add.invite.listSeparator")) })}</Caption></View>
            ) : null}
            <Caption>{t("add.inviteConn.shareHint")}</Caption>
            {notice ? <View testID="invite-share-sample"><Caption tone="error">{t("add.inviteConn.sampleReadOnly")}</Caption></View> : null}
            <View testID="invite-share-save"><Button label={copy.action.save} variant="primary" block loading={busy} onPress={() => void save()} /></View>
          </>
        ) : null}
        <Button label={copy.action.cancel} variant="ghost" block onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const ignoreDismiss = () => undefined;

export function InviteUnlinkSheet({ visible, contactId, name, onClose, onUnlinked, api: injected }: {
  visible: boolean;
  contactId: string;
  name: string;
  onClose: () => void;
  onUnlinked?: (result: InviteUnlinkResult) => void;
  api?: InviteApi;
}) {
  const fallbackApi = useInviteApi();
  const api = injected ?? fallbackApi;
  const { t } = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const colors = useAddColors();
  const { styles } = useAddStyles();
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState(false);
  const unlinkKey = useRef<string | null>(null);
  const cancelRef = useRef<View>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (visible) return;
    // Every opening starts from the default (keep as a contact) and moves focus to キャンセル again.
    focused.current = false;
    setKeep(true);
    setSample(false);
  }, [visible]);

  const focusCancel = () => {
    if (focused.current) return;
    focused.current = true;
    // One frame later: VoiceOver ignores focus requests during the presenting layout (same as ActionSheet).
    requestAnimationFrame(() => { const handle = findNodeHandle(cancelRef.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); });
  };

  const unlink = async () => {
    setBusy(true);
    setSample(false);
    unlinkKey.current ??= newInviteKey("invite-unlink");
    const result = await api.unlink(contactId, { idempotencyKey: unlinkKey.current, keepAsContact: keep });
    setBusy(false);
    if (result.ok) {
      unlinkKey.current = null;
      toast.success(t("add.inviteConn.unlinked"));
      onUnlinked?.(result.data);
      onClose();
      return;
    }
    unlinkKey.current = null;
    if (result.reason === "SAMPLE_READ_ONLY") setSample(true);
    else toast.error(t("add.inviteConn.unlinkFailed"));
  };

  const effects: [IconName, string][] = [
    ["users", t("add.inviteConn.unlinkEffect1")],
    ["refresh", t("add.inviteConn.unlinkEffect2")],
    ["note", t("add.inviteConn.unlinkEffect3")],
  ];
  return (
    // Destructive confirm: a backdrop tap, a drag or the back gesture does not close it (DESIGN §9 #32); キャンセル does.
    <BottomSheet visible={visible} onClose={ignoreDismiss} accessibilityLabel={t("add.inviteConn.unlinkTitle", { name })}>
      <View style={styles.stack} testID="invite-unlink-sheet">
        <View style={styles.centered}>
          <UiText accessibilityRole="header" style={styles.title}>{t("add.inviteConn.unlinkTitle", { name })}</UiText>
          <Caption>{t("add.inviteConn.unlinkSub")}</Caption>
        </View>
        {effects.map(([icon, text]) => (
          <View key={text} style={styles.row}>
            <Icon name={icon} size={16} color={colors.ink3Text} />
            <View style={styles.grow}><UiText style={styles.body}>{text}</UiText></View>
          </View>
        ))}
        <View style={styles.row} testID="invite-unlink-keep">
          <Checkbox checked={keep} onChange={setKeep} accessibilityLabel={t("add.inviteConn.keepAsContact")} />
          <View style={styles.grow}><UiText style={styles.body}>{t("add.inviteConn.keepAsContact")}</UiText></View>
        </View>
        {sample ? <View testID="invite-unlink-sample"><Caption tone="error">{t("add.inviteConn.sampleReadOnly")}</Caption></View> : null}
        <View testID="invite-unlink-confirm"><Button label={t("add.inviteConn.unlink")} variant="danger" block loading={busy} onPress={() => void unlink()} /></View>
        <View ref={cancelRef} collapsable={false} onLayout={focusCancel} testID="invite-unlink-cancel">
          <Button label={copy.action.cancel} block disabled={busy} onPress={onClose} />
        </View>
      </View>
    </BottomSheet>
  );
}
