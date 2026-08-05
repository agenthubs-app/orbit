import type { EventAdmissionApplication } from "../../../../../../features/events/admission/contract";
import { EVENT_PARTICIPANT_PROFILE_FIELDS } from "../../../../../../features/events/registration/contract";
import { EVENT_PROFILE_FIELD_LABELS } from "../../../../../../features/events/registration/interview-response-contract";
import { Icon } from "../../../orbit-reference-primitives";

type Language = "en" | "zh";

const statusCopy = {
  pending_review: {
    en: {
      description:
        "The organizer is reviewing your event profile. You are not counted as an attendee until the application is approved.",
      eyebrow: "Application submitted",
      title: "Waiting for organizer review",
    },
    zh: {
      description: "主办方正在审核你的本场画像。审核通过前，你不会计入参会者名单。",
      eyebrow: "申请已提交",
      title: "等待主办方审核",
    },
  },
  waitlisted: {
    en: {
      description:
        "Your application is eligible, but the event is currently full. A place is assigned automatically in submission order when capacity opens.",
      eyebrow: "Waitlist",
      title: "You are on the waitlist",
    },
    zh: {
      description: "你的申请符合条件，但当前名额已满。有空位时会按提交顺序自动递补。",
      eyebrow: "候补中",
      title: "你已进入候补名单",
    },
  },
  rejected: {
    en: {
      description:
        "The organizer did not admit this application. No attendee membership or event contact access was created.",
      eyebrow: "Decision complete",
      title: "Application not admitted",
    },
    zh: {
      description: "主办方未通过本次申请；系统没有创建参会资格，也没有开放活动联系人信息。",
      eyebrow: "审核已完成",
      title: "本次申请未通过",
    },
  },
  withdrawn: {
    en: {
      description:
        "This application has been withdrawn. If it was previously admitted, the attendee membership was cancelled in the same transaction.",
      eyebrow: "Application withdrawn",
      title: "You are no longer joining this event",
    },
    zh: {
      description: "这份申请已撤回；如果此前已通过，参会资格也已在同一事务中取消。",
      eyebrow: "申请已撤回",
      title: "你将不再参加这场活动",
    },
  },
} as const;

export function EventAdmissionStatusCard({
  application,
  eventHref,
  language,
  onWithdraw,
  pendingWithdraw,
}: {
  application: EventAdmissionApplication & {
    status: "pending_review" | "rejected" | "waitlisted" | "withdrawn";
  };
  eventHref: string;
  language: Language;
  onWithdraw: () => void;
  pendingWithdraw: boolean;
}) {
  const localized = statusCopy[application.status][language];
  const answeredFields = EVENT_PARTICIPANT_PROFILE_FIELDS.filter((field) =>
    Boolean(application.profilePayload.answers[field]?.trim()),
  );
  const canWithdraw =
    application.status === "pending_review" || application.status === "waitlisted";

  return (
    <section
      data-admission-application-status={application.status}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 24,
        boxShadow: "var(--sh-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "grid", gap: 12, padding: "30px 34px 24px" }}>
        <span
          style={{
            alignItems: "center",
            color: "var(--accent)",
            display: "inline-flex",
            fontSize: 12,
            fontWeight: 750,
            gap: 7,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <Icon name={application.status === "rejected" ? "x" : "check"} size={15} />
          {localized.eyebrow}
        </span>
        <h2
          style={{
            color: "var(--ink)",
            fontFamily: "var(--ff-display)",
            fontSize: "clamp(1.35rem, 3vw, 1.8rem)",
            margin: 0,
          }}
        >
          {localized.title}
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>
          {localized.description}
        </p>
        <p style={{ color: "var(--text-4)", fontSize: 12.5, margin: 0 }}>
          {language === "en"
            ? `Application v${application.applicationVersion} · submitted ${new Date(application.submittedAt).toLocaleString("en")}`
            : `申请版本 v${application.applicationVersion} · 提交于 ${new Date(application.submittedAt).toLocaleString("zh-CN")}`}
        </p>

        {answeredFields.length > 0 ? (
          <details data-admission-profile-answers open>
            <summary style={{ color: "var(--text-2)", cursor: "pointer", fontSize: 13.5, fontWeight: 650 }}>
              {language === "en"
                ? `All submitted answers (${answeredFields.length})`
                : `本次提交的全部回答（${answeredFields.length}）`}
            </summary>
            <dl style={{ display: "grid", gap: 9, margin: "12px 0 0" }}>
              {answeredFields.map((field) => (
                <div
                  data-admission-profile-answer={field}
                  key={field}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    display: "grid",
                    gap: 5,
                    padding: "13px 15px",
                  }}
                >
                  <dt style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 700 }}>
                    {EVENT_PROFILE_FIELD_LABELS[field][language]}
                  </dt>
                  <dd style={{ color: "var(--ink)", fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>
                    {application.profilePayload.answers[field]}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>

      <footer
        style={{
          alignItems: "center",
          background: "color-mix(in srgb, var(--surface-2) 55%, var(--surface))",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: "space-between",
          padding: "14px 22px",
        }}
      >
        {canWithdraw ? (
          <button
            className="reg-ghost-btn"
            data-admission-withdraw
            disabled={pendingWithdraw}
            onClick={onWithdraw}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--danger, #C2410C)",
              cursor: pendingWithdraw ? "wait" : "pointer",
              fontFamily: "var(--ff)",
              fontSize: 13,
              fontWeight: 650,
            }}
            type="button"
          >
            {pendingWithdraw
              ? language === "en" ? "Withdrawing…" : "正在撤回…"
              : language === "en" ? "Withdraw application" : "撤回申请"}
          </button>
        ) : (
          <span style={{ color: "var(--text-4)", fontSize: 12.5 }}>
            {language === "en"
              ? "This application state is final."
              : "这份申请已进入最终状态。"}
          </span>
        )}
        <a className="reg-ghost-btn" href={eventHref} style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          {language === "en" ? "Back to event" : "返回活动页"}
        </a>
      </footer>
    </section>
  );
}
