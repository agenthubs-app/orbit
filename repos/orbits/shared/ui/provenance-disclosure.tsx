import { StatusDisplay } from "./primitives";
import { sanitizeSourceDisplayText } from "./source-chip";

// ProvenanceDisclosure 统一展示可读来源、说明 notes 和原始 evidence id。
// 所有展示文本先经过 source-chip 的清洗，避免把内部 raw id 当成用户可读 copy。
export interface ProvenanceDisclosureProps {
  summaryLabel: string;
  sourceLabel: string;
  evidenceIdentifiers?: readonly string[];
  notes?: readonly string[];
  ariaLabel?: string;
}

function sanitizeNotes(notes: readonly string[]): string[] {
  return notes
    .map((note) => sanitizeSourceDisplayText(note, ""))
    .filter((note) => note.length > 0);
}

export function ProvenanceDisclosure({
  summaryLabel,
  sourceLabel,
  evidenceIdentifiers = [],
  notes = [],
  ariaLabel,
}: ProvenanceDisclosureProps) {
  const safeSummaryLabel = sanitizeSourceDisplayText(summaryLabel, "Inspect source context");
  const safeSourceLabel = sanitizeSourceDisplayText(sourceLabel);
  const safeNotes = sanitizeNotes(notes);
  const detailsLabel =
    ariaLabel ?? `${safeSummaryLabel} for ${safeSourceLabel}`;

  return (
    <details aria-label={sanitizeSourceDisplayText(detailsLabel)}>
      <summary>{safeSummaryLabel}</summary>
      <div className="control-stack">
        <StatusDisplay
          label="Readable source"
          tone="evidence"
          value={safeSourceLabel}
        />
        {safeNotes.length > 0 && (
          <ul aria-label="Provenance notes">
            {safeNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {evidenceIdentifiers.length > 0 ? (
          <ul aria-label="Raw evidence identifiers">
            {evidenceIdentifiers.map((identifier) => (
              <li key={identifier}>
                <code>{identifier}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body">No evidence identifiers supplied.</p>
        )}
      </div>
    </details>
  );
}
