"use client";

import { useEffect, useRef, useState } from "react";

import { ModalShell } from "../../orbit-account-shell";
import { FormField, Icon } from "../../orbit-reference-primitives";

interface ContactChoice {
  id: string;
  displayName: string;
  organization: string;
  role: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contactChoices(body: unknown): ContactChoice[] {
  if (
    !isRecord(body) ||
    body.success !== true ||
    !isRecord(body.data) ||
    !Array.isArray(body.data.contacts)
  ) {
    return [];
  }
  return body.data.contacts.flatMap((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.displayName !== "string"
    ) {
      return [];
    }
    return [
      {
        id: value.id,
        displayName: value.displayName,
        organization:
          typeof value.organization === "string" ? value.organization : "",
        role: typeof value.role === "string" ? value.role : "",
      },
    ];
  });
}

function workflowContactCandidates(body: unknown): ContactChoice[] {
  if (
    !isRecord(body) ||
    !isRecord(body.data) ||
    !Array.isArray(body.data.contactCandidates)
  ) {
    return [];
  }
  return body.data.contactCandidates.flatMap((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.displayName !== "string"
    ) {
      return [];
    }
    return [
      {
        id: value.id,
        displayName: value.displayName,
        organization:
          typeof value.organization === "string" ? value.organization : "",
        role: typeof value.role === "string" ? value.role : "",
      },
    ];
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize),
    );
  }
  return btoa(binary);
}

function duplicateContactIds(
  contacts: readonly ContactChoice[],
  selectedContact: ContactChoice | null,
): readonly string[] {
  if (!selectedContact) return [];
  const normalizedName = selectedContact.displayName.trim().toLocaleLowerCase();
  return contacts
    .filter(
      (contact) =>
        contact.id !== selectedContact.id &&
        contact.displayName.trim().toLocaleLowerCase() === normalizedName,
    )
    .map((contact) => contact.id);
}

