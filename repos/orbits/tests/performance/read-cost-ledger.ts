import type {
  PostgresReadMetric,
  PostgresReadMetricsObserver,
} from "../../shared/storage/postgres-read-metrics";

/** Cost of one operation chain: SQL read statements, rows returned, serialized row bytes. */
export interface ReadCost {
  queries: number;
  rows: number;
  bytes: number;
}

export type ReadCostBook = Record<string, ReadCost>;

export const READ_COST_DIMENSIONS = ["queries", "rows", "bytes"] as const;

export class ReadCostBudgetError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`Read cost exceeds budget:\n${violations.join("\n")}`);
    this.name = "ReadCostBudgetError";
  }
}

export interface ReadCostLedger {
  /** Attach to the Postgres read metrics of the clients under measurement. */
  observer: PostgresReadMetricsObserver;
  /** Runs one operation chain and returns its result together with its isolated cost. */
  measure<T>(chain: string, run: () => Promise<T>): Promise<{ result: T; cost: ReadCost }>;
  /** Latest cost recorded for each chain. */
  book(): ReadCostBook;
}

function zero(): ReadCost {
  return { queries: 0, rows: 0, bytes: 0 };
}

export function createReadCostLedger(): ReadCostLedger {
  const book: ReadCostBook = {};
  let active: { chain: string; cost: ReadCost } | null = null;

  const observer: PostgresReadMetricsObserver = (metric: PostgresReadMetric) => {
    if (!active) return;
    active.cost.queries += metric.queryCount;
    active.cost.rows += metric.returnedRows;
    active.cost.bytes += metric.approximateSerializedRowBytes;
  };

  return {
    observer,
    async measure(chain, run) {
      if (active) throw new Error(`Chain "${active.chain}" is still being measured.`);
      active = { chain, cost: zero() };
      try {
        const result = await run();
        const cost = { ...active.cost };
        book[chain] = cost;
        return { result, cost };
      } finally {
        active = null;
      }
    },
    book: () => ({ ...book }),
  };
}

/**
 * Every measured chain must have a budget entry, and no dimension may exceed it.
 * Missing budgets are violations so a new chain cannot slip in unmeasured.
 */
export function assertWithinBudget(actual: ReadCostBook, budget: ReadCostBook): void {
  const violations: string[] = [];
  for (const [chain, cost] of Object.entries(actual)) {
    const limit = budget[chain];
    if (!limit) {
      violations.push(`${chain}: no budget recorded (actual ${JSON.stringify(cost)})`);
      continue;
    }
    for (const dimension of READ_COST_DIMENSIONS) {
      if (cost[dimension] > limit[dimension]) {
        violations.push(`${chain}.${dimension}: ${cost[dimension]} > budget ${limit[dimension]}`);
      }
    }
  }
  if (violations.length > 0) throw new ReadCostBudgetError(violations);
}
