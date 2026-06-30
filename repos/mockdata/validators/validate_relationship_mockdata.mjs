#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const required = ['seed/users.seed.json','seed/events.seed.json','seed/event_participants.seed.json','seed/connections.seed.json','seed/match_recommendations.seed.json','tests/golden_matches.json'];
for (const rel of required) {
  const url = new URL(rel, root);
  if (!existsSync(url)) throw new Error(`Missing ${rel}`);
  JSON.parse(readFileSync(url, 'utf8'));
}
console.log('relationship mockdata files are present and parseable');
