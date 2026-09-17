"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

const person = z.object({
  recommendationId: z.string().trim().min(1), eventId: z.string().trim().min(1),
  attendee: z.object({ attendeeId: z.string().trim().min(1), displayName: z.string().trim().min(1), role: z.string(), organization: z.string(), contactId: z.string().trim().min(1).max(512).optional() }),
  reasons: z.array(z.string()),
});
const recommendations = z.object({ state: z.enum(["success", "empty", "pending"]), event: z.object({ id: z.string() }), recommendations: z.array(person), nextAction: z.string() });

// Mounted only in the result view and keyed by the parent's canonical actor/origin/event scope.
export function RegistrationPortraitRecommendations({ eventId, language }: { eventId: string; language: "en" | "zh" }) {
  const mounted = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const [data, setData] = useState<z.infer<typeof recommendations> | null>(null);
  const [state, setState] = useState<"loading" | "failed" | "ready">("loading");
  const copy = (en: string, zh: string) => language === "en" ? en : zh;
  async function readRecommendations() {
    if (!mounted.current || operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setState("loading"); setData(null);
    try {
      const response = await fetch(`/api/recommendations/event/${encodeURIComponent(eventId)}?limit=3`, { method: "GET", cache: "no-store", signal: controller.signal });
      const envelope = await response.json().catch(() => null);
      if (!response.ok || envelope?.success !== true) throw new Error("Recommendation read failed.");
      const result = recommendations.parse(envelope.data);
      if (result.event.id !== eventId || result.recommendations.some(entry => entry.eventId !== eventId) || new Set(result.recommendations.map(entry => entry.recommendationId)).size !== result.recommendations.length || new Set(result.recommendations.map(entry => entry.attendee.attendeeId)).size !== result.recommendations.length) throw new Error("Recommendation scope is invalid.");
      if (!mounted.current || operation.current !== controller || controller.signal.aborted) return;
      setData(result); setState("ready");
    } catch { if (mounted.current && operation.current === controller && !controller.signal.aborted) setState("failed"); }
    finally { if (operation.current === controller) operation.current = null; }
  }
  useEffect(() => {
    mounted.current = true; void readRecommendations();
    return () => { mounted.current = false; operation.current?.abort(); operation.current = null; };
    // The parent remounts this component for every canonical scope change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <section style={{ marginTop: 18 }}>
    <h3>{copy("People to meet", "建议认识的人")}</h3>
    {state === "failed" ? <><p role="alert">{copy("Recommendations unavailable. Your portrait is unchanged.", "推荐暂时不可用，画像未受影响。")}</p><button className="btn portrait-link" type="button" onClick={readRecommendations}>{copy("Retry recommendations", "重试推荐")}</button></> : state === "loading" || data?.state === "pending" ? <p role="status" className="portrait-note">{copy("Loading recommendations…", "正在读取推荐…")}</p> : data?.recommendations.length === 0 ? <p className="portrait-note">{copy("No recommendations yet", "暂无推荐")}</p> : data?.recommendations.map(entry => <article key={entry.recommendationId} style={{ padding: "10px 0", borderBottom: "1px solid #EEF0F4" }}><strong>{entry.attendee.displayName}</strong><p className="portrait-note">{[entry.attendee.role, entry.attendee.organization].filter(Boolean).join(" · ")}</p>{entry.reasons.length ? <p className="portrait-note">{entry.reasons.join(" · ")}</p> : null}{entry.attendee.contactId ? <a href={`/app/contacts/${encodeURIComponent(entry.attendee.contactId)}?language=${language}`}>{copy("View contact", "查看联系人")}</a> : null}</article>)}
  </section>;
}
