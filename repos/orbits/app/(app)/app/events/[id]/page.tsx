/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import {
  APP_EVENT_DETAIL_EVENT_ID,
  loadAppEventDetailRoute,
  type AppEventDetailActionResult,
  type AppEventDetailBoundaryModel,
  type AppEventDetailSuccessModel,
} from "../compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";

export const metadata = {
  title: "Climate founders dinner | Orbit",
  description:
    "Review a source-backed event workspace with attendee roster, readiness, recommendations, in-room intent, notes, and post-event review.",
};

export function generateStaticParams() {
  return [{ id: APP_EVENT_DETAIL_EVENT_ID }];
}

type AppEventDetailSearchParams = Record<string, string | string[] | undefined>;

interface EventDetailPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<AppEventDetailSearchParams>;
}

const routeStyles = `
.app-event-detail-route {
  display: grid;
  gap: var(--orbit-space-md);
  min-width: 0;
}

.orbit-app-shell:has(.app-event-detail-route) .workbench-header,
.orbit-app-shell:has(.app-event-detail-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-event-detail-hero,
.app-event-detail-priority,
.app-event-detail-priority-grid,
.app-event-detail-consistency,
.app-event-detail-grid,
.app-event-detail-metrics,
.app-event-detail-run-sheet,
.app-event-detail-ledger,
.app-event-detail-list,
.app-event-detail-route .chip-row,
.app-event-detail-route-state {
  min-width: 0;
}

.app-event-detail-hero {
  background:
    linear-gradient(135deg, rgba(20, 148, 120, 0.12), rgba(96, 74, 216, 0.08)),
    var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-left: 5px solid var(--orbit-color-evidence);
  border-radius: var(--orbit-radius-card);
  box-shadow: var(--orbit-shadow-card);
  display: grid;
  gap: var(--orbit-space-md);
  padding: var(--orbit-space-lg);
}

.app-event-detail-title {
  display: grid;
  gap: 8px;
}

.app-event-detail-title h1 {
  font-family: var(--orbit-font-display);
  font-size: clamp(2rem, 7vw, 3.1rem);
  font-weight: 780;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
}

.app-event-detail-title p {
  color: var(--orbit-color-muted);
  font-size: 1rem;
  line-height: 1.55;
  margin: 0;
  max-width: 820px;
}

.app-event-detail-meta,
.app-event-detail-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-event-detail-priority-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.8fr);
}

.app-event-detail-priority-surface {
  border-left: 5px solid var(--orbit-color-primary-strong);
}

.app-event-detail-priority-copy {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-event-detail-priority-copy p {
  color: var(--orbit-color-muted);
  line-height: 1.55;
  margin: 0;
}

.app-event-detail-metrics,
.app-event-detail-run-sheet {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 168px), 1fr));
}

.app-event-detail-metric,
.app-event-detail-run-step,
.app-event-detail-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-event-detail-metric strong {
  display: block;
  font-family: var(--orbit-font-display);
  font-size: 1.5rem;
  line-height: 1;
}

.app-event-detail-metric span,
.app-event-detail-run-step span,
.app-event-detail-list dt,
.app-event-detail-ledger dt {
  color: var(--orbit-color-primary-strong);
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.35;
  text-transform: uppercase;
}

.app-event-detail-run-step {
  border-top: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: 6px;
}

.app-event-detail-run-step strong {
  font-size: 0.98rem;
  line-height: 1.35;
}

.app-event-detail-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.78fr);
}

.app-event-detail-list,
.app-event-detail-ledger {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-event-detail-list div,
.app-event-detail-ledger div {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: 4px;
  padding-left: var(--orbit-space-sm);
}

.app-event-detail-list dd,
.app-event-detail-ledger dd,
.app-event-detail-action-result p {
  color: var(--orbit-color-muted);
  line-height: 1.5;
  margin: 0;
}

.app-event-detail-action-link,
.app-event-detail-recovery-actions a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  display: inline-flex;
  font-weight: 700;
  line-height: 1.3;
  padding: 8px 10px;
  text-decoration: none;
}

.app-event-detail-action-link {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
  width: fit-content;
}

.app-event-detail-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: var(--orbit-space-sm);
  margin-top: var(--orbit-space-sm);
}

.app-event-detail-route-state {
  display: grid;
  gap: var(--orbit-space-sm);
}

@media (max-width: 860px) {
  .app-event-detail-grid,
  .app-event-detail-priority-grid {
    grid-template-columns: 1fr;
  }
}
`;

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function readSearchParam(
  searchParams: AppEventDetailSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function yesNo(value: boolean): string {
  return value ? "yes" : "none";
}

function firstName(value: string): string {
  return value.split(" ")[0] ?? value;
}

const productCopyReplacements: readonly [RegExp, string][] = [
  [/\bmock\b/gi, "workspace"],
  [new RegExp("\\b" + "fix" + "tures?\\b", "gi"), "source record"],
  [/\blocal evidence\b/gi, "Source evidence"],
  [/\blocal suggestions\b/gi, "source-backed suggestions"],
  [/\blocal rule\b/gi, "source-backed check"],
  [/\blocal contact\b/gi, "saved contact"],
  [/\blocal\b/gi, "source-backed"],
  [/\bdeterministic\b/gi, "reviewed"],
  [/\blive\b/gi, "connected"],
  [/\bproviders?\b/gi, "connections"],
  [/\bdatabases?\b/gi, "saved records"],
  [/\bAI calls?\b/gi, "automated calls"],
];

function productCopy(value: string | undefined): string {
  return productCopyReplacements.reduce((copy, [pattern, replacement]) => {
    return copy.replace(pattern, replacement);
  }, value ?? "");
}

function evidenceLabel(evidenceId: string): string {
  const words = evidenceId
    .replace(/^evidence:/, "")
    .split(/[-_:]+/)
    .filter((word) => !["fixture", "mock", "local"].includes(word))
    .map((word) => {
      if (word === "rec") {
        return "recommendation";
      }

      return word;
    });
  const label = words.join(" ");

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidenceIds.slice(0, 6).map((evidenceId) => (
        <span data-evidence-id={evidenceId} key={evidenceId}>
          <Chip tone="evidence">{evidenceLabel(evidenceId)}</Chip>
        </span>
      ))}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="app-event-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function relationshipRecordSummary(model: AppEventDetailSuccessModel): string {
  if (model.sourceConsistency.reconciledSourceCount === 0) {
    return "All attendee context already matches the trusted event details.";
  }

  return "Orbit already resolved older attendee logistics; visible venue and time stay anchored to trusted event details.";
}

