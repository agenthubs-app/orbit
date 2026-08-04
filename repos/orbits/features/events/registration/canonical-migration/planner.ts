import type { EventRegistration } from "../contract";
import {
  CANONICAL_MEMBERSHIP_MIGRATION_ID,
  CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
  canonicalMigrationHash,
  stableCanonicalMigrationValue,
  type CanonicalMembershipMigrationBlocker,
  type CanonicalMembershipMigrationDeadline,
  type CanonicalMembershipMigrationEventFact,
  type CanonicalMembershipMigrationEventPlan,
  type CanonicalMembershipMigrationPlan,
  type ParsedCanonicalMembershipOperatorManifest,
} from "./contract";

function blocker(input: {
  code: string;
  eventId?: string | null;
  message: string;
}): CanonicalMembershipMigrationBlocker {
  return {
    code: input.code,
    eventId: input.eventId ?? null,
    message: input.message,
    recordId: null,
  };
}

function sortBlockers(
  values: readonly CanonicalMembershipMigrationBlocker[],
): readonly CanonicalMembershipMigrationBlocker[] {
  return [...values].sort(
    (left, right) =>
      (left.eventId ?? "").localeCompare(right.eventId ?? "") ||
      left.code.localeCompare(right.code) ||
      (left.recordId ?? "").localeCompare(right.recordId ?? "") ||
      left.message.localeCompare(right.message),
  );
}

function orderedRegistrations(
  registrations: readonly EventRegistration[],
): readonly EventRegistration[] {
  return [...registrations].sort(
    (left, right) =>
      left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id),
  );
}

function sourceSummary(registrations: readonly EventRegistration[]) {
  const ordered = orderedRegistrations(registrations);
  return {
    cancelled: ordered.filter((registration) => registration.status === "cancelled")
      .length,
    count: ordered.length,
    hash: canonicalMigrationHash(ordered),
    rsvped: ordered.filter((registration) => registration.status === "rsvped")
      .length,
  };
}

function configurationDeadline(
  fact: CanonicalMembershipMigrationEventFact,
): CanonicalMembershipMigrationDeadline | null {
  const configuration = fact.configurationDeadline;
  return configuration
    ? {
        evidenceId: `event-operations-configuration:${encodeURIComponent(fact.eventId)}:${configuration.configurationVersion}`,
        profileEditDeadlineAt: configuration.profileEditDeadlineAt,
        source: "event_operations_configuration",
      }
    : null;
}

function factIdentity(fact: CanonicalMembershipMigrationEventFact) {
  return {
    activationBaselineValid:
      fact.authority === "canonical_membership"
        ? fact.activationBaselineValid
        : null,
    authority: fact.authority,
    configurationDeadline: fact.configurationDeadline
      ? {
          configurationVersion: fact.configurationDeadline.configurationVersion,
          profileEditDeadlineAt:
            fact.configurationDeadline.profileEditDeadlineAt,
        }
      : null,
    contentHash: fact.contentHash,
    eventId: fact.eventId,
    eventVersion: fact.eventVersion,
    source: sourceSummary(fact.registrations),
  };
}

