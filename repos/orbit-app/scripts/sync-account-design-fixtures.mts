// R18a canonical account fixtures → private development-only App snapshot.
// Run with node --import tsx scripts/sync-account-design-fixtures.mts; production runtime never imports the source world.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demoAccountEventSummary, demoAccountIntegrations, demoAccountMemories, demoAccountProfiles, demoAccountSeekCandidates, demoAccountSuggestions, demoAccountUnread } from "../../orbits/shared/mock/demo-world/account";
import { DEMO_PLAN } from "../../orbits/shared/mock/demo-world/index";
const fixtures = { integrations: demoAccountIntegrations, memories: demoAccountMemories, seekCandidates: demoAccountSeekCandidates, suggestions: demoAccountSuggestions, eventSummary: demoAccountEventSummary, unread: demoAccountUnread, goal: { planId: DEMO_PLAN.id, goal: DEMO_PLAN.goal }, bio: demoAccountProfiles.complete.profile?.bio ?? "" };
writeFileSync(fileURLToPath(new URL("../fixtures/account-design.ts", import.meta.url)), `// Generated from shared/mock/demo-world/account.ts. Only load inside an __DEV__ guard.\nexport const accountDesignFixtures = ${JSON.stringify(fixtures, null, 2)} as const;\n`);
