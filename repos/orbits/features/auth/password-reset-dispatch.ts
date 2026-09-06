import { createConfiguredPasswordResetRuntime } from "./password-reset-factory";
import { deliverPasswordResetMail } from "./password-reset-service";

// Works inside Next after() and a scheduled serverless invocation, without relying
// on a never-ending process inside a Vercel function. The durable lease survives kills.
export async function dispatchPasswordResetMail(limit = 3) {
  const runtime = createConfiguredPasswordResetRuntime();
  if (!runtime) return { configured: false, sent: 0, retry: 0 };
  const counts = { configured: true, sent: 0, retry: 0 };
  for (let index = 0; index < Math.min(Math.max(limit, 1), 3); index += 1) {
    const result = await deliverPasswordResetMail(runtime);
    if (result === "idle") break;
    counts[result] += 1;
    if (result === "retry") break;
  }
  return counts;
}