export function buildCanonicalMembershipMigrationPlan(input: {
  facts: readonly CanonicalMembershipMigrationEventFact[];
  parsedManifest: ParsedCanonicalMembershipOperatorManifest;
}): CanonicalMembershipMigrationPlan {
  const globalBlockers = [...input.parsedManifest.blockers];
  const identifiedFacts = input.facts
    .map((fact) => {
      const identity = factIdentity(fact);
      return {
        fact,
        identity,
        identityHash: canonicalMigrationHash(identity),
        identityJson: JSON.stringify(stableCanonicalMigrationValue(identity)),
      };
    })
    .sort(
      (left, right) =>
        left.fact.eventId.localeCompare(right.fact.eventId) ||
        left.identityHash.localeCompare(right.identityHash) ||
        left.identityJson.localeCompare(right.identityJson),
    );
  const facts = identifiedFacts.map((item) => item.fact);
  const duplicateFactIds = new Set<string>();
  const factByEventId = new Map<string, CanonicalMembershipMigrationEventFact>();
  for (const fact of facts) {
    if (factByEventId.has(fact.eventId)) duplicateFactIds.add(fact.eventId);
    else factByEventId.set(fact.eventId, fact);
  }
  for (const eventId of duplicateFactIds) {
    globalBlockers.push(
      blocker({
        code: "EVENT_FACT_DUPLICATE",
        eventId,
        message: `Canonical Event Core fact ${eventId} is duplicated.`,
      }),
    );
  }

  const manifestEntries = new Map(
    Object.entries(input.parsedManifest.manifest?.events ?? {}),
  );
  const eventBlockers = new Map<string, CanonicalMembershipMigrationBlocker[]>();
  const addEventBlocker = (
    eventId: string,
    value: CanonicalMembershipMigrationBlocker,
  ) => {
    eventBlockers.set(eventId, [...(eventBlockers.get(eventId) ?? []), value]);
  };

  for (const [eventId] of manifestEntries) {
    const fact = factByEventId.get(eventId);
    if (!fact) {
      globalBlockers.push(
        blocker({
          code: "MANIFEST_EVENT_UNKNOWN",
          eventId,
          message: `Operator manifest event ${eventId} is not canonical Event Core data.`,
        }),
      );
    } else if (
      fact.authority === "canonical_membership" ||
      fact.configurationDeadline !== null
    ) {
      addEventBlocker(
        fact.eventId,
        blocker({
          code: "MANIFEST_ENTRY_EXTRA",
          eventId: fact.eventId,
          message: `Operator manifest event ${fact.eventId} already has deadline authority.`,
        }),
      );
    }
  }

  const eventPlans: CanonicalMembershipMigrationEventPlan[] = [];
  for (const fact of factByEventId.values()) {
    const blockers = [...(eventBlockers.get(fact.eventId) ?? [])];
    let deadline =
      fact.authority === "legacy_registration"
        ? configurationDeadline(fact)
        : null;
    if (fact.authority === "canonical_membership") {
      if (!fact.activationBaselineValid) {
        blockers.push(
          blocker({
            code: "CANONICAL_ACTIVATION_BASELINE_INVALID",
            eventId: fact.eventId,
            message: `Canonical activation baseline for ${fact.eventId} is invalid.`,
          }),
        );
      }
    } else if (!deadline) {
      const entry = manifestEntries.get(fact.eventId);
      if (entry) {
        deadline = {
          evidenceId: entry.evidenceId,
          profileEditDeadlineAt: entry.profileEditDeadlineAt,
          source: "operator_manifest",
        };
      } else {
        blockers.push(
          blocker({
            code: "MISSING_PROFILE_EDIT_DEADLINE",
            eventId: fact.eventId,
            message: `Legacy event ${fact.eventId} requires an operator manifest deadline.`,
          }),
        );
      }
    }
    const sorted = sortBlockers(blockers);
    eventPlans.push({
      action:
        sorted.length > 0
          ? "blocked"
          : fact.authority === "canonical_membership"
            ? "verify_canonical"
            : "activate",
      authority: fact.authority,
      blockers: sorted,
      currentState:
        fact.authority === "canonical_membership" ? "canonical" : "legacy",
      deadline,
      eventId: fact.eventId,
      source: sourceSummary(fact.registrations),
    });
  }
  eventPlans.sort((left, right) => left.eventId.localeCompare(right.eventId));
  const allBlockers = sortBlockers([
    ...globalBlockers,
    ...eventPlans.flatMap((event) => event.blockers),
  ]);
  const total = {
    cancelled: eventPlans.reduce((sum, event) => sum + event.source.cancelled, 0),
    registrations: eventPlans.reduce((sum, event) => sum + event.source.count, 0),
    rsvped: eventPlans.reduce((sum, event) => sum + event.source.rsvped, 0),
  };
  const eventCoreHash = canonicalMigrationHash(
    facts
      .map((fact) => ({
        contentHash: fact.contentHash,
        eventId: fact.eventId,
        eventVersion: fact.eventVersion,
      }))
      .sort(
        (left, right) =>
          left.eventId.localeCompare(right.eventId) ||
          left.contentHash.localeCompare(right.contentHash) ||
          left.eventVersion - right.eventVersion,
      ),
  );
  const migrationId = CANONICAL_MEMBERSHIP_MIGRATION_ID;
  const diagnosticPayload = {
    blockers: allBlockers,
    eventCount: eventPlans.length,
    eventCoreHash,
    events: eventPlans,
    manifestHash: input.parsedManifest.manifestHash,
    migrationId,
    schemaVersion: CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
    total,
  };
  const diagnosticHash = canonicalMigrationHash(diagnosticPayload);
  const applyEligible = allBlockers.length === 0;
  return {
    applyEligible,
    applyPlanHash: applyEligible
      ? canonicalMigrationHash({ ...diagnosticPayload, diagnosticHash })
      : null,
    blockers: allBlockers,
    diagnosticHash,
    eventCount: eventPlans.length,
    eventCoreHash,
    events: eventPlans,
    manifestHash: input.parsedManifest.manifestHash,
    migrationId,
    schemaVersion: CANONICAL_MEMBERSHIP_MIGRATION_SCHEMA_VERSION,
    total,
  };
}
