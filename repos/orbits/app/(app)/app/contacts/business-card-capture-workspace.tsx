"use client";

import {
  useEffect,
  useReducer,
  useRef,
  type ChangeEvent,
} from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

interface BusinessCardReviewIssue {
  code: string;
  field: string;
  message: string;
}

export interface BusinessCardScanPayload {
  capture: {
    imageDigest: string;
    imageName: string;
  };
  draft: {
    displayName: string;
    email: string;
    evidence: readonly { evidenceId: string }[];
    id: string;
    organization: string;
    phone: string;
    relationshipContext: string;
    role: string;
  } | null;
  ocr: {
    reviewIssues?: readonly BusinessCardReviewIssue[];
  };
  provenance: {
    model?: string;
    provider?: string;
  };
}

interface ReviewFields {
  displayName: string;
  email: string;
  organization: string;
  phone: string;
  relationshipContext: string;
  role: string;
}

interface InvitationDraft {
  invitationId: string;
  subject: string;
  body: string;
}

export type BusinessCardCaptureState =
  | { kind: "idle" }
  | { kind: "preview"; file: File; previewUrl: string }
  | { kind: "processing"; file: File; previewUrl: string }
  | {
      kind: "review";
      acknowledgedIssueCodes: readonly string[];
      allFieldsReviewed: boolean;
      fields: ReviewFields;
      payload: BusinessCardScanPayload;
      previewUrl: string;
    }
  | {
      kind: "confirmed";
      contactId: string;
      displayName: string;
      email: string;
      invitation: InvitationDraft | null;
      invitationStatus: "idle" | "preparing" | "draft" | "ready" | "failure";
      inviteSelected: boolean;
    }
  | {
      kind: "failure";
      message: string;
      retryable: boolean;
    };

export type BusinessCardCaptureAction =
  | { file: File; previewUrl: string; type: "select_file" }
  | { type: "start_scan" }
  | {
      payload: BusinessCardScanPayload;
      previewUrl: string;
      type: "scan_succeeded";
    }
  | { message: string; retryable?: boolean; type: "operation_failed" }
  | {
      field: keyof ReviewFields;
      type: "update_field";
      value: string;
    }
  | { issueCode: string; type: "acknowledge_issue" }
  | { type: "mark_fields_reviewed"; value: boolean }
  | { contactId: string; type: "contact_confirmed" }
  | { type: "select_invitation"; value: boolean }
  | { type: "invitation_preparing" }
  | { invitation: InvitationDraft; type: "invitation_prepared" }
  | {
      field: "body" | "subject";
      type: "update_invitation";
      value: string;
    }
  | { type: "invitation_confirmed" }
  | { type: "invitation_failed" }
  | { type: "reset" };

export const initialBusinessCardCaptureState: BusinessCardCaptureState = {
  kind: "idle",
};

function reviewFieldsFrom(
  payload: BusinessCardScanPayload,
): ReviewFields {
  const draft = payload.draft;

  return {
    displayName: draft?.displayName ?? "",
    email: draft?.email ?? "",
    organization: draft?.organization ?? "",
    phone: draft?.phone ?? "",
    relationshipContext: draft?.relationshipContext ?? "",
    role: draft?.role ?? "",
  };
}

