import { Chip } from "./primitives";

type KnownSourceType =
  | "calendar"
  | "calendar_event"
  | "conversation"
  | "document"
  | "email"
  | "event"
  | "import"
  | "manual"
  | "profile";

type KnownSourceTrustState =
  | "limited"
  | "needs_review"
  | "review"
  | "trusted"
  | "untrusted"
  | "unknown"
  | "verified";

type SourceChipTone = "neutral" | "evidence" | "privacy" | "success" | "warning";

export type SourceType = KnownSourceType | (string & {});
export type SourceTrustState = KnownSourceTrustState | (string & {});

export interface SourceChipProps {
  sourceLabel: string;
  sourceType: SourceType;
  trustState: SourceTrustState;
  supportingText?: string;
  ariaLabel?: string;
}

const rawReferencePattern =
  /\b(?:evidence|queue|source)(?::|_)[A-Za-z0-9][A-Za-z0-9:._/-]*/gi;
const hyphenatedRawReferencePattern =
  /\b(?:evidence|queue|source)-[A-Za-z0-9][A-Za-z0-9:._/-]*/gi;
const compactRawIdentifierPattern = /^[a-z][a-z0-9_-]*(?::|\/)[a-z0-9:_/-]+$/i;

const sourceTypeLabels: Partial<Record<KnownSourceType, string>> = {
  calendar: "Calendar",
  calendar_event: "Calendar event",
  conversation: "Conversation",
  document: "Document",
  email: "Email",
  event: "Event",
  import: "Imported list",
  manual: "Manual note",
  profile: "Profile",
};

const trustStateLabels: Partial<Record<KnownSourceTrustState, string>> = {
  limited: "Limited signal",
  needs_review: "Review source",
  review: "Review source",
  trusted: "Verified source",
  untrusted: "Needs confirmation",
  unknown: "Source context",
  verified: "Verified source",
};

const trustStateTones: Partial<Record<KnownSourceTrustState, SourceChipTone>> = {
  limited: "privacy",
  needs_review: "warning",
  review: "warning",
  trusted: "success",
  untrusted: "warning",
  unknown: "neutral",
  verified: "success",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function humanizeToken(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  if (!cleaned) {
    return fallback;
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function sanitizeSourceDisplayText(value: string, fallback = "Source context"): string {
  const trimmed = value.trim();

  if (!trimmed || compactRawIdentifierPattern.test(trimmed)) {
    return fallback;
  }

  const sanitized = trimmed
    .replace(rawReferencePattern, "private reference")
    .replace(hyphenatedRawReferencePattern, (match) => {
      const suffix = match.slice(match.indexOf("-") + 1);
      const separatorCount = (suffix.match(/[-_:/]/g) ?? []).length;

      return /\d/.test(suffix) || separatorCount >= 2 ? "private reference" : match;
    })
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || fallback;
}

export function resolveSourceTrustTone(trustState: SourceTrustState): SourceChipTone {
  const normalized = normalizeToken(trustState);

  return trustStateTones[normalized as KnownSourceTrustState] ?? "neutral";
}

export function formatSourceType(sourceType: SourceType): string {
  const normalized = normalizeToken(sourceType);

  return sourceTypeLabels[normalized as KnownSourceType] ?? humanizeToken(sourceType, "Source");
}

export function formatSourceTrustState(trustState: SourceTrustState): string {
  const normalized = normalizeToken(trustState);

  return trustStateLabels[normalized as KnownSourceTrustState] ?? "Source context";
}

export function SourceChip({
  sourceLabel,
  sourceType,
  trustState,
  supportingText,
  ariaLabel,
}: SourceChipProps) {
  const safeSourceLabel = sanitizeSourceDisplayText(sourceLabel);
  const safeSupportingText = supportingText
    ? sanitizeSourceDisplayText(supportingText, "")
    : "";
  const sourceTypeLabel = sanitizeSourceDisplayText(formatSourceType(sourceType), "Source");
  const trustStateLabel = sanitizeSourceDisplayText(
    formatSourceTrustState(trustState),
    "Source context",
  );
  const accessibleLabel =
    ariaLabel ??
    `Source context: ${safeSourceLabel}, ${sourceTypeLabel}, ${trustStateLabel}`;

  return (
    <Chip tone={resolveSourceTrustTone(trustState)}>
      <span
        aria-label={sanitizeSourceDisplayText(accessibleLabel)}
        className="control-stack"
      >
        <span>{safeSourceLabel}</span>
        <span>
          {sourceTypeLabel} · {trustStateLabel}
        </span>
        {safeSupportingText && <small>{safeSupportingText}</small>}
      </span>
    </Chip>
  );
}
