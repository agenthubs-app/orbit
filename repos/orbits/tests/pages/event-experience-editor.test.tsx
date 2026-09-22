import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventExperienceEditor } from "../../app/(app)/app/events/[id]/operations/experience/event-experience-editor";

// 特征化渲染测试（运营台 任务 1）：锁定报名设置编辑器的 加载 / saveDraft PUT 体
// （含 expectedRevision）/ publish POST / CONFLICT → 重读 / 预览零写入 POST 行为，
// 使逻辑搬进 use-experience-editor 时零变化可证。

const EVENT_ID = "event:experience";
const BASE = `/api/events/${encodeURIComponent(EVENT_ID)}/experience`;

function question(intent: "target_attendees" | "value_offered", prompt: string) {
  return {
    id: intent,
    intent,
    options: ["A", "B"],
    participantProfileField: intent === "target_attendees" ? "targetAttendees" : "valueOffered",
    prompt,
    required: true,
  };
}

function configuration(introduction: string | null = "Welcome") {
  return {
    accentColor: "#123456",
    coverAssetId: null,
    introduction,
    questionSet: {
      questions: [question("target_attendees", "Who?"), question("value_offered", "What?")],
      track: "v1",
    },
    templateId: "default",
  };
}

function version(versionNumber: number, hash = `hash-${versionNumber}`) {
  return {
    configuration: configuration(),
    createdAt: "2026-09-20T00:00:00.000Z",
    createdByActorId: "user:organizer",
    eventId: EVENT_ID,
    hash,
    version: versionNumber,
  };
}

function snapshot(revision: number, options: { draft?: boolean; published?: boolean } = {}) {
  return {
    draft: options.draft === false ? null : version(revision),
    head: {
      draftVersion: options.draft === false ? null : revision,
      eventId: EVENT_ID,
      frozenAt: null,
      publishedAt: options.published ? "2026-09-21T00:00:00.000Z" : null,
      publishedVersion: options.published ? 1 : null,
      revision,
    },
    published: options.published ? version(1, "published-hash") : null,
  };
}

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

function install(respond: (call: Observed) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const observed: Observed[] = [];
  globalThis.fetch = (async (url, init) => {
    const call = {
      body: typeof init?.body === "string" ? init.body : null,
      method: init?.method ?? "GET",
      url: String(url),
    };
    observed.push(call);
    return respond(call);
  }) as typeof fetch;
  return {
    observed,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function text(renderer: ReactTestRenderer): string {
  const walk = (node: unknown): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(walk).join("");
    const tree = node as { children?: unknown[]; type?: string };
    if (tree.type === "style") return "";
    return (tree.children ?? []).map(walk).join("");
  };
  return walk(renderer.toJSON());
}

function buttonNamed(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    (node) => node.type === "button" && node.children.join("").trim() === label,
  );
}

async function mount(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<EventExperienceEditor eventId={EVENT_ID} />);
    await flush();
  });
  return renderer;
}

async function unmount(renderer: ReactTestRenderer | undefined): Promise<void> {
  if (!renderer) return;
  await act(async () => {
    renderer.unmount();
  });
}