export function businessCardCaptureReducer(
  state: BusinessCardCaptureState,
  action: BusinessCardCaptureAction,
): BusinessCardCaptureState {
  switch (action.type) {
    case "select_file":
      return {
        kind: "preview",
        file: action.file,
        previewUrl: action.previewUrl,
      };
    case "start_scan":
      return state.kind === "preview"
        ? { ...state, kind: "processing" }
        : state;
    case "scan_succeeded":
      return {
        kind: "review",
        acknowledgedIssueCodes: [],
        allFieldsReviewed: false,
        fields: reviewFieldsFrom(action.payload),
        payload: action.payload,
        previewUrl: action.previewUrl,
      };
    case "operation_failed":
      return {
        kind: "failure",
        message: action.message,
        retryable: action.retryable ?? true,
      };
    case "update_field":
      return state.kind === "review"
        ? {
            ...state,
            allFieldsReviewed: false,
            fields: { ...state.fields, [action.field]: action.value },
          }
        : state;
    case "acknowledge_issue":
      return state.kind === "review"
        ? {
            ...state,
            acknowledgedIssueCodes: Array.from(
              new Set([...state.acknowledgedIssueCodes, action.issueCode]),
            ),
          }
        : state;
    case "mark_fields_reviewed":
      return state.kind === "review"
        ? { ...state, allFieldsReviewed: action.value }
        : state;
    case "contact_confirmed":
      return state.kind === "review"
        ? {
            kind: "confirmed",
            contactId: action.contactId,
            displayName: state.fields.displayName,
            email: state.fields.email,
            invitation: null,
            invitationStatus: "idle",
            inviteSelected: false,
          }
        : state;
    case "select_invitation":
      return state.kind === "confirmed"
        ? {
            ...state,
            invitation: action.value ? state.invitation : null,
            invitationStatus: action.value ? state.invitationStatus : "idle",
            inviteSelected: action.value,
          }
        : state;
    case "invitation_preparing":
      return state.kind === "confirmed"
        ? { ...state, invitationStatus: "preparing" }
        : state;
    case "invitation_prepared":
      return state.kind === "confirmed"
        ? {
            ...state,
            invitation: action.invitation,
            invitationStatus: "draft",
          }
        : state;
    case "update_invitation":
      return state.kind === "confirmed" && state.invitation
        ? {
            ...state,
            invitation: {
              ...state.invitation,
              [action.field]: action.value,
            },
          }
        : state;
    case "invitation_confirmed":
      return state.kind === "confirmed"
        ? { ...state, invitationStatus: "ready" }
        : state;
    case "invitation_failed":
      return state.kind === "confirmed"
        ? { ...state, invitationStatus: "failure" }
        : state;
    case "reset":
      return initialBusinessCardCaptureState;
    default:
      return state;
  }
}

export function businessCardCaptureCanConfirm(
  state: BusinessCardCaptureState,
): boolean {
  if (state.kind !== "review" || !state.allFieldsReviewed) {
    return false;
  }

  const issues = state.payload.ocr.reviewIssues ?? [];

  return (
    state.fields.displayName.trim().length > 0 &&
    issues.every((issue) =>
      state.acknowledgedIssueCodes.includes(issue.code),
    )
  );
}

function apiErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }

  return fallback;
}

function Field({
  label,
  multiline = false,
  onChange,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="bcc-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          value={value}
        />
      ) : (
        <input
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      )}
    </label>
  );
}

