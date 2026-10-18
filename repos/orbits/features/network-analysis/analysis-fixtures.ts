/**
 * R11b mock world for 人脈分析 (`ORBIT_REDESIGN_MOCK=network-analysis`, never production): no database, no AI.
 *
 * - Default: the demo world (shared/mock/demo-world/network-analysis.ts — its 10 people, the demo plan's needs).
 * - Design variants for the pixel gates live in a separate module next to this one (imported only by the dev route
 *   app/api/dev/network-design-fixture/route.dev.ts, so production bundles carry no design data); the route installs
 *   the chosen world here. The world lives on globalThis (Next dev bundles each route separately).
 */
import {
  DEMO_NETWORK_ANALYSIS_FOLLOW_UP_IDS,
  DEMO_NETWORK_ANALYSIS_GOAL_IDS,
  DEMO_NETWORK_ANALYSIS_NEEDS,
  DEMO_NETWORK_ANALYSIS_PEOPLE,
} from "../../shared/mock/demo-world/network-analysis";
import { DEMO_TODAY } from "../../shared/mock/demo-world";
import type { NetworkSnapshotView } from "./contract";
import type { NetworkAnalysisNeed, NetworkAnalysisRow } from "./analysis-model";
import type { NetworkAnalysisReadDeps } from "./analysis-reader";

export const NETWORK_DESIGN_VARIANTS = ["empty", "locked5", "few14", "many286"] as const;
export type NetworkDesignVariant = (typeof NETWORK_DESIGN_VARIANTS)[number];

/** The boards' day: 「10/7 更新」 (demo day 2026-10-07, noon Tokyo). */
export const NETWORK_FIXTURE_NOW = new Date(`${DEMO_TODAY}T03:00:00.000Z`);
const DAY = 86_400_000;
const ago = (days: number) => new Date(NETWORK_FIXTURE_NOW.getTime() - days * DAY).toISOString();

export interface NetworkFixtureWorld { variant: NetworkDesignVariant | null; rows: NetworkAnalysisRow[]; needs: NetworkAnalysisNeed[] }
type FixtureState = { world: NetworkFixtureWorld | null };
const STATE_KEY = "__orbitNetworkAnalysisFixture";
function state(): FixtureState {
  const holder = globalThis as unknown as Record<string, FixtureState | undefined>;
  return (holder[STATE_KEY] ??= { world: null });
}
/** Installed only by the dev route (it owns the design data); null restores the demo world. */
export function installNetworkFixtureWorld(world: NetworkFixtureWorld | null): NetworkDesignVariant | null {
  state().world = world;
  return world?.variant ?? null;
}

function demoRows(): NetworkAnalysisRow[] {
  const goal = new Set(DEMO_NETWORK_ANALYSIS_GOAL_IDS);
  const followUp = new Set(DEMO_NETWORK_ANALYSIS_FOLLOW_UP_IDS);
  return DEMO_NETWORK_ANALYSIS_PEOPLE.map((person) => ({
    id: person.id, name: person.name, organization: person.organization, role: person.role, status: person.status,
    primaryIndustryId: person.primaryIndustryId, city: person.city, metKind: person.metKind, seniorityLevel: person.seniorityLevel,
    addedAt: ago(person.addedDaysAgo), lastInteractionAt: person.lastTouchDaysAgo === null ? null : ago(person.lastTouchDaysAgo),
    goalRelated: goal.has(person.id), needsFollowUp: followUp.has(person.id), nextActionPreview: "",
  }));
}

/** The people and needs in effect: the design world the dev route installed, else the demo world. */
export function activeNetworkFixture(): NetworkFixtureWorld {
  return state().world ?? { variant: null, rows: demoRows(), needs: DEMO_NETWORK_ANALYSIS_NEEDS.map(({ sample: _sample, ...need }) => need) };
}

export function fixtureNetworkAnalysisReadDeps(): NetworkAnalysisReadDeps {
  const world = activeNetworkFixture();
  return {
    readTotal: async () => world.rows.length,
    readRows: async () => world.rows,
    readNeeds: async () => world.needs,
    now: () => NETWORK_FIXTURE_NOW,
  };
}

/** GET /api/network/snapshot in the mock world: a ready snapshot whose sentences cite fixture people (many286 carries the 不足 sentence). */
export function fixtureNetworkSnapshotView(language: "zh" | "en" | "ja"): NetworkSnapshotView {
  const { variant, rows } = activeNetworkFixture();
  const base: NetworkSnapshotView = {
    blocks: [], contactCount: rows.length, freshness: { job: "none", newContactCount: 0, stale: false }, generatedAt: null,
    quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } }, state: "none",
  };
  if (rows.length < 10) return { ...base, state: "insufficient" };
  const kobayashi = rows.find((row) => row.name === "小林 誠");
  const text = (ja: string, zh: string, en: string) => (language === "ja" ? ja : language === "zh" ? zh : en);
  return {
    ...base,
    state: "ready",
    generatedAt: NETWORK_FIXTURE_NOW.toISOString(),
    blocks: [
      ...(variant === "many286" && kobayashi ? [{ key: "gap-1", kind: "gap" as const, needId: "design-need-cvc", evidence: { contactIds: [kobayashi.id], recordIds: [] },
        text: text("小林さん（丸の内イノベーションラボ）経由で会える可能性があります", "可以通过小林（丸之内创新实验室）认识", "You may reach them through Kobayashi (Marunouchi Innovation Lab).") }] : []),
      { key: "diagnosis-1", kind: "diagnosis" as const, evidence: { contactIds: rows.slice(0, 3).map((row) => row.id), recordIds: [] },
        text: text("投資・金融の方が多く、製造業との接点が増えています。", "投资与金融的人最多，与制造业的接触在增加。", "Most of your network is in finance, and your ties to manufacturing are growing.") },
    ],
  };
}
