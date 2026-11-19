/**
 * The graph's web access as the deployment configures it (agent-design AG09): the switch ORBIT_AGENT_WEB, the DeepSeek
 * key (the same DEEPSEEK_API_KEY as the model), the request's web record store and the users' own switches. With the
 * switch off or no key the access is disabled and not one web request is made (features/plans/search/factory.ts does
 * the same for its search). Under ORBIT_AGENT_EVAL=1 the calls go to the same endpoints and the eval's preload answers
 * them from the recorded replays (tests/agent-eval/preload/eval-preload.cjs); an unrecorded one is refused there.
 */
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { configuredWebEvidenceStore } from "./evidence";
import type { AgentWebAccess } from "./service";
import { configuredWebSettings, webSwitchOn } from "./settings";

export function configuredWebAccess(mode: FeatureMode, fetchImplementation?: typeof fetch, env: Record<string, string | undefined> = process.env): AgentWebAccess {
  const apiKey = env.DEEPSEEK_API_KEY?.trim() || null;
  return {
    apiKey,
    enabled: webSwitchOn(env) && Boolean(apiKey),
    ...(fetchImplementation ? { fetchImplementation } : {}),
    settings: configuredWebSettings(mode),
    store: configuredWebEvidenceStore(mode),
  };
}