test("editor loads the snapshot and seeds the form from the draft configuration", async () => {
  const harness = install(() => Response.json({ data: snapshot(3, { published: true }), success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [["GET", BASE]]);
    const body = text(renderer);
    assert.match(body, /草稿 revision 3/u);
    assert.match(body, /已发布 v1/u);
    assert.match(body, /2 \/ 4 题/u);
    const textarea = renderer.root.findAllByType("textarea")[0];
    assert.equal(textarea.props.value, "Welcome");
    assert.doesNotMatch(body, /正在读取活动体验/u);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("a NOT_FOUND snapshot falls back to the default v1 two-question configuration without an error", async () => {
  const harness = install(() =>
    Response.json({ error: { code: "NOT_FOUND", message: "no experience" }, success: false }, { status: 404 }),
  );
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    const body = text(renderer);
    assert.match(body, /草稿 revision 0/u);
    assert.match(body, /未发布/u);
    assert.match(body, /2 \/ 4 题/u);
    assert.equal(buttonNamed(renderer, "发布题集").props.disabled, true, "no draft → publish disabled");
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("save draft PUTs the edited configuration with the current expectedRevision and re-seeds from the response", async () => {
  let put: Observed | null = null;
  const harness = install((call) => {
    if (call.method === "PUT") {
      put = call;
      return Response.json({ data: snapshot(4), success: true });
    }
    return Response.json({ data: snapshot(3), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    const textarea = renderer.root.findAllByType("textarea")[0];
    await act(async () => {
      textarea.props.onChange({ target: { value: "Edited intro" } });
      await flush();
    });
    await act(async () => {
      buttonNamed(renderer!, "保存草稿").props.onClick();
      await flush();
    });
    assert.ok(put);
    const observedPut = put as Observed;
    assert.equal(observedPut.url, BASE);
    const payload = JSON.parse(observedPut.body ?? "{}") as { configuration: { introduction: string }; expectedRevision: number };
    assert.equal(payload.expectedRevision, 3);
    assert.equal(payload.configuration.introduction, "Edited intro");
    assert.match(text(renderer), /草稿已保存/u);
    assert.match(text(renderer), /草稿 revision 4/u);
    assert.deepEqual(harness.observed.map((call) => call.method), ["GET", "PUT"]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("publish POSTs /publish with expectedRevision; CONFLICT shows the conflict copy, then the reload replaces it", async () => {
  // 既有行为：CONFLICT 文案先出现，随后 load() 成功会 setError(null) 把它清掉。
  let gets = 0;
  let releaseReload!: () => void;
  const reloadGate = new Promise<void>((resolve) => { releaseReload = resolve; });
  const harness = install(async (call) => {
    if (call.method === "POST") {
      assert.equal(call.url, `${BASE}/publish`);
      assert.deepEqual(JSON.parse(call.body ?? "{}"), { expectedRevision: 3 });
      return Response.json({ error: { code: "CONFLICT", message: "stale" }, success: false }, { status: 409 });
    }
    gets += 1;
    if (gets > 1) await reloadGate;
    return Response.json({ data: snapshot(gets === 1 ? 3 : 5), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await act(async () => {
      buttonNamed(renderer!, "发布题集").props.onClick();
      await flush();
    });
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.match(alert.children.join(""), /发布冲突、缺少草稿，或活动已冻结/u);
    assert.equal(gets, 2, "CONFLICT reloads the snapshot");
    await act(async () => {
      releaseReload();
      await flush();
    });
    assert.match(text(renderer), /草稿 revision 5/u);
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0, "successful reload clears the error");
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("save draft CONFLICT shows the save conflict copy and reloads", async () => {
  let gets = 0;
  let releaseReload!: () => void;
  const reloadGate = new Promise<void>((resolve) => { releaseReload = resolve; });
  const harness = install(async (call) => {
    if (call.method === "PUT") {
      return Response.json({ error: { code: "CONFLICT", message: "stale" }, success: false }, { status: 409 });
    }
    gets += 1;
    if (gets > 1) await reloadGate;
    return Response.json({ data: snapshot(3), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await act(async () => {
      buttonNamed(renderer!, "保存草稿").props.onClick();
      await flush();
    });
    assert.match(text(renderer), /保存冲突或活动已冻结。请重新读取最新版本后再操作。/u);
    assert.equal(gets, 2);
    await act(async () => {
      releaseReload();
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("preview POSTs the current configuration to /preview and renders the returned hash without any other write", async () => {
  const harness = install((call) => {
    if (call.method === "POST") {
      assert.equal(call.url, `${BASE}/preview`);
      const payload = JSON.parse(call.body ?? "{}") as { configuration: { introduction: string } };
      assert.equal(payload.configuration.introduction, "Welcome");
      return Response.json({ data: { version: { ...version(9, "preview-hash"), configuration: configuration("Preview intro") } }, success: true });
    }
    return Response.json({ data: snapshot(3), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await act(async () => {
      buttonNamed(renderer!, "预览（零写入）").props.onClick();
      await flush();
    });
    const body = text(renderer);
    assert.match(body, /preview-hash/u);
    assert.match(body, /Preview intro/u);
    assert.match(body, /预览已生成/u);
    assert.deepEqual(harness.observed.map((call) => call.method), ["GET", "POST"]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});
