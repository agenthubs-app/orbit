import assert from "node:assert/strict";
import test from "node:test";

import { stashAgentPrefill, takeAgentPrefill } from "../../app/(app)/app/orbit-global-ask/orbit-ask-draft";

// R30 (search/DESIGN.md §1): ⌘K 「iOrbit に聞く」 only prefills iOrbit's input. The hand-off is a plain prefill
// (origin null) that the iOrbit page reads once into its input; it never becomes a pending ask that sends on arrival.
function withSession(run: () => void) {
  const memory: Record<string, string> = {};
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { sessionStorage: { getItem: (k: string) => memory[k] ?? null, setItem: (k: string, v: string) => { memory[k] = v; }, removeItem: (k: string) => { delete memory[k]; } } };
  try { run(); } finally { (globalThis as { window?: unknown }).window = previous; }
}

test("a plain prefill round-trips once and is then gone", () => withSession(() => {
  stashAgentPrefill({ origin: null, query: " 半導体商社の人に会うには？ ", returnTo: "/app/contacts" });
  assert.deepEqual(takeAgentPrefill(), { origin: null, query: "半導体商社の人に会うには？", returnTo: "/app/contacts" });
  assert.equal(takeAgentPrefill(), null);
}));

test("a plain prefill from outside /app or without text is refused", () => withSession(() => {
  stashAgentPrefill({ origin: null, query: "x", returnTo: "https://evil.example" });
  assert.equal(takeAgentPrefill(), null);
  stashAgentPrefill({ origin: null, query: "  ", returnTo: "/app/home" });
  assert.equal(takeAgentPrefill(), null);
}));
