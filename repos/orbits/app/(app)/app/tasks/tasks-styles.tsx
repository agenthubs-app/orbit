export function TasksStyles() {
  return <style>{`
    .orbit-task-page { margin: 0 auto; max-width: 1180px; padding: 28px 24px 96px; }
    .orbit-task-page h1 { color: var(--ink); font-size: 28px; line-height: 1.25; margin: 10px 0 24px; }
    .orbit-tasks { color: var(--text); font-size: 14px; line-height: 1.6; min-width: 0; }
    .orbit-tasks h2 { color: var(--ink); font-size: 17px; line-height: 1.4; margin: 0 0 12px; }
    .orbit-tasks h3 { color: var(--ink); font-size: 15px; margin: 0; }
    .orbit-tasks p { margin: 8px 0; }
    .orbit-tasks .task-meta { color: var(--text-2); font-size: 13px; }
    .task-toolbar, .task-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
    .task-toolbar { justify-content: space-between; margin-bottom: 20px; }
    .task-tabs { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md, 10px); display: flex; padding: 3px; }
    [data-orbit-real-page] .orbit-tasks .btn { align-items: center; display: inline-flex; justify-content: center; min-height: 40px; padding: 8px 14px; }
    [data-orbit-real-page] .orbit-tasks .btn:disabled { cursor: not-allowed; opacity: .55; }
    [data-orbit-real-page] .orbit-tasks .task-tabs .btn { border: 0; min-width: 84px; }
    [data-orbit-real-page] .orbit-tasks .task-tabs [aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.07); }
    .orbit-tasks .task-composer { display: flex; gap: 8px; margin: 0 0 20px; }
    [data-orbit-real-page] .orbit-tasks input:not([type="checkbox"]),
    [data-orbit-real-page] .orbit-tasks textarea {
      background: var(--surface); border: 1px solid var(--border-2); border-radius: var(--r-md, 10px);
      box-sizing: border-box; color: var(--ink); font: inherit; line-height: 1.6; min-height: 44px; padding: 10px 12px; width: 100%;
    }
    [data-orbit-real-page] .orbit-tasks input::placeholder, [data-orbit-real-page] .orbit-tasks textarea::placeholder { color: var(--text-2); }
    [data-orbit-real-page] .orbit-tasks .task-composer input { flex: 1; min-width: 0; }
    [data-orbit-real-page] .orbit-tasks :is(button, a, input, textarea):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .task-search { color: var(--text-2); display: grid; font-size: 13px; gap: 6px; margin-bottom: 16px; max-width: 360px; }
    .orbit-tasks .task-rows { border-bottom: 1px solid var(--border); list-style: none; margin: 0; padding: 0; }
    .orbit-tasks .task-rows:empty { display: none; }
    .task-rows li { align-items: center; border-top: 1px solid var(--border); display: flex; gap: 12px; min-height: 72px; padding: 6px 4px; }
    [data-orbit-real-page] .orbit-tasks input[type="checkbox"] { accent-color: var(--accent); appearance: auto; cursor: pointer; flex-shrink: 0; height: 21px; margin: 0 8px; width: 21px; }
    .task-row-copy { display: grid; flex: 1; gap: 3px; min-width: 0; padding: 10px 0; text-decoration: none; }
    .task-row-title { color: var(--ink); font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
    .task-done .task-row-title { color: var(--text-2); text-decoration: line-through; }
    .task-chevron { color: var(--text-3); font-size: 22px; padding: 0 8px; }
    .orbit-tasks .task-empty { background: var(--surface-2); border-radius: var(--r-md, 10px); color: var(--text-2); padding: 24px 16px; }
    .orbit-tasks .task-error { color: var(--rose, #b03b40); overflow-wrap: anywhere; }
    .orbit-tasks .task-success { color: var(--accent); }
    .task-read-error { border-left: 2px solid var(--rose, #b03b40); margin: 12px 0; padding: 0 12px; }
    .task-suggestions { margin-top: 28px; }
    .task-suggestions article { border-top: 1px solid var(--border); padding: 16px 0; }
    .task-detail-grid { align-items: start; display: grid; gap: 40px; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); }
    .task-editor { display: grid; gap: 20px; }
    .task-editor label { color: var(--text-2); display: grid; font-size: 13px; gap: 6px; }
    [data-orbit-real-page] .orbit-tasks .task-title-input { color: var(--ink); font-size: 20px; font-weight: 600; }
    [data-orbit-real-page] .orbit-tasks textarea { resize: vertical; }
    .task-detail-actions { border-top: 1px solid var(--border); margin-top: 28px; padding-top: 20px; }
    [data-orbit-real-page] .orbit-tasks .task-danger { color: var(--rose, #b03b40); }
    .task-delete-confirm { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--r-md, 10px); margin-top: 16px; padding: 16px; }
    .task-details { border-left: 1px solid var(--border); padding-left: 24px; }
    .task-details section { border-top: 1px solid var(--border); margin-top: 24px; padding-top: 24px; }
    .task-details dl { display: grid; gap: 6px; margin: 0; }
    .task-details dt { color: var(--text-2); font-size: 13px; }
    .task-details dd { color: var(--ink); margin: 0 0 12px; }
    .task-history, .task-reminders { list-style: none; margin: 0; padding: 0; }
    .task-history li { display: grid; gap: 2px; margin: 12px 0; }
    .task-history time { color: var(--text-2); font-size: 12px; }
    .task-reminders li { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: space-between; margin: 8px 0; }
    .orbit-tasks.task-summary { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg, 14px); margin-top: 24px; padding: 20px; }
    .task-summary .task-toolbar { margin-bottom: 12px; }
    .task-summary h2 { margin: 0; }
    .task-summary .task-composer { margin-bottom: 12px; }
    .task-summary .task-count { color: var(--text-2); font-size: 13px; font-weight: 400; margin-left: 8px; }
    @media (max-width: 760px) {
      .orbit-task-page { padding: 22px 16px 96px; }
      .task-detail-grid { gap: 28px; grid-template-columns: minmax(0, 1fr); }
      .task-details { border-left: 0; border-top: 1px solid var(--border); padding: 24px 0 0; }
      [data-orbit-real-page] .orbit-tasks .btn { min-height: 44px; }
      .task-search { max-width: none; }
      .orbit-tasks.task-summary { padding: 16px; }
    }
  `}</style>;
}
