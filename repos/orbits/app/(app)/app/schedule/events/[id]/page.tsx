import { AccountTopNav } from "../../../orbit-account-shell";
import { Icon } from "../../../orbit-reference-primitives";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../orbit-visual-freeze-runtime";
import {
  loadAppScheduleEventPreviewRouteViewModel,
  type AppScheduleEventPreviewRouteViewModel,
} from "./event-preview-route-view-model";

function PreviewActions({
  actions,
}: {
  actions: readonly { href: string; label: string }[];
}) {
  return (
    <div
      aria-label="恢复操作"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      {actions.map((action, index) => (
        <a
          className={index === 0 ? "btn btn-primary" : "btn btn-ghost"}
          href={action.href}
          key={action.href}
        >
          {action.label}
        </a>
      ))}
    </div>
  );
}

function ScheduleEventPreviewSuccess({
  model,
}: {
  model: Extract<AppScheduleEventPreviewRouteViewModel, { state: "success" }>;
}) {
  return (
    <main
      className="orbit-personal-page"
      data-orbit-real-page="schedule"
      data-orbit-route="app-schedule-event-preview"
    >
      <div style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <AccountTopNav active="schedule" />
        <div
          className="scroll"
          data-appscroll
          style={{
            margin: "0 auto",
            maxWidth: 860,
            padding: "32px min(32px, 6vw) 80px",
          }}
        >
          <section
            className="card"
            style={{
              display: "grid",
              gap: 18,
              padding: "clamp(18px, 4vw, 28px)",
            }}
          >
            <div>
              <div className="eyebrow">日程安排</div>
              <h1 className="h-display" style={{ margin: "4px 0 0" }}>
                {model.title}
              </h1>
              <p
                style={{
                  color: "var(--text-2)",
                  fontSize: 14,
                  lineHeight: 1.7,
                  margin: "10px 0 0",
                }}
              >
                {model.description}
              </p>
            </div>
            <div
              className="card-flat"
              style={{ display: "grid", gap: 14, padding: 16 }}
            >
              <div
                style={{
                  alignItems: "flex-start",
                  display: "flex",
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    alignItems: "center",
                    background: "var(--amber-soft)",
                    borderRadius: 12,
                    color: "var(--amber)",
                    display: "inline-flex",
                    flexShrink: 0,
                    height: 40,
                    justifyContent: "center",
                    width: 40,
                  }}
                >
                  <Icon name="calendar" size={19} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2
                    className="h-title"
                    style={{
                      margin: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {model.event.title}
                  </h2>
                  <div
                    style={{
                      color: "var(--text-3)",
                      fontSize: 13,
                      lineHeight: 1.5,
                      marginTop: 4,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {model.event.venue}
                  </div>
                </div>
                <span className="badge badge-soon" style={{ flexShrink: 0 }}>
                  {model.event.statusLabel}
                </span>
              </div>
              <div style={{ display: "grid", gap: 9 }}>
                <span
                  style={{
                    alignItems: "center",
                    color: "var(--text-3)",
                    display: "inline-flex",
                    fontSize: 13,
                    gap: 7,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  <Icon name="clock" size={14} />
                  {model.event.timing}
                </span>
                <span
                  style={{
                    alignItems: "center",
                    color: "var(--text-3)",
                    display: "inline-flex",
                    fontSize: 13,
                    gap: 7,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  <Icon name="doc" size={14} />
                  {model.event.sourceContext}
                </span>
              </div>
              <p
                style={{
                  color: "var(--text-2)",
                  fontSize: 14,
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {model.event.nextAction}
              </p>
            </div>
            <p
              className="card-flat"
              style={{
                color: "var(--text-2)",
                fontSize: 13,
                lineHeight: 1.65,
                margin: 0,
                padding: 14,
              }}
            >
              {model.guardrail}
            </p>
            <PreviewActions actions={model.recoveryActions} />
          </section>
        </div>
      </div>
    </main>
  );
}

function ScheduleEventPreviewFailure({
  model,
}: {
  model: Extract<AppScheduleEventPreviewRouteViewModel, { state: "failure" }>;
}) {
  return (
    <main
      className="orbit-personal-page"
      data-orbit-real-page="schedule"
      data-orbit-route="app-schedule-event-preview-state"
    >
      <div style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <AccountTopNav active="schedule" />
        <section
          className="card"
          style={{
            display: "grid",
            gap: 16,
            margin: "32px auto",
            maxWidth: 720,
            padding: 24,
            width: "calc(100% - 32px)",
          }}
        >
          <div>
            <div className="eyebrow">日程安排</div>
            <h1 className="h-title" style={{ margin: "4px 0 0" }}>
              {model.title}
            </h1>
          </div>
          <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
            {model.description}
          </p>
          <p
            className="card-flat"
            style={{
              color: "var(--text-2)",
              fontSize: 13,
              lineHeight: 1.6,
              margin: 0,
              padding: 14,
            }}
          >
            {model.guardrail}
          </p>
          {model.errorCode ? (
            <div className="badge" style={{ justifySelf: "start" }}>
              来源状态 {model.errorCode}
            </div>
          ) : null}
          <PreviewActions actions={model.recoveryActions} />
        </section>
      </div>
    </main>
  );
}

export default async function AppScheduleEventPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const model = await loadAppScheduleEventPreviewRouteViewModel({ eventId: id });

  return (
    <>
      <OrbitReferenceStyles />
      {model.state === "success" ? (
        <ScheduleEventPreviewSuccess model={model} />
      ) : (
        <ScheduleEventPreviewFailure model={model} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
