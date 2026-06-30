import { bilingualText } from "./bilingual";
import { Chip, WorkbenchSurface } from "./primitives";

// StateView 是空态、pending、failure 等页面状态的统一展示组件。
// 它把“为什么重要 / 当前上下文 / 安全下一步 / 来源证据”固定成一致结构。
export type StateViewRecoveryAction =
  | {
      id: string;
      label: string;
      recoveryCopy: string;
      href: string;
      ariaLabel?: string;
    }
  | {
      id: string;
      label: string;
      recoveryCopy: string;
      href?: undefined;
      ariaLabel?: string;
    };

export interface StateViewProps {
  eyebrow: string;
  title: string;
  description: string;
  purpose?: string;
  emptyState?: string;
  guardrail?: string;
  evidence?: string[];
  nextStep?: string;
  recoveryActions?: StateViewRecoveryAction[];
}

const stateViewStyles = `
.state-recovery-actions {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  max-width: 100%;
  min-width: 0;
}

.state-recovery-action {
  align-content: start;
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: var(--orbit-space-sm);
}

.state-recovery-control {
  align-items: center;
  background: var(--orbit-color-primary);
  border: 1px solid var(--orbit-color-primary-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-primary-text);
  display: inline-flex;
  font-size: 0.9rem;
  font-weight: 760;
  justify-content: center;
  line-height: 1.25;
  min-height: 40px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 8px 12px;
  text-align: center;
  text-decoration: none;
  white-space: normal;
  width: 100%;
}

.state-recovery-action p {
  color: var(--orbit-color-muted);
  font-size: 0.86rem;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}
`;

function normalizeRecoveryActions(
  recoveryActions: StateViewRecoveryAction[],
): StateViewRecoveryAction[] {
  // 空 label 的 recovery action 不渲染，避免出现无意义按钮或空链接。
  return recoveryActions.filter((action) => action.label.trim());
}

function toRecoveryCopyIdPart(value: string): string {
  const idPart = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return idPart || "action";
}

export function StateView({
  eyebrow,
  title,
  description,
  purpose = bilingualText(
    "用来源上下文判断下一段关系工作该怎么走。",
    "Use source context to decide what relationship work comes next.",
  ),
  emptyState = bilingualText(
    "还没有可用的关系来源。",
    "No relationship source is ready yet.",
  ),
  guardrail = bilingualText(
    "Orbit 会等来源复核后再建议动作。",
    "Orbit waits for source review before suggesting an action.",
  ),
  evidence = [],
  nextStep = bilingualText(
    "来源复核后会显示细节，下一步动作要能回到可见证据。",
    "Source details appear after review so the next safe action can stay tied to visible evidence.",
  ),
  recoveryActions = [],
}: StateViewProps) {
  const visibleRecoveryActions = normalizeRecoveryActions(recoveryActions);

  return (
    <div data-state-boundary="shared-ui-state-view">
      <style>{stateViewStyles}</style>
      <WorkbenchSurface elevated eyebrow={eyebrow} title={title}>
        <p className="type-body">{description}</p>
        <div aria-label="Relationship state guidance" className="action-guard">
          <dl className="guard-list">
            <div aria-label="Screen purpose">
              <dt>{bilingualText("为什么重要", "Why this matters")}</dt>
              <dd>{purpose}</dd>
            </div>
            <div aria-label="Available relationship context">
              <dt>{bilingualText("现在可用的上下文", "What you can use now")}</dt>
              <dd>{emptyState}</dd>
            </div>
            <div aria-label="Safe next step">
              <dt>{bilingualText("安全下一步", "Safe next step")}</dt>
              <dd>{guardrail}</dd>
            </div>
          </dl>
        </div>
        {evidence.length > 0 && (
          <details aria-label="State source details">
            <summary>{bilingualText("来源详情", "Source details")}</summary>
            <div aria-label="State source evidence" className="chip-row">
              {evidence.map((item) => (
                <Chip key={item} tone="evidence">
                  {item}
                </Chip>
              ))}
            </div>
          </details>
        )}
        <p className="privacy-note">
          {bilingualText(
            "这里还没有连接任何外部账号。之后的每条记录都要先显示来源，Orbit 才会建议动作。",
            "No outside accounts are connected here yet. Each future record must show its source before Orbit suggests an action.",
          )}
        </p>
        {visibleRecoveryActions.length > 0 ? (
          <div aria-label="Recovery actions" className="state-recovery-actions">
            {visibleRecoveryActions.map((action, actionIndex) => {
              const label = action.label.trim();
              const ariaLabel = action.ariaLabel?.trim() || label;
              const recoveryCopy = action.recoveryCopy.trim();
              const recoveryCopyId = recoveryCopy
                ? `state-recovery-copy-${toRecoveryCopyIdPart(action.id)}-${actionIndex}`
                : undefined;

              return (
                <div
                  className="state-recovery-action"
                  data-state-recovery-copy={recoveryCopy}
                  key={action.id}
                >
                  {action.href ? (
                    <a
                      aria-label={ariaLabel}
                      aria-describedby={recoveryCopyId}
                      className="state-recovery-control"
                      href={action.href}
                    >
                      {label}
                    </a>
                  ) : (
                    <button
                      aria-label={ariaLabel}
                      aria-describedby={recoveryCopyId}
                      className="state-recovery-control"
                      type="button"
                    >
                      {label}
                    </button>
                  )}
                  {recoveryCopy && <p id={recoveryCopyId}>{recoveryCopy}</p>}
                </div>
              );
            })}
          </div>
        ) : nextStep ? (
          <p aria-label="Next step:" className="type-body">
            <strong>{bilingualText("接下来做什么", "What to do next")}:</strong>{" "}
            {nextStep}
          </p>
        ) : null}
      </WorkbenchSurface>
    </div>
  );
}