export function BusinessCardCaptureWorkspace() {
  const { t } = useOrbitLanguage();
  const [state, dispatch] = useReducer(
    businessCardCaptureReducer,
    initialBusinessCardCaptureState,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    [],
  );

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;
    dispatch({ file, previewUrl, type: "select_file" });
  }

  async function startRecognition() {
    if (state.kind !== "preview") {
      return;
    }

    const { file, previewUrl } = state;
    const formData = new FormData();
    formData.append("image", file);
    dispatch({ type: "start_scan" });

    try {
      const response = await fetch("/api/contact-drafts/business-card/scan", {
        body: formData,
        method: "POST",
      });
      const body = (await response.json()) as {
        data?: BusinessCardScanPayload;
        success?: boolean;
      };

      if (!response.ok || body.success !== true || !body.data?.draft) {
        throw new Error(apiErrorMessage(body, "名片识别失败，请重试。"));
      }

      dispatch({
        payload: body.data,
        previewUrl,
        type: "scan_succeeded",
      });
    } catch (error) {
      dispatch({
        message:
          error instanceof Error ? error.message : "名片识别失败，请重试。",
        type: "operation_failed",
      });
    }
  }

  async function confirmContact() {
    if (state.kind !== "review" || !businessCardCaptureCanConfirm(state)) {
      return;
    }

    const draft = state.payload.draft;

    if (!draft) {
      return;
    }

    try {
      const response = await fetch("/api/contacts/business-card/confirm", {
        body: JSON.stringify({
          confirmed: true,
          displayName: state.fields.displayName,
          draftId: draft.id,
          email: state.fields.email,
          evidenceIds: draft.evidence.map((item) => item.evidenceId),
          imageDigest: state.payload.capture.imageDigest,
          organization: state.fields.organization,
          phone: state.fields.phone,
          relationshipContext: state.fields.relationshipContext,
          role: state.fields.role,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        data?: {
          contactId?: string;
          state?: string;
        };
        success?: boolean;
      };

      if (
        !response.ok ||
        body.success !== true ||
        !body.data?.contactId ||
        body.data.state === "duplicate_review"
      ) {
        throw new Error(
          body.data?.state === "duplicate_review"
            ? "发现可能重复的联系人，请先处理重复项。"
            : apiErrorMessage(body, "联系人收录失败，请重试。"),
        );
      }

      dispatch({
        contactId: body.data.contactId,
        type: "contact_confirmed",
      });
    } catch (error) {
      dispatch({
        message:
          error instanceof Error ? error.message : "联系人收录失败，请重试。",
        type: "operation_failed",
      });
    }
  }

  async function selectInvitation(value: boolean) {
    if (state.kind !== "confirmed") {
      return;
    }

    dispatch({ type: "select_invitation", value });

    if (!value) {
      return;
    }

    if (!state.email.trim()) {
      dispatch({ type: "invitation_failed" });
      return;
    }

    dispatch({ type: "invitation_preparing" });

    try {
      const response = await fetch("/api/contact-invitations", {
        body: JSON.stringify({
          contactId: state.contactId,
          recipientEmail: state.email,
          recipientName: state.displayName,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        data?: InvitationDraft;
        success?: boolean;
      };

      if (!response.ok || body.success !== true || !body.data?.invitationId) {
        throw new Error("邀请预览生成失败。");
      }

      dispatch({
        invitation: {
          invitationId: body.data.invitationId,
          subject: body.data.subject,
          body: body.data.body,
        },
        type: "invitation_prepared",
      });
    } catch {
      dispatch({ type: "invitation_failed" });
    }
  }

  async function confirmInvitation() {
    if (
      state.kind !== "confirmed" ||
      !state.invitation ||
      state.invitationStatus !== "draft"
    ) {
      return;
    }

    try {
      const response = await fetch("/api/contact-invitations", {
        body: JSON.stringify({
          body: state.invitation.body,
          confirmed: true,
          invitationId: state.invitation.invitationId,
          subject: state.invitation.subject,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = (await response.json()) as {
        data?: { status?: string };
        success?: boolean;
      };

      if (
        !response.ok ||
        body.success !== true ||
        body.data?.status !== "ready_for_delivery"
      ) {
        throw new Error("邀请确认失败。");
      }

      dispatch({ type: "invitation_confirmed" });
    } catch {
      dispatch({ type: "invitation_failed" });
    }
  }

  const privacyNote = (
    <div className="bcc-privacy">
      <Icon color="var(--accent)" name="lock" size={15} />
      <span>
        {t({
          en: "The image is used only for this cloud recognition request and is not stored.",
          zh: "图片只用于本次云端识别，不会保存原始名片。",
        })}
      </span>
    </div>
  );

  if (state.kind === "idle") {
    return (
      <section className="bcc-shell" data-business-card-capture="idle">
        <style>{CAPTURE_STYLE}</style>
        <div className="bcc-kicker">{t({ en: "PRIVATE CAPTURE · BUSINESS CARD", zh: "本地采集 · 名片" })}</div>
        <h2>{t({ en: "Turn a card into a relationship", zh: "把一张名片，变成一段可信关系" })}</h2>
        <p className="bcc-lede">
          {t({
            en: "Photograph or upload a card. Orbit extracts visible fields, then waits for your review before creating anything.",
            zh: "拍照或上传名片。Orbit 识别可见字段，但在你逐项复核前不会创建联系人。",
          })}
        </p>
        <div className="bcc-dropzone">
          <span className="bcc-scan-mark"><Icon name="scan" size={30} /></span>
          <strong>{t({ en: "Ready when the card is", zh: "让名片正对镜头或选择图片" })}</strong>
          <span>JPEG · PNG · WebP · ≤ 10 MiB</span>
          <div className="bcc-actions">
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Icon name="scan" size={17} />
              {t({ en: "Photograph card", zh: "拍照扫描" })}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Icon name="upload" size={17} />
              {t({ en: "Upload image", zh: "上传图片" })}
            </button>
          </div>
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="上传名片图片"
            capture="environment"
            className="bcc-file"
            onChange={selectFile}
            ref={fileInputRef}
            type="file"
          />
        </div>
        {privacyNote}
      </section>
    );
  }

  if (state.kind === "preview" || state.kind === "processing") {
    return (
      <section className="bcc-shell" data-business-card-capture={state.kind}>
        <style>{CAPTURE_STYLE}</style>
        <div className="bcc-kicker">{t({ en: "CAPTURE PREVIEW", zh: "采集预览" })}</div>
        <div className="bcc-preview-stage">
          <img alt="待识别名片预览" src={state.previewUrl} />
          {state.kind === "processing" ? (
            <div aria-live="polite" className="bcc-processing">
              <span />
              {t({ en: "Reading visible fields…", zh: "正在识别名片字段…" })}
            </div>
          ) : null}
        </div>
        {privacyNote}
        <div className="bcc-footer-actions">
          <button
            className="btn btn-ghost"
            disabled={state.kind === "processing"}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {t({ en: "Replace image", zh: "更换图片" })}
          </button>
          <button
            className="btn btn-primary"
            disabled={state.kind === "processing"}
            onClick={startRecognition}
            type="button"
          >
            <Icon name="sparkle" size={17} />
            {t({ en: "Start recognition", zh: "开始识别" })}
          </button>
        </div>
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="上传名片图片"
          capture="environment"
          className="bcc-file"
          onChange={selectFile}
          ref={fileInputRef}
          type="file"
        />
      </section>
    );
  }

  if (state.kind === "review") {
    const issues = state.payload.ocr.reviewIssues ?? [];
    const canConfirm = businessCardCaptureCanConfirm(state);

    return (
      <section className="bcc-shell" data-business-card-capture="review">
        <style>{CAPTURE_STYLE}</style>
        <div className="bcc-review-head">
          <div>
            <div className="bcc-kicker">{t({ en: "CAPTURE → REVIEW", zh: "采集 → 复核" })}</div>
            <h2>{t({ en: "Review what Orbit saw", zh: "复核 Orbit 识别到的内容" })}</h2>
          </div>
          <span className="bcc-provider">
            {state.payload.provenance.model ?? "cloud OCR"}
          </span>
        </div>
        <div className="bcc-rail">
          <div className="bcc-card-evidence">
            <img alt="名片证据预览" src={state.previewUrl} />
            <div>
              <span className="bcc-dot bcc-dot-sky" />
              {t({ en: "Uploaded evidence", zh: "本次上传证据" })}
            </div>
            <small>{state.payload.capture.imageName}</small>
            {privacyNote}
          </div>
          <div className="bcc-fields">
            <Field
              label={t({ en: "Name", zh: "姓名" })}
              onChange={(value) =>
                dispatch({ field: "displayName", type: "update_field", value })
              }
              value={state.fields.displayName}
            />
            <div className="bcc-field-pair">
              <Field
                label={t({ en: "Role", zh: "职位" })}
                onChange={(value) =>
                  dispatch({ field: "role", type: "update_field", value })
                }
                value={state.fields.role}
              />
              <Field
                label={t({ en: "Organization", zh: "公司" })}
                onChange={(value) =>
                  dispatch({
                    field: "organization",
                    type: "update_field",
                    value,
                  })
                }
                value={state.fields.organization}
              />
            </div>
            <div className="bcc-field-pair">
              <Field
                label={t({ en: "Email", zh: "邮箱" })}
                onChange={(value) =>
                  dispatch({ field: "email", type: "update_field", value })
                }
                value={state.fields.email}
              />
              <Field
                label={t({ en: "Phone", zh: "电话" })}
                onChange={(value) =>
                  dispatch({ field: "phone", type: "update_field", value })
                }
                value={state.fields.phone}
              />
            </div>
            <Field
              label={t({ en: "How you met", zh: "认识场景" })}
              multiline
              onChange={(value) =>
                dispatch({
                  field: "relationshipContext",
                  type: "update_field",
                  value,
                })
              }
              value={state.fields.relationshipContext}
            />
            {issues.length > 0 ? (
              <div className="bcc-issues">
                <strong>{t({ en: "Needs your judgment", zh: "需要你判断" })}</strong>
                {issues.map((issue) => {
                  const acknowledged = state.acknowledgedIssueCodes.includes(
                    issue.code,
                  );

                  return (
                    <button
                      className={acknowledged ? "is-done" : ""}
                      key={issue.code}
                      onClick={() =>
                        dispatch({
                          issueCode: issue.code,
                          type: "acknowledge_issue",
                        })
                      }
                      type="button"
                    >
                      <Icon
                        name={acknowledged ? "checkCircle" : "bell"}
                        size={15}
                      />
                      <span>{issue.message}</span>
                      <b>{acknowledged ? "已处理" : "确认"}</b>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <label className="bcc-check">
              <input
                checked={state.allFieldsReviewed}
                onChange={(event) =>
                  dispatch({
                    type: "mark_fields_reviewed",
                    value: event.target.checked,
                  })
                }
                type="checkbox"
              />
              <span>
                {t({
                  en: "I reviewed every field and want to create this contact.",
                  zh: "我已核对所有字段，并决定将其收录进人脉。",
                })}
              </span>
            </label>
            <div className="bcc-confirm">
              <span>
                {t({
                  en: "No contact exists yet",
                  zh: "此刻仍未写入联系人",
                })}
              </span>
              <button
                className="btn btn-primary"
                disabled={!canConfirm}
                onClick={confirmContact}
                type="button"
              >
                <Icon name="check" size={17} />
                {t({ en: "Confirm and save", zh: "确认并收录" })}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (state.kind === "confirmed") {
    return (
      <section className="bcc-shell" data-business-card-capture="confirmed">
        <style>{CAPTURE_STYLE}</style>
        <div className="bcc-success">
          <span><Icon name="check" size={20} /></span>
          <div>
            <div className="bcc-kicker">{t({ en: "CONTACT CONFIRMED", zh: "联系人已确认" })}</div>
            <h2>{state.displayName || t({ en: "Contact saved", zh: "联系人已收录" })}</h2>
            <p>{t({ en: "Now decide whether to invite them. This is optional and separately confirmed.", zh: "现在可以决定是否邀请对方。该操作完全可选，并需要单独确认。" })}</p>
          </div>
        </div>
        <label className="bcc-invite-choice">
          <input
            checked={state.inviteSelected}
            onChange={(event) => void selectInvitation(event.target.checked)}
            type="checkbox"
          />
          <span>
            <b>{t({ en: "Invite them to join Orbit", zh: "邀请对方加入 Orbit" })}</b>
            <small>{state.email || t({ en: "No email on the reviewed card", zh: "复核后的名片没有邮箱" })}</small>
          </span>
        </label>
        {state.inviteSelected ? (
          <div className="bcc-invitation">
            {state.invitationStatus === "preparing" ? (
              <p aria-live="polite">{t({ en: "Preparing editable invitation…", zh: "正在准备可编辑邀请…" })}</p>
            ) : null}
            {state.invitation ? (
              <>
                <Field
                  label={t({ en: "Subject", zh: "邮件主题" })}
                  onChange={(value) =>
                    dispatch({
                      field: "subject",
                      type: "update_invitation",
                      value,
                    })
                  }
                  value={state.invitation.subject}
                />
                <Field
                  label={t({ en: "Message", zh: "邀请正文" })}
                  multiline
                  onChange={(value) =>
                    dispatch({
                      field: "body",
                      type: "update_invitation",
                      value,
                    })
                  }
                  value={state.invitation.body}
                />
              </>
            ) : null}
            {state.invitationStatus === "failure" ? (
              <div className="bcc-error-note">
                {t({ en: "An email address and valid draft are required. Nothing was sent.", zh: "需要有效邮箱和邀请草稿。当前没有发送任何邮件。" })}
              </div>
            ) : null}
            {state.invitationStatus === "ready" ? (
              <div className="bcc-ready">
                <Icon name="checkCircle" size={17} />
                <span>{t({ en: "Invitation prepared, not sent", zh: "邀请已准备，尚未发送" })}</span>
              </div>
            ) : (
              <div className="bcc-footer-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => void selectInvitation(false)}
                  type="button"
                >
                  {t({ en: "Not now", zh: "暂不邀请" })}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!state.invitation}
                  onClick={confirmInvitation}
                  type="button"
                >
                  {t({ en: "Confirm invitation", zh: "确认邀请" })}
                </button>
              </div>
            )}
            <small className="bcc-send-boundary">
              externalSendRequested=false · emailProviderRequested=false · messageSent=false
            </small>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="bcc-shell" data-business-card-capture="failure">
      <style>{CAPTURE_STYLE}</style>
      <div className="bcc-failure">
        <Icon name="bell" size={22} />
        <h2>{t({ en: "This card needs another look", zh: "这张名片需要重新处理" })}</h2>
        <p>{state.message}</p>
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: "reset" })}
          type="button"
        >
          {state.retryable
            ? t({ en: "Try another image", zh: "换一张图片重试" })
            : t({ en: "Start again", zh: "重新开始" })}
        </button>
      </div>
    </section>
  );
}

const CAPTURE_STYLE = `
.bcc-shell { background: color-mix(in srgb, var(--surface) 96%, var(--accent)); border: 1px solid var(--border); border-radius: 22px; box-shadow: 0 24px 70px rgba(6,5,13,.16); overflow: hidden; padding: clamp(18px, 3vw, 30px); position: relative; }
.bcc-shell::before { background: linear-gradient(90deg, var(--accent), var(--sky), var(--live)); content: ""; height: 2px; inset: 0 0 auto; position: absolute; }
.bcc-shell h2 { color: var(--ink); font-family: var(--ff-display); font-size: clamp(22px, 3vw, 34px); letter-spacing: -.035em; line-height: 1.08; margin: 8px 0 10px; }
.bcc-kicker { color: var(--accent); font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: .15em; }
.bcc-lede { color: var(--text-2); font-size: 14px; line-height: 1.7; margin: 0 0 22px; max-width: 680px; }
.bcc-dropzone { align-items: center; background: color-mix(in srgb, var(--surface-2) 82%, transparent); border: 1px dashed var(--border-2); border-radius: 18px; display: flex; flex-direction: column; gap: 9px; justify-content: center; min-height: 300px; padding: 28px; text-align: center; }
.bcc-dropzone strong { color: var(--ink); font-family: var(--ff-display); font-size: 18px; }
.bcc-dropzone > span:not(.bcc-scan-mark) { color: var(--text-3); font-family: var(--mono); font-size: 11px; }
.bcc-scan-mark { background: var(--accent-soft); border-radius: 16px; color: var(--accent); display: grid; height: 62px; place-items: center; width: 62px; }
.bcc-actions, .bcc-footer-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.bcc-file { height: 1px; opacity: 0; overflow: hidden; position: absolute; width: 1px; }
.bcc-privacy { align-items: flex-start; background: var(--accent-softer); border-radius: 11px; color: var(--text-2); display: flex; font-size: 12px; gap: 8px; line-height: 1.5; margin-top: 14px; padding: 10px 12px; }
.bcc-preview-stage { align-items: center; background: #08070e; border-radius: 18px; display: flex; justify-content: center; min-height: 340px; overflow: hidden; position: relative; }
.bcc-preview-stage img { display: block; max-height: 520px; max-width: 100%; object-fit: contain; }
.bcc-processing { align-items: center; backdrop-filter: blur(8px); background: rgba(6,5,13,.74); color: white; display: flex; font-weight: 600; gap: 10px; inset: 0; justify-content: center; position: absolute; }
.bcc-processing span { animation: bcc-pulse 1.15s ease-in-out infinite; background: var(--accent); border-radius: 50%; height: 10px; width: 10px; }
.bcc-review-head { align-items: flex-start; display: flex; gap: 16px; justify-content: space-between; }
.bcc-provider { background: var(--surface-3); border-radius: 999px; color: var(--text-3); font-family: var(--mono); font-size: 10px; padding: 7px 10px; }
.bcc-rail { display: grid; gap: 22px; grid-template-columns: minmax(220px, 42fr) minmax(320px, 58fr); margin-top: 16px; }
.bcc-card-evidence { background: #090810; border-radius: 17px; color: rgba(255,255,255,.76); padding: 14px; }
.bcc-card-evidence img { border-radius: 11px; display: block; max-height: 440px; object-fit: contain; width: 100%; }
.bcc-card-evidence > div:not(.bcc-privacy) { align-items: center; display: flex; font-size: 12px; gap: 7px; margin-top: 12px; }
.bcc-card-evidence small { color: rgba(255,255,255,.46); display: block; font-family: var(--mono); font-size: 10px; margin-top: 5px; word-break: break-all; }
.bcc-card-evidence .bcc-privacy { background: rgba(139,123,240,.12); color: rgba(255,255,255,.7); }
.bcc-dot { border-radius: 50%; height: 7px; width: 7px; }.bcc-dot-sky { background: var(--sky); }
.bcc-fields { display: flex; flex-direction: column; gap: 14px; }
.bcc-field { display: flex; flex: 1; flex-direction: column; gap: 6px; }
.bcc-field > span { color: var(--text-3); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.bcc-field input, .bcc-field textarea { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; color: var(--ink); font: inherit; font-size: 14px; min-width: 0; padding: 10px 11px; resize: vertical; }
.bcc-field input:focus, .bcc-field textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-softer); outline: 0; }
.bcc-field-pair { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
.bcc-issues { background: var(--amber-soft); border-radius: 13px; display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.bcc-issues > strong { color: var(--amber-text); font-size: 12px; }
.bcc-issues button { align-items: center; background: transparent; border: 0; color: var(--text-2); cursor: pointer; display: grid; font: inherit; font-size: 12px; gap: 8px; grid-template-columns: auto 1fr auto; padding: 5px 0; text-align: left; }
.bcc-issues button b { color: var(--amber-text); font-size: 11px; }.bcc-issues button.is-done { color: var(--text-3); }.bcc-issues button.is-done b { color: var(--live-text); }
.bcc-check, .bcc-invite-choice { align-items: flex-start; color: var(--text-2); cursor: pointer; display: flex; font-size: 13px; gap: 10px; line-height: 1.5; }
.bcc-check input, .bcc-invite-choice input { accent-color: var(--accent); margin-top: 3px; }
.bcc-confirm { align-items: center; border-top: 1px solid var(--hairline); display: flex; gap: 14px; justify-content: space-between; padding-top: 14px; }.bcc-confirm > span { color: var(--text-3); font-size: 12px; }
.bcc-success { align-items: flex-start; display: flex; gap: 14px; }.bcc-success > span { background: var(--live-soft); border-radius: 50%; color: var(--live); display: grid; flex: 0 0 42px; height: 42px; place-items: center; }.bcc-success p { color: var(--text-2); font-size: 13px; line-height: 1.6; margin: 0; }
.bcc-invite-choice { background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; margin-top: 20px; padding: 14px; }.bcc-invite-choice span { display: flex; flex-direction: column; }.bcc-invite-choice b { color: var(--ink); }.bcc-invite-choice small { color: var(--text-3); margin-top: 3px; }
.bcc-invitation { background: var(--surface-2); border-radius: 14px; display: flex; flex-direction: column; gap: 13px; margin-top: 12px; padding: 15px; }
.bcc-ready { align-items: center; background: var(--live-soft); border-radius: 11px; color: var(--live-text); display: flex; font-weight: 700; gap: 8px; padding: 12px; }
.bcc-error-note { background: var(--amber-soft); border-radius: 11px; color: var(--amber-text); font-size: 12px; padding: 10px; }
.bcc-send-boundary { color: var(--text-4); font-family: var(--mono); font-size: 9px; }
.bcc-failure { align-items: center; display: flex; flex-direction: column; min-height: 320px; justify-content: center; text-align: center; }.bcc-failure > svg { color: var(--amber); }.bcc-failure p { color: var(--text-2); max-width: 480px; }
@keyframes bcc-pulse { 0%,100% { opacity: .35; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.25); } }
@media (max-width: 840px) { .bcc-rail { grid-template-columns: 1fr; }.bcc-card-evidence { order: 0; }.bcc-fields { order: 1; }.bcc-field-pair { grid-template-columns: 1fr; }.bcc-confirm { align-items: stretch; flex-direction: column; }.bcc-confirm .btn { width: 100%; }.bcc-shell { border-radius: 16px; padding: 16px; }.bcc-dropzone { min-height: 250px; } }
@media (prefers-reduced-motion: reduce) { .bcc-processing span { animation: none; } }
`;
