/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import type { AppChatAgentArtifactSurfaceViewModel } from "./chat-route-view-model";

export const agentArtifactSidePanelStyles = `
.app-chat-route .agent-artifact-side-panel {
  border-left: 4px solid var(--orbit-color-primary);
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-chat-route .agent-artifact-summary {
  display: grid;
  gap: var(--orbit-space-xs);
}

.app-chat-route .agent-artifact-summary p {
  margin: 0;
}

.app-chat-route .agent-artifact-sections {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-chat-route .agent-artifact-section,
.app-chat-route .agent-artifact-item {
  display: grid;
  gap: var(--orbit-space-xs);
  min-width: 0;
}

.app-chat-route .agent-artifact-item {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-chat-route .agent-artifact-metadata {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));
}

.app-chat-route .agent-artifact-metadata div {
  background: var(--orbit-color-raised);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: 6px 8px;
}

.app-chat-route .agent-artifact-metadata dt,
.app-chat-route .agent-artifact-metadata dd {
  margin: 0;
}

.app-chat-route .agent-artifact-metadata dt {
  color: var(--orbit-color-muted);
  font-size: 0.75rem;
}

.app-chat-route .agent-artifact-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-chat-route .agent-artifact-actions button {
  background: var(--orbit-color-primary);
  border: 1px solid var(--orbit-color-primary-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-primary-text);
  padding: 7px 10px;
}

.app-chat-route .agent-artifact-footer {
  display: grid;
  gap: var(--orbit-space-xs);
}
`;

export function AgentArtifactSidePanel({
  surface,
}: {
  surface: AppChatAgentArtifactSurfaceViewModel | null;
}) {
  if (!surface || surface.surface !== "side_panel") {
    return null;
  }

  return (
    <WorkbenchSurface
      className="agent-artifact-side-panel"
      elevated
      eyebrow={bilingualText("Agent 生成结果", "Agent generated result")}
      title={surface.title}
    >
      <div
        className="agent-artifact-summary"
        data-agent-artifact-id={surface.artifactId}
        data-agent-artifact-kind={surface.kind}
        data-agent-artifact-surface={surface.surface}
      >
        {surface.subtitle && <p className="type-caption">{surface.subtitle}</p>}
        <p className="type-body">{surface.summary}</p>
        <p className="type-caption">{surface.nextAction}</p>
      </div>

      <div className="agent-artifact-sections">
        {surface.sections.map((section) => (
          <section className="agent-artifact-section" key={section.title}>
            <h3 className="relationship-name">{section.title}</h3>
            {section.body && <p className="type-body">{section.body}</p>}
            {section.items.map((item) => (
              <article className="agent-artifact-item" key={item.id}>
                <p className="surface-eyebrow">
                  {item.confidenceLabel ??
                    bilingualText("需要人工复核", "Human review required")}
                </p>
                <h4 className="relationship-name">{item.title}</h4>
                {item.subtitle && <p className="type-caption">{item.subtitle}</p>}
                {item.body && <p className="type-body">{item.body}</p>}
                {item.reason && <p className="type-caption">{item.reason}</p>}
                {item.metadata.length > 0 && (
                  <dl className="agent-artifact-metadata">
                    {item.metadata.map((metadata) => (
                      <div key={`${item.id}:${metadata.label}`}>
                        <dt>{metadata.label}</dt>
                        <dd>{metadata.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {item.actions.length > 0 && (
                  <div
                    aria-label={`${item.title} artifact actions`}
                    className="agent-artifact-actions"
                    data-side-effects="none"
                  >
                    {item.actions.map((action) => (
                      <button
                        data-requires-confirmation={String(
                          action.requiresConfirmation,
                        )}
                        key={action.id}
                        type="button"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        ))}
      </div>

      <div className="agent-artifact-footer">
        <div className="chip-row">
          {surface.sourceModules.map((sourceModule) => (
            <Chip key={sourceModule} tone="evidence">
              {sourceModule}
            </Chip>
          ))}
        </div>
        <details className="chat-evidence-details">
          <summary>
            {bilingualText("Agent 结果证据", "Agent result evidence")}
          </summary>
          <div className="chip-row">
            {surface.evidenceIds.map((evidenceId) => (
              <Chip key={evidenceId} tone="evidence">
                {evidenceId}
              </Chip>
            ))}
          </div>
        </details>
      </div>
    </WorkbenchSurface>
  );
}
