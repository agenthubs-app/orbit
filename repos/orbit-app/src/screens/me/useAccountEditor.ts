import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { profileSaveReceiptSchema, type ProfileSaveRequest } from "../../api/profile-detail-contract";
import { clearProfileEditSession, completeProfileEditSave, getProfileEditSession, prepareProfileEditSave, recordProfileEditSaveFailure, updateProfileEditDraft, validateProfileEditDraft, type ProfileEditDraft } from "../../data/profile-edit-session";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useProfileEditSessionScreen } from "../profile/useProfileEditSessionScreen";
import { useAccountPath } from "./useAccountProfile";

export function useAccountEditor(readOffline = false) {
  const path = useAccountPath();
  const state = useProfileEditSessionScreen({ path, readOffline });
  const { t } = useOrbitLocale();
  const client = useOrbitApiClient({ scopeKey: JSON.stringify([state.scope, path]) });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const current = useRef(client); current.current = client;
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(() => { const controller = new AbortController(); abort.current = controller; busy.current = false; setSaving(false); setFeedback(null); return () => controller.abort(); }, [client]);
  const offline = state.copy?.offline === true || state.resource.kind === "offline";
  const invalid = state.session ? validateProfileEditDraft(state.session.draft) : ["displayName"];
  function patch(fields: Partial<ProfileEditDraft>) {
    if (!state.scope || current.current !== client) return;
    updateProfileEditDraft(state.scope, fields); state.syncSession(); setFeedback(null);
  }
  async function save(): Promise<boolean> {
    if (!state.scope || !state.baseProfile || current.current !== client || busy.current || offline) return false;
    const scope = state.scope;
    const session = getProfileEditSession(scope);
    if (!session || !session.dirtyFields.length || validateProfileEditDraft(session.draft).length) return false;
    let attempt: ReturnType<typeof prepareProfileEditSave>;
    try { attempt = prepareProfileEditSave(scope, () => Crypto.randomUUID()); }
    catch { setFeedback(t("me.saveError")); return false; }
    if (!attempt) return false;
    const draft = JSON.stringify(session.draft);
    const controller = abort.current;
    const signal = controller?.signal;
    busy.current = true; setSaving(true); setFeedback(null);
    try {
      const result = await client.put<unknown>(path, { body: attempt.body, ...(signal ? { signal } : {}) });
      if (signal?.aborted || current.current !== client) return false;
      const receipt = result.success ? profileSaveReceiptSchema(state.baseProfile.id, attempt.body as ProfileSaveRequest).safeParse(result.data) : null;
      if (!receipt?.success) {
        const message = result.status === 409 ? t("profile.saveConflict") : t("me.saveError");
        recordProfileEditSaveFailure(scope, attempt.body.mutationId, result.status, message); setFeedback(message); state.syncSession();
        return false;
      }
      if (JSON.stringify(getProfileEditSession(scope)?.draft) !== draft) {
        recordProfileEditSaveFailure(scope, attempt.body.mutationId, 409, t("profile.saveConflict"));
        setFeedback(t("profile.saveConflict")); state.syncSession(); return false;
      }
      if (!completeProfileEditSave(scope, attempt.body.mutationId)) return false;
      state.syncSession(); state.refresh(); return true;
    } catch {
      if (!signal?.aborted && current.current === client) { recordProfileEditSaveFailure(scope, attempt.body.mutationId, 503, t("me.saveError")); setFeedback(t("me.saveError")); }
      return false;
    } finally { if (abort.current === controller) { busy.current = false; if (current.current === client) setSaving(false); } }
  }
  function reload() { if (current.current !== client) return; if (state.scope) clearProfileEditSession(state.scope); state.syncSession(); state.refresh(); setFeedback(null); }
  return { ...state, path, patch, save, reload, saving, feedback, offline, canSave: Boolean(state.session?.dirtyFields.length && !offline && !saving && !invalid.length) };
}
