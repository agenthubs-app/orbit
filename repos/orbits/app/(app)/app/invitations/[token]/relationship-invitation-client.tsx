"use client";

import { useEffect, useState } from "react";

interface InvitationPreview {
  canAccept: boolean;
  expiresAt: string;
  invitationId: string;
  inviterDisplayName: string;
  recipientName: string;
  status: "pending" | "accepted" | "expired" | "revoked";
}

type InvitationState =
  | { kind: "loading" }
  | { kind: "failure"; message: string }
  | { kind: "ready"; preview: InvitationPreview }
  | { kind: "accepted"; conversationId: string };

function isPreview(value: unknown): value is InvitationPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preview = value as Partial<InvitationPreview>;
  return typeof preview.invitationId === "string" &&
    typeof preview.inviterDisplayName === "string" &&
    typeof preview.recipientName === "string" &&
    typeof preview.expiresAt === "string" &&
    typeof preview.canAccept === "boolean" &&
    ["pending", "accepted", "expired", "revoked"].includes(preview.status ?? "");
}

function envelopeData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as { success?: unknown; data?: unknown };
  return envelope.success === true ? envelope.data : null;
}

function errorMessage(status: number): string {
  if (status === 401) return "登录已失效，请重新登录后打开邀请。";
  if (status === 404) return "邀请不存在，或不属于当前登录邮箱。";
  if (status === 409) return "邀请已过期、撤销，或已绑定到其他账号。";
  return "暂时无法读取邀请，请稍后重试。";
}

export function RelationshipInvitationClient({ token }: { token: string }) {
  const [state, setState] = useState<InvitationState>({ kind: "loading" });
  const [accepting, setAccepting] = useState(false);
  const endpoint = `/api/relationship-communication/invitations/${encodeURIComponent(token)}`;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { method: "GET", signal: controller.signal })
      .then(async (response) => {
        const data = envelopeData(await response.json().catch(() => null));
        if (!response.ok || !isPreview(data)) {
          throw new Error(errorMessage(response.status));
        }
        setState({ kind: "ready", preview: data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ kind: "failure", message: error instanceof Error ? error.message : errorMessage(500) });
        }
      });
    return () => controller.abort();
  }, [endpoint]);

  async function acceptInvitation() {
    if (state.kind !== "ready" || !state.preview.canAccept || accepting) return;
    setAccepting(true);
    try {
      const response = await fetch(`${endpoint}/accept`, {
        body: JSON.stringify({ confirmed: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = envelopeData(await response.json().catch(() => null));
      const conversationId = data && typeof data === "object" && !Array.isArray(data) &&
        typeof (data as { conversationId?: unknown }).conversationId === "string"
        ? (data as { conversationId: string }).conversationId
        : "";
      if (!response.ok || !conversationId) throw new Error(errorMessage(response.status));
      setState({ conversationId, kind: "accepted" });
    } catch (error) {
      setState({ kind: "failure", message: error instanceof Error ? error.message : errorMessage(500) });
    } finally {
      setAccepting(false);
    }
  }

  if (state.kind === "loading") {
    return <section aria-live="polite" className="card" style={{ padding: 24 }}>正在验证邀请…</section>;
  }
  if (state.kind === "failure") {
    return <section aria-live="assertive" className="card" style={{ display: "grid", gap: 12, padding: 24 }}><h1 className="h-section">无法接受邀请</h1><p style={{ color: "var(--text-2)", margin: 0 }}>{state.message}</p></section>;
  }
  if (state.kind === "accepted") {
    return <section aria-live="polite" className="card" style={{ display: "grid", gap: 16, padding: 24 }}><span className="badge badge-live" style={{ justifySelf: "start" }}>身份已验证</span><h1 className="h-section">关系对话已建立</h1><p style={{ color: "var(--text-2)", margin: 0 }}>回到 Orbit App 刷新关系对话，即可安全收发站内消息。</p><a className="btn btn-primary" href="/app/contacts" style={{ justifySelf: "start" }}>返回人脉</a></section>;
  }

  const expiresAt = new Date(state.preview.expiresAt).toLocaleString("zh-CN");
  const statusCopy = state.preview.status === "accepted" ? "邀请已接受" : state.preview.status === "expired" ? "邀请已过期" : state.preview.status === "revoked" ? "邀请已撤销" : "等待你确认";
  return (
    <section className="card" style={{ display: "grid", gap: 18, padding: 24 }}>
      <span className="badge badge-soon" style={{ justifySelf: "start" }}>{statusCopy}</span>
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ color: "var(--text-3)", margin: 0 }}>Orbit 关系邀请</p>
        <h1 className="h-section" style={{ margin: 0 }}>{state.preview.inviterDisplayName} 邀请你建立关系对话</h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.6, margin: 0 }}>邀请对象：{state.preview.recipientName}。接受后，双方会以当前登录的 Orbit 账号建立一对一站内会话。</p>
      </div>
      <div className="card-flat" style={{ display: "grid", gap: 6, padding: 14 }}>
        <strong>确认边界</strong>
        <span style={{ color: "var(--text-2)" }}>打开本页不会自动接受邀请，也不会发送邮件、短信或消息。</span>
        <span style={{ color: "var(--text-3)" }}>有效期至 {expiresAt}</span>
      </div>
      <button className="btn btn-primary" disabled={!state.preview.canAccept || accepting} onClick={acceptInvitation} style={{ justifySelf: "start" }} type="button">
        {accepting ? "正在确认…" : "接受邀请并建立关系对话"}
      </button>
    </section>
  );
}
