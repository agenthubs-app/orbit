/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { createBusinessCardScanOcrService } from "../../../../../features/acquisition/service-factory";
import { createEmailCalendarSignalService } from "../../../../../features/acquisition/service-factory";
import { createEventAttendeeImportService } from "../../../../../features/acquisition/service-factory";
import { createExternalContactsImportService } from "../../../../../features/acquisition/service-factory";
import { createManualContactCreationService } from "../../../../../features/acquisition/service-factory";
import { createDuplicateMergeService } from "../../../../../features/acquisition/service-factory";
import { createQrScanConnectService } from "../../../../../features/acquisition/service-factory";
import { createReferralRecommendationService } from "../../../../../features/acquisition/service-factory";
import { createContactAcquisitionDraftService } from "../../../../../features/acquisition/service-factory";
import { createPermissionStateService } from "../../../../../features/permissions/service-factory";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";

export const metadata = {
  title: "Contact acquisition | Orbit",
  description:
    "Compose source-backed contact acquisition, staged permissions, and local review actions in Orbit.",
};

const appContactsNewStyles = `
.app-contacts-new-route {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
  overflow-x: clip;
}

.orbit-app-shell:has(.app-contacts-new-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-contacts-new-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-contacts-new-route) [aria-label="Account and next steps"] {
  display: none;
}

.orbit-app-shell:has(.app-contacts-new-route) [aria-label="Secondary demo recovery checks"] {
  display: none;
}

.orbit-app-shell:has(.app-contacts-new-route) [data-runtime-status="compact"] {
  display: none;
}

.app-contacts-new-route,
.app-contacts-new-route .workbench-surface,
.app-contacts-new-route .relationship-meta,
.app-contacts-new-route .chip-row,
.app-contacts-new-route .contacts-new-ledger,
.app-contacts-new-route .contacts-new-grid,
.app-contacts-new-route .contacts-new-method-grid,
.app-contacts-new-route .contacts-new-source-group,
.app-contacts-new-route .contacts-new-source-group-grid,
.app-contacts-new-route .contacts-new-source-grid,
.app-contacts-new-route .evidence-cluster {
  min-width: 0;
}

.app-contacts-new-route .relationship-name,
.app-contacts-new-route .type-body,
.app-contacts-new-route .type-caption,
.app-contacts-new-route .relationship-meta dd,
.app-contacts-new-route .orbit-chip,
.app-contacts-new-route .contacts-new-state-links a,
.app-contacts-new-route .contacts-new-action-result span,
.app-contacts-new-route .contacts-new-action-result strong,
.app-contacts-new-route .contacts-new-source-method button {
  overflow-wrap: anywhere;
}

.app-contacts-new-route .chip-row {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));
}

.app-contacts-new-route .orbit-chip {
  max-width: 100%;
  min-width: 0;
  white-space: normal;
}

.app-contacts-new-route .contacts-new-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-contacts-new-route .contacts-new-ledger,
.app-contacts-new-route .contacts-new-grid,
.app-contacts-new-route .contacts-new-source-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-contacts-new-route .contacts-new-method-grid,
.app-contacts-new-route .contacts-new-source-group,
.app-contacts-new-route .contacts-new-source-group-grid {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-new-route .contacts-new-method-grid {
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1fr);
}

.app-contacts-new-route .contacts-new-source-group-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-contacts-new-route .contacts-new-source-group-header {
  display: grid;
  gap: 4px;
}

.app-contacts-new-route .contacts-new-ledger div,
.app-contacts-new-route .contacts-new-action-result,
.app-contacts-new-route .contacts-new-task,
.app-contacts-new-route .contacts-new-capability,
.app-contacts-new-route .contacts-new-source-method,
.app-contacts-new-route .contacts-new-secondary {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-contacts-new-route .contacts-new-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-contacts-new-route .contacts-new-task,
.app-contacts-new-route .contacts-new-action-result,
.app-contacts-new-route .contacts-new-capability,
.app-contacts-new-route .contacts-new-source-method,
.app-contacts-new-route .contacts-new-secondary {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-new-route .contacts-new-current-candidate {
  border-color: var(--orbit-color-primary);
}

.app-contacts-new-route .contacts-new-current-candidate dl,
.app-contacts-new-route .contacts-new-source-method dl {
  display: grid;
  gap: 6px;
  margin: 0;
}

.app-contacts-new-route .contacts-new-current-candidate dl div,
.app-contacts-new-route .contacts-new-source-method dl div {
  display: grid;
  gap: 2px;
}

.app-contacts-new-route .contacts-new-current-candidate dt,
.app-contacts-new-route .contacts-new-source-method dt {
  color: var(--orbit-color-muted);
  font-size: 0.78rem;
  font-weight: 760;
  text-transform: uppercase;
}

.app-contacts-new-route .contacts-new-current-candidate dd,
.app-contacts-new-route .contacts-new-source-method dd {
  margin: 0;
}

.app-contacts-new-route .source-label-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
  min-width: 0;
}

.app-contacts-new-route .contacts-new-secondary summary {
  cursor: pointer;
  font-weight: 700;
}

.app-contacts-new-route .contacts-new-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-contacts-new-route .contacts-new-action-summary {
  display: grid;
  gap: 6px;
  margin: 0;
}

.app-contacts-new-route .contacts-new-action-summary div {
  display: grid;
  gap: 2px;
}

.app-contacts-new-route .contacts-new-action-summary dt {
  color: var(--orbit-color-muted);
  font-size: 0.78rem;
  font-weight: 760;
  text-transform: uppercase;
}

.app-contacts-new-route .contacts-new-action-summary dd {
  margin: 0;
}

.app-contacts-new-route .contacts-new-task button,
.app-contacts-new-route .contacts-new-source-method button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-primary-text);
  font-weight: 760;
  line-height: 1.25;
  max-width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  white-space: normal;
}

.app-contacts-new-route .contacts-new-source-method button {
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border);
  color: var(--orbit-color-text);
}

.app-contacts-new-route .contacts-new-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-contacts-new-route .contacts-new-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  max-width: 100%;
  padding: 6px 10px;
  text-decoration: none;
}

.app-contacts-new-route .evidence-cluster {
  display: grid;
  gap: var(--orbit-space-xs);
}

.app-contacts-new-route .technical-provenance {
  color: var(--orbit-color-muted);
  font-size: 0.86rem;
}

.app-contacts-new-route .technical-provenance summary {
  cursor: pointer;
}

.app-contacts-new-route .technical-provenance ul {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
  padding-left: var(--orbit-space-md);
}

.app-contacts-new-route .technical-provenance code {
  overflow-wrap: anywhere;
  white-space: normal;
}
`;

