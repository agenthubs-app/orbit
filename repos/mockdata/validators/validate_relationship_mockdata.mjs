#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const required = [
  'seed/users.seed.json',
  'seed/events.seed.json',
  'seed/event_participants.seed.json',
  'seed/connections.seed.json',
  'seed/interactions.seed.json',
  'seed/messages.seed.json',
  'seed/match_recommendations.seed.json',
  'tests/golden_matches.json',
  'tests/negative_cases.json',
];
const data = new Map();
for (const rel of required) {
  const url = new URL(rel, root);
  if (!existsSync(url)) throw new Error(`Missing ${rel}`);
  const value = JSON.parse(readFileSync(url, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${rel} must contain an array`);
  data.set(rel, value);
}
const messages = data.get('seed/messages.seed.json');
const messageBodies = messages.map((record) => record.body);
if (new Set(messageBodies).size / messages.length < 0.9) {
  throw new Error('message body uniqueness must be at least 90%');
}
if (messageBodies.filter((body) => /[\u3400-\u9fff]/u.test(body)).length / messages.length < 0.8) {
  throw new Error('at least 80% of message bodies must contain Chinese context');
}
for (const record of messages) {
  for (const field of ['conversation_id', 'sender_role', 'direction', 'channel', 'occurred_at', 'message_type', 'body']) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      throw new Error(`message ${record.id} is missing ${field}`);
    }
  }
}
const conversationCounts = new Map();
for (const record of messages) {
  conversationCounts.set(record.conversation_id, (conversationCounts.get(record.conversation_id) ?? 0) + 1);
}
if ([...conversationCounts.values()].some((count) => count < 3)) {
  throw new Error('every conversation must contain at least three messages');
}
const interactions = data.get('seed/interactions.seed.json');
if (new Set(interactions.map((record) => record.summary)).size / interactions.length < 0.9) {
  throw new Error('interaction summary uniqueness must be at least 90%');
}
if (new Set(interactions.map((record) => record.channel)).size < 5) {
  throw new Error('interactions must cover at least five channels');
}
const recommendations = data.get('seed/match_recommendations.seed.json');
const ranked = new Map();
for (const record of recommendations) {
  const key = `${record.event_id}\u0000${record.user_id}`;
  const values = ranked.get(key) ?? [];
  values.push(record);
  ranked.set(key, values);
}
const topPairs = new Set();
for (const [key, values] of ranked) {
  values.sort((left, right) => right.score - left.score || left.recommended_user_id.localeCompare(right.recommended_user_id));
  for (const value of values.slice(0, 3)) {
    topPairs.add(`${key}\u0000${value.recommended_user_id}`);
  }
}
const golden = data.get('tests/golden_matches.json');
const goldenHits = golden.filter((record) => topPairs.has(`${record.event_id}\u0000${record.user_id}\u0000${record.recommended_user_id}`)).length;
const recallAt3 = goldenHits / golden.length;
if (recallAt3 < 0.95) throw new Error(`golden recall@3 ${recallAt3.toFixed(3)} is below 0.95`);
const negative = data.get('tests/negative_cases.json');
const negativeLeaks = negative.filter((record) => topPairs.has(`${record.event_id}\u0000${record.user_id}\u0000${record.recommended_user_id}`)).length;
if (negativeLeaks > 0) throw new Error(`${negativeLeaks} negative cases leaked into top-3`);
console.log(JSON.stringify({
  passed: true,
  conversations: conversationCounts.size,
  interactionChannels: new Set(interactions.map((record) => record.channel)).size,
  messageUniqueness: new Set(messageBodies).size / messages.length,
  recallAt3,
  negativeLeaks,
}, null, 2));