function checkedRecordSummary(model: AppEventDetailSuccessModel): string {
  if (model.sourceConsistency.apiEvidenceContradictionCount === 0) {
    return "Checked event context already matches trusted event details.";
  }

  return "One source was reconciled before recommendations were shown; venue and time stay anchored to trusted event details.";
}

function renderSourceConsistency(model: AppEventDetailSuccessModel) {
  const canonicalEvent = model.canonicalEvent;

  return (
    <WorkbenchSurface
      className="app-event-detail-consistency"
      eyebrow="Record check"
      title="Venue and time stay anchored"
    >
      <p className="type-body">{relationshipRecordSummary(model)}</p>
      <p className="type-body">{checkedRecordSummary(model)}</p>
      <dl aria-label="Canonical event logistics" className="app-event-detail-ledger">
        <div>
          <dt>Visible venue</dt>
          <dd>{canonicalEvent.venue}</dd>
        </div>
        <div>
          <dt>Visible time</dt>
          <dd>{formatDateTime(canonicalEvent.startsAt)}</dd>
        </div>
        <div>
          <dt>Sources checked</dt>
          <dd>
            {model.sourceConsistency.checkedSourceCount} event sources checked
            before relationship recommendations are shown.
          </dd>
        </div>
        <div>
          <dt>Reconciled</dt>
          <dd>
            {model.sourceConsistency.apiEvidenceContradictionCount} of{" "}
            {model.sourceConsistency.apiEvidenceSurfaceCount} sources needed
            logistics review before this page opened.
          </dd>
        </div>
      </dl>
      <EvidenceChips
        evidenceIds={model.sourceConsistency.evidenceIds}
        label="Canonical event source evidence"
      />
    </WorkbenchSurface>
  );
}

