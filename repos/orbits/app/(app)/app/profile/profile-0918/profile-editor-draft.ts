import type {
  OrbitProfileEditorView,
  ProfileEditorField,
  ProfileEditorVisibleHandleKey,
} from "../profile-editor-adapter";

const PROFILE_EDITOR_DRAFT_KEY = "orbit.profile.editor.draft.v1";

export interface StoredProfileEditorDraft {
  actorKey: string;
  dirtyFields: ProfileEditorField[];
  dirtyHandleFields: ProfileEditorVisibleHandleKey[];
  extractText: string;
  method: "manual" | "text";
  profile: OrbitProfileEditorView;
}

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isProfile(value: unknown): value is OrbitProfileEditorView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<OrbitProfileEditorView>;
  return typeof profile.email === "string"
    && typeof profile.fullName === "string"
    && typeof profile.company === "string"
    && typeof profile.title === "string"
    && typeof profile.bio === "string"
    && typeof profile.wechatName === "string"
    && typeof profile.lineId === "string"
    && isStringArray(profile.offering)
    && isStringArray(profile.seeking)
    && isStringArray(profile.topics);
}

export function readProfileEditorDraft(actorKey: string): StoredProfileEditorDraft | null {
  try {
    const raw = session()?.getItem(PROFILE_EDITOR_DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredProfileEditorDraft> | null;
    if (
      !value || value.actorKey !== actorKey || !isProfile(value.profile)
      || !isStringArray(value.dirtyFields) || !isStringArray(value.dirtyHandleFields)
      || (value.method !== "manual" && value.method !== "text")
      || typeof value.extractText !== "string"
    ) return null;
    return value as StoredProfileEditorDraft;
  } catch {
    return null;
  }
}

export function writeProfileEditorDraft(
  draft: StoredProfileEditorDraft | null,
): void {
  try {
    const store = session();
    if (!store) return;
    if (!draft || (draft.dirtyFields.length === 0 && !draft.extractText.trim())) {
      store.removeItem(PROFILE_EDITOR_DRAFT_KEY);
      return;
    }
    store.setItem(PROFILE_EDITOR_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage can be unavailable in private browsing. The live React state
    // remains usable even when cross-route restoration is not possible.
  }
}

export function clearProfileEditorDraft(): void {
  writeProfileEditorDraft(null);
}
