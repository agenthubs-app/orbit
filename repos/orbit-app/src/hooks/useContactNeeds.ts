import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";

import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS } from "../api/endpoints";
import {
  acceptRelationshipGoalSaveReceipt,
  createRelationshipGoalSaveAttempt,
  type RelationshipGoalSaveAttempt,
} from "../api/relationship-goal";
import { profileDetailSchema } from "../api/profile-detail-contract";
import { useOrbitApiClient } from "./useOrbitApiClient";
import { useValidatedApiResource } from "./useValidatedApiResource";

interface GoalEditorState {
  baseline: { profileId: string; relationshipGoal: string; updatedAt: string };
  draft: string;
  ownerKey: string;
}

export type ContactNeedsErrorCode =
  | "PROFILE_CONFLICT"
  | "PROFILE_NOT_READY"
  | "PROFILE_RECEIPT_INVALID"
  | "PROFILE_SAVE_FAILED";

export type ContactNeedsMessageCode = "PROFILE_SAVED" | "PROFILE_SAVED_OLDER_DRAFT";

export function useContactNeeds(options: { onSaved?(): void } = {}) {
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const scopeKey = JSON.stringify([actorId, auth.cookieHeader, baseUrl]);
  const client = useOrbitApiClient({ scopeKey });
  const profileState = useValidatedApiResource(
    ORBIT_API_ENDPOINTS.profile,
    profileDetailSchema,
    () => false,
    { cachePolicy: "network-only", scopeKey },
  );
  const data = profileState.kind === "success" || profileState.kind === "empty" ? profileState.data : null;
  const profile = data && data.state !== "pending" && data.editor.canSave ? data.profile : null;
  const ownerKey = JSON.stringify([actorId, auth.cookieHeader, baseUrl]);
  const [editor, setEditor] = useState<GoalEditorState | null>(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ContactNeedsErrorCode | null>(null);
  const [message, setMessage] = useState<ContactNeedsMessageCode | null>(null);
  const editorRef = useRef(editor);
  const ownerRef = useRef(ownerKey);
  const attemptRef = useRef<RelationshipGoalSaveAttempt | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const rebaseRequested = useRef(false);
  editorRef.current = editor;
  ownerRef.current = ownerKey;

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    attemptRef.current = null;
    rebaseRequested.current = false;
    setEditor(null);
    setSaving(false);
    setError(null);
    setMessage(null);
    setVisible(false);
  }, [ownerKey]);

  useEffect(() => {
    if (!profile || !actorId) return;
    setEditor((current) => {
      const baseline = { profileId: profile.id, relationshipGoal: profile.relationshipGoal, updatedAt: profile.updatedAt };
      if (
        !current
        || current.ownerKey !== ownerKey
        || current.baseline.profileId !== profile.id
      ) return { baseline, draft: profile.relationshipGoal, ownerKey };
      if (current.draft.trim() === current.baseline.relationshipGoal.trim()) {
        rebaseRequested.current = false;
        return { baseline, draft: profile.relationshipGoal, ownerKey };
      }
      if (rebaseRequested.current && current.baseline.updatedAt !== baseline.updatedAt) {
        attemptRef.current = null;
        rebaseRequested.current = false;
        return { ...current, baseline };
      }
      return current;
    });
  }, [actorId, ownerKey, profile?.id, profile?.relationshipGoal, profile?.updatedAt]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function open() {
    setError(null);
    setMessage(null);
    setVisible(true);
  }

  function cancel() {
    setEditor((current) => current ? { ...current, draft: current.baseline.relationshipGoal } : current);
    setError(null);
    setMessage(null);
    setVisible(false);
  }

  async function save() {
    const current = editorRef.current;
    if (!current || current.ownerKey !== ownerKey || !actorId || !baseUrl) {
      setError("PROFILE_NOT_READY");
      return;
    }
    const attempt = createRelationshipGoalSaveAttempt({
      actorId,
      baseUrl,
      expectedUpdatedAt: current.baseline.updatedAt,
      profileId: current.baseline.profileId,
      relationshipGoal: current.draft,
    }, attemptRef.current, randomUUID);
    attemptRef.current = attempt;
    const submittedDraft = current.draft;
    const requestOwner = current.ownerKey;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await client.put<unknown>(ORBIT_API_ENDPOINTS.profile, { body: attempt.body, signal: controller.signal });
      const latest = editorRef.current;
      if (
        !latest
        || ownerRef.current !== requestOwner
        || latest.ownerKey !== requestOwner
        || controllerRef.current !== controller
      ) return;
      if (!result.success) {
        setError(result.status === 409 ? "PROFILE_CONFLICT" : "PROFILE_SAVE_FAILED");
        if (result.status === 409) {
          rebaseRequested.current = true;
          profileState.refresh();
        }
        return;
      }
      const receipt = acceptRelationshipGoalSaveReceipt(attempt, result.data, {
        actorId,
        baseUrl,
        profileId: latest.baseline.profileId,
      });
      if (!receipt.ok) {
        setError("PROFILE_RECEIPT_INVALID");
        return;
      }
      attemptRef.current = null;
      const newerDraft = latest.draft !== submittedDraft;
      setEditor({
        baseline: { profileId: attempt.scope.profileId, relationshipGoal: receipt.relationshipGoal, updatedAt: receipt.updatedAt },
        draft: newerDraft ? latest.draft : receipt.relationshipGoal,
        ownerKey: latest.ownerKey,
      });
      setMessage(newerDraft ? "PROFILE_SAVED_OLDER_DRAFT" : "PROFILE_SAVED");
      if (!newerDraft) setVisible(false);
      profileState.refresh();
      options.onSaved?.();
    } catch {
      if (ownerRef.current === requestOwner && controllerRef.current === controller) {
        setError("PROFILE_SAVE_FAILED");
      }
    } finally {
      if (ownerRef.current === requestOwner && controllerRef.current === controller) {
        controllerRef.current = null;
        setSaving(false);
      }
    }
  }

  return {
    cancel,
    draft: editor?.draft ?? "",
    error,
    goal: editor?.baseline.relationshipGoal ?? "",
    loading: profileState.kind === "loading" || data?.state === "pending",
    message,
    open,
    profileReady: editor !== null,
    refresh: profileState.refresh,
    save,
    saving,
    setDraft: (draft: string) => setEditor((current) => current ? { ...current, draft } : current),
    unavailable: profileState.kind === "failure" || profileState.kind === "offline",
    visible,
  };
}
