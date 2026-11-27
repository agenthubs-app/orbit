import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { invalidProfileContactMethods, PROFILE_CONTACT_METHODS, type ProfileContactMethod } from "../../api/compute/profile-contact-methods";
import type { ContactHandlesContract } from "../../api/contract/profile";
import { profileSaveReceiptSchema, type ProfileSaveRequest } from "../../api/profile-detail-contract";
import { clearProfileEditSession, completeProfileEditSave, getProfileEditSession, prepareProfileEditSave, recordProfileEditSaveFailure, updateProfileEditDraft, validateProfileEditDraft, type ProfileEditDraft } from "../../data/profile-edit-session";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useProfileEditSessionScreen } from "../profile/useProfileEditSessionScreen";
import { useAccountPath } from "./useAccountProfile";

const HANDLE_ORDER = ["email", "phone", "wechatId", "lineId", "website", "linkedinUrl", "xHandle"] as const satisfies readonly (keyof ContactHandlesContract)[];
const contactKey = (handles: ContactHandlesContract | undefined) => JSON.stringify(PROFILE_CONTACT_METHODS.map(key => (handles?.[key] ?? "").trim()));

/**
 * 「保存即确认」（2026-11-27，同 Web 44c694152）：四种联系方式改过才带 contactMethodsConfirmed: true，handles 整体替换——
 * 其他项（网站等）照旧带上，四种去首尾空格、空的不写；服务端：有一种有效 = 确认，全空 = 撤销。没改过就照原样，不带标记。
 */
function contactSave(base: ContactHandlesContract | undefined, draft: ContactHandlesContract | undefined): { handles: ContactHandlesContract; contactMethodsConfirmed: true } | null {
  if (contactKey(base) === contactKey(draft)) return null;
  // 键按回执 schema 的顺序排（回执核对按 JSON 逐字段比较）。
  const handles = Object.fromEntries(HANDLE_ORDER.flatMap(key => {
    const value = (draft?.[key] ?? "").trim();
    if (!value) return [];
    return [[key, PROFILE_CONTACT_METHODS.includes(key as ProfileContactMethod) ? value : draft?.[key] ?? ""]];
  })) as ContactHandlesContract;
  return { handles, contactMethodsConfirmed: true };
}

export function useAccountEditor(readOffline = false) {
  const path = useAccountPath();
  const state = useProfileEditSessionScreen({ path, readOffline });
  const { t } = useOrbitLocale();
  const client = useOrbitApiClient({ scopeKey: JSON.stringify([state.scope, path]) });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // 点过保存才标联系方式的格式错误（UR-P13）；改对哪一栏，那一栏的提示就消失。
  const [contactAttempted, setContactAttempted] = useState(false);
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
    const contact = contactSave(state.baseProfile.handles, session.draft.handles);
    if (contact) {
      const bad = invalidProfileContactMethods(contact.handles).filter(key => key === "email" || key === "phone");
      if (bad.length) { setContactAttempted(true); setFeedback(t(bad[0] === "email" ? "onboarding.v3.checkEmailFormat" : "onboarding.v3.checkPhoneFormat")); return false; }
    }
    let attempt: ReturnType<typeof prepareProfileEditSave>;
    try { attempt = prepareProfileEditSave(scope, () => Crypto.randomUUID()); }
    catch { setFeedback(t("me.saveError")); return false; }
    if (!attempt) return false;
    const draft = JSON.stringify(session.draft);
    const controller = abort.current;
    const signal = controller?.signal;
    busy.current = true; setSaving(true); setFeedback(null);
    try {
      const body = contact ? { ...attempt.body, handles: contact.handles } : attempt.body;
      const result = await client.put<unknown>(path, { body: contact ? { ...body, contactMethodsConfirmed: true } : body, ...(signal ? { signal } : {}) });
      if (signal?.aborted || current.current !== client) return false;
      // 回执里没有 contactMethodsConfirmed（不进资料），核对时用不带它的请求。
      const receipt = result.success ? profileSaveReceiptSchema(state.baseProfile.id, body as ProfileSaveRequest).safeParse(result.data) : null;
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
  const contactErrors = contactAttempted && state.session
    ? invalidProfileContactMethods(state.session.draft.handles ?? {}).filter((key): key is "email" | "phone" => key === "email" || key === "phone")
    : [];
  return { ...state, path, patch, save, reload, saving, feedback, offline, contactErrors, canSave: Boolean(state.session?.dirtyFields.length && !offline && !saving && !invalid.length) };
}
