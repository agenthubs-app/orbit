import { useEffect, useRef, useState } from "react";

import { checkAgentReferences } from "../api/agent-v1-client";
import type { OrbitApiClient } from "../api/client";
import { answerRecordCheckInput, answerRecordKey, answerRecordsIn } from "../api/compute/agent-answer-blocks";
import type { AgentResultDocument } from "../api/contract/agent-v1";

/** A document older than this was not verified a moment ago: its cards are checked once (still there, still yours). */
const GONE_CHECK_AFTER_MS = 120_000;

/**
 * agent-design AG19-5: the records on the cards of older answers that are gone or cannot be seen any more ("kind:id").
 * One request per batch of records not checked yet (the @ picker's check); an answer delivered just now was verified by
 * the server and is not asked about. Offline, or when the check fails, the cards stay as they are.
 */
export function useAgentAnswerGone(client: OrbitApiClient, documents: ReadonlyMap<string, AgentResultDocument>, enabled: boolean): ReadonlySet<string> {
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const pending = answerRecordsIn([...documents.values()].filter((item) => now - Date.parse(item.updatedAt) > GONE_CHECK_AFTER_MS).flatMap((item) => item.answer?.blocks ?? [])).filter((record) => !asked.current.has(answerRecordKey(record)));
    const batch = answerRecordCheckInput(pending);
    if (!batch.length) return;
    for (const record of batch) asked.current.add(`${record.type}:${record.id}`);
    let cancelled = false;
    void checkAgentReferences(client, batch).then((closed) => {
      if (!cancelled && closed.size) setGone((previous) => new Set([...previous, ...closed]));
    });
    return () => { cancelled = true; };
  }, [client, documents, enabled]);
  return gone;
}
