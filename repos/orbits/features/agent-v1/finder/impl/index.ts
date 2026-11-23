// @ts-nocheck -- finder/impl/index.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/index.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * Record finder (rules only, approach B): code gathers candidates, the model only picks among ids, code decides.
 * See plan.json for the structure and every tunable number.
 */
import type { Finders, Lookup } from "../types";
import { cleanClue } from "./clean";
import { decide } from "./decide";
import { findContacts, findEvents, findSchedule, findTodosMemos } from "./finders";
import { lookup } from "./lookup";
import { resolvePerson } from "./person";
import { resolveTime } from "./time";

const impl: Finders & Lookup = {
  resolveTime,
  resolvePerson,
  cleanClue,
  findTodosMemos,
  findSchedule,
  findEvents,
  findContacts,
  decide,
  lookup,
};

export default impl;
