import { randomUUID } from "node:crypto";

import type { HumanEncounterProjectionClaim, HumanEncounterProjectionRepository } from "./projection-repository";

function noteFor(claim: HumanEncounterProjectionClaim) {
  const encounter = claim.encounter;
  const body = [
    `谈过：${encounter.talked === "yes" ? "是" : encounter.talked === "no" ? "否" : "不确定"}`,
    encounter.noteText && `记录：${encounter.noteText}`,
    encounter.commitments.length && `承诺：${encounter.commitments.join("；")}`,
    encounter.nextStep && `下一步：${encounter.nextStep}`,
    encounter.tags.length && `标签：${encounter.tags.join("、")}`,
    encounter.voiceMemoReference && "含用户上传的语音备忘引用",
  ].filter(Boolean).join("\n");
  return {
    interaction: { channel: "event_note", occurredAt: encounter.observedAt, summary: `用户明确记录：谈过状态为 ${encounter.talked}` },
    note: {
      authorLabel: "You · explicit encounter",
      body,
      createdAt: encounter.observedAt,
      noteId: `note:${encounter.encounterId}`,
      privacy: encounter.privacy,
      sourceLabel: "Explicit human encounter",
    },
  };
}

export async function projectPendingHumanEncounters(input: {
  afterContactWrite?: (claim: HumanEncounterProjectionClaim) => Promise<void>;
  leaseMilliseconds?: number;
  limit?: number;
  now?: () => string;
  repository: HumanEncounterProjectionRepository;
  workerId?: string;
}): Promise<{ completed: number; failed: number; leaseLost: number; retried: number }> {
  const now = input.now ?? (() => new Date().toISOString());
  const claims = await input.repository.claim({
    leaseMilliseconds: Math.max(1_000, input.leaseMilliseconds ?? 60_000),
    limit: Math.max(1, Math.min(64, input.limit ?? 32)),
    now: now(),
    workerId: input.workerId?.trim() || `human-encounter-worker:${randomUUID()}`,
  });
  let completed = 0;
  let failed = 0;
  let leaseLost = 0;
  let retried = 0;
  await Promise.all(claims.map(async (claim) => {
    const projection = noteFor(claim);
    try {
      const outcome = await input.repository.complete({
        afterContactWrite: input.afterContactWrite ? () => input.afterContactWrite!(claim) : undefined,
        claim,
        interaction: projection.interaction,
        note: projection.note,
        now: now(),
      });
      if (outcome === "completed") completed += 1;
      else leaseLost += 1;
    } catch (error) {
      const outcome = await input.repository.fail({ claim, error: error instanceof Error ? error.message : "Encounter projection failed.", now: now() });
      if (outcome === "failed") failed += 1;
      else if (outcome === "retry") retried += 1;
      else leaseLost += 1;
    }
  }));
  return { completed, failed, leaseLost, retried };
}
