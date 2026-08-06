import type { EventRegistration } from "./contract";

/**
 * Anonymous aggregate preview of who has registered for an event.
 *
 * Privacy contract: this module never exposes an individual — output is
 * bucket counts only, and a bucket is published only when it holds at least
 * {@link CLUSTER_PREVIEW_MIN_BUCKET} people so small samples cannot be
 * reverse-mapped to a person. Published bucket counts are additionally
 * floored to multiples of the threshold ("5+", "10+"), so watching the
 * endpoint across a single person's registration does not reveal which
 * bucket they joined. `total` mirrors the attendee count that the event
 * detail page already shows publicly; it is not additional signal. Callers
 * may show `total` alone when no bucket clears the threshold.
 */
export const CLUSTER_PREVIEW_MIN_BUCKET = 5;

export interface RegistrationClusterBucket {
  count: number;
  label: string;
}

export interface RegistrationClusterPreview {
  buckets: readonly RegistrationClusterBucket[];
  total: number;
}

export function registrationClusterPreview(
  registrations: readonly EventRegistration[],
): RegistrationClusterPreview {
  const active = registrations.filter(
    (registration) => registration.status === "rsvped",
  );
  const counts = new Map<string, { count: number; label: string }>();
  for (const registration of active) {
    // 桶标签只用用户自己填写的内容：优先行业，缺失时退回定位里的角色段
    // （"role @ organization" 的 @ 前部分）。不做任何推断补齐。
    const answers = registration.participantProfile.answers;
    const industry =
      answers.industry?.trim() ||
      answers.positioning?.split("@")[0]?.trim() ||
      "";
    if (!industry) continue;
    const key = industry.toLocaleLowerCase("en-US");
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { count: 1, label: industry });
  }
  const buckets = [...counts.values()]
    .filter((bucket) => bucket.count >= CLUSTER_PREVIEW_MIN_BUCKET)
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((bucket) => ({
      // 只发布 5 的整数倍下界（"5+"、"10+"），单人报名前后轮询看不到桶变化。
      count:
        Math.floor(bucket.count / CLUSTER_PREVIEW_MIN_BUCKET) *
        CLUSTER_PREVIEW_MIN_BUCKET,
      label: bucket.label,
    }));
  return { buckets, total: active.length };
}
