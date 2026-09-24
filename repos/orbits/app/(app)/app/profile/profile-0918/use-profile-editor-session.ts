"use client";

import { useEffect, useRef, useState } from "react";

import type { ProfileDocumentExtractionPayload } from "../../../../../features/profile/extraction-contract";
import type { IndustrySelectionContract } from "../../../../../shared/contract/industries";
import type {
  ManualProfileUpdateInput,
  ProfilePayload,
} from "../../../../../features/profile/contract";
import {
  profileEditorReadbackMatches,
  profileEditorUpdateInput,
  profileEditorViewFromPayload,
  type OrbitProfileEditorView,
  type OrbitProfileEditorViewModel,
  type ProfileEditorField,
  type ProfileEditorSaveScope,
  type ProfileEditorVisibleHandleKey,
} from "../profile-editor-adapter";
import type { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitProfileView } from "../../orbit-profile-route-view-model";
import { profileContinuationPath } from "../profile-onboarding-navigation";
import {
  emptyProfileAfterReload,
  mergeProfilePreservingDraft,
  profileSaveFailureKind,
  profileSaveScopeFields,
  validateProfileSaveDraft,
} from "../profile-save-model";
import { ONBOARDING_FIELD_LABEL } from "./profile-model";

type Translate = ReturnType<typeof useOrbitLanguage>["t"];

type TagField = "offering" | "seeking" | "topics";
type Method = "text" | "manual";
// warning = 保存后仍不完整（唯一的新增分支）
type NoticeKind = "error" | "info" | "success" | "warning";
type EditableProfile = OrbitProfileEditorView;

interface ApiEnvelope<TData> {
  success?: boolean;
  data?: TData;
  error?: {
    code?: string;
    message?: string;
  };
}

export const profileReadbackMatches = profileEditorReadbackMatches;

function applyExtractionDraft(
  profile: EditableProfile,
  payload: ProfileDocumentExtractionPayload,
): EditableProfile {
  const draft = payload.draft;
  if (!draft) return profile;

  return {
    ...profile,
    company: draft.organization || profile.company,
    fullName: draft.displayName || profile.fullName,
    title: draft.role || profile.title,
  };
}

export interface ProfileEditorSession {
  profile: OrbitProfileEditorView;
  dirtyFields: Set<ProfileEditorField>;
  matchingDirty: boolean;
  editorDisabled: boolean;
  industryReady: boolean;
  setIndustryReady: (v: boolean) => void;
  saving: boolean;
  matchingSaving: boolean;
  reloading: boolean;
  requiresReconcile: boolean;
  extracting: boolean;
  message: string;
  messageKind: NoticeKind;
  notify(kind: NoticeKind, text: string): void;
  method: Method;
  setMethod: (m: Method) => void;
  extractText: string;
  setExtractText: (v: string) => void;
  update<K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]): void;
  updateBirthDate(value: string): void;
  updateIndustry(sel: IndustrySelectionContract): void;
  toggleTag(field: TagField, tag: string): void;
  saveProfile(scope: ProfileEditorSaveScope): Promise<void>;
  reloadLatestProfile(): Promise<void>;
  onTextExtract(): Promise<void>;
  onboardingNext?: string;
}

/* 原样抽自 orbit-real-profile.tsx `OrbitRealProfile`（936–1329 行）：
   状态、加载、update/updateBirthDate/updateIndustry/toggleTag、saveProfile、
   reloadLatestProfile、文本提取、消息。`t` 由调用方传入。 */
