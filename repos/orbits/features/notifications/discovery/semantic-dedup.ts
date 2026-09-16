import { createHash } from 'node:crypto';
import type { DiscoveryEvidence } from './contract';

export function discoveryDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function discoveryAnchors(evidence: DiscoveryEvidence[]): string[] {
  // Only server-owned provenance joins sources. The model cannot invent aliases.
  return [...new Set(evidence.flatMap(item => item.links.length ? item.links : [item.key]))].sort();
}
export function semanticDiscoveryKey(input: { actorId: string; objectId: string; action: string; dueAt?: string; evidence: DiscoveryEvidence[] }): string {
  return 'discovery:' + discoveryDigest([input.actorId, input.objectId, input.action.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, ''), input.dueAt ?? null, discoveryAnchors(input.evidence)]);
}
