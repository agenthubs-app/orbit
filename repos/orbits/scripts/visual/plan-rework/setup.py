"""计划页门禁造状态（只打本机 mock 服务器）。用法见 README：setup.py <bg|q|p|d|r1|r3|03|one|05|06a|used|achieve>"""
import json, os, sys, urllib.error, urllib.request, uuid

ORIGIN = os.environ.get("PLAN_ORIGIN", "http://localhost:3203")
STORAGE = os.environ.get("PLAN_STORAGE", os.path.expanduser("~/orbit-sprint-evidence/redesign/.auth/qa@orbit.test.json"))
if not (ORIGIN.startswith("http://localhost:") or ORIGIN.startswith("http://127.0.0.1:")):
    sys.exit("PLAN_ORIGIN must be a local origin")
COOKIE = "; ".join(c["name"] + "=" + c["value"] for c in json.load(open(STORAGE))["cookies"] if c["domain"].lstrip(".") in ("localhost", "127.0.0.1"))
PLAN = "demo-plan-series-a"


def call(method, path, body=None):
    req = urllib.request.Request(ORIGIN + "/api/agent/plans" + path, method=method, data=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
                                 headers={"cookie": COOKIE, "content-type": "application/json", "x-orbit-lang": "ja"})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=240))
    except urllib.error.HTTPError as error:
        res = json.load(error)
    if not res.get("success"):
        sys.exit(f"ERR {path} {json.dumps(res, ensure_ascii=False)[:300]}")
    return res["data"]


def key():
    return "gate:plan:" + uuid.uuid4().hex


def intake(target):
    it = call("POST", "/intakes", {"goalKind": "fundraising", "goalText": "シリーズAで3億円を調達する", "idempotencyKey": key(), "source": "task"})
    base = "/intakes/" + it["intakeId"]
    if target != "bg":
        me = it["background"]["me"]["value"]
        it = call("PATCH", base, {"block": "me", "me": {"stance": me["stance"], "wants": me["wants"]}, "expectedUpdatedAt": it["updatedAt"], "idempotencyKey": key()})
        team = it["background"]["team"]["value"]
        members = [{"capabilities": m["capabilities"], "memberId": m["memberId"], "otherCapabilities": m["otherCapabilities"], "relation": m["relation"]} for m in team["members"]]
        it = call("PATCH", base, {"block": "team", "team": {"mode": team["mode"], "members": members}, "expectedUpdatedAt": it["updatedAt"], "idempotencyKey": key()})
        it = call("PATCH", base, {"block": "purpose", "purpose": {"selectedLevel": it["background"]["purpose"]["value"]["selectedLevel"]}, "expectedUpdatedAt": it["updatedAt"], "idempotencyKey": key()})
        it = call("POST", base + "/questions", {"idempotencyKey": key()})
    if target in ("p", "d", "r1", "r3"):
        it = call("POST", base + "/answers", {"idempotencyKey": key(), "answers": [{"questionId": q["id"], "text": None, "values": []} for q in it["questions"]]})
    if target in ("d", "r1", "r3"):
        draft = call("POST", base + "/draft", {"idempotencyKey": key()})
        says = ["VC との面談を先に増やしたいです。CFO の相談は後回しで大丈夫です。", "エンジェル投資家の優先度を上げてください", "やっぱり CVC も Step に入れたほうがいいですか？"]
        for text in says[: {"d": 0, "r1": 1, "r3": 3}[target]]:
            draft = call("POST", "/drafts/" + draft["draftId"] + "/fix", {"idempotencyKey": key(), "text": text})
        print(draft["draftId"], file=sys.stderr)
    print(it["intakeId"])


def review(target):
    start = lambda: call("POST", f"/v2/{PLAN}/reviews", {"idempotencyKey": key()})["draft"]["draftId"]
    fix = lambda draft, text, premise=(): call("POST", f"/drafts/{draft}/review/fix", {"idempotencyKey": key(), "premise": list(premise), "text": text})
    confirm = lambda draft: call("POST", f"/drafts/{draft}/confirm", {"idempotencyKey": key()})
    if target == "03":
        fix(start(), "ARR は年内に 1億円が見えました。リード候補は青葉ベンチャーズ（高橋さん）。条件を比べたいので、事業会社の CVC にも並行で当たりたいです。",
            [{"key": "F1", "value": "ARR 1億円の見込み（年内）· 前年比 2.4倍"}, {"key": "F2", "value": "エンジェル 2名 · リード候補 1社（青葉ベンチャーズ）"}])
    elif target in ("one", "05", "06a", "used"):
        for _ in range({"one": 1, "05": 2}.get(target, 3)):
            draft = start(); fix(draft, "CVC にも並行で当たりたい"); confirm(draft)
        if target == "05":
            fix(start(), "リードが決まりそうなので、そのまま VC の目標人数を 3 → 1人に減らしたい")
        elif target == "06a":
            start()
    elif target == "achieve":
        revision = call("GET", f"/v2/{PLAN}")["revision"]
        print(call("POST", f"/v2/{PLAN}/achieve", {"idempotencyKey": key(), "expectedRevision": revision}))
    print(call("GET", "/v2/quota"))


target = sys.argv[1] if len(sys.argv) > 1 else ""
if target in ("bg", "q", "p", "d", "r1", "r3"):
    intake(target)
elif target in ("03", "one", "05", "06a", "used", "achieve"):
    review(target)
else:
    sys.exit(__doc__)