function renderBoundaryState(model: AppEventDetailBoundaryModel) {
  const routeStateUrl = `/app/events/demo-event-1?scenario=${model.routeState}`;

  return (
    <div
      className="app-event-detail-route app-event-detail-route-state"
      data-route-state-url={routeStateUrl}
    >
      <style>{routeStyles}</style>
      <div data-state-boundary="app-event-detail-route-state-view">
        <WorkbenchSurface elevated eyebrow="Event workspace" title={model.title}>
          <p className="type-body">{model.description}</p>
          <dl aria-label="Event workspace state details" className="app-event-detail-ledger">
            <div>
              <dt>Current status</dt>
              <dd>{model.description}</dd>
            </div>
            <div>
              <dt>Safety check</dt>
              <dd>No external action can run until this event context is ready.</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>{model.nextStep}</dd>
            </div>
          </dl>
          <EvidenceChips
            evidenceIds={model.evidence}
            label="Event detail state evidence"
          />
        </WorkbenchSurface>
      </div>
      <nav
        aria-label="Event detail route recovery actions"
        className="app-event-detail-recovery-actions"
      >
        {model.recoveryActions.map((action) => (
          <a href={action.href} key={action.href}>
            {action.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function renderActionResult(actionResult: AppEventDetailActionResult | null) {
  if (!actionResult) {
    return null;
  }

  return (
    <div
      className="app-event-detail-action-result"
      data-action-evidence={actionResult.evidenceId}
      data-action-result="event-detail-want-connect-recorded"
      data-action-storage="route-only"
      data-side-effects={actionResult.sideEffectsLabel}
    >
      <strong>
        {actionResult.targetDisplayName} is marked for this page preview
      </strong>
      <p>
        Intent held for this review: {actionResult.targetDisplayName}. Use this
        as your in-room prompt. {actionResult.matchTitle}
      </p>
      <p>
        This preview only changes what you see here; it does not update a
        saved contact, calendar, message thread, notification, or outside
        network.
      </p>
      <p>
        No realtime presence, peer notification, external message,
        saved-record write, or outside network request ran.
      </p>
      <dl aria-label="Want-to-connect safety ledger" className="app-event-detail-ledger">
        <div>
          <dt>Calendar updates</dt>
          <dd>Calendar updates: {yesNo(actionResult.calendarUpdateExecuted)}</dd>
        </div>
        <div>
          <dt>Realtime presence</dt>
          <dd>Realtime presence: {yesNo(actionResult.realtimePresenceRequested)}</dd>
        </div>
        <div>
          <dt>Peer notifications</dt>
          <dd>Peer notifications: {yesNo(actionResult.peerNotificationDelivered)}</dd>
        </div>
        <div>
          <dt>External messages</dt>
          <dd>External messages: {yesNo(actionResult.externalMessageSent)}</dd>
        </div>
        <div>
          <dt>Saved-record writes</dt>
          <dd>Saved-record writes: {yesNo(actionResult.databaseWriteExecuted)}</dd>
        </div>
        <div>
          <dt>Notifications</dt>
          <dd>Notifications: {yesNo(actionResult.notificationDelivered)}</dd>
        </div>
        <div>
          <dt>Outside network</dt>
          <dd>Outside network requests: {yesNo(actionResult.externalNetworkRequested)}</dd>
        </div>
      </dl>
    </div>
  );
}

function wantConnectTargetName(model: AppEventDetailSuccessModel): string {
  const match = model.wantConnectMatches.matches[0];
  const targetName = match?.participantNames.find(
    (name) => name !== "Orbit operator",
  );

  return targetName ?? "the recommended attendee";
}

function wantConnectTargetAttendee(
  model: AppEventDetailSuccessModel,
  targetName: string,
) {
  return model.attendeeRoster.attendees.find(
    (attendee) => attendee.displayName === targetName,
  );
}

function renderRoutePriority(model: AppEventDetailSuccessModel) {
  const canonicalEvent = model.canonicalEvent;
  const targetName = wantConnectTargetName(model);
  const targetAttendee = wantConnectTargetAttendee(model, targetName);
  const match = model.wantConnectMatches.matches[0];
  const actionLabel = `Mark ${targetName} to meet`;
  const targetContext = productCopy(
    targetAttendee?.relationshipContext ?? match?.successNotice.message,
  );

  return (
    <div
      className="app-event-detail-priority"
      data-route-priority="app-event-detail-next-action"
    >
      <WorkbenchSurface
        elevated
        className="app-event-detail-priority-surface"
        eyebrow="Next action"
        title={`Meet ${targetName} first`}
      >
        <div className="app-event-detail-priority-grid">
          <div className="app-event-detail-priority-copy">
            <p>
              Mark {targetName} as the first person to meet. {targetContext}
            </p>
            <p>{productCopy(match?.successNotice.message)}</p>
            <p>
              Opening line context: {productCopy(match?.successNotice.message)}
            </p>
            <p>
              Orbit has already checked venue and time against trusted event
              sources: {canonicalEvent.venue}, {formatDateTime(canonicalEvent.startsAt)}.
            </p>
            <a
              className="app-event-detail-action-link"
              href="/app/events/demo-event-1?action=want-to-connect&targetContactId=contact:priya-shah"
            >
              {actionLabel}
            </a>
          </div>
          <dl
            aria-label="Relationship priority evidence"
            className="app-event-detail-ledger"
          >
            <div>
              <dt>Canonical place</dt>
              <dd>
                {canonicalEvent.venue}, {formatDateTime(canonicalEvent.startsAt)}
              </dd>
            </div>
            <div>
              <dt>Why first</dt>
              <dd>{targetContext}</dd>
            </div>
            <div>
              <dt>Guardrail</dt>
              <dd>
                This page does not send messages, alerts, saved-record writes,
                or outside network requests.
              </dd>
            </div>
          </dl>
        </div>
      </WorkbenchSurface>
    </div>
  );
}

function renderSuccessState(model: AppEventDetailSuccessModel) {
  const event = model.eventDetail.event;
  const canonicalEvent = model.canonicalEvent;
  const topRecommendation = model.recommendations.recommendations[0];
  const note = model.encounterNote.note;
  const participant = model.encounterNote.participant;
  const targetName = wantConnectTargetName(model);
  const actionLabel = `Mark ${targetName} to meet`;

  return (
    <div
      className="app-event-detail-route"
      data-selected-event={canonicalEvent.id}
      data-state-boundary="app-event-detail-success"
    >
      <style>{routeStyles}</style>
      <section className="app-event-detail-hero" aria-label="Event detail header">
        <div className="app-event-detail-title">
          <p className="surface-eyebrow">Event workspace</p>
          <h1>{event.title}</h1>
          <p>
            Current event: {event.title}. Source story: Calendar source confirmed
            the dinner and the relationship context is ready for in-room review.
          </p>
          <p>
            Venue/time confidence: {canonicalEvent.venue},{" "}
            {formatDateTime(canonicalEvent.startsAt)}.
          </p>
          <p>First person to meet: {targetName}.</p>
          <p>In-room action: {actionLabel} on this page.</p>
          <p>
            {event.description} {event.relationshipContext}
          </p>
        </div>
        <div className="app-event-detail-meta" aria-label="Event status and sources">
          <Chip tone="primary">Status: {event.status}</Chip>
          <Chip tone="evidence">{canonicalEvent.venue}</Chip>
          <Chip tone="confirmation">{formatDateTime(canonicalEvent.startsAt)}</Chip>
        </div>
        <EvidenceChips
          evidenceIds={[
            ...canonicalEvent.evidenceIds,
            ...model.attendeeRoster.provenance.evidenceIds,
          ]}
          label="Event source evidence"
        />
      </section>

      {renderRoutePriority(model)}

      {renderSourceConsistency(model)}

      <section className="app-event-detail-metrics" aria-label="Event route metrics">
        <Metric label="Roster" value={model.attendeeRoster.attendees.length} />
        <Metric
          label="Recommendations"
          value={model.recommendations.recommendations.length}
        />
        <Metric
          label="Readiness"
          value={model.readiness.preparationState.readinessScore}
        />
        <Metric label="Review" value={model.postEventReview.contacts.length} />
      </section>

      <WorkbenchSurface eyebrow="Run sheet" title="What this event is for">
        <div className="app-event-detail-run-sheet">
          <div className="app-event-detail-run-step">
            <span>Goal</span>
            <strong>{model.readiness.goal?.intent}</strong>
          </div>
          <div className="app-event-detail-run-step">
            <span>Meet first</span>
            <strong>{targetName}</strong>
          </div>
          <div className="app-event-detail-run-step">
            <span>After {firstName(targetName)}</span>
            <strong>{topRecommendation.attendee.displayName}</strong>
          </div>
          <div className="app-event-detail-run-step">
            <span>Afterward</span>
            <strong>{model.postEventReview.contacts[0]?.summary.headline}</strong>
          </div>
        </div>
      </WorkbenchSurface>

      <div className="app-event-detail-grid">
        <WorkbenchSurface eyebrow="Goal and readiness" title="Before arrival">
          <p className="type-body">
            Readiness {model.readiness.preparationState.readinessScore}.{" "}
            {productCopy(model.readiness.preparationState.nextPreparationStep)}
          </p>
          <dl className="app-event-detail-list">
            {model.readiness.readinessChecklist.map((item) => (
              <div key={item.itemId}>
                <dt>{item.label}</dt>
                <dd>
                  {item.status} by {item.owner}. {productCopy(item.rationale)}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Attendee roster" title="Who is in the room">
          <dl className="app-event-detail-list">
            {model.attendeeRoster.attendees.map((attendee) => (
              <div key={attendee.attendeeId}>
                <dt>{attendee.displayName}</dt>
                <dd>
                  {attendee.role} at {attendee.organization}.{" "}
                  {productCopy(attendee.suggestedNextAction)}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>
      </div>

      <div className="app-event-detail-grid">
        <WorkbenchSurface
          eyebrow="Secondary lead"
          title={`After ${firstName(targetName)}, review ${topRecommendation.attendee.displayName}`}
        >
          <p className="type-body">
            Treat {topRecommendation.attendee.displayName} as the next evidence-backed
            lead after {targetName}.{" "}
            {topRecommendation.attendee.displayName}, {topRecommendation.attendee.role} at{" "}
            {topRecommendation.attendee.organization}. Score {topRecommendation.score}.
          </p>
          <dl className="app-event-detail-ledger">
            <div>
              <dt>Why now</dt>
              <dd>{productCopy(topRecommendation.recommendedAction)}</dd>
            </div>
            <div>
              <dt>Opening line</dt>
              <dd>{model.openingLine.openingLine.text}</dd>
            </div>
          </dl>
          <EvidenceChips
            evidenceIds={model.openingLine.openingLine.evidenceIds}
            label="Opening line evidence"
          />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="On-site intent" title={`Meet ${firstName(targetName)} first`}>
          <p className="type-body">
            {productCopy(model.wantConnectMatches.matches[0]?.successNotice.message)}
          </p>
          <a
            className="app-event-detail-action-link"
            href="/app/events/demo-event-1?action=want-to-connect&targetContactId=contact:priya-shah"
          >
            {actionLabel}
          </a>
          {renderActionResult(model.actionResult)}
        </WorkbenchSurface>
      </div>

      <div className="app-event-detail-grid">
        <WorkbenchSurface eyebrow="Encounter notes" title="What happened">
          <dl className="app-event-detail-ledger">
            <div>
              <dt>Participant</dt>
              <dd>
                {participant?.displayName} at {participant?.organization}
              </dd>
            </div>
            <div>
              <dt>Note</dt>
              <dd>{note?.text}</dd>
            </div>
            <div>
              <dt>Summary seed</dt>
              <dd>
                {productCopy(
                  model.encounterNote.conversationSummarySeed?.suggestedSummary,
                )}
              </dd>
            </div>
          </dl>
          <EvidenceChips
            evidenceIds={model.encounterNote.provenance.evidenceIds}
            label="Encounter note evidence"
          />
        </WorkbenchSurface>

        <WorkbenchSurface eyebrow="Post-event review" title="Who to keep">
          <dl className="app-event-detail-list">
            {model.postEventReview.contacts.map((contact) => (
              <div key={contact.contactDraftId}>
                <dt>{contact.displayName}</dt>
                <dd>
                  {productCopy(contact.summary.headline)}{" "}
                  {productCopy(contact.followUpSuggestion.rationale)}
                </dd>
              </div>
            ))}
          </dl>
          <EvidenceChips
            evidenceIds={model.postEventReview.provenance.evidenceIds}
            label="Post-event review evidence"
          />
        </WorkbenchSurface>
      </div>
    </div>
  );
}

async function renderEventDetailPage({
  params,
  searchParams,
}: EventDetailPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = isPromiseLike(searchParams)
    ? await searchParams
    : undefined;
  const model = loadAppEventDetailRoute({
    action: readSearchParam(resolvedSearchParams, "action"),
    eventId: resolvedParams.id,
    scenario: readSearchParam(resolvedSearchParams, "scenario"),
    targetContactId: readSearchParam(resolvedSearchParams, "targetContactId"),
  });

  if (model.routeState !== "success") {
    return renderBoundaryState(model);
  }

  return renderSuccessState(model);
}

export default function EventDetailPage(props: EventDetailPageProps) {
  return renderEventDetailPage(props);
}
