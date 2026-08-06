"use client";

import { useEffect, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { Icon } from "../../orbit-reference-primitives";

interface RegistrationClusterPreview {
  admissionControlled?: boolean;
  buckets: readonly { count: number; label: string }[];
  total: number;
}

export interface QuickSignupAnswers {
  targetAttendees?: string;
  valueOffered?: string;
}

export function quickSignupStorageKey(eventId: string) {
  return `orbit-quick-answers:${eventId}`;
}

export function readQuickSignupAnswers(
  storage: Pick<Storage, "getItem">,
  eventId: string,
): QuickSignupAnswers | null {
  try {
    const raw = storage.getItem(quickSignupStorageKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuickSignupAnswers;
    const targetAttendees = parsed.targetAttendees?.trim();
    const valueOffered = parsed.valueOffered?.trim();
    if (!targetAttendees && !valueOffered) return null;
    return {
      ...(targetAttendees ? { targetAttendees } : {}),
      ...(valueOffered ? { valueOffered } : {}),
    };
  } catch {
    return null;
  }
}

// Pre-registration quick answers + anonymous cluster preview. The two intent
// answers live only in localStorage until the registration wizard carries them
// into the interview transcript after login — nothing is persisted server-side
// from this card.
export function OrbitEventQuickSignup({
  audienceHint = null,
  eventId,
}: {
  audienceHint?: string | null;
  eventId: string;
}) {
  const { t } = useOrbitLanguage();
  const [targetAttendees, setTargetAttendees] = useState("");
  const [valueOffered, setValueOffered] = useState("");
  const [preview, setPreview] = useState<RegistrationClusterPreview | null>(null);

  useEffect(() => {
    const stored = readQuickSignupAnswers(window.localStorage, eventId);
    if (stored?.targetAttendees) setTargetAttendees(stored.targetAttendees);
    if (stored?.valueOffered) setValueOffered(stored.valueOffered);
  }, [eventId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/events/${encodeURIComponent(eventId)}/registration/preview`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: RegistrationClusterPreview;
          success?: boolean;
        };
        if (response.ok && body.success === true && body.data) {
          setPreview(body.data);
        }
      })
      .catch(() => {
        // Preview is decorative; the card still works without it.
      });
    return () => controller.abort();
  }, [eventId]);

  const persist = (next: QuickSignupAnswers) => {
    try {
      const targetValue = next.targetAttendees?.trim();
      const offeredValue = next.valueOffered?.trim();
      if (!targetValue && !offeredValue) {
        window.localStorage.removeItem(quickSignupStorageKey(eventId));
        return;
      }
      window.localStorage.setItem(
        quickSignupStorageKey(eventId),
        JSON.stringify({
          ...(targetValue ? { targetAttendees: targetValue } : {}),
          ...(offeredValue ? { valueOffered: offeredValue } : {}),
        }),
      );
    } catch {
      // localStorage unavailable (private mode): answers just aren't carried over.
    }
  };

  const inputStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    color: "var(--ink)",
    fontSize: 14,
    padding: "10px 12px",
    width: "100%",
  } as const;

  const showAudienceHint = Boolean(
    audienceHint && (!preview || preview.buckets.length === 0),
  );
  const previewStats = (
    <>
      {preview && preview.total >= 5 ? (
        <div data-quick-signup-preview style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "var(--text-3)", fontSize: 13 }}>
            {t({ en: `${preview.total} people have registered`, zh: `已有 ${preview.total} 人报名` })}
          </span>
          {preview.buckets.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {preview.buckets.map((bucket) => (
                <span className="chip" key={bucket.label}>{bucket.label} × {bucket.count}+</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {showAudienceHint ? (
        <div data-quick-signup-audience style={{ color: "var(--text-3)", fontSize: 13 }}>
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{t({ en: "Who this is for: ", zh: "这场适合：" })}</span>
          {audienceHint}
        </div>
      ) : null}
    </>
  );

  // 准入审核活动的报名申请只接受签名问答，速答不会带入——因此不收集
  // 任何回答，只保留聚合预览和入口，避免许下不会兑现的承诺。
  if (preview?.admissionControlled) {
    return (
      <section className="card" data-event-quick-signup data-quick-signup-admission style={{ borderLeft: "3px solid var(--accent)", display: "grid", gap: 12, padding: 16 }}>
        <span className="eyebrow">ORBIT MATCH</span>
        <strong style={{ color: "var(--ink)", fontSize: 15 }}>
          {t({ en: "This event reviews every application", zh: "这场活动由主办方审核报名" })}
        </strong>
        {previewStats}
        <a
          className="btn btn-primary"
          data-quick-signup-register
          href={`/app/events/${encodeURIComponent(eventId)}/register`}
          style={{ justifyContent: "center", textDecoration: "none" }}
        >
          {t({ en: "Start your application", zh: "去申请报名" })}
          <Icon name="arrowUR" size={16} />
        </a>
      </section>
    );
  }

  return (
    <section className="card" data-event-quick-signup style={{ borderLeft: "3px solid var(--accent)", display: "grid", gap: 12, padding: 16 }}>
      <span className="eyebrow">ORBIT MATCH</span>
      <strong style={{ color: "var(--ink)", fontSize: 15 }}>
        {t({ en: "Two quick answers before you register", zh: "先花 20 秒说说这场想要什么" })}
      </strong>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 600 }}>{t({ en: "Who do you want to meet here?", zh: "这场你想认识谁？" })}</span>
        <input
          data-quick-signup-target
          onChange={(changeEvent) => {
            setTargetAttendees(changeEvent.target.value);
            persist({ targetAttendees: changeEvent.target.value, valueOffered });
          }}
          placeholder={t({ en: "e.g. hardware founders, supply chain people", zh: "例如：硬件创始人、供应链的人" })}
          style={inputStyle}
          value={targetAttendees}
        />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 600 }}>{t({ en: "What can you offer?", zh: "你能为别人提供什么？" })}</span>
        <input
          data-quick-signup-offer
          onChange={(changeEvent) => {
            setValueOffered(changeEvent.target.value);
            persist({ targetAttendees, valueOffered: changeEvent.target.value });
          }}
          placeholder={t({ en: "e.g. fundraising experience, customer intros", zh: "例如：融资经验、客户资源引荐" })}
          style={inputStyle}
          value={valueOffered}
        />
      </label>
      {previewStats}
      <a
        className="btn btn-primary"
        data-quick-signup-register
        href={`/app/events/${encodeURIComponent(eventId)}/register`}
        style={{ justifyContent: "center", textDecoration: "none" }}
      >
        {t({ en: "Save answers and register", zh: "带着回答去报名" })}
        <Icon name="arrowUR" size={16} />
      </a>
      <span style={{ color: "var(--text-3)", fontSize: 12 }}>
        {t({ en: "Answers stay on this device until you register.", zh: "回答先存在本机，报名时自动带入，无需重复填写。" })}
      </span>
    </section>
  );
}
