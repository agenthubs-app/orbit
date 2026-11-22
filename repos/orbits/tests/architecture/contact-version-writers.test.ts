/**
 * agent-design AG12-2 (PLANNER 易错边界 2): every module that writes the `contacts` collection takes the next version
 * from features/contacts/contact-version.ts — otherwise an expected version could match while the contact changed.
 *
 * Product modules (features/, shared/, app/) that name the contacts collection and call a record write are found by text
 * search; each is either a writer that uses the shared functions, or listed below with why it writes no contact.
 * A new writer fails this test until it uses them (or is shown not to write contacts).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

/** Writers of contacts: each must import from contact-version. */
const WRITERS = [
  "features/connections/lifecycle/initialization.ts",
  "features/contacts/action-writer.ts",
  "features/contacts/business-card-contact-match.ts",
  "features/contacts/contact-field-write.ts",
  "features/contacts/delete/service.ts",
  "features/contacts/enrichment/backfill.ts",
  "features/contacts/storage/contact-live-record-provider.ts",
  "features/contacts/storage/contact-write-live-record-provider.ts",
  "features/invite-codes/invite-fields.ts",
  "features/network-analysis/layers-runtime.ts",
];

/** Modules that name contacts and write other records (checked by reading them; AG12 REPORT 写入方清单). */
const NOT_CONTACT_WRITES: Record<string, string> = {
  "features/connections/lifecycle/postgres-repository.ts": "locks and reads the contact; writes connections, tasks, evidence and audits only",
  "features/contacts/completion/repository.ts": "writes completion questions; contact fields go through applyContactFieldValues (completion/service.ts)",
  "features/contacts/manual-contact-v2/service.ts": "creates through the write provider's saveContact, merges through applyContactFieldValues; undo is a tombstone delete",
  "features/events/confirmed-followup/service.ts": "reads contacts; writes its follow-up marker",
  "features/notifications/appointment-inbox-backfill.ts": "reads a contact's name; writes inbox notifications",
  "features/invite-codes/service.ts": "creates through the write provider; undo is a tombstone delete (deleteRecord)",
  "shared/storage/generated-notification-title-repair.ts": "repairs notification titles",
  "shared/storage/seed-generated-fixtures.ts": "development fixture seeding, not a product write path",
};

const NAMES_CONTACTS = /collectionName:\s*"contacts"|collection_name\s*=\s*'contacts'|CONTACTS_LIVE_RECORD_COLLECTIONS\.contacts/u;
const WRITES = /\b(upsertRecord|updateRecordIfCurrent|insertRecordIfAbsent)\s*\(|update\s+orbit_records|insert\s+into\s+orbit_records/iu;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/u.test(name) && !/\.test\.tsx?$/u.test(name)) out.push(path);
  }
  return out;
}

test("every product module that writes contacts takes the next version from contact-version.ts", () => {
  const found = ["features", "shared", "app"].flatMap((dir) => sources(join(ROOT, dir)))
    .filter((path) => {
      const text = readFileSync(path, "utf8");
      return NAMES_CONTACTS.test(text) && WRITES.test(text);
    })
    .map((path) => relative(ROOT, path))
    .filter((path) => path !== "features/contacts/contact-version.ts");
  const unknown = found.filter((path) => !WRITERS.includes(path) && !(path in NOT_CONTACT_WRITES));
  assert.deepEqual(unknown, [], "a module writes records and names contacts: make it use contact-version.ts or list why it writes none");
  for (const path of WRITERS) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.match(text, /from\s+"[./]*(?:[\w-]+\/)*contact-version"/u, `${path} must take the next version from contact-version.ts`);
  }
});

test("the shared functions are used where contacts are written, not only imported", () => {
  for (const path of WRITERS) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.match(text, /\b(withNextContactVersion|nextContactVersion|contactNextVersionSql|stampContactVersion)\(/u, `${path} imports but never calls the version functions`);
  }
});
