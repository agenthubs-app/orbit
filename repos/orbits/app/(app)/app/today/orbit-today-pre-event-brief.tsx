import type { PreEventBriefArtifact } from "../../../../features/orbit-ai/workflows/contract";

function formatEventTime(brief: PreEventBriefArtifact): string {
  const start = new Date(brief.startsAt);
  if (!Number.isFinite(start.getTime())) return brief.startsAt;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  });
  const startLabel = formatter.format(start);
  if (!brief.endsAt) return startLabel;
  const end = new Date(brief.endsAt);
  return Number.isFinite(end.getTime())
    ? `${startLabel} – ${formatter.format(end)}`
    : startLabel;
}

function ListLine({
  empty,
  label,
  values,
}: {
  empty: string;
  label: string;
  values: readonly string[];
}) {
  return (
    <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
      <strong style={{ color: "var(--text)", fontWeight: 600 }}>{label}：</strong>
      {values.length > 0 ? values.join("、") : empty}
    </p>
  );
}

export function OrbitTodayPreEventBrief({
  brief,
}: {
  brief: PreEventBriefArtifact;
}) {
  return (
    <section
      data-orbit-pre-event-brief={brief.eventId}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 16,
      }}
    >
      <div>
        <div className="eyebrow">会前 Brief</div>
        <h3 style={{ fontSize: 18, margin: "4px 0 8px" }}>{brief.title}</h3>
        <p style={{ color: "var(--text-2)", fontSize: 13, margin: "0 0 4px" }}>
          {formatEventTime(brief)}
        </p>
        <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>
          {brief.location ?? "地点待确认"}
        </p>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 4 }}>本场目标</div>
        <p style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          {brief.goal?.trim() || "尚未设置；可在“需要你决定”中编辑并确认活动目标。"}
        </p>
      </div>

      {brief.preparationGaps.length > 0 ? (
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>准备缺口</div>
          <ul style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            {brief.preparationGaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>重点人物 · 最多 3 位</div>
        <div style={{ display: "grid", gap: 10 }}>
          {brief.people.map((person) => (
            <article
              data-orbit-pre-event-person={person.contactId}
              key={person.contactId}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                padding: 12,
              }}
            >
              <h4 style={{ fontSize: 14, margin: 0 }}>
                {person.displayName}
                {person.organization ? ` · ${person.organization}` : ""}
              </h4>
              <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                {person.whyWorthMeeting}
              </p>
              <p style={{ color: "var(--text-3)", fontSize: 12, margin: 0 }}>
                上次互动：{person.lastInteraction ?? "暂无记录"}
              </p>
              <ListLine
                empty={
                  person.evidenceIds.length > 0
                    ? `${person.evidenceIds.length} 条关系证据`
                    : "暂无证据"
                }
                label="证据"
                values={person.evidenceSummaries ?? []}
              />
              <ListLine empty="待补充" label="建议话题" values={person.suggestedTopics} />
              <ListLine empty="无" label="未完成承诺" values={person.openCommitments} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
