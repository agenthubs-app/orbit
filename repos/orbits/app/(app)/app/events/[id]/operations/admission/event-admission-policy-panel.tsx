"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import type {
  EventAdmissionMode,
  EventAdmissionPolicy,
} from "../../../../../../../features/events/admission/contract";

interface AdmissionPolicyReadView {
  policy: EventAdmissionPolicy | null;
  policyVersion: number;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

type PolicySaveState = "idle" | "saving" | "success" | "conflict" | "unavailable";

interface PolicyDraft {
  admissionMode: EventAdmissionMode;
  capacity: string;
  profileEditDeadlineAt: string;
  registrationClosesAt: string;
  registrationOpensAt: string;
  waitlistEnabled: boolean;
}

class PolicyRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PolicyRequestError";
  }
}

function policyUrl(eventId: string): string {
  return `/api/events/${encodeURIComponent(eventId)}/admission/policy`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new PolicyRequestError(
      envelope?.error?.message ?? "报名政策请求失败。",
      response.status,
    );
  }
  return envelope.data;
}

function localDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`
    + `T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function canonicalTimestamp(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

function emptyDraft(): PolicyDraft {
  return {
    admissionMode: "approval_required",
    capacity: "",
    profileEditDeadlineAt: "",
    registrationClosesAt: "",
    registrationOpensAt: "",
    waitlistEnabled: false,
  };
}

function draftFor(policy: EventAdmissionPolicy | null): PolicyDraft {
  if (!policy) return emptyDraft();
  return {
    admissionMode: policy.admissionMode,
    capacity: policy.capacity === null ? "" : String(policy.capacity),
    profileEditDeadlineAt: localDateTime(policy.profileEditDeadlineAt),
    registrationClosesAt: localDateTime(policy.registrationClosesAt),
    registrationOpensAt: localDateTime(policy.registrationOpensAt),
    waitlistEnabled: policy.waitlistEnabled,
  };
}

function timeLabel(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestamp))
    : "—";
}

function policyPayload(
  draft: PolicyDraft,
  expectedPolicyVersion: number,
): Record<string, unknown> | null {
  const registrationOpensAt = canonicalTimestamp(draft.registrationOpensAt);
  const registrationClosesAt = canonicalTimestamp(draft.registrationClosesAt);
  const profileEditDeadlineAt = canonicalTimestamp(draft.profileEditDeadlineAt);
  if (
    !registrationOpensAt ||
    !registrationClosesAt ||
    !profileEditDeadlineAt ||
    Date.parse(registrationOpensAt) >= Date.parse(registrationClosesAt) ||
    Date.parse(profileEditDeadlineAt) < Date.parse(registrationOpensAt) ||
    Date.parse(profileEditDeadlineAt) > Date.parse(registrationClosesAt)
  ) {
    return null;
  }
  const rawCapacity = draft.capacity.trim();
  const capacity = rawCapacity === "" ? null : Number(rawCapacity);
  if (
    capacity !== null &&
    (!Number.isSafeInteger(capacity) || capacity < 0)
  ) {
    return null;
  }
  return {
    admissionMode: draft.admissionMode,
    capacity,
    expectedPolicyVersion,
    profileEditDeadlineAt,
    registrationClosesAt,
    registrationOpensAt,
    waitlistEnabled: draft.waitlistEnabled,
  };
}

function ReadOnlyPolicy({ policy }: { policy: EventAdmissionPolicy | null }) {
  if (!policy) {
    return (
      <p data-admission-policy-empty style={{ color: "var(--text-3)", margin: 0 }}>
        当前活动尚未配置报名政策。
      </p>
    );
  }

  return (
    <dl data-admission-policy-readonly style={{ display: "grid", gap: 8, margin: 0 }}>
      <div><dt>录取方式</dt><dd>{policy.admissionMode === "instant" ? "即时录取" : "人工审核"}</dd></div>
      <div><dt>容量</dt><dd>{policy.capacity === null ? "不设上限" : `${policy.capacity} 人`}</dd></div>
      <div><dt>候补名单</dt><dd>{policy.waitlistEnabled ? "已启用" : "未启用"}</dd></div>
      <div><dt>报名开放</dt><dd>{timeLabel(policy.registrationOpensAt)}</dd></div>
      <div><dt>报名截止</dt><dd>{timeLabel(policy.registrationClosesAt)}</dd></div>
      <div><dt>画像编辑截止</dt><dd>{timeLabel(policy.profileEditDeadlineAt)}</dd></div>
    </dl>
  );
}

