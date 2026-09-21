import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

const root = join(process.cwd());
const gone = [
  "app/(app)/app/dashboard/page.tsx",
  "app/(app)/app/contacts/all-actions/page.tsx",
  "app/(app)/app/contacts/intros/page.tsx",
  "app/(app)/app/contacts/graph/page.tsx",
  "app/(app)/app/contacts/new/batch/[id]/page.tsx",
  "app/(app)/app/contacts/new/batch2/page.tsx",
  "app/(app)/app/contacts/new/batch2/[id]/page.tsx",
  "app/(app)/app/contacts/new/import/[id]/page.tsx",
];

test("retired network routes no longer exist", () => {
  for (const p of gone) assert.equal(existsSync(join(root, p)), false, `${p} should be deleted`);
});

test("no server-side link generator points at a retired route", () => {
  const files = [
    "features/orbit-ai/live-command-service.ts",
    "app/api/integrations/[provider]/callback/route.ts",
    "features/auth/app-auth-routing.ts",
  ];
  for (const f of files) {
    const text = readFileSync(join(root, f), "utf8");
    assert.doesNotMatch(
      text,
      /"\/app\/dashboard"|\/app\/contacts\/all-actions|\/app\/contacts\/intros|\/app\/contacts\/graph|contacts\/new\/batch/,
      f,
    );
  }
});
