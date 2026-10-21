import assert from "node:assert/strict";
import test from "node:test";

import type { ContactSyncPayload } from "../src/api/contract/contact-local-directory";
import { buildNetworkAnalysisPeople, buildNetworkAnalysisView, type NetworkAnalysisNeed, type NetworkAnalysisRow } from "../src/api/compute/network-analysis-model";
import { localNetworkAnalysisRows } from "../src/view-models/network-analysis-local";

// LF3: the device builds the analysis rows from its contacts domain the way the server's readNetworkAnalysisRows builds
// them from the 人脈 cards, so the shared model gives the same view on both sides (0117's on-device analysis restored).
const industries = ["finance", "software", "manufacturing", "retail"];
const cities = ["Tokyo", "Osaka", null];
const mets = ["event", "intro", "card", undefined] as const;
const levels = ["executive", "senior", "mid", null];

function row(index: number): ContactSyncPayload {
  const id = `contact:${index}`;
  const minute = String(index).padStart(2, "0");
  return {
    id: `record:${index}`,
    card: {
      id, displayName: `人${index}`, organization: `会社${index % 5}`, role: "マネージャー", sourceType: "manual",
      status: index % 3 === 0 ? "nurture" : "active", pendingInitialization: false, nextActionPreview: index % 4 === 0 ? "連絡する" : "",
      valueTypes: [], updatedAt: "2026-10-01T00:00:00.000Z",
      primaryIndustryId: industries[index % industries.length],
      ...(cities[index % cities.length] ? { region: { countryCode: "JP", city: cities[index % cities.length] } } : {}),
      ...(mets[index % mets.length] ? { metKind: mets[index % mets.length] as never } : {}),
      addedAt: `2026-0${1 + (index % 9)}-10T00:00:00.000Z`,
      ...(index % 2 === 0 ? { lastInteractionAt: `2026-0${1 + (index % 7)}-01T00:00:00.000Z` } : {}),
    },
    tags: [],
    search: { text: `人${index}`, occurredAt: `2026-10-01T00:${minute}:00.000000Z`, updatedAt: `2026-10-01T00:${minute}:00.000000Z`, error: null },
    detail: { state: "success", contact: { id, displayName: `人${index}`, ...(levels[index % levels.length] ? { seniorityLevel: levels[index % levels.length] } : {}) } },
  };
}

const rows = Array.from({ length: 24 }, (_, index) => row(index + 1));
const merge = { goalIds: ["contact:2", "contact:5", "contact:9", "contact:12"], followUpIds: ["contact:3", "contact:12", "contact:20"] };
const needs: NetworkAnalysisNeed[] = [
  { planId: "plan:1", needId: "need:1", title: "金融の担当者", primaryIndustryId: "finance", targetCount: 5, linkedCount: 1, skipped: false },
  { planId: "plan:1", needId: "need:2", title: "工場の責任者", primaryIndustryId: "manufacturing", targetCount: 3, linkedCount: 3, skipped: false },
];
const now = new Date("2026-10-21T00:00:00.000Z");

/** The server's projection (features/network-analysis/analysis-reader.ts readNetworkAnalysisRows) over the same cards. */
function serverRows(): NetworkAnalysisRow[] {
  const goal = new Set(merge.goalIds), followUp = new Set(merge.followUpIds);
  return rows.map(({ card, detail }) => ({
    id: card!.id, name: card!.displayName, organization: card!.organization, role: card!.role, status: card!.status,
    primaryIndustryId: card!.primaryIndustryId ?? null, city: card!.region?.city ?? null, metKind: card!.metKind ?? null,
    seniorityLevel: ((detail as { contact: { seniorityLevel?: string } }).contact.seniorityLevel) ?? null,
    addedAt: card!.addedAt ?? null, lastInteractionAt: card!.lastInteractionAt ?? null,
    goalRelated: goal.has(card!.id), needsFollowUp: followUp.has(card!.id), nextActionPreview: card!.nextActionPreview,
  }));
}

const sortById = (list: NetworkAnalysisRow[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

test("LF3: device rows equal the server's projection of the same contacts", () => {
  assert.deepEqual(sortById(localNetworkAnalysisRows(rows, merge)), sortById(serverRows()));
});

test("LF3: the shared model gives the same view from device rows and server rows (structure, gaps, opportunities, insights)", () => {
  const device = buildNetworkAnalysisView({ total: rows.length, rows: localNetworkAnalysisRows(rows, merge), needs, now });
  const server = buildNetworkAnalysisView({ total: rows.length, rows: serverRows(), needs, now });
  assert.deepEqual(device, server);
  assert.equal(device.lock.state, "open");
  assert.deepEqual(device.needs, needs);
  assert.ok(device.structure?.gaps?.length, "the unmet finance need is a gap");
});

test("LF3: drill-down lists computed on the device match the server's, page by page", () => {
  const device = localNetworkAnalysisRows(rows, merge);
  for (const [dimension, bucketId] of [["industry", "finance"], ["opportunity", "reconnect"]] as const) {
    const a = buildNetworkAnalysisPeople({ rows: device, needs, dimension, bucketId, limit: 5, now });
    const b = buildNetworkAnalysisPeople({ rows: serverRows(), needs, dimension, bucketId, limit: 5, now });
    assert.deepEqual(a, b, `${dimension}/${bucketId}`);
  }
});

test("LF3: below ten people the device view is locked, like the server's", () => {
  const few = rows.slice(0, 6);
  const view = buildNetworkAnalysisView({ total: few.length, rows: localNetworkAnalysisRows(few, merge), needs, now });
  assert.equal(view.lock.state, "locked");
});
