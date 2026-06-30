/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
/**
 * UI 风格基础页。
 *
 * 这是设计 token 和基础组件的实物样张，用真实业务场景展示颜色、状态、
 * privacy/confirmation/evidence 等语义样式如何组合。
 */
import "../../../globals.css";
import {
  Chip,
  Field,
  InlineMetric,
  PrimaryAction,
  ProductFrame,
  ProductSurface,
  SecondaryAction,
  StatusDisplay,
  TokenSwatch,
} from "../../../../shared/ui/primitives";
import { color } from "../../../../shared/ui/theme";

const colorSamples = [
  { name: "Canvas", tone: "canvas", value: color.canvas },
  { name: "Surface", tone: "surface", value: color.surface },
  { name: "Raised surface", tone: "raised", value: color.surfaceRaised },
  { name: "Text", tone: "text", value: color.text },
  { name: "Muted text", tone: "muted", value: color.mutedText },
  { name: "Border", tone: "border", value: color.border },
  { name: "Primary action", tone: "primary", value: color.primaryAction },
  { name: "Evidence", tone: "evidence", value: color.evidence },
  { name: "Confirmation", tone: "confirmation", value: color.confirmation },
  { name: "Privacy", tone: "privacy", value: color.privacy },
  { name: "Warning", tone: "warning", value: color.warning },
  { name: "Success", tone: "success", value: color.success },
];

export default function StyleFoundationPage() {
  return (
    <ProductFrame>
      <div className="workbench-shell">
        <header className="workbench-header">
          <p className="workbench-kicker">Style foundation</p>
          <h1>Post-event follow-up review</h1>
          <p className="workbench-intro">
            Ari Kato asked for an operator intro after the Orbit Summit
            Roundtable. This specimen keeps source, privacy, confirmation, and
            next-step controls visible in one compact participant-facing surface.
          </p>
        </header>

        <section className="workbench-grid" aria-label="Relationship review specimen">
          <ProductSurface
            elevated
            eyebrow="Relationship context"
            title="Ari Kato needs a source-backed intro"
          >
            <div className="type-stack">
              <p className="type-title">The hiring-market intro is worth a follow-up.</p>
              <p className="type-body">
                Met through Nia Patel after the procurement panel. The badge
                scan and event note point to the same ask, so Orbit should keep
                the origin beside the recommendation.
              </p>
              <p className="type-caption">ORBIT SUMMIT ROUNDTABLE / JUNE 18</p>
            </div>
            <div className="dense-grid" aria-label="Relationship metrics">
              <InlineMetric label="Evidence" tone="evidence" value="2 sources" />
              <InlineMetric label="Follow-up" tone="success" value="Draft ready" />
              <InlineMetric label="Privacy" tone="privacy" value="1 hidden note" />
            </div>
          </ProductSurface>

          <ProductSurface eyebrow="Source evidence" title="Why this connection exists">
            <div className="relationship-record">
              <header>
                <p className="relationship-name">Ari Kato</p>
                <p className="type-caption">Orbit Summit Roundtable / June 18</p>
              </header>
              <dl className="relationship-meta">
                <div>
                  <dt>Origin</dt>
                  <dd>Met after the procurement panel through Nia Patel.</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>Badge scan and note mention a hiring-market intro.</dd>
                </div>
                <div>
                  <dt>Next action</dt>
                  <dd>Draft a warm intro, then confirm before sending.</dd>
                </div>
              </dl>
              <div className="chip-row" aria-label="Relationship chips">
                <Chip>Event source</Chip>
                <Chip tone="evidence">Evidence attached</Chip>
                <Chip tone="confirmation">Confirm first</Chip>
                <Chip tone="privacy">Private note</Chip>
              </div>
              <details>
                <summary>Source record</summary>
                <p className="type-body">
                  Badge scan, roundtable note, and user-confirmed next step are
                  shown together before any external action.
                </p>
              </details>
            </div>
          </ProductSurface>
        </section>

        <section className="workbench-grid" aria-label="Guardrail and privacy specimens">
          <ProductSurface eyebrow="Confirmation guard" title="Paused before send">
            <div className="action-guard">
              <StatusDisplay
                label="Action state"
                tone="warning"
                value="Needs user confirmation"
              />
              <p className="type-body">
                Orbit can prepare the intro, but the send path stays paused
                until the source, private context, and intended recipient are
                reviewed together.
              </p>
              <dl className="guard-list">
                <div>
                  <dt>Source attached</dt>
                  <dd>Badge scan and event note are visible before the draft.</dd>
                </div>
                <div>
                  <dt>Privacy checked</dt>
                  <dd>Funding context stays private and is excluded from the intro.</dd>
                </div>
                <div>
                  <dt>External action paused</dt>
                  <dd>The primary button confirms the next step; it does not send yet.</dd>
                </div>
              </dl>
              <p className="handoff-preview">
                Draft intent: introduce Ari to a hiring-market operator with the
                Orbit Summit source attached.
              </p>
            </div>
          </ProductSurface>

          <ProductSurface eyebrow="Privacy boundary" title="Private notes stay scoped">
            <p className="privacy-note">
              Private note: hide funding context from exports and generated copy.
            </p>
            <StatusDisplay
              label="Visibility"
              tone="privacy"
              value="Private to this workspace"
            />
            <details>
              <summary>Runtime disclosure</summary>
              <p className="type-body">
                This foundation route renders static specimen states only; live
                providers replace the same primitives without changing their
                visual contract.
              </p>
            </details>
          </ProductSurface>
        </section>

        <ProductSurface eyebrow="Token palette" title="Semantic color roles">
          <div className="token-grid" aria-label="Token palette">
            {colorSamples.map((sample) => (
              <TokenSwatch
                key={sample.name}
                name={sample.name}
                tone={sample.tone}
                value={sample.value}
              />
            ))}
          </div>
        </ProductSurface>

        <section className="workbench-grid" aria-label="Control and action specimens">
          <ProductSurface eyebrow="Control states" title="Confirm the draft before sending">
            <div className="control-stack">
              <Field label="Relationship source" helper="Required before a recommendation">
                <input defaultValue="Orbit Summit Roundtable" />
              </Field>
              <Field label="Visibility" helper="Private context stays out of exports">
                <select defaultValue="private">
                  <option value="private">Private to me</option>
                  <option value="team">Share with team</option>
                </select>
              </Field>
              <Field label="Evidence note">
                <textarea defaultValue="Ari asked for a source-backed intro to a hiring-market operator." />
              </Field>
            </div>
          </ProductSurface>

          <ProductSurface eyebrow="Action states" title="Primary and secondary decisions">
            <div className="control-stack">
              <StatusDisplay label="Ready state" tone="success" value="Source checked" />
              <StatusDisplay
                label="External send gated"
                tone="warning"
                value="Locked until confirmed"
              />
              <div className="button-row">
                <PrimaryAction>Confirm next step</PrimaryAction>
                <SecondaryAction>Keep as draft</SecondaryAction>
                <SecondaryAction disabled>Send externally locked</SecondaryAction>
              </div>
              <details>
                <summary>Responsive evidence</summary>
                <p className="type-body">
                  No external message leaves the workspace from this specimen.
                  Desktop, tablet, and 375px mobile layouts use dense grid tracks
                  and wrapped controls to avoid horizontal overflow.
                </p>
              </details>
            </div>
          </ProductSurface>
        </section>
      </div>
    </ProductFrame>
  );
}
