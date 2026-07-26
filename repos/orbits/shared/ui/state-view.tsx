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

// StateView 是产品路由（app/(app)/app/**）的 route-state 边界，那些路由不会
// 加载 app/globals.css（其中的规则全限定在 `.orbit-dev-root` 下）。所以这里把
// StateView 自己直接渲染的 class（action-guard / guard-list / chip-row /
// privacy-note / type-body）连同原有的 state-recovery-* 规则一起，复制成不依赖
// --orbit-* token、不依赖 `.orbit-dev-root` 作用域的字面量值。
const stateViewStyles = `
.type-body {
  color: var(--text-2, #52615d);
  font-size: 0.94rem;
  line-height: 1.55;
  margin: 0;
  overflow-wrap: anywhere;
}

.action-guard {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.guard-list {
  display: grid;
  gap: 0;
  margin: 0;
  min-width: 0;
}

.guard-list div {
  border-top: 1px solid var(--border, #d5ddd9);
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 0;
}

.guard-list div:first-child {
  border-top: 0;
  padding-top: 0;
}

.guard-list dt {
  color: var(--accent, #0f4758);
  font-size: 0.78rem;
  font-weight: 760;
  line-height: 1.35;
}

.guard-list dd {
  color: var(--text-2, #52615d);
  font-size: 0.88rem;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}

.chip-row {
  align-items: start;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), max-content));
  max-width: 100%;
  min-width: 0;
}

.privacy-note {
  background: var(--accent-softer, #e8f2f0);
  border: 1px solid var(--border, rgba(81, 68, 122, 0.18));
  border-left: 3px solid var(--accent, #51447a);
  border-radius: var(--r-xs, 6px);
  color: var(--text-2, #51447a);
  font-size: 0.82rem;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
  padding: 9px 10px;
}

.state-recovery-actions {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  max-width: 100%;
  min-width: 0;
}

.state-recovery-action {
  align-content: start;
  background: var(--surface, #ffffff);
  border: 1px solid var(--border, #d5ddd9);
  border-radius: var(--r-xs, 6px);
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px;
}

.state-recovery-control {
  align-items: center;
  background: var(--accent, #155e75);
  border: 1px solid var(--accent, #0f4758);
  border-radius: var(--r-sm, 6px);
  color: var(--on-accent, #ffffff);
  display: inline-flex;
  font-size: 0.9rem;
  font-weight: 760;
  justify-content: center;
  line-height: 1.25;
  min-height: 44px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 8px 12px;
  text-align: center;
  text-decoration: none;
  white-space: normal;
  width: 100%;
}

.state-recovery-action p {
  color: var(--text-2, #52615d);
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
