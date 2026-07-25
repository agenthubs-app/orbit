import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppAllActionsRouteViewModel } from "../../app/(app)/app/contacts/all-actions/compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";
import { OrbitRealAllActions } from "../../app/(app)/app/contacts/all-actions/orbit-real-all-actions";

test("the entry query opens the matching audit record without changing its filter", async () => {
  const baseline = await loadAppAllActionsRouteViewModel({});
  const draft = baseline.entries.find((entry) =>
    entry.operations.some(
      (operation) => operation.operationType === "save_message_draft",
    ),
  );
  assert.ok(draft);

  const model = await loadAppAllActionsRouteViewModel({
    entry: draft.entryId,
  });
  assert.equal(model.selectedEntryId, draft.entryId);
  assert.equal(model.activeFilter, "all");

  const html = renderToStaticMarkup(<OrbitRealAllActions viewModel={model} />);
  assert.match(html, /data-orbit-all-actions-audit-detail/);
  assert.match(html, new RegExp(`Action：${draft.entryId}`));
  assert.match(html, /Operation：/);
  assert.match(html, /Executor：/);
  assert.match(html, /Idempotency：/);
  assert.match(html, /Payload hash：/);
});

test("an expanded message draft can be copied or opened in communication without a send action", async () => {
  const baseline = await loadAppAllActionsRouteViewModel({});
  const draft = baseline.entries.find((entry) =>
    entry.operations.some(
      (operation) => operation.operationType === "save_message_draft",
    ),
  );
  assert.ok(draft);

  const model = await loadAppAllActionsRouteViewModel({
    entry: draft.entryId,
  });
  const html = renderToStaticMarkup(<OrbitRealAllActions viewModel={model} />);

  assert.match(html, /复制草稿/);
  assert.match(html, /href="\/app\/chat"/);
  assert.match(html, /只复制或继续编辑，不会自动发送/);
  assert.doesNotMatch(html, />发送</);
});

test("expanded audit details stay inside their mobile grid column", async () => {
  const baseline = await loadAppAllActionsRouteViewModel({});
  const entry = baseline.entries[0];
  assert.ok(entry);

  const model = await loadAppAllActionsRouteViewModel({
    entry: entry.entryId,
  });
  const html = renderToStaticMarkup(<OrbitRealAllActions viewModel={model} />);

  assert.match(
    html,
    /\.orbit-all-actions-entry-detail\s*\{[^}]*box-sizing:\s*border-box;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*min-width:\s*0;[^}]*width:\s*100%;/s,
  );
  assert.match(
    html,
    /\.orbit-all-actions-entry-detail \.chip\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
  );
});
