"use client";

import { useRef, useState, type FormEvent } from "react";
import type { OrbitLanguage } from "../orbit-language-core";

function copy(
  language: OrbitLanguage,
  value: { en: string; zh: string },
): string {
  return language === "en" ? value.en : value.zh;
}

function nextRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatMessageComposer({
  conversationId,
  language,
}: {
  conversationId: string;
  language: OrbitLanguage;
}) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<
    { kind: "error" | "success"; message: string } | null
  >(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = body.trim();

    if (!message || pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setStatus(null);
    requestIdRef.current ??= nextRequestId();

    try {
      const response = await fetch(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          body: JSON.stringify({
            body: message,
            requestId: requestIdRef.current,
          }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": requestIdRef.current,
          },
          method: "POST",
        },
      );
      const envelope = (await response.json()) as {
        error?: { message?: string };
        success?: boolean;
      };

      if (!response.ok || envelope.success === false) {
        throw new Error(
          envelope.error?.message ||
            copy(language, {
              en: "The message could not be recorded.",
              zh: "消息暂时无法记录。",
            }),
        );
      }

      requestIdRef.current = null;
      setBody("");
      setStatus({
        kind: "success",
        message: copy(language, {
          en: "Message recorded. No external delivery was requested.",
          zh: "消息已记录，未请求外部发送。",
        }),
      });
      globalThis.location?.reload();
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : copy(language, {
                en: "The message could not be recorded.",
                zh: "消息暂时无法记录。",
              }),
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form className="orbit-chat-composer" onSubmit={submit}>
      <label htmlFor="orbit-chat-message">
        {copy(language, { en: "Record a message", zh: "记录一条消息" })}
      </label>
      <div>
        <textarea
          disabled={pending}
          id="orbit-chat-message"
          onChange={(event) => {
            setBody(event.target.value);
            setStatus(null);
            requestIdRef.current = null;
          }}
          placeholder={copy(language, {
            en: "Write a source-backed note…",
            zh: "写下有来源依据的消息…",
          })}
          rows={2}
          value={body}
        />
        <button className="btn btn-primary btn-sm" disabled={pending || !body.trim()} type="submit">
          {pending
            ? copy(language, { en: "Recording…", zh: "记录中…" })
            : copy(language, { en: "Record", zh: "记录" })}
        </button>
      </div>
      <small>
        {copy(language, {
          en: "This records the message in your private workspace; it does not send it externally.",
          zh: "消息只记录在你的私有工作区，不会向外部发送。",
        })}
      </small>
      {status ? (
        <p aria-live="polite" className={`is-${status.kind}`} role="status">
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