export function EventAdmissionPolicyPanel({
  canConfigurePolicy,
  eventId,
}: {
  canConfigurePolicy: boolean;
  eventId: string;
}) {
  const [view, setView] = useState<AdmissionPolicyReadView | null>(null);
  const [draft, setDraft] = useState<PolicyDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<PolicySaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);

  const loadPolicy = useCallback(async (options: { retainStatus?: boolean } = {}) => {
    setLoading(true);
    try {
      const next = await requestJson<AdmissionPolicyReadView>(policyUrl(eventId));
      setView(next);
      setDraft(draftFor(next.policy));
      if (!options.retainStatus) {
        setError(null);
        setSaveState("idle");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取报名政策。");
      setSaveState("unavailable");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!view || !canConfigurePolicy) return;
    const payload = policyPayload(draft, view.policyVersion);
    if (!payload) {
      setError("请确认容量为非负整数，报名开放早于截止，且画像编辑截止位于报名窗口内。");
      setSaveState("idle");
      return;
    }

    setSaveState("saving");
    setError(null);
    setNotice(null);
    try {
      const next = await requestJson<AdmissionPolicyReadView>(policyUrl(eventId), {
        body: JSON.stringify(payload),
        method: "PUT",
      });
      setView(next);
      setDraft(draftFor(next.policy));
      setSaveState("success");
      setNotice(`报名政策已保存为 v${next.policyVersion}。`);
    } catch (cause) {
      if (cause instanceof PolicyRequestError && cause.status === 409) {
        setSaveState("conflict");
        if (cause.message === "Admission policy changed. Refresh and try again.") {
          setError("政策已被其他负责人更新，已读取当前版本；请确认后重新保存。");
          await loadPolicy({ retainStatus: true });
        } else {
          setError("保存前请先配置活动运营时间；如有旧报名记录，请先完成迁移。");
        }
        return;
      }
      setSaveState("unavailable");
      setError(cause instanceof Error ? cause.message : "报名政策暂时无法保存。");
    }
  }

  return (
    <section
      aria-label="报名政策"
      className="card-flat"
      data-admission-policy-panel
      style={{ display: "grid", gap: 14, marginBottom: 18, padding: 18 }}
    >
      <header style={{ alignItems: "baseline", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">ADMISSION · POLICY</div>
          <h2 style={{ margin: "4px 0 0" }}>报名政策</h2>
        </div>
        <span className="badge" data-admission-policy-version>
          当前版本 v{view?.policyVersion ?? "—"}
        </span>
      </header>

      {loading ? <p style={{ color: "var(--text-3)", margin: 0 }}>正在读取 canonical 报名政策…</p> : null}
      {error ? (
        <div data-admission-policy-status={saveState} role="alert" style={{ color: "var(--danger, #b3261e)" }}>
          <p style={{ margin: 0 }}>{error}</p>
          {saveState === "unavailable" ? (
            <button className="btn btn-ghost btn-sm" onClick={() => void loadPolicy()} type="button">重试读取</button>
          ) : null}
        </div>
      ) : null}
      {notice ? <p data-admission-policy-status={saveState} role="status" style={{ color: "var(--success, #147d64)", margin: 0 }}>{notice}</p> : null}

      {!loading && view && !canConfigurePolicy ? <ReadOnlyPolicy policy={view.policy} /> : null}

      {!loading && view && canConfigurePolicy ? (
        <form data-admission-policy-form onSubmit={(event) => void savePolicy(event)} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>录取方式</span>
            <select data-admission-policy-field="admissionMode" onChange={(event) => setDraft((current) => ({ ...current, admissionMode: event.target.value as EventAdmissionMode }))} value={draft.admissionMode}>
              <option value="approval_required">人工审核</option>
              <option value="instant">即时录取</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>容量（留空表示不设上限）</span>
            <input data-admission-policy-field="capacity" inputMode="numeric" min="0" onChange={(event) => setDraft((current) => ({ ...current, capacity: event.target.value }))} type="number" value={draft.capacity} />
          </label>
          <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <input checked={draft.waitlistEnabled} data-admission-policy-field="waitlistEnabled" onChange={(event) => setDraft((current) => ({ ...current, waitlistEnabled: event.target.checked }))} type="checkbox" />
            <span>启用候补名单</span>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>报名开放时间</span>
            <input data-admission-policy-field="registrationOpensAt" onChange={(event) => setDraft((current) => ({ ...current, registrationOpensAt: event.target.value }))} type="datetime-local" value={draft.registrationOpensAt} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>报名截止时间</span>
            <input data-admission-policy-field="registrationClosesAt" onChange={(event) => setDraft((current) => ({ ...current, registrationClosesAt: event.target.value }))} type="datetime-local" value={draft.registrationClosesAt} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>画像编辑截止时间</span>
            <input data-admission-policy-field="profileEditDeadlineAt" onChange={(event) => setDraft((current) => ({ ...current, profileEditDeadlineAt: event.target.value }))} type="datetime-local" value={draft.profileEditDeadlineAt} />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button className="btn btn-primary" data-admission-policy-save disabled={saveState === "saving"} type="submit">
              {saveState === "saving" ? "正在保存…" : "保存报名政策"}
            </button>
            <button className="btn btn-ghost" disabled={saveState === "saving"} onClick={() => void loadPolicy()} type="button">恢复当前版本</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