const capabilityLabels = [
  "Manual contact",
  "Business card scan",
  "QR scan",
  "Event attendee import",
  "External contacts",
  "Email and calendar signals",
  "Referral recommendations",
  "Merge suggestions",
] as const;

const routeStateChecks = [
  {
    href: "/app/contacts/new?scenario=empty",
    label: "Open source choices",
  },
  {
    href: "/app/contacts/new?scenario=pending",
    label: "Review waiting intake",
  },
  {
    href: "/app/contacts/new?scenario=failure",
    label: "Open safe intake",
  },
] as const;

type AppContactsNewSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";
type EvidenceResult =
  | {
      success: true;
      data: {
        provenance: {
          evidenceIds: readonly string[];
        };
      };
    }
  | {
      success: false;
      error: {
        code: string;
      };
    };

interface AppContactsNewPageProps {
  searchParams?: AppContactsNewSearchParams | Promise<AppContactsNewSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function readSearchParam(
  searchParams: AppContactsNewSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppContactsNewSearchParams | undefined,
): RouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

function evidenceFromResult(result: EvidenceResult): string {
  if (result.success === false) {
    return result.error.code;
  }

  return firstEvidence(result.data.provenance.evidenceIds);
}

function formatCount(
  count: number | undefined,
  singular: string,
  plural = `${singular}s`,
): string {
  const safeCount = count ?? 0;

  return `${safeCount} ${safeCount === 1 ? singular : plural}`;
}

function sourceName(
  displayName: string | undefined,
  fallback = "Source waiting for review",
): string {
  return displayName?.trim() || fallback;
}

function capitalizeWord(word: string): string {
  if (!word) {
    return word;
  }

  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function evidenceLabel(evidenceId: string): string {
  const friendlyLabels: Array<[RegExp, string]> = [
    [/manual-note/, "Manual note"],
    [/manual-contact-confirmed/, "Contact review held"],
    [/business-card-capture/, "Card captured"],
    [/business-card-ocr/, "Card details read"],
    [/business-card-draft/, "Card draft ready"],
    [/qr-scan-frame/, "QR scan captured"],
    [/qr-mutual-context/, "Mutual context matched"],
    [/qr-draft/, "QR draft ready"],
    [/event-import-roster/, "Event roster"],
    [/event-import-conversation-thread/, "Conversation noted"],
    [/event-import-goal-fit/, "Goal fit noted"],
    [/external-import-phone/, "Phone contact held"],
    [/external-import-google/, "Google contact held"],
    [/external-import-csv/, "CSV contact held"],
    [/external-import-customer-list/, "Customer list held"],
    [/email-calendar:gmail-intro/, "Intro email signal"],
    [/email-calendar:calendar-meeting/, "Calendar signal held"],
    [/email-calendar:graph-overlap/, "Shared-network signal"],
    [/referral:founder/, "Founder referral"],
    [/referral:investor/, "Investor referral"],
    [/referral:community/, "Community referral"],
    [/duplicate-merge-email/, "Email match found"],
    [/duplicate-merge-event-context/, "Event context match"],
    [/duplicate-merge-referral-context/, "Referral context match"],
    [/duplicate-merge-confirmation/, "Merge review held"],
  ];
  const normalizedEvidenceId = evidenceId.toLowerCase();
  const friendlyLabel = friendlyLabels.find(([pattern]) =>
    pattern.test(normalizedEvidenceId),
  )?.[1];

  if (friendlyLabel) {
    return friendlyLabel;
  }

  const specialWords: Record<string, string> = {
    ai: "AI",
    api: "API",
    csv: "CSV",
    gmail: "Gmail",
    id: "ID",
    ocr: "OCR",
    qr: "QR",
  };
  const names = new Set([
    "aiko",
    "akari",
    "emi",
    "hana",
    "kai",
    "kenji",
    "mateo",
    "maya",
    "mika",
    "omar",
    "priya",
  ]);
  const readable = evidenceId
    .replace(/^evidence[:_-]?/i, "")
    .replace(/[:_-]+/g, " ")
    .trim();

  if (!readable) {
    return "Source evidence";
  }

  return productCopy(
    readable
      .split(/\s+/)
      .map((word, index) => {
        const lowerWord = word.toLowerCase();

        if (specialWords[lowerWord]) {
          return specialWords[lowerWord];
        }

        if (index === 0 || names.has(lowerWord)) {
          return capitalizeWord(lowerWord);
        }

        return lowerWord;
      })
      .join(" "),
  );
}

function productCopy(value: string): string {
  return value
    .replace(/\bproduction contact service\b/gi, "contact record queue")
    .replace(/\bcontact record service\b/gi, "contact record queue")
    .replace(/\bmock\b/gi, "review")
    .replace(/\boperator intro\b/gi, "partner intro")
    .replace(/\boperators\b/gi, "partner teams")
    .replace(/\boperator\b/gi, "reviewer")
    .replace(/\bproviders?\b/gi, "tools")
    .replace(/\bservices?\b/gi, "tools")
    .replace(new RegExp("\\bfixture" + "s?\\b", "gi"), "source records")
    .replace(/\bdatabases?\b/gi, "saved records");
}

function readableSourceLabel(label: string | undefined, fallback: string): string {
  const normalized = productCopy(label?.trim() || fallback)
    .replace(/\bbusiness card scan\b/i, "card")
    .replace(/\brelationship QR scan\b/i, "QR badge")
    .replace(/\borganizer roster\b/i, "event roster")
    .replace(/\bsource records\b/gi, "source")
    .replace(/\bocr\b/gi, "OCR");

  return capitalizeWord(normalized);
}

function TechnicalProvenanceDetails({
  evidenceIds,
}: {
  evidenceIds: readonly string[];
}) {
  return (
    <details className="technical-provenance">
      <summary>Source record details</summary>
      <ul>
        {evidenceIds.map((evidenceId) => (
          <li key={evidenceId}>
            <code>{evidenceId}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  const visibleEvidenceIds = evidenceIds.slice(0, 5);

  return (
    <div className="evidence-cluster">
      <div aria-label={label} className="chip-row">
        {visibleEvidenceIds.map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceLabel(evidenceId)}
          </Chip>
        ))}
      </div>
      <TechnicalProvenanceDetails evidenceIds={visibleEvidenceIds} />
    </div>
  );
}

function ContactReviewDiagnostics({
  contactWriteExecuted,
  duplicateLookupExecuted,
  evidenceIds,
}: {
  contactWriteExecuted: boolean;
  duplicateLookupExecuted: boolean;
  evidenceIds: readonly string[];
}) {
  return (
    <details className="technical-provenance">
      <summary>Contact review diagnostics</summary>
      <ul>
        <li>
          Source evidence: {evidenceLabel(firstEvidence(evidenceIds))}
        </li>
        <li>Contact write executed: {contactWriteExecuted ? "yes" : "no"}</li>
        <li>
          Duplicate lookup executed: {duplicateLookupExecuted ? "yes" : "no"}
        </li>
        {evidenceIds.map((evidenceId) => (
          <li key={evidenceId}>
            <code>{evidenceId}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  const routeStateUrl = `/app/contacts/new?scenario=${scenario}`;

  return <div data-route-state-url={routeStateUrl}>{children}</div>;
}

function RouteStateBoundary({ scenario }: { scenario: RouteScenario }) {
  const draftService = createContactAcquisitionDraftService();
  const manualService = createManualContactCreationService();
  const cardService = createBusinessCardScanOcrService();
  const qrService = createQrScanConnectService();
  const eventService = createEventAttendeeImportService();
  const externalService = createExternalContactsImportService();
  const signalService = createEmailCalendarSignalService();
  const referralService = createReferralRecommendationService();
  const mergeService = createDuplicateMergeService();

  if (scenario === "empty") {
    const draftState = draftService.listContactDrafts({ scenario: "empty" });
    const manualState = manualService.createManualContactDraft({
      scenario: "empty",
    });
    const cardState = cardService.scanBusinessCard({ scenario: "empty" });
    const qrState = qrService.scanQrCode({ scenario: "empty" });
    const eventState = eventService.importEventAttendees({
      eventId: "demo-event-1",
      scenario: "empty",
    });
    const externalState = externalService.importExternalContacts({
      scenario: "empty",
    });
    const signalState = signalService.listEmailCalendarSignals({
      scenario: "empty",
    });
    const referralState = referralService.createReferralContactDrafts({
      scenario: "empty",
    });
    const mergeState = mergeService.listMergeSuggestions({
      scenario: "empty",
    });

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description="Start from a manual note, card scan, relationship QR, attendee import, external contact list, email or calendar signal, referral, or merge review."
          emptyState="No source has produced a contact candidate ready for review."
          evidence={[
            evidenceFromResult(draftState),
            evidenceFromResult(manualState),
            evidenceFromResult(cardState),
            evidenceFromResult(qrState),
            evidenceFromResult(eventState),
            evidenceFromResult(externalState),
            evidenceFromResult(signalState),
            evidenceFromResult(referralState),
            evidenceFromResult(mergeState),
          ]}
          eyebrow="Empty state"
          guardrail="Orbit can invite source capture, but it cannot create contacts without source evidence and confirmation."
          recoveryActions={[
            {
              id: "return-to-source-choices",
              href: "/app/contacts/new",
              label: "Return to source choices",
              recoveryCopy:
                "Choose a source method before staging a relationship candidate.",
            },
          ]}
          purpose="Start contact acquisition from source-backed intake boundaries."
          title="No source is ready for review"
        />
      </RouteStateMarker>
    );
  }

  if (scenario === "pending") {
    const draftState = draftService.listContactDrafts({ scenario: "pending" });
    const manualState = manualService.createManualContactDraft({
      scenario: "pending",
    });
    const cardState = cardService.scanBusinessCard({ scenario: "pending" });
    const qrState = qrService.scanQrCode({ scenario: "pending" });
    const eventState = eventService.importEventAttendees({
      eventId: "demo-event-1",
      scenario: "pending",
    });

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description="Relationship sources are waiting for review before any contact record can be staged."
          emptyState="Drafts, scans, imports, signals, referrals, and merge decisions stay pending until reviewed."
          evidence={[
            evidenceFromResult(draftState),
            evidenceFromResult(manualState),
            evidenceFromResult(cardState),
            evidenceFromResult(qrState),
            evidenceFromResult(eventState),
          ]}
          eyebrow="Loading state"
          guardrail="Pending source material cannot write contacts, merge records, send messages, or read outside accounts."
          recoveryActions={[
            {
              id: "review-waiting-source",
              href: "/app/contacts/new",
              label: "Review waiting source",
              recoveryCopy:
                "Return to the intake desk while source evidence remains held for review.",
            },
          ]}
          purpose="Keep acquisition visible while local review states resolve."
          title="Source review is waiting"
        />
      </RouteStateMarker>
    );
  }

  const failureState = draftService.listContactDrafts({ scenario: "failure" });

  return (
    <RouteStateMarker scenario={scenario}>
      <StateView
        description="The intake desk could not assemble the current source queue, so Orbit keeps every source side-effect-free."
        emptyState="No contact, connection, merge, message, task, or outside account was changed."
        evidence={
          failureState.success === false
            ? [
                failureState.error.code,
                firstEvidence(failureState.error.evidenceIds),
              ]
            : ["contact-acquisition-expected-failure-not-returned"]
        }
        eyebrow="Failure state"
        guardrail="The recovery control keeps camera, email, calendar, contacts, storage, AI, notifications, and messaging disconnected."
        recoveryActions={[
          {
            id: "return-to-safe-intake",
            href: "/app/contacts/new",
            label: "Return to safe intake",
            recoveryCopy:
              "Reopen the intake desk without calling camera, imports, inbox, calendar, merge, or outbound tools.",
          },
        ]}
        purpose="Render a controlled acquisition failure without side effects."
        title="Source intake needs attention"
      />
    </RouteStateMarker>
  );
}

function ContactsNewLedger({
  acquisitionCount,
  cardCount,
  eventDraftCount,
  manualName,
  pendingPermissionCount,
}: {
  acquisitionCount: number;
  cardCount: number;
  eventDraftCount: number;
  manualName: string;
  pendingPermissionCount: number;
}) {
  return (
    <dl
      aria-label="App contacts new composed capabilities"
      className="relationship-meta contacts-new-ledger"
    >
      <div>
        <dt>Manual note</dt>
        <dd>{manualName}</dd>
      </div>
      <div>
        <dt>Draft queue</dt>
        <dd>
          <strong>{acquisitionCount}</strong>
          source-backed drafts
        </dd>
      </div>
      <div>
        <dt>Card scans</dt>
        <dd>{formatCount(cardCount, "card draft")}</dd>
      </div>
      <div>
        <dt>Event import</dt>
        <dd>{formatCount(eventDraftCount, "attendee draft")}</dd>
      </div>
      <div>
        <dt>Permissions</dt>
        <dd>{formatCount(pendingPermissionCount, "staged permission")}</dd>
      </div>
    </dl>
  );
}

function SourceMethodCard({
  controlLabel,
  detail,
  evidenceIds,
  name,
  nextStep,
  sourceLabel,
  status,
  title,
}: {
  controlLabel: string;
  detail: string;
  evidenceIds: readonly string[];
  name: string;
  nextStep: string;
  sourceLabel: string;
  status: string;
  title: string;
}) {
  return (
    <article className="contacts-new-source-method">
      <header>
        <p className="type-caption">Source method</p>
        <h3 className="relationship-name">{title}</h3>
      </header>
      <dl className="relationship-meta">
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{sourceLabel}</dd>
        </div>
        <div>
          <dt>Candidate</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>Next step</dt>
          <dd>{nextStep}</dd>
        </div>
      </dl>
      <p className="type-body">{productCopy(detail)}</p>
      <button type="button">{controlLabel}</button>
      <EvidenceChips
        evidenceIds={evidenceIds}
        label={`${title} evidence`}
      />
    </article>
  );
}

function renderContactsNewPage(
  searchParams: AppContactsNewSearchParams | undefined,
) {
  const draftService = createContactAcquisitionDraftService();
  const manualService = createManualContactCreationService();
  const cardService = createBusinessCardScanOcrService();
  const qrService = createQrScanConnectService();
  const eventService = createEventAttendeeImportService();
  const externalService = createExternalContactsImportService();
  const signalService = createEmailCalendarSignalService();
  const referralService = createReferralRecommendationService();
  const mergeService = createDuplicateMergeService();
  const permissionService = createPermissionStateService();
  const requestedScenario = readRouteScenario(searchParams);
  const actionRequested =
    readSearchParam(searchParams, "action") === "confirm-manual-draft";

  if (requestedScenario) {
    return (
      <div className="app-contacts-new-route">
        <style>{appContactsNewStyles}</style>
        <RouteStateBoundary scenario={requestedScenario} />
      </div>
    );
  }

  const draftQueue = draftService.listContactDrafts();
  const manualState = manualService.createManualContactDraft();
  const cardState = cardService.scanBusinessCard();
  const qrState = qrService.scanQrCode();
  const eventState = eventService.importEventAttendees({
    eventId: "demo-event-1",
  });
  const externalState = externalService.importExternalContacts();
  const signalState = signalService.listEmailCalendarSignals();
  const referralState = referralService.createReferralContactDrafts();
  const mergeState = mergeService.listMergeSuggestions();
  const permissionState = permissionService.listPermissionStates();

  if (
    draftQueue.success === false ||
    manualState.success === false ||
    cardState.success === false ||
    qrState.success === false ||
    eventState.success === false ||
    externalState.success === false ||
    signalState.success === false ||
    referralState.success === false ||
    mergeState.success === false ||
    permissionState.success === false
  ) {
    return (
      <StateView
        description="The contact acquisition page could not compose every required local service state."
        emptyState="A contact source, permission, referral, or merge boundary returned an unexpected state."
        evidence={[
          evidenceFromResult(draftQueue),
          evidenceFromResult(manualState),
          evidenceFromResult(cardState),
          evidenceFromResult(qrState),
          evidenceFromResult(eventState),
          evidenceFromResult(externalState),
          evidenceFromResult(signalState),
          evidenceFromResult(referralState),
          evidenceFromResult(mergeState),
          evidenceFromResult(permissionState),
        ]}
        eyebrow="Contacts"
        guardrail="No external action can run when contact acquisition composition fails."
        nextStep="Inspect GET /api/contact-drafts and GET /api/permissions."
        purpose="Stop contact acquisition when local source evidence cannot be composed."
        title="Contact acquisition could not load"
      />
    );
  }

  const manualDraft = manualState.data.draft;
  const cardDraft = cardState.data.draft;
  const qrDraft = qrState.data.draft;
  const eventDraft = eventState.data.contactDrafts[0] ?? null;
  const externalDraft = externalState.data.contactDrafts[0] ?? null;
  const emailCalendarSignal = signalState.data.signals[0] ?? null;
  const referralDraft = referralState.data.contactDrafts[0] ?? null;
  const mergeSuggestion = mergeState.data.mergeSuggestions[0] ?? null;
  const pendingPermissionCount = permissionState.data.permissions.filter(
    (permission) => permission.authorizationStage !== "ready",
  ).length;
  const manualConfirmation =
    actionRequested && manualDraft
      ? manualService.confirmManualContactDraft({
          actorLabel: "Orbit operator",
          draftId: manualDraft.id,
        })
      : null;
  const currentSourceLabel = readableSourceLabel(
    manualDraft?.source.label,
    "manual note from climate founders dinner",
  );
  const sourceMethods = [
    {
      controlLabel: "Choose manual note",
      detail: manualDraft?.followUpHint ?? manualState.data.nextAction,
      evidenceIds: manualState.data.provenance.evidenceIds,
      name: sourceName(manualDraft?.displayName),
      nextStep: "Preview the contact review before saving a person.",
      sourceLabel: currentSourceLabel,
      status: "Ready to review",
      title: "Manual note",
    },
    {
      controlLabel: "Choose card scan",
      detail: cardDraft?.relationshipContext ?? cardState.data.nextAction,
      evidenceIds: cardState.data.provenance.evidenceIds,
      name: sourceName(cardDraft?.displayName),
      nextStep: "Review extracted fields before creating a contact.",
      sourceLabel: "Card from robotics investor salon",
      status: "Draft extracted",
      title: "Business card",
    },
    {
      controlLabel: "Choose QR scan",
      detail: qrState.data.mutualContext
        ? `${qrState.data.mutualContext.eventName}: ${qrState.data.mutualContext.introductionPath}`
        : qrState.data.nextAction,
      evidenceIds: qrState.data.provenance.evidenceIds,
      name: sourceName(qrDraft?.displayName),
      nextStep: "Review mutual context before confirming.",
      sourceLabel: "QR badge from Climate founders dinner",
      status: "Context matched",
      title: "Relationship QR",
    },
    {
      controlLabel: "Choose attendee import",
      detail: eventDraft
        ? `${eventState.data.event.name}: ${eventDraft.relationshipStatus.label}`
        : eventState.data.nextAction,
      evidenceIds: eventState.data.provenance.evidenceIds,
      name: sourceName(eventDraft?.displayName),
      nextStep: "Pick attendees whose event context explains the follow-up.",
      sourceLabel: readableSourceLabel(
        eventDraft?.source.label ?? eventState.data.event.source.label,
        "event roster from climate founders dinner",
      ),
      status: "Roster staged",
      title: "Event attendees",
    },
    {
      controlLabel: "Choose external contacts",
      detail: externalDraft
        ? externalDraft.relationshipContext
        : externalState.data.nextAction,
      evidenceIds: externalState.data.provenance.evidenceIds,
      name: sourceName(externalDraft?.displayName),
      nextStep: "Review why each outside-list contact exists before staging.",
      sourceLabel: "Phone, Google, CSV, and customer-list sources",
      status: "Candidates held",
      title: "External contacts",
    },
    {
      controlLabel: "Choose inbox signals",
      detail: emailCalendarSignal
        ? emailCalendarSignal.relationshipContext
        : signalState.data.nextAction,
      evidenceIds: signalState.data.provenance.evidenceIds,
      name: sourceName(emailCalendarSignal?.displayName),
      nextStep: "Confirm the signal before turning it into relationship work.",
      sourceLabel: "Metadata-only inbox and calendar signals",
      status: "Signals held",
      title: "Email and calendar",
    },
    {
      controlLabel: "Choose referral",
      detail: referralDraft
        ? referralDraft.relationshipContext
        : referralState.data.nextAction,
      evidenceIds: referralState.data.provenance.evidenceIds,
      name: sourceName(referralDraft?.displayName),
      nextStep: "Confirm the recommender context before any outreach.",
      sourceLabel: "Founder, investor, and community referrals",
      status: "Warm path ready",
      title: "Referral",
    },
    {
      controlLabel: "Choose merge review",
      detail: mergeSuggestion
        ? mergeSuggestion.reviewQuestion
        : mergeState.data.nextAction,
      evidenceIds: mergeState.data.provenance.evidenceIds,
      name: mergeSuggestion
        ? productCopy(mergeSuggestion.decision.replaceAll("_", " "))
        : "No merge decision queued",
      nextStep: "Approve or keep records separate before any merge can happen.",
      sourceLabel: "Duplicate review queue",
      status: "Needs approval",
      title: "Merge review",
    },
  ] as const;
  const sourceMethodGroups = [
    {
      description:
        "Use when the relationship started in a room, at a table, or through a badge exchange.",
      heading: "Captured in person",
      methods: [sourceMethods[0], sourceMethods[1], sourceMethods[2]],
    },
    {
      description:
        "Use when the source starts as a roster, address book, signal, or duplicate review.",
      heading: "Imported records",
      methods: [
        sourceMethods[3],
        sourceMethods[4],
        sourceMethods[5],
        sourceMethods[7],
      ],
    },
    {
      description:
        "Use when another person explains the warm path and the reason to follow up.",
      heading: "Warm introductions",
      methods: [sourceMethods[6]],
    },
  ] as const;

  return (
    <div className="app-contacts-new-route">
      <style>{appContactsNewStyles}</style>
      <div data-state-boundary="app-contacts-new-success">
        <WorkbenchSurface
          className="contacts-new-command"
          elevated
          eyebrow="Contacts"
          title="Relationship source intake"
        >
          <p className="type-body">
            Review one relationship candidate at a time. The first decision is
            whether the source explains why this person belongs in Orbit.
          </p>

          <form
            action="/app/contacts/new"
            className="contacts-new-task contacts-new-current-candidate"
            method="get"
          >
            <div>
              <p className="type-caption">First review</p>
              <h3 className="relationship-name">Current review candidate</h3>
              <div className="source-label-row" aria-label="Current source">
                <Chip tone="evidence">{currentSourceLabel}</Chip>
              </div>
              <p className="type-body">
                {sourceName(manualDraft?.displayName)} is ready for contact
                review because the dinner note gives a clear relationship
                context and a sensible follow-up.
              </p>
            </div>
            <dl className="relationship-meta">
              <div>
                <dt>Source</dt>
                <dd>{currentSourceLabel}</dd>
              </div>
              <div>
                <dt>Next decision</dt>
                <dd>Preview contact review</dd>
              </div>
              <div>
                <dt>No-side-effect boundary</dt>
                <dd>
                  No contact record is created, no duplicate merge runs, and no
                  message, task, camera, inbox, calendar, or outside account is
                  touched.
                </dd>
              </div>
            </dl>
            <input name="action" type="hidden" value="confirm-manual-draft" />
            <button type="submit">Preview contact review</button>
          </form>

          {manualConfirmation?.success && (
            <div
              aria-label="App contacts new local action result"
              className="contacts-new-action-result"
              data-action-evidence="manual-contact-confirmation-local-preview"
              data-side-effects="none"
              data-task-result="manual-contact-confirmation-preview"
            >
              <strong>
                Ready for contact review:{" "}
                {manualConfirmation.data.contactCandidate.displayName}
              </strong>
              <span>
                Keep this source-backed candidate ready for later contact
                review.
              </span>
              <dl className="relationship-meta contacts-new-action-summary">
                <div>
                  <dt>Source moment</dt>
                  <dd>
                    {readableSourceLabel(
                      manualConfirmation.data.contactCandidate.source.label,
                      currentSourceLabel,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Relationship reason</dt>
                  <dd>
                    {productCopy(
                      manualConfirmation.data.contactCandidate
                        .relationshipContext,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Promised follow-up</dt>
                  <dd>
                    {productCopy(
                      manualConfirmation.data.contactCandidate.followUpHint,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Will remain unsaved</dt>
                  <dd>
                    Contact record, duplicate review, message, task, camera,
                    inbox, calendar, and outside-account changes.
                  </dd>
                </div>
              </dl>
              <span>Outside accounts contacted: none</span>
              <ContactReviewDiagnostics
                contactWriteExecuted={
                  manualConfirmation.data.contactCandidate.contactWriteExecuted
                }
                duplicateLookupExecuted={
                  manualConfirmation.data.contactCandidate
                    .duplicateLookupExecuted
                }
                evidenceIds={manualConfirmation.data.provenance.evidenceIds}
              />
            </div>
          )}

          <p className="privacy-note">
            Outside accounts contacted: none. Camera, address book, email,
            calendar, storage, AI, notification, messaging, and saved contact
            records stay untouched from this route.
          </p>
        </WorkbenchSurface>
      </div>

      <WorkbenchSurface eyebrow="Source choices" title="Choose another relationship source">
        <p className="type-body">
          Select a source method when the current candidate is not the right
          next review. Each method stays staged until a person confirms what the
          source proves.
        </p>
        <div
          aria-label="Selectable relationship source methods"
          className="contacts-new-method-grid"
        >
          {sourceMethodGroups.map((group) => (
            <section className="contacts-new-source-group" key={group.heading}>
              <header className="contacts-new-source-group-header">
                <p className="type-caption">Source type</p>
                <h3 className="relationship-name">{group.heading}</h3>
                <p className="type-body">{group.description}</p>
              </header>
              <div className="contacts-new-source-group-grid">
                {group.methods.map((method) => (
                  <SourceMethodCard
                    controlLabel={method.controlLabel}
                    detail={method.detail}
                    evidenceIds={method.evidenceIds}
                    key={method.title}
                    name={method.name}
                    nextStep={method.nextStep}
                    sourceLabel={method.sourceLabel}
                    status={method.status}
                    title={method.title}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <details className="contacts-new-secondary">
          <summary>Source counts</summary>
          <ContactsNewLedger
            acquisitionCount={draftQueue.data.drafts.length}
            cardCount={cardDraft ? 1 : 0}
            eventDraftCount={eventState.data.contactDrafts.length}
            manualName={sourceName(manualDraft?.displayName)}
            pendingPermissionCount={pendingPermissionCount}
          />
          <div aria-label="App contacts new capability labels" className="chip-row">
            {capabilityLabels.map((label) => (
              <Chip key={label} tone="primary">
                {label}
              </Chip>
            ))}
          </div>
        </details>
        <details className="contacts-new-secondary">
          <summary>Workspace status</summary>
          <p className="type-body">
            This intake desk stages review candidates locally. No live login,
            sync, import, merge, message, task, camera, inbox, calendar, or
            outside-account action is connected here.
          </p>
        </details>
        <details className="contacts-new-secondary">
          <summary>Recovery options</summary>
          <div aria-label="App contacts new intake status">
            <p className="type-caption">Intake status</p>
            <h3 className="relationship-name">Intake status</h3>
            <p className="type-body">
              Open the intake desk when source context is missing, waiting for
              review, or unavailable. Each status keeps the current candidate
              and all outside accounts untouched.
            </p>
            <nav className="contacts-new-state-links">
              {routeStateChecks.map((stateCheck) => (
                <a href={stateCheck.href} key={stateCheck.href}>
                  {stateCheck.label}
                </a>
              ))}
            </nav>
          </div>
        </details>
      </WorkbenchSurface>

      <WorkbenchSurface eyebrow="Evidence" title="Review queues">
        <details className="contacts-new-secondary">
          <summary>Sample queue</summary>
          <p className="type-body">
            Separate sample queue: {draftQueue.data.drafts.length} draft
            candidates are staged from source-backed intake. The highlighted
            review candidate remains {sourceName(manualDraft?.displayName)}; this
            separate sample set starts with{" "}
            {sourceName(draftQueue.data.drafts[0]?.displayName)} from{" "}
            {draftQueue.data.drafts[0]?.source.label ?? "a source record"}.
          </p>
          <EvidenceChips
            evidenceIds={draftQueue.data.provenance.evidenceIds}
            label="App contacts new draft queue evidence"
          />
        </details>
      </WorkbenchSurface>
    </div>
  );
}

export default function ContactsNewPage({
  searchParams,
}: AppContactsNewPageProps = {}) {
  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderContactsNewPage(resolvedSearchParams),
    );
  }

  return renderContactsNewPage(searchParams);
}
