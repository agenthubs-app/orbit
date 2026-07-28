import type { EventDTO } from "../../shared/domain/contracts";
import { hashString } from "../../shared/utils/stable-hash";

export function eventCodeFor(event: EventDTO, index = 0): string {
  const source = event.id || event.source.id || event.name;
  const compact = source
    .replace(/^source[:_-]?/i, "")
    .replace(/^event[:_-]?/i, "evt")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

  if (!compact) {
    return `EVT${index + 1}`;
  }

  // Ten-character truncation made event_signup_01/02/03 all resolve to
  // EVTSIGNUP0. Preserve naturally short codes and add a stable suffix only
  // for genuinely long ids so every public card has one canonical detail URL.
  if (compact.length <= 16) {
    return compact;
  }

  const suffix = hashString(source)
    .toString(36)
    .toUpperCase()
    .slice(-4)
    .padStart(4, "0");

  return `${compact.slice(0, 12)}${suffix}`;
}
