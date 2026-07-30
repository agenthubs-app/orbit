"use client";

import { useEffect, useState } from "react";
import type {
  AgentMemory,
  AgentMemoryCategory,
  AgentMemorySettings,
} from "../../../../features/agent/memory/contract";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

const categoryOptions = [
  { value: "identity", en: "About me", zh: "关于我" },
  { value: "goal", en: "Goals", zh: "目标" },
  { value: "preference", en: "Preferences", zh: "偏好" },
  { value: "constraint", en: "Boundaries", zh: "约束" },
] as const;

const defaultSettings: AgentMemorySettings = {
  enabled: true,
  allowConversationLearning: false,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

const controlStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--ink)",
  font: "inherit",
  minHeight: 42,
  padding: "9px 11px",
  width: "100%",
} as const;

const memorySwitchLabelStyle = {
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  textAlign: "left",
  whiteSpace: "normal",
} as const;

const memorySwitchStateStyle = {
  flexShrink: 0,
} as const;

const memorySwitchStyle = {
  alignItems: "flex-start",
  justifyContent: "space-between",
  minWidth: 0,
  whiteSpace: "normal",
  width: "100%",
} as const;

function apiError(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }
  return fallback;
}

export function OrbitAgentMemorySettings() {
  const { language, t } = useOrbitLanguage();
  const displayLanguage = language === "zh" ? "zh" : "en";
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [settings, setSettings] =
    useState<AgentMemorySettings>(defaultSettings);
  const [category, setCategory] =
    useState<AgentMemoryCategory>("preference");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] =
    useState<AgentMemoryCategory>("preference");
  const [editContent, setEditContent] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/memory", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        data?: {
          memories?: AgentMemory[];
          settings?: AgentMemorySettings;
        };
      } | null;
      if (!response.ok) {
        throw new Error(
          apiError(
            body,
            t({
              en: "Agent memory could not be loaded.",
              zh: "Agent 记忆暂时无法读取。",
            }),
          ),
        );
      }
      setMemories(
        Array.isArray(body?.data?.memories) ? body.data.memories : [],
      );
      setSettings(body?.data?.settings ?? defaultSettings);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "Agent memory could not be loaded.",
              zh: "Agent 记忆暂时无法读取。",
            }),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createMemory() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/agent/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, content }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { memory?: AgentMemory };
      } | null;
      const memory = body?.data?.memory;
      if (!response.ok || !memory) {
        throw new Error(
          apiError(
            body,
            t({
              en: "The memory was not saved.",
              zh: "这条记忆没有保存成功。",
            }),
          ),
        );
      }
      setMemories((current) => [memory, ...current]);
      setContent("");
      setNotice(t({ en: "Memory saved.", zh: "记忆已保存。" }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "The memory was not saved.",
              zh: "这条记忆没有保存成功。",
            }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateSettings(
    patch: Partial<
      Pick<
        AgentMemorySettings,
        "enabled" | "allowConversationLearning"
      >
    >,
  ) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/agent/memory/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { settings?: AgentMemorySettings };
      } | null;
      const nextSettings = body?.data?.settings;
      if (!response.ok || !nextSettings) {
        throw new Error(
          apiError(
            body,
            t({
              en: "Memory settings were not changed.",
              zh: "记忆设置没有更新成功。",
            }),
          ),
        );
      }
      setSettings(nextSettings);
      setNotice(t({ en: "Memory settings updated.", zh: "记忆设置已更新。" }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "Memory settings were not changed.",
              zh: "记忆设置没有更新成功。",
            }),
      );
    } finally {
      setSaving(false);
    }
  }

  function startEditing(memory: AgentMemory) {
    setEditingId(memory.memoryId);
    setEditCategory(memory.category);
    setEditContent(memory.content);
    setDeleteConfirmId(null);
  }

  async function saveEdit(memory: AgentMemory) {
    setPendingId(memory.memoryId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/agent/memory/${encodeURIComponent(memory.memoryId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            category: editCategory,
            content: editContent,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { memory?: AgentMemory };
      } | null;
      const updatedMemory = body?.data?.memory;
      if (!response.ok || !updatedMemory) {
        throw new Error(
          apiError(
            body,
            t({
              en: "The memory was not updated.",
              zh: "这条记忆没有更新成功。",
            }),
          ),
        );
      }
      setMemories((current) =>
        current.map((item) =>
          item.memoryId === memory.memoryId ? updatedMemory : item,
        ),
      );
      setEditingId(null);
      setNotice(t({ en: "Memory updated.", zh: "记忆已更新。" }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "The memory was not updated.",
              zh: "这条记忆没有更新成功。",
            }),
      );
    } finally {
      setPendingId(null);
    }
  }

  async function remove(memory: AgentMemory) {
    if (deleteConfirmId !== memory.memoryId) {
      setDeleteConfirmId(memory.memoryId);
      setEditingId(null);
      return;
    }
    setPendingId(memory.memoryId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/agent/memory/${encodeURIComponent(memory.memoryId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(
          apiError(
            await response.json().catch(() => null),
            t({
              en: "The memory was not deleted.",
              zh: "这条记忆没有删除成功。",
            }),
          ),
        );
      }
      setMemories((current) =>
        current.filter((item) => item.memoryId !== memory.memoryId),
      );
      setDeleteConfirmId(null);
      setNotice(t({ en: "Memory deleted.", zh: "记忆已删除。" }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t({
              en: "The memory was not deleted.",
              zh: "这条记忆没有删除成功。",
            }),
      );
    } finally {
      setPendingId(null);
    }
  }

  function categoryLabel(value: AgentMemoryCategory): string {
    const option = categoryOptions.find((item) => item.value === value);
    return option?.[displayLanguage] ?? value;
  }

  return (
    <section
      aria-labelledby="orbit-agent-memory-title"
      className="card"
      data-orbit-agent-memory-settings
      style={{ marginTop: 16, padding: 24 }}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 14 }}>
        <span
          aria-hidden="true"
          style={{
            alignItems: "center",
            background: "var(--accent-soft)",
            borderRadius: 12,
            color: "var(--accent)",
            display: "inline-flex",
            flex: "0 0 auto",
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Icon name="sparkle" size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            id="orbit-agent-memory-title"
            style={{ color: "var(--ink)", fontSize: 18, margin: 0 }}
          >
            {t({ en: "Agent memory", zh: "Agent 记忆" })}
          </h2>
          <p
            style={{
              color: "var(--text-3)",
              fontSize: 13.5,
              lineHeight: 1.6,
              margin: "6px 0 16px",
            }}
          >
            {t({
              en: "Control the long-term context Orbit may use. Relationship facts remain in Contacts and their evidence.",
              zh: "管理 Orbit 可以使用的长期上下文。关系事实仍保留在人脉及其证据中。",
            })}
          </p>

          <div style={{ display: "grid", gap: 9 }}>
            <button
              aria-checked={settings.enabled}
              className="btn btn-ghost"
              disabled={saving || loading}
              onClick={() =>
                void updateSettings({ enabled: !settings.enabled })
              }
              role="switch"
              style={memorySwitchStyle}
              type="button"
            >
              <span style={memorySwitchLabelStyle}>
                {t({ en: "Use memory in Agent replies", zh: "在 Agent 回复中使用记忆" })}
              </span>
              <span className="chip" style={memorySwitchStateStyle}>
                {settings.enabled
                  ? t({ en: "On", zh: "开启" })
                  : t({ en: "Off", zh: "关闭" })}
              </span>
            </button>
            <button
              aria-checked={settings.allowConversationLearning}
              className="btn btn-ghost"
              disabled={saving || loading}
              onClick={() =>
                void updateSettings({
                  allowConversationLearning:
                    !settings.allowConversationLearning,
                })
              }
              role="switch"
              style={memorySwitchStyle}
              type="button"
            >
              <span style={memorySwitchLabelStyle}>
                {t({
                  en: "Allow approved learning from conversations",
                  zh: "允许从对话中经确认后学习",
                })}
              </span>
              <span className="chip" style={memorySwitchStateStyle}>
                {settings.allowConversationLearning
                  ? t({ en: "On", zh: "开启" })
                  : t({ en: "Off", zh: "关闭" })}
              </span>
            </button>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              display: "grid",
              gap: 10,
              marginTop: 18,
              paddingTop: 18,
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {t({ en: "Add a memory", zh: "添加一条记忆" })}
            </strong>
            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
                {t({ en: "Category", zh: "分类" })}
                <select
                  aria-label={t({ en: "Memory category", zh: "记忆分类" })}
                  onChange={(event) =>
                    setCategory(event.target.value as AgentMemoryCategory)
                  }
                  style={controlStyle}
                  value={category}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option[displayLanguage]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", fontSize: 13, gap: 6 }}>
                {t({ en: "What should Orbit remember?", zh: "希望 Orbit 记住什么？" })}
                <textarea
                  aria-label={t({
                    en: "Memory content",
                    zh: "记忆内容",
                  })}
                  maxLength={600}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={t({
                    en: "Prefer concise Chinese replies.",
                    zh: "偏好简洁的中文回复。",
                  })}
                  rows={2}
                  style={{ ...controlStyle, resize: "vertical" }}
                  value={content}
                />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-primary"
                disabled={saving || !content.trim()}
                onClick={() => void createMemory()}
                type="button"
              >
                <Icon name="plus" size={16} />
                {saving
                  ? t({ en: "Saving…", zh: "正在保存…" })
                  : t({ en: "Save memory", zh: "保存记忆" })}
              </button>
            </div>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" style={{ color: "var(--accent)", fontSize: 13 }}>
              {notice}
            </p>
          ) : null}

          <div
            style={{
              borderTop: "1px solid var(--border)",
              display: "grid",
              gap: 10,
              marginTop: 18,
              paddingTop: 18,
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {t({ en: "Saved memories", zh: "已保存的记忆" })}
            </strong>
            {loading ? (
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
                {t({ en: "Loading…", zh: "正在加载…" })}
              </p>
            ) : memories.length === 0 ? (
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
                {t({
                  en: "No saved memories. Orbit will not infer one silently.",
                  zh: "还没有记忆，Orbit 不会静默推断并保存。",
                })}
              </p>
            ) : (
              memories.map((memory) => {
                const editing = editingId === memory.memoryId;
                const pending = pendingId === memory.memoryId;
                return (
                  <article
                    data-agent-memory-id={memory.memoryId}
                    key={memory.memoryId}
                    style={{
                      background: "var(--bg-soft)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      display: "grid",
                      gap: 9,
                      padding: 14,
                    }}
                  >
                    {editing ? (
                      <>
                        <select
                          aria-label={t({
                            en: "Edit memory category",
                            zh: "编辑记忆分类",
                          })}
                          onChange={(event) =>
                            setEditCategory(
                              event.target.value as AgentMemoryCategory,
                            )
                          }
                          style={controlStyle}
                          value={editCategory}
                        >
                          {categoryOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option[displayLanguage]}
                            </option>
                          ))}
                        </select>
                        <textarea
                          aria-label={t({
                            en: "Edit memory content",
                            zh: "编辑记忆内容",
                          })}
                          maxLength={600}
                          onChange={(event) =>
                            setEditContent(event.target.value)
                          }
                          rows={3}
                          style={{ ...controlStyle, resize: "vertical" }}
                          value={editContent}
                        />
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 7,
                          }}
                        >
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={pending || !editContent.trim()}
                            onClick={() => void saveEdit(memory)}
                            type="button"
                          >
                            {t({ en: "Save changes", zh: "保存修改" })}
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={pending}
                            onClick={() => setEditingId(null)}
                            type="button"
                          >
                            {t({ en: "Cancel", zh: "取消" })}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            alignItems: "center",
                            display: "flex",
                            gap: 10,
                            justifyContent: "space-between",
                          }}
                        >
                          <span className="chip">
                            {categoryLabel(memory.category)}
                          </span>
                          <span
                            style={{ color: "var(--text-3)", fontSize: 12 }}
                          >
                            {memory.source === "manual"
                              ? t({ en: "Added by you", zh: "由你添加" })
                              : t({
                                  en: "Approved from chat",
                                  zh: "经你确认后来自对话",
                                })}
                          </span>
                        </div>
                        <p
                          style={{
                            color: "var(--text)",
                            fontSize: 13,
                            lineHeight: 1.55,
                            margin: 0,
                          }}
                        >
                          {memory.content}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 7,
                          }}
                        >
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={pending}
                            onClick={() => startEditing(memory)}
                            type="button"
                          >
                            {t({ en: "Edit", zh: "编辑" })}
                          </button>
                          <button
                            className="btn btn-sm btn-quiet"
                            disabled={pending}
                            onClick={() => void remove(memory)}
                            type="button"
                          >
                            {deleteConfirmId === memory.memoryId
                              ? t({ en: "Confirm delete", zh: "确认删除" })
                              : t({ en: "Delete", zh: "删除" })}
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
