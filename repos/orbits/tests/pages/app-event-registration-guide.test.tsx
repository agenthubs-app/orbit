import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { useRegistrationCatalogueFixture } from "../support/registration-catalogue-fixture";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
useRegistrationCatalogueFixture([
  {
    id: "event_signup_02",
    code: "EVTSIGNUP02",
    title: "东京 AI 落地伙伴对接会",
    venue: "Tokyo",
  },
]);

async function withOrbitModuleMode<T>(
  mode: string,
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = mode;

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("/app/events/[id] does not render the retired deterministic registration guide", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /loadRegistrationProfileGuideForCurrentTestUser/);
  assert.doesNotMatch(pageSource, /RegistrationProfileGuide/);
  assert.doesNotMatch(pageSource, /data-orbit-registration-profile-guide/);
  assert.doesNotMatch(pageSource, /deterministic profile questions/);
});

