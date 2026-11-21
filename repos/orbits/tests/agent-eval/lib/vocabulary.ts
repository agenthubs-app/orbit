/**
 * The words a case may use (eval/README.md §3.1, §3.2 and §3.4).
 *
 * A case may only use a word listed here. Adding a word: first add it to
 * README §3.4 (and the case file's `proposed_steps` / `proposed_checks`), then here,
 * then implement it — steps in `step-executors.ts`, checks in `hard-checks.ts`.
 * `vocabulary.test.ts` fails when this file and the README tables drift apart.
 */

/** §3.1 */
export const BASE_STEP_WORDS = [
  "user",
  "select",
  "click",
  "card_edit",
  "review",
  "regenerate",
  "advance_clock",
  "external_change",
  "local_pending_edit",
  "revoke",
  "fault",
  "concurrent",
  "resend",
  "disconnect",
  "reconnect",
  "stop",
  "new_conversation",
  "switch_account",
  "setting",
  "scheduler_tick",
  "mcp",
  "open_link",
] as const;

/** §3.4 steps that are new top-level step words. */
export const EXTRA_STEP_WORDS = [
  "egress_probe",
  "legacy_update",
  "mcp_paginate",
  "resume_conversation",
  "rollback",
  "sync",
  "use_fake_agent",
] as const;

/** Keys allowed next to a step word on the same step (§3.1 `client`, `refs`; §3.4 `while_running`). */
export const STEP_MODIFIERS = ["client", "refs", "while_running"] as const;

export const CLIENTS = ["web", "app", "app_old"] as const;

export const FAULT_KINDS = [
  "fail_once",
  "fail_always",
  "unknown_outcome",
  "timeout",
  // §3.4
  "low_confidence",
  "mistag_write",
  "phantom_candidate",
  "malformed_once",
  "malformed_always",
  "inject_approval_flag",
] as const;

/** §3.2 */
export const BASE_CHECK_WORDS = [
  "no_write_before_click",
  "no_business_writes",
  "writes_exact",
  "cards",
  "card_ops",
  "card_state",
  "card_revision",
  "decisions",
  "decision_result",
  "receipts",
  "duplicate_effects",
  "no_private_reads",
  "private_reads_within",
  "no_cross_account",
  "cites_within_reads",
  "no_web_calls",
  "web_calls",
  "web_calls_max",
  "outbound_traceable",
  "outbound_blocked",
  "fetch_urls_within",
  "model_calls_max",
  "judgment_calls_max",
  "judgment_calls",
  "judgment_candidates_max",
  "clarifications",
  "clarify_max_per_part",
  "offered_options",
  "parts",
  "request_status",
  "requests",
  "order",
  "memory_state",
  "memory_recalled",
  "inbox",
  "push",
  "rule_state",
  "mcp_result_excludes",
  "http_status",
  "reads_include",
  "pages_read",
  "context_messages_max",
  "answer_uses",
] as const;

/** §3.4 checks. */
export const EXTRA_CHECK_WORDS = [
  "answer_blocks",
  "answer_blocks_in_sync",
  "answer_cards",
  "answer_excludes",
  "answer_text_plain",
  "card_effects",
  "cites",
  "client_view",
  "client_view_matches_result",
  "costs_complete",
  "egress",
  "event_sources",
  "expect_hard_fail",
  "expect_judge_verdicts",
  "field_history",
  "first_layer_context",
  "functions_called",
  "gaps",
  "import_rows",
  "judgment_question",
  "listed",
  "mcp_collected",
  "mcp_result_has",
  "mcp_tool_list",
  "model_input_excludes",
  "no_auto_extraction",
  "part_plan",
  "parts_split",
  "push_delivery",
  "push_excludes",
  "recent_interaction",
  "request_states",
  "routes_absent",
  "rule_runs",
  "same_card_on",
  "settings_memory_list",
  "shadow_report",
  "summary_separates_simulated",
  "trace_complete",
] as const;

export const STEP_WORDS: ReadonlySet<string> = new Set([...BASE_STEP_WORDS, ...EXTRA_STEP_WORDS]);
export const CHECK_WORDS: ReadonlySet<string> = new Set([...BASE_CHECK_WORDS, ...EXTRA_CHECK_WORDS]);

/** Top-level case fields (README §3 and the two optional fields `account`, `conversation`). */
export const REQUIRED_CASE_FIELDS = [
  "id",
  "title",
  "sprint",
  "split",
  "invariant",
  "requirement",
  "design",
  "locale",
  "world",
  "steps",
  "hard",
  "rubric",
] as const;
// `category`: the sealed set's grouping (1–6); not read by the runner.
export const OPTIONAL_CASE_FIELDS = ["notes", "patches", "clock", "settings", "account", "conversation", "gate", "interference", "category"] as const;
export const SPLITS = ["dev", "val", "sealed"] as const;
export const LOCALES = ["zh", "ja", "en"] as const;
export const ACCOUNTS = ["small", "regular", "large"] as const;
export const WORLD_FOR_ACCOUNT: Record<(typeof ACCOUNTS)[number], string> = {
  small: "base-v1",
  regular: "regular-v1",
  large: "large-v1",
};
export const DEFAULT_CLOCK = "2026-11-15T10:00:00+09:00";
/** README §3: web on, memory use on, learning off, judgment on. */
export const DEFAULT_SETTINGS = { web: "on", memory_use: "on", memory_learn: "off", judgment: "on" } as const;
/** Settings keys a case may override (defaults plus §3.4 `shadow` and the `web_replay` selector). */
export const SETTING_KEYS = ["web", "memory_use", "memory_learn", "judgment", "shadow", "web_replay"] as const;