export function OrbitPostEventFollowupCapture({
  attendeeNames,
  eventId,
  eventTitle,
}: {
  attendeeNames: readonly string[];
  eventId: string;
  eventTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<readonly ContactChoice[]>([]);
  const [selectedContact, setSelectedContact] =
    useState<ContactChoice | null>(null);
  const [reviewContacts, setReviewContacts] = useState<
    readonly ContactChoice[]
  >([]);
  const [resolvedContactId, setResolvedContactId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteSource, setNoteSource] = useState<
    "typed" | "voice_transcript"
  >("typed");
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [searching, setSearching] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearRecorderResources(): void {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    stopTimerRef.current = null;
    tickTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  }

  function discardRecording(): void {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state === "recording") recorder.stop();
    }
    clearRecorderResources();
  }

  useEffect(
    () => () => {
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state === "recording") {
          recorderRef.current.stop();
        }
      }
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function searchContacts(): Promise<void> {
    const normalized = query.trim();
    if (!normalized) {
      setError("先输入联系人姓名。");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const response = await fetch("/api/contacts/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: normalized }),
      });
      const body = (await response.json()) as unknown;
      const choices = contactChoices(body);
      setContacts(choices);
      if (!response.ok || choices.length === 0) {
        setError("没有找到对应联系人。请换一个姓名，或先在名片夹中创建联系人。");
      }
    } catch {
      setError("联系人搜索失败，请重试。");
    } finally {
      setSearching(false);
    }
  }

  async function transcribe(blob: Blob, durationMs: number): Promise<void> {
    setTranscribing(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const response = await fetch("/api/agent/voice-memos/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audioBase64: bytesToBase64(bytes),
          durationMs,
          locale: "zh",
          mimeType: blob.type || "audio/webm",
        }),
      });
      const body = (await response.json()) as unknown;
      if (
        !response.ok ||
        !isRecord(body) ||
        !isRecord(body.data) ||
        typeof body.data.transcript !== "string"
      ) {
        throw new Error("ASR unavailable");
      }
      setNoteText(body.data.transcript);
      setNoteSource("voice_transcript");
    } catch {
      setError("语音转写暂时不可用，原始音频未保存。请直接输入会面笔记。");
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording(): Promise<void> {
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("当前浏览器不支持录音，请直接输入会面笔记。");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      setRecordedSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Math.min(
          15_000,
          Math.max(1, Date.now() - startedAtRef.current),
        );
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        clearRecorderResources();
        void transcribe(blob, durationMs);
      };
      recorder.start();
      setRecording(true);
      tickTimerRef.current = setInterval(() => {
        setRecordedSeconds(
          Math.min(15, Math.ceil((Date.now() - startedAtRef.current) / 1_000)),
        );
      }, 250);
      stopTimerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 15_000);
    } catch {
      clearRecorderResources();
      setError("无法使用麦克风。你仍可以直接输入会面笔记。");
    }
  }

  function stopRecording(): void {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  async function submit(
    confirmedResolvedContactId?: string,
  ): Promise<void> {
    if (!selectedContact) {
      setError("请选择一位已存在的联系人。");
      return;
    }
    if (!noteText.trim()) {
      setError("请输入并确认会面笔记。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/post-event/followup`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            eventId,
            eventTitle,
            contactId: selectedContact.id,
            contactName: selectedContact.displayName,
            resolvedContactId: confirmedResolvedContactId,
            organization: selectedContact.organization,
            encounterId: `encounter:${eventId}:${selectedContact.id}`,
            noteText: noteText.trim(),
            noteSource,
          }),
        },
      );
      const body = (await response.json()) as unknown;
      if (
        !response.ok ||
        !isRecord(body) ||
        !isRecord(body.data) ||
        !Array.isArray(body.data.actions)
      ) {
        throw new Error("workflow failed");
      }
      if (
        isRecord(body.data.artifact) &&
        body.data.artifact.contactResolution === "merge_review_required"
      ) {
        const candidates = workflowContactCandidates(body);
        setReviewContacts(candidates);
        setResolvedContactId(candidates[0]?.id ?? "");
        setError(null);
        setSubmitting(false);
        return;
      }
      const nextAction = body.data.actions.find(
        (action) =>
          isRecord(action) &&
          action.status === "awaiting_confirmation" &&
          typeof action.actionId === "string",
      );
      const actionId =
        isRecord(nextAction) && typeof nextAction.actionId === "string"
          ? nextAction.actionId
          : null;
      window.location.href = actionId
        ? `/app/today?entry=${encodeURIComponent(actionId)}`
        : "/app/today";
    } catch {
      setError("会后流程没有启动，请重试。笔记仍保留在当前表单中。");
      setSubmitting(false);
    }
  }

  return (
    <>
      <section
        className="card-flat"
        data-orbit-post-event-followup-entry
        style={{ display: "grid", gap: 12, padding: 16 }}
      >
        <div>
          <div className="eyebrow">Orbit Agent · 会后</div>
          <h3 className="h-section" style={{ margin: "5px 0 3px" }}>
            把一次见面转成可完成的跟进
          </h3>
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
            先确认笔记，再分别决定是否建立任务和提醒。消息只保存为草稿。
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Icon name="doc" size={16} />
          记录会后跟进
        </button>
      </section>

      {open ? (
        <ModalShell
          label="记录会后跟进"
          maxW={600}
          onClose={() => {
            discardRecording();
            setOpen(false);
          }}
          step="会后跟进"
        >
          <h2 className="h-title" style={{ margin: "4px 0 6px" }}>
            记录这次交流
          </h2>
          <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 18px" }}>
            原始录音只用于本次转写，不会保存；转写文本可编辑，只有点击确认后才成为证据。
          </p>

          <FormField
            id="post-event-contact-query"
            label="和谁见面了？"
            helper="只会关联你明确选择的现有联系人。"
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="field"
                id="post-event-contact-query"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedContact(null);
                  setReviewContacts([]);
                  setResolvedContactId("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchContacts();
                  }
                }}
                placeholder={attendeeNames[0] ?? "输入联系人姓名"}
                value={query}
              />
              <button
                className="btn btn-ghost"
                disabled={searching}
                onClick={() => void searchContacts()}
                type="button"
              >
                搜索
              </button>
            </div>
          </FormField>

          {attendeeNames.length > 0 && contacts.length === 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {attendeeNames.slice(0, 5).map((name) => (
                <button
                  className="btn chip"
                  key={name}
                  onClick={() => {
                    setQuery(name);
                    setSelectedContact(null);
                    setReviewContacts([]);
                    setResolvedContactId("");
                  }}
                  type="button"
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}

          {contacts.length > 0 ? (
            <div
              aria-label="联系人搜索结果"
              role="listbox"
              style={{ display: "grid", gap: 8, marginTop: 10, maxHeight: 150, overflowY: "auto" }}
            >
              {contacts.map((contact) => (
                <button
                  aria-selected={selectedContact?.id === contact.id}
                  className="btn btn-quiet"
                  key={contact.id}
                  onClick={() => {
                    setSelectedContact(contact);
                    setReviewContacts([]);
                    setResolvedContactId("");
                  }}
                  role="option"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  type="button"
                >
                  {selectedContact?.id === contact.id ? "✓ " : ""}
                  {contact.displayName}
                  {contact.organization ? ` · ${contact.organization}` : ""}
                </button>
              ))}
            </div>
          ) : null}
          {duplicateContactIds(contacts, selectedContact).length > 0 ? (
            <p
              role="status"
              style={{
                background: "var(--accent-soft)",
                borderRadius: "var(--r-sm)",
                color: "var(--text-2)",
                fontSize: 13,
                lineHeight: 1.55,
                margin: "10px 0 0",
                padding: "10px 12px",
              }}
            >
              检测到同名重复联系人。确认笔记后会先进入合并复核，不会创建任何写操作。
              你也可以先到{" "}
              <a href="/app/contacts/new">联系人导入与合并</a>
              {" "}处理重复项。
            </p>
          ) : null}
          {reviewContacts.length > 1 ? (
            <section
              aria-label="重复联系人复核"
              className="card-flat"
              style={{ display: "grid", gap: 10, marginTop: 12, padding: 12 }}
            >
              <div>
                <strong>选择本次跟进对应的联系人</strong>
                <p
                  style={{
                    color: "var(--text-3)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    margin: "4px 0 0",
                  }}
                >
                  服务端检测到同名记录。选择前不会创建任务、提醒或消息草稿；这里只确认本次关联，不会静默合并联系人。
                </p>
              </div>
              <div aria-label="同名联系人候选" role="radiogroup">
                {reviewContacts.map((contact) => (
                  <label
                    key={contact.id}
                    style={{
                      alignItems: "flex-start",
                      display: "flex",
                      gap: 8,
                      padding: "8px 0",
                    }}
                  >
                    <input
                      checked={resolvedContactId === contact.id}
                      name="resolved-contact"
                      onChange={() => setResolvedContactId(contact.id)}
                      type="radio"
                      value={contact.id}
                    />
                    <span>
                      <strong>{contact.displayName}</strong>
                      <span
                        style={{
                          color: "var(--text-3)",
                          display: "block",
                          fontSize: 12,
                        }}
                      >
                        {[contact.role, contact.organization]
                          .filter(Boolean)
                          .join(" · ") || contact.id}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  className="btn btn-primary"
                  disabled={submitting || !resolvedContactId}
                  onClick={() => void submit(resolvedContactId)}
                  type="button"
                >
                  {submitting ? "正在继续…" : "使用选中的联系人继续"}
                </button>
                <a className="btn btn-ghost" href="/app/contacts/new">
                  前往联系人合并
                </a>
              </div>
            </section>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <FormField
              id="post-event-note"
              label="会面笔记"
              helper="可输入文字，或录制最长 15 秒的语音 memo。"
            >
              <textarea
                className="field"
                id="post-event-note"
                onChange={(event) => {
                  setNoteText(event.target.value);
                  setNoteSource("typed");
                }}
                placeholder="对方关心什么、你承诺了什么、下一步是什么？"
                rows={5}
                value={noteText}
              />
            </FormField>
            <div style={{ alignItems: "center", display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className={recording ? "btn btn-primary" : "btn btn-ghost"}
                disabled={transcribing}
                onClick={
                  recording
                    ? stopRecording
                    : () => void startRecording()
                }
                type="button"
              >
                {recording
                  ? `停止录音 ${recordedSeconds}/15s`
                  : transcribing
                    ? "正在转写…"
                    : "录 15 秒语音"}
              </button>
              {noteSource === "voice_transcript" ? (
                <span className="chip">转写已生成，可编辑</span>
              ) : null}
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              style={{ color: "var(--danger, #b4413c)", fontSize: 13, margin: "12px 0 0" }}
            >
              {error}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            <button
              className="btn btn-ghost"
              disabled={submitting}
              onClick={() => {
                discardRecording();
                setOpen(false);
              }}
              type="button"
            >
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={
                submitting ||
                transcribing ||
                recording ||
                !selectedContact ||
                !noteText.trim()
              }
              onClick={() => void submit()}
              type="button"
            >
              {submitting ? "正在准备…" : "确认笔记并准备跟进"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
