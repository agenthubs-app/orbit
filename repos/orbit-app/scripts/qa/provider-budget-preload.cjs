"use strict";

// Explicit QA launch only. A missing/corrupt ledger stops startup, never resets it.
const { readLedger, createBudgetFetch, installBudgetObservation } = require("./provider-budget.cjs");
const file = process.env.ORBIT_QA_BUDGET_LEDGER;
readLedger(file);
const log = event => process.stdout.write(JSON.stringify({ orbitQa: { ...event, pid: process.pid } }) + "\n");
globalThis.fetch = createBudgetFetch({ file, fetchImplementation: globalThis.fetch,
  supabaseOrigin: process.env.ORBIT_QA_SUPABASE_ORIGIN, log });
installBudgetObservation(log);
log({ event: "ready" });
