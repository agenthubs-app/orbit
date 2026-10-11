// R15 复核 S1 「同じ人かも」: a redeemed invite always makes a new 本人入力 contact; when my network already has
// someone who may be the same person, the server only suggests it (InviteConnectionView / history joined
// `mergeSuggestion`). The owner decides here: 統合する (POST …/merge — existing values are kept, empty ones are
// filled) or 別の人 (POST …/merge/dismiss). Used by the sender's これまでのコード and by InviteShareSheet.
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";

import type { InviteConnectionView, InviteMergeSuggestion } from "../../../api/contract/invite-codes";
import { Button, Icon, UiText, useToast } from "../../../components/ui";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../../i18n/standard-copy";
import { useAddColors, useAddStyles } from "../add-ui";
import type { InviteApi } from "./invite-api";
import { newInviteKey } from "./invite-model";

type MergeAction = "merge" | "dismiss";

/**
 * 統合する / 別の人 with one idempotency key per contact and action (a retry after a failure reuses it);
 * a failure says so with the common 「保存できませんでした」 and returns null.
 */
export function useInviteMerge(api: InviteApi) {
  const toast = useToast();
  const { t } = useOrbitLocale();
  const standard = useStandardCopy();
  const [busyId, setBusyId] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());

  const run = useCallback(async (action: MergeAction, contactId: string): Promise<InviteConnectionView | null> => {
    const slot = `${action}:${contactId}`;
    const idempotencyKey = keys.current.get(slot) ?? newInviteKey(`invite-${action}`);
    keys.current.set(slot, idempotencyKey);
    setBusyId(contactId);
    const result = action === "merge" ? await api.merge(contactId, { idempotencyKey }) : await api.dismissMerge(contactId, { idempotencyKey });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.reason === "SAMPLE_READ_ONLY" ? t("add.inviteConn.sampleReadOnly") : standard.toast.saveFailed);
      return null;
    }
    keys.current.delete(slot);
    if (action === "merge") toast.success(t("add.inviteConn.merged"));
    return result.data;
  }, [api, standard, t, toast]);

  return {
    busyId,
    merge: useCallback((contactId: string) => run("merge", contactId), [run]),
    dismiss: useCallback((contactId: string) => run("dismiss", contactId), [run]),
  };
}

/** 「同じ人かも：<my existing contact>」 + 統合する / 別の人 (disabled while either runs). */
export function InviteMergeSuggestionRow({ contactId, suggestion, busy, onMerge, onDismiss }: {
  /** The contact the invite made (the one 統合する / 別の人 act on). */
  contactId: string;
  suggestion: InviteMergeSuggestion;
  busy: boolean;
  onMerge: () => void;
  onDismiss: () => void;
}) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const colors = useAddColors();
  return (
    <View style={styles.notice} testID={`invite-merge-${contactId}`}>
      <Icon name="users" size={16} color={colors.ink3Text} />
      <View style={[styles.grow, styles.tightStack]}>
        <UiText style={styles.body}>{t("add.inviteConn.maybeSame", { name: suggestion.displayName })}</UiText>
        <View style={styles.row}>
          <Button label={t("add.inviteConn.merge")} size="sm" variant="primary" disabled={busy} onPress={onMerge} />
          <Button label={t("add.inviteConn.notSame")} size="sm" variant="ghost" disabled={busy} onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}