export function useProfileEditorSession({
  onboardingNext,
  t,
  viewModel,
}: {
  onboardingNext?: string;
  t: Translate;
  viewModel: OrbitProfileEditorViewModel;
}): ProfileEditorSession {
  const initialView = viewModel as OrbitProfileEditorViewModel;
  const initialProfile: EditableProfile = {
    ...initialView.profile,
    birthDate: initialView.profile.birthDate ?? null,
    expectedUpdatedAt: initialView.profile.expectedUpdatedAt ?? null,
    handles: initialView.profile.handles ? { ...initialView.profile.handles } : undefined,
    hasPersistedProfile: initialView.profile.hasPersistedProfile ?? false,
    onboarding: initialView.profile.onboarding ?? {
      policyVersion: 1,
      status: "incomplete",
      missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"],
    },
    offering: [...initialView.profile.offering],
    seeking: [...initialView.profile.seeking],
    topics: [...initialView.profile.topics],
  };
  const [profile, setProfile] = useState<EditableProfile>(initialProfile);
  const [dirtyFields, setDirtyFields] = useState<Set<ProfileEditorField>>(() =>
    initialProfile.hasPersistedProfile
      ? new Set<ProfileEditorField>()
      : new Set<ProfileEditorField>(["displayName"]),
  );
  const [dirtyHandleFields, setDirtyHandleFields] = useState<Set<ProfileEditorVisibleHandleKey>>(new Set());
  const [industryReady, setIndustryReady] = useState(false);
  const [method, setMethod] = useState<Method>("manual");
  const [extractText, setExtractText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matchingSaving, setMatchingSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [requiresReconcile, setRequiresReconcile] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<NoticeKind>("info");
  const mountedRef = useRef(true);
  const operationEpoch = useRef(0);
  const reloadInFlight = useRef<number | null>(null);
  const saveInFlight = useRef<number | null>(null);
  const pendingSave = useRef<{
    fingerprint: string;
    input: ManualProfileUpdateInput;
    scope: ProfileEditorSaveScope;
  } | null>(null);
  const editorDisabled = !industryReady || extracting || saving || matchingSaving || reloading || requiresReconcile;

  function knownOnboarding(value: ProfilePayload["onboarding"]): value is NonNullable<ProfilePayload["onboarding"]> {
    return Boolean(
      value &&
        value.policyVersion === 1 &&
        (value.status === "complete" || value.status === "incomplete") &&
        Array.isArray(value.missingFields),
    );
  }

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    const loadEpoch = ++operationEpoch.current;
    // Re-read the actor-scoped profile so the editor starts from the real
    // revision, private birthday, and complete hidden handle object.
    void (async () => {
      try {
        const response = await fetch("/api/profile", { cache: "no-store", headers: { accept: "application/json" } });
        const envelope = await response.json() as ApiEnvelope<ProfilePayload>;
        if (!response.ok || envelope.success !== true || !envelope.data || !knownOnboarding(envelope.data.onboarding)) {
          throw new Error("Profile read failed");
        }
        if (!active || !mountedRef.current || operationEpoch.current !== loadEpoch) return;
        if (envelope.data.profile) {
          setProfile(current => profileEditorViewFromPayload(current, envelope.data!));
          setDirtyFields(new Set());
          setDirtyHandleFields(new Set());
        } else {
          setProfile(current => ({
            ...current,
            birthDate: null,
            expectedUpdatedAt: null,
            hasPersistedProfile: false,
            onboarding: envelope.data!.onboarding!,
            primaryIndustryId: undefined,
            secondaryIndustryId: undefined,
          }));
          setDirtyFields(current => new Set(current).add("displayName"));
          setDirtyHandleFields(new Set());
        }
        setIndustryReady(true);
      } catch {
        if (!active || !mountedRef.current || operationEpoch.current !== loadEpoch) return;
        setMessageKind("error");
        setMessage(t({ en: "Could not load your profile policy. Reload before saving.", zh: "资料政策读取失败，请刷新后再保存。" }));
      }
    })();
    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, []);

  function markDirty(field: ProfileEditorField) {
    setDirtyFields(current => new Set(current).add(field));
  }

  function update<K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]) {
    if (editorDisabled) return;
    const editorField: Partial<Record<keyof OrbitProfileView, ProfileEditorField>> = {
      bio: "bio",
      company: "organization",
      fullName: "displayName",
      title: "role",
      wechatName: "handles",
      lineId: "handles",
    };
    const dirty = editorField[field];
    setProfile((current) => ({ ...current, [field]: value }));
    if (dirty) markDirty(dirty);
    if (field === "lineId" || field === "wechatName") {
      setDirtyHandleFields(current => new Set(current).add(field === "lineId" ? "lineId" : "wechatId"));
    }
  }

  function updateBirthDate(value: string) {
    if (editorDisabled) return;
    setProfile(current => ({ ...current, birthDate: value || null }));
    markDirty("birthDate");
  }

  function updateIndustry(selection: IndustrySelectionContract) {
    if (editorDisabled) return;
    setProfile(current => ({ ...current, ...selection }));
    if (selection.primaryIndustryId !== undefined) markDirty("primaryIndustryId");
    if (selection.secondaryIndustryId !== undefined) markDirty("secondaryIndustryId");
  }

  function toggleTag(field: TagField, tag: string) {
    if (editorDisabled) return;
    setProfile((current) => {
      const values = current[field];
      return { ...current, [field]: values.includes(tag) ? values.filter((value) => value !== tag) : [...values, tag] };
    });
    markDirty(field);
  }

  async function extractProfile(
    input: { fileName: string; mimeType: string; text?: string },
  ) {
    if (editorDisabled || extracting) return;
    setExtracting(true);
    setMessage("");

    try {
      const response = await fetch("/api/profile/extractions/resume", {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const envelope =
        (await response.json()) as ApiEnvelope<ProfileDocumentExtractionPayload>;

      if (!response.ok || envelope.success !== true || !envelope.data) {
        throw new Error(
          envelope.error?.message ||
            t({ en: "Profile extraction failed.", zh: "档案提取失败。" }),
        );
      }

      if (envelope.data.state !== "success" || !envelope.data.draft) {
        setMessageKind("info");
        setMessage(
          t({
            en: "No profile fields were extracted. Your profile was not changed.",
            zh: "未提取到档案字段，你的档案没有发生变化。",
          }),
        );
        return;
      }

      const draft = envelope.data.draft;
      setProfile((current) => applyExtractionDraft(current, envelope.data!));
      if (draft?.displayName) markDirty("displayName");
      if (draft?.organization) markDirty("organization");
      if (draft?.role) markDirty("role");
      setMessageKind("info");
      setMessage(
        t({
          en: "Extracted draft fields were filled into the form. Review them before saving.",
          zh: "提取出的草稿字段已填入表单，请复核后再保存。",
        }),
      );
    } catch (error) {
      setMessageKind("error");
      setMessage(
        error instanceof Error
          ? error.message
          : t({ en: "Profile extraction failed.", zh: "档案提取失败。" }),
      );
    } finally {
      setExtracting(false);
    }
  }

  async function onTextExtract() {
    if (editorDisabled) return;
    const text = extractText.trim();
    if (!text) {
      setMessageKind("error");
      setMessage(
        t({
          en: "Paste profile text before extracting.",
          zh: "请先粘贴档案文本再提取。",
        }),
      );
      return;
    }

    await extractProfile({
      fileName: "pasted-profile.txt",
      mimeType: "text/plain",
      text,
    });
  }

  async function saveProfile(scope: ProfileEditorSaveScope) {
    if (editorDisabled || reloadInFlight.current !== null || saveInFlight.current !== null) return;
    const scopeFields = profileSaveScopeFields(scope);
    const scopeDirty = new Set([...dirtyFields].filter(field => scopeFields.has(field)));
    if (scopeDirty.size === 0) {
      setMessageKind("info");
      setMessage(t({ en: "There are no changes in this section.", zh: "此区块没有待保存的修改。" }));
      return;
    }
    const dirtyHandleFieldsAtSave = new Set(dirtyHandleFields);
    const validation = validateProfileSaveDraft({ profile, scope, scopeDirty });
    if (validation.ok === false) {
      setMessageKind("error");
      setMessage(t(validation.message));
      return;
    }

    const newInput = profileEditorUpdateInput({
      dirtyFields: scopeDirty,
      expectedUpdatedAt: profile.expectedUpdatedAt,
      mutationId: globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}`,
      profile,
      scope,
    });
    const inputFingerprint = JSON.stringify({ ...newInput, mutationId: undefined });
    const pending = pendingSave.current;
    const updateInput = pending?.scope === scope && pending.fingerprint === inputFingerprint
      ? pending.input
      : newInput;
    const saveEpoch = ++operationEpoch.current;
    saveInFlight.current = saveEpoch;
    pendingSave.current = { fingerprint: inputFingerprint, input: updateInput, scope };
    if (scope === "basic") setSaving(true); else setMatchingSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        body: JSON.stringify(updateInput),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const envelope = (await response.json()) as ApiEnvelope<ProfilePayload>;
      if (!mountedRef.current || operationEpoch.current !== saveEpoch) return;

      if (!response.ok || envelope.success !== true || !envelope.data) {
        if (profileSaveFailureKind(response.status, envelope.error?.code) === "conflict") {
          setRequiresReconcile(true);
          throw new Error(t({ en: "This profile changed elsewhere. Reload the latest profile before saving this draft.", zh: "资料已在其他位置发生变化，请先刷新最新资料，再处理当前草稿。" }));
        }
        throw new Error(envelope.error?.message || t({ en: "Profile save failed.", zh: "档案保存失败。" }));
      }
      if (envelope.data.mutationId !== updateInput.mutationId) {
        throw new Error(t({ en: "The save receipt could not be verified. Retry the same draft.", zh: "保存回执无法核验，请使用相同草稿重试。" }));
      }

      const readbackResponse = await fetch("/api/profile", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const readback = (await readbackResponse.json()) as ApiEnvelope<ProfilePayload>;
      if (!mountedRef.current || operationEpoch.current !== saveEpoch) return;
      if (!readbackResponse.ok || readback.success !== true || !readback.data || !knownOnboarding(readback.data.onboarding) || !profileEditorReadbackMatches(updateInput, readback.data)) {
        throw new Error(t({ en: "The save could not be verified by reading the profile back.", zh: "保存结果无法通过重新读取资料完成核验。" }));
      }
      const matchingDraftAtSave = [...dirtyFields].some((field) =>
        field === "offering" || field === "seeking" || field === "topics",
      );
      const shouldContinue =
        scope === "basic" &&
        Boolean(onboardingNext) &&
        readback.data.onboarding.status === "complete" &&
        !matchingDraftAtSave;

      setProfile(current => mergeProfilePreservingDraft({
        current,
        dirtyHandleFields: dirtyHandleFieldsAtSave,
        latest: profileEditorViewFromPayload(current, readback.data!),
        preserve: new Set([...dirtyFields].filter(field => !scopeFields.has(field))),
      }));
      setDirtyFields(current => {
        const next = new Set(current);
        for (const field of scopeFields) next.delete(field);
        return next;
      });
      if (scope === "basic") setDirtyHandleFields(new Set());
      pendingSave.current = null;
      setRequiresReconcile(false);
      if (scope === "basic" && readback.data.onboarding.status !== "complete") {
        // 唯一的新增分支（已批准）：基础资料保存成功但仍不完整 → 琥珀色提示，不显示绿色成功、不跳转。
        const missing = readback.data.onboarding.missingFields
          .map((code) => t(ONBOARDING_FIELD_LABEL[code]))
          .join(t({ en: ", ", zh: "、" }));
        setMessageKind("warning");
        setMessage(
          t({
            en: `Basic profile saved, but you still need to fill in: ${missing}. Complete them before entering other pages.`,
            zh: `基础资料已保存，但还需填写：${missing}。填完后才能进入其他页面。`,
          }),
        );
        return;
      }
      setMessageKind("success");
      setMessage(
        t(
          onboardingNext &&
            scope === "basic" &&
            readback.data.onboarding.status === "complete" &&
            matchingDraftAtSave
            ? {
                en: "Basic profile saved and verified. Matching preferences still have unsaved changes.",
                zh: "基础资料已保存并完成复读核验；匹配偏好还有未保存的修改。",
              }
            : {
                en: scope === "basic"
                  ? "Basic profile saved and verified."
                  : "Matching preferences saved and verified.",
                zh: scope === "basic"
                  ? "基础资料已保存并完成复读核验。"
                  : "匹配偏好已保存并完成复读核验。",
              },
        ),
      );
      if (shouldContinue) {
        window.location.assign(profileContinuationPath(onboardingNext!));
      }
    } catch (error) {
      if (!mountedRef.current || operationEpoch.current !== saveEpoch) return;
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : t({ en: "Profile save failed.", zh: "档案保存失败。" }));
    } finally {
      if (saveInFlight.current === saveEpoch) {
        saveInFlight.current = null;
        if (mountedRef.current && operationEpoch.current === saveEpoch) {
          if (scope === "basic") setSaving(false); else setMatchingSaving(false);
        }
      }
    }
  }

  async function reloadLatestProfile() {
    if (
      saving ||
      matchingSaving ||
      extracting ||
      reloadInFlight.current !== null ||
      saveInFlight.current !== null
    ) return;
    const reloadEpoch = ++operationEpoch.current;
    reloadInFlight.current = reloadEpoch;
    const dirtyAtReload = new Set(dirtyFields);
    const dirtyHandleFieldsAtReload = new Set(dirtyHandleFields);
    setReloading(true);
    setRequiresReconcile(true);
    try {
      const response = await fetch("/api/profile", { cache: "no-store", headers: { accept: "application/json" } });
      const envelope = await response.json() as ApiEnvelope<ProfilePayload>;
      if (!response.ok || envelope.success !== true || !envelope.data || !knownOnboarding(envelope.data.onboarding)) throw new Error("Profile reload failed");
      if (!mountedRef.current || operationEpoch.current !== reloadEpoch) return;
      setProfile(current => mergeProfilePreservingDraft({
        current,
        dirtyHandleFields: dirtyHandleFieldsAtReload,
        latest: envelope.data!.profile
          ? profileEditorViewFromPayload(current, envelope.data!)
          : emptyProfileAfterReload(current, envelope.data!.onboarding!),
        preserve: dirtyAtReload,
      }));
      setDirtyFields(dirtyAtReload);
      setDirtyHandleFields(dirtyHandleFieldsAtReload);
      pendingSave.current = null;
      setRequiresReconcile(false);
      setMessageKind("info");
      setMessage(t({ en: "Latest profile loaded. Your unsaved fields remain in the draft; save again to reconcile them.", zh: "最新资料已加载，未保存字段仍保留在草稿中；请再次保存以完成合并。" }));
    } catch (error) {
      if (!mountedRef.current || operationEpoch.current !== reloadEpoch) return;
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : t({ en: "Profile reload failed.", zh: "资料刷新失败。" }));
    } finally {
      if (reloadInFlight.current === reloadEpoch) {
        reloadInFlight.current = null;
        if (mountedRef.current && operationEpoch.current === reloadEpoch) {
          setReloading(false);
        }
      }
    }
  }


  const matchingDirty = ["offering", "seeking", "topics"].some(field => dirtyFields.has(field as ProfileEditorField));
  function notify(kind: NoticeKind, text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  return {
    dirtyFields,
    editorDisabled,
    extractText,
    extracting,
    industryReady,
    matchingDirty,
    matchingSaving,
    message,
    messageKind,
    method,
    notify,
    onTextExtract,
    onboardingNext,
    profile,
    reloadLatestProfile,
    reloading,
    requiresReconcile,
    saveProfile,
    saving,
    setExtractText,
    setIndustryReady,
    setMethod,
    toggleTag,
    update,
    updateBirthDate,
    updateIndustry,
  };
}
