import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProvenanceDisclosure } from "../../shared/ui/provenance-disclosure";
import { SourceChip } from "../../shared/ui/source-chip";

const rawIdentifiers = [
  "evidence:events-calendar-fixture",
  "queue:notification:maya-deck",
  "source:import:attendee-roster",
] as const;

function summaryMarkup(html: string): string {
  return html.match(/<summary[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? "";
}

function statusPrimaryMarkup(html: string): string {
  return html.match(/<p[^>]*status-display[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
}

function assertRawIdsHiddenFromPrimaryText(html: string): void {
  const primaryMarkup = `${summaryMarkup(html)} ${statusPrimaryMarkup(html)}`;

  for (const rawIdentifier of rawIdentifiers) {
    assert.doesNotMatch(primaryMarkup, new RegExp(rawIdentifier));
  }
}

test("SourceChip renders readable source context without raw identifiers", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceChip, {
      sourceLabel: "Tokyo Founder Demo Night attendee list",
      sourceType: "event",
      trustState: "verified",
      supportingText:
        "Introduced by the event team after source:import:attendee-roster",
    }),
  );

  assert.match(html, /Tokyo Founder Demo Night attendee list/);
  assert.match(html, /Event/);
  assert.match(html, /Verified source/);
  assert.match(html, /Introduced by the event team after private reference/);
  assert.match(html, /orbit-chip/);
  assert.match(html, /orbit-chip-success/);
  assert.match(html, /control-stack/);
  assert.match(html, /aria-label="Source context:/);
  assert.doesNotMatch(html, /\sstyle="/);

  for (const rawIdentifier of rawIdentifiers) {
    assert.doesNotMatch(html, new RegExp(rawIdentifier));
  }
});

test("ProvenanceDisclosure renders empty provenance without identifier markup", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProvenanceDisclosure, {
      summaryLabel: "Inspect source context",
      sourceLabel: "Manual note from Rina Kato",
      evidenceIdentifiers: [],
      notes: ["Relationship note is waiting for a reviewed source."],
    }),
  );

  assert.match(html, /<details/);
  assert.match(html, /<summary>Inspect source context<\/summary>/);
  assert.match(html, /Manual note from Rina Kato/);
  assert.match(html, /No evidence identifiers supplied/);
  assert.match(html, /status-display/);
  assert.match(html, /control-stack/);
  assert.doesNotMatch(html, /<code>/);
  assert.doesNotMatch(html, /\sstyle="/);
});

test("source and provenance components keep long labels wrap-ready", () => {
  const longLabel =
    "Tokyo Founder Demo Night post-event relationship source from the enterprise partnerships breakfast conversation";
  const html = renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      React.createElement(SourceChip, {
        sourceLabel: longLabel,
        sourceType: "calendar_event",
        trustState: "needs_review",
      }),
      React.createElement(ProvenanceDisclosure, {
        summaryLabel: "Inspect long source label",
        sourceLabel: longLabel,
        evidenceIdentifiers: ["evidence:long-label-calendar-event"],
      }),
    ),
  );

  assert.match(html, new RegExp(longLabel));
  assert.match(html, /Calendar event/);
  assert.match(html, /Review source/);
  assert.match(html, /orbit-chip-warning/);
  assert.match(html, /status-display-evidence/);
  assert.match(html, /control-stack/);
  assert.doesNotMatch(html, /\sstyle="/);
});

test("ProvenanceDisclosure keeps raw identifiers inside details body code list only", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProvenanceDisclosure, {
      summaryLabel: "Inspect provenance",
      sourceLabel: "Event attendee roster",
      evidenceIdentifiers: rawIdentifiers,
      notes: [
        "Reviewed source source:import:attendee-roster before outreach.",
        "Queue queue:notification:maya-deck remains inside provenance details.",
      ],
    }),
  );

  assertRawIdsHiddenFromPrimaryText(html);
  assert.match(html, /<summary>Inspect provenance<\/summary>/);
  assert.match(html, /Event attendee roster/);
  assert.match(html, /Reviewed source private reference before outreach/);
  assert.match(html, /Queue private reference remains inside provenance details/);

  for (const rawIdentifier of rawIdentifiers) {
    assert.match(html, new RegExp(`<li><code>${rawIdentifier}</code></li>`));
  }
});

test("SourceChip falls back to a neutral presentation for unknown trust states", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceChip, {
      sourceLabel: "Ari Kato email introduction",
      sourceType: "email",
      trustState: "partner_experimental_signal",
      supportingText: "Readable source context only",
    }),
  );

  assert.match(html, /Ari Kato email introduction/);
  assert.match(html, /Email/);
  assert.match(html, /Source context/);
  assert.match(html, /orbit-chip-neutral/);
  assert.doesNotMatch(html, /orbit-chip-partner_experimental_signal/);
  assert.doesNotMatch(html, /partner_experimental_signal/);
  assert.doesNotMatch(html, /\sstyle="/);
});

test("SourceChip preserves readable source and evidence prose", () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceChip, {
      sourceLabel: "Source-backed introduction context",
      sourceType: "manual",
      trustState: "limited",
      supportingText: "Evidence-based notes are waiting for confirmation.",
    }),
  );

  assert.match(html, /Source-backed introduction context/);
  assert.match(html, /Evidence-based notes are waiting for confirmation/);
  assert.doesNotMatch(html, /private reference/);
  assert.doesNotMatch(html, /\sstyle="/);
});
