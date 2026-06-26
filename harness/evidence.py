from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path, PurePosixPath
from typing import Any, Callable
from html import unescape
from urllib.parse import urljoin
from urllib.parse import unquote
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from harness.models.state import SprintContract

BrowserCollector = Callable[[str, dict[str, Path], str], dict[str, Any]]
ALLOWED_COMMAND_EXECUTABLES = {"npm", "pnpm", "yarn", "bun"}
ALLOWED_API_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
SAFE_PACKAGE_SCRIPT = re.compile(r"^[A-Za-z0-9:_-]+$")
GLOB_CHARS = set("*?[")
SOURCE_GLOB_CHARS = set("*?")
ALLOWED_PACKAGE_SCRIPTS = {"build", "check", "format:check", "lint", "test", "typecheck"}

BROWSER_VIEWPORTS = [
    {"name": "mobile", "width": 375, "height": 812},
    {"name": "tablet", "width": 768, "height": 1024},
    {"name": "desktop", "width": 1440, "height": 900},
]

BROWSER_SNAPSHOT_SCRIPT = """() => ({
    title: document.title,
    text: document.body ? document.body.innerText.slice(0, 4000) : "",
    buttons: Array.from(document.querySelectorAll("button")).map((el) => el.innerText.trim()).filter(Boolean).slice(0, 50),
    inputs: Array.from(document.querySelectorAll("input, textarea, select")).map((el) => ({name: el.getAttribute("name") || "", type: el.getAttribute("type") || el.tagName.toLowerCase()})).slice(0, 50),
    links: Array.from(document.querySelectorAll("a")).map((el) => ({href: el.getAttribute("href") || "", text: el.innerText.trim()})).slice(0, 50),
    headings: Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((el) => ({level: Number(el.tagName.slice(1)), text: el.innerText.trim()})).filter((heading) => heading.text).slice(0, 50),
    viewport: {width: window.innerWidth, height: window.innerHeight},
    overflow: {
        horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scroll_width: document.documentElement.scrollWidth,
        client_width: document.documentElement.clientWidth
    }
})"""


def _clean_html_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def summarize_html(body: str) -> dict[str, Any]:
    title_match = re.search(r"<title[^>]*>(.*?)</title>", body, re.IGNORECASE | re.DOTALL)
    buttons = [
        _clean_html_text(match)
        for match in re.findall(r"<button[^>]*>(.*?)</button>", body, re.IGNORECASE | re.DOTALL)
    ]
    input_names = [
        unescape(match)
        for match in re.findall(r"<input[^>]*\bname=[\"']?([^\"'\s>]+)", body, re.IGNORECASE)
    ]
    links = [
        {"href": href, "text": _clean_html_text(text)}
        for href, text in re.findall(r"<a[^>]*\bhref=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", body, re.IGNORECASE | re.DOTALL)
    ]
    return {
        "title": _clean_html_text(title_match.group(1)) if title_match else "",
        "forms_count": len(re.findall(r"<form\b", body, re.IGNORECASE)),
        "buttons": [button for button in buttons if button],
        "input_names": sorted(dict.fromkeys(input_names)),
        "links": links[:25],
        "text_excerpt": _clean_html_text(body)[:1200],
    }


def run_recorded(cmd: list[str], cwd: Path, out_dir: Path, name: str, timeout: int = 900) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    started = time.time()
    stdout = ""
    stderr = ""
    record = {
        "cmd": cmd,
        "cwd": str(cwd),
        "returncode": None,
        "seconds": 0,
        "stdout_path": str(out_dir / f"{name}.stdout.txt"),
        "stderr_path": str(out_dir / f"{name}.stderr.txt"),
    }
    try:
        result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, timeout=timeout)
        stdout = result.stdout
        stderr = result.stderr
        record["returncode"] = result.returncode
        record["timed_out"] = False
        record["missing_executable"] = False
    except subprocess.TimeoutExpired as exc:
        stdout = _decode_command_output(getattr(exc, "stdout", None) or getattr(exc, "output", None))
        stderr = _decode_command_output(getattr(exc, "stderr", None))
        record["timed_out"] = True
        record["missing_executable"] = False
        record["timeout_seconds"] = timeout
        record["error"] = f"Command timed out after {timeout}s."
    except FileNotFoundError as exc:
        stderr = str(exc)
        record["returncode"] = 127
        record["timed_out"] = False
        record["missing_executable"] = True
        record["error"] = str(exc)
    record["seconds"] = round(time.time() - started, 2)
    Path(record["stdout_path"]).write_text(stdout)
    Path(record["stderr_path"]).write_text(stderr)
    (out_dir / f"{name}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return record


def _decode_command_output(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _safe_route_name(route_key: str) -> str:
    cleaned = route_key.strip("/") or "root"
    return "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in cleaned)


def _path_has_glob(value: str) -> bool:
    return any(char in value for char in GLOB_CHARS)


def _source_path_has_glob(value: str) -> bool:
    return any(char in value for char in SOURCE_GLOB_CHARS)


def _route_template_rejection_reason(value: str, decoded_path: str) -> str | None:
    parts = PurePosixPath(decoded_path).parts
    if any(part.startswith(":") or "[" in part or "]" in part for part in parts) or _path_has_glob(decoded_path):
        return f"Evidence path must be concrete, not a route template: {value}."
    return None


def _resolve_app_source_file(app_dir: Path, source: Any) -> tuple[Path | None, Path | None, str | None]:
    if not isinstance(source, str) or not source.strip():
        return None, None, "Source file evidence path must be a non-empty relative string."
    relative = Path(source)
    if relative.is_absolute() or any(part == ".." for part in relative.parts):
        return None, None, "Source file evidence path is outside app root."
    if "\\" in source:
        return None, None, "Source file evidence path must not contain traversal segments."
    if relative.parts and relative.parts[0] == "repos":
        return None, None, "Source file evidence path must be app-relative to app root, not include repo root prefix."
    if _source_path_has_glob(source):
        return None, None, "Source file evidence path must be concrete, not a glob."
    app_root = app_dir.resolve()
    candidate = (app_dir / relative).resolve()
    if not candidate.is_relative_to(app_root):
        return None, None, "Source file evidence path is outside app root."
    return candidate, relative, None


def _command_rejection_reason(cmd: Any) -> str | None:
    if not isinstance(cmd, list) or not cmd or not all(isinstance(part, str) and part for part in cmd):
        return "Invalid command shape; expected non-empty list[str]."
    executable = Path(cmd[0])
    if executable.is_absolute() or len(executable.parts) > 1:
        return f"Command executable is not allowed: {cmd[0]}."
    if cmd[0] not in ALLOWED_COMMAND_EXECUTABLES:
        return f"Command executable is not allowed: {cmd[0]}."
    if len(cmd) == 2 and cmd[1] == "test":
        return None
    if len(cmd) == 3 and cmd[1] == "run" and SAFE_PACKAGE_SCRIPT.fullmatch(cmd[2]) and cmd[2] in ALLOWED_PACKAGE_SCRIPTS:
        return None
    return f"Command must be a one-shot package-manager verification command: {cmd!r}."


def _app_relative_rejection_reason(path: Any) -> str | None:
    if not isinstance(path, str) or not path.strip():
        return "Evidence path must be a non-empty app-relative string."
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc:
        return f"Evidence path must be app-relative, not external: {path}."
    if not path.startswith("/"):
        return f"Evidence path must start with `/`: {path}."
    decoded_path = unquote(parsed.path)
    if "\\" in decoded_path or any(part == ".." for part in PurePosixPath(decoded_path).parts):
        return f"Evidence path must not contain traversal segments: {path}."
    template_reason = _route_template_rejection_reason(path, decoded_path)
    if template_reason:
        return template_reason
    return None


def _expected_status_rejection_reason(value: Any) -> str | None:
    if isinstance(value, bool):
        return f"API expected status must be an integer HTTP status: {value!r}."
    if isinstance(value, int):
        status = value
    elif isinstance(value, str) and value.strip().isdigit():
        status = int(value)
    else:
        return f"API expected status must be an integer HTTP status: {value!r}."
    if status < 100 or status > 599:
        return f"API expected status must be between 100 and 599: {value!r}."
    return None


def _api_probe_rejection_reason(probe: dict[str, Any]) -> str | None:
    method = str(probe.get("method", "GET")).upper()
    if method not in ALLOWED_API_METHODS:
        return f"API method is not allowed: {method}."
    path_reason = _app_relative_rejection_reason(probe.get("path", "/"))
    if path_reason:
        return path_reason
    status_reason = _expected_status_rejection_reason(probe.get("expectStatus", probe.get("expected_status", 200)))
    if status_reason:
        return status_reason
    if "body" in probe:
        try:
            json.dumps(probe["body"])
        except (TypeError, ValueError) as exc:
            return f"API body must be JSON serializable: {type(exc).__name__}: {exc}."
    return None


def _write_route_artifact(paths: dict[str, Path], bucket: str, route_key: str, suffix: str, record: dict[str, Any]) -> dict[str, Any]:
    paths[bucket].mkdir(parents=True, exist_ok=True)
    artifact_path = paths[bucket] / f"{_safe_route_name(route_key)}-{suffix}.json"
    record["artifact_path"] = str(artifact_path)
    artifact_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return record


def capture_viewport_snapshots(page: Any, paths: dict[str, Path], safe_name: str) -> list[dict[str, Any]]:
    paths["screenshots"].mkdir(parents=True, exist_ok=True)
    snapshots: list[dict[str, Any]] = []
    for viewport in BROWSER_VIEWPORTS:
        page.set_viewport_size({"width": viewport["width"], "height": viewport["height"]})
        screenshot_path = paths["screenshots"] / f"{safe_name}-{viewport['name']}.png"
        page.screenshot(path=str(screenshot_path), full_page=True)
        snapshot = page.evaluate(BROWSER_SNAPSHOT_SCRIPT)
        snapshots.append({
            "name": viewport["name"],
            "width": viewport["width"],
            "height": viewport["height"],
            "screenshot_path": str(screenshot_path),
            "snapshot": snapshot,
            "overflow": snapshot.get("overflow", {}) if isinstance(snapshot, dict) else {},
        })
    return snapshots


def collect_accessibility_smoke_evidence(
    route_key: str,
    route_url: str,
    navigation_record: dict[str, Any],
    browser_record: dict[str, Any],
    paths: dict[str, Path],
) -> dict[str, Any]:
    body = str(navigation_record.get("body_excerpt", ""))
    summary = navigation_record.get("html_summary") if isinstance(navigation_record.get("html_summary"), dict) else {}
    headings = browser_record.get("headings") if isinstance(browser_record.get("headings"), list) else []
    browser_has_h1 = any(
        isinstance(heading, dict) and heading.get("level") == 1 and str(heading.get("text", "")).strip()
        for heading in headings
    )
    violations: list[dict[str, str]] = []

    if not summary.get("title"):
        violations.append({
            "id": "title-missing",
            "severity": "serious",
            "message": "Document title was not found in collected HTML.",
        })
    if re.search(r"<html\b", body, re.IGNORECASE) and not re.search(r"<html\b[^>]*\blang=", body, re.IGNORECASE):
        violations.append({
            "id": "html-lang-missing",
            "severity": "serious",
            "message": "The html element does not declare a lang attribute in collected HTML.",
        })
    if body and not re.search(r"<h1\b", body, re.IGNORECASE) and not browser_has_h1:
        violations.append({
            "id": "h1-missing",
            "severity": "moderate",
            "message": "No h1 heading was found in collected HTML.",
        })
    for index, tag in enumerate(re.findall(r"<img\b[^>]*>", body, re.IGNORECASE), start=1):
        if not re.search(r"\balt\s*=", tag, re.IGNORECASE):
            violations.append({
                "id": "image-alt-missing",
                "severity": "serious",
                "message": f"Image {index} does not declare alt text in collected HTML.",
            })
    for index, text in enumerate(re.findall(r"<button\b[^>]*>(.*?)</button>", body, re.IGNORECASE | re.DOTALL), start=1):
        if not _clean_html_text(text):
            violations.append({
                "id": "button-name-missing",
                "severity": "serious",
                "message": f"Button {index} has no accessible text in collected HTML.",
            })
    for index, link in enumerate(summary.get("links", []), start=1):
        if isinstance(link, dict) and not str(link.get("text", "")).strip():
            violations.append({
                "id": "link-name-missing",
                "severity": "moderate",
                "message": f"Link {index} has no collected text.",
            })

    record = {
        "url": route_url,
        "route": route_key,
        "available": bool(navigation_record) or bool(browser_record),
        "engine": "built_in_accessibility_smoke",
        "not_full_axe": True,
        "limitations": "Built-in smoke checks only; this is not an axe-core accessibility audit.",
        "violations": violations,
        "passed": not violations,
    }
    return _write_route_artifact(paths, "axe", route_key, "smoke", record)


def collect_performance_smoke_evidence(
    route_key: str,
    route_url: str,
    navigation_record: dict[str, Any],
    browser_record: dict[str, Any],
    paths: dict[str, Path],
) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    status = browser_record.get("status") or navigation_record.get("status")
    if isinstance(status, int) and status >= 400:
        issues.append({
            "id": "http-error-status",
            "severity": "critical",
            "message": f"Route returned HTTP status {status}.",
        })
    overflow_records = []
    overflow = browser_record.get("overflow") if isinstance(browser_record.get("overflow"), dict) else {}
    if overflow:
        overflow_records.append({"name": "default", **overflow})
    for viewport_record in browser_record.get("viewports", []):
        if not isinstance(viewport_record, dict):
            continue
        viewport_overflow = viewport_record.get("overflow")
        if isinstance(viewport_overflow, dict):
            overflow_records.append({"name": viewport_record.get("name", "viewport"), **viewport_overflow})
    overflowing = [item for item in overflow_records if item.get("horizontal")]
    if overflowing:
        issues.append({
            "id": "horizontal-overflow",
            "severity": "serious",
            "message": "Browser evidence detected horizontal overflow.",
            "details": overflowing,
        })
    console_errors = [
        item for item in browser_record.get("console", [])
        if isinstance(item, dict) and str(item.get("type", "")).lower() == "error"
    ]
    if console_errors:
        issues.append({
            "id": "console-errors",
            "severity": "serious",
            "message": "Browser console errors were collected.",
            "count": len(console_errors),
            "examples": console_errors[:5],
        })
    request_failures = browser_record.get("request_failures", [])
    if request_failures:
        issues.append({
            "id": "request-failures",
            "severity": "serious",
            "message": "Browser request failures were collected.",
            "count": len(request_failures),
            "examples": request_failures[:5],
        })

    record = {
        "url": route_url,
        "route": route_key,
        "available": bool(browser_record),
        "engine": "built_in_performance_smoke",
        "not_full_lighthouse": True,
        "limitations": "Built-in smoke checks only; this is not a Lighthouse audit.",
        "status": status,
        "issues": issues,
        "dev_noise": browser_record.get("dev_noise", []),
        "passed": not issues,
    }
    return _write_route_artifact(paths, "lighthouse", route_key, "smoke", record)


def _is_next_hmr_console_noise(message: dict[str, str]) -> bool:
    text = message.get("text", "")
    return (
        message.get("type") == "error"
        and "_next/webpack-hmr" in text
        and "WebSocket connection" in text
        and "Error during WebSocket handshake" in text
    )


def normalize_browser_dev_noise(record: dict[str, Any]) -> dict[str, Any]:
    console = record.get("console")
    if not isinstance(console, list):
        return record
    app_console: list[dict[str, str]] = []
    dev_noise: list[dict[str, str]] = []
    for item in console:
        if not isinstance(item, dict):
            app_console.append(item)
            continue
        if _is_next_hmr_console_noise(item):
            dev_noise.append(
                {
                    "id": "next-hmr-websocket",
                    "type": item.get("type", ""),
                    "text": item.get("text", ""),
                    "classification": "dev-server-noise",
                }
            )
        else:
            app_console.append(item)
    if not dev_noise:
        return record
    normalized = {**record, "console": app_console}
    normalized["dev_noise"] = [*record.get("dev_noise", []), *dev_noise]
    return normalized


def collect_browser_evidence(url: str, paths: dict[str, Path], route_key: str) -> dict[str, Any]:
    paths["screenshots"].mkdir(parents=True, exist_ok=True)
    paths["browser"].mkdir(parents=True, exist_ok=True)
    safe_name = _safe_route_name(route_key)
    browser_path = paths["browser"] / f"{safe_name}.json"
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        record = {
            "url": url,
            "route": route_key,
            "available": False,
            "error": f"Playwright unavailable: {type(exc).__name__}: {exc}",
            "artifact_path": str(browser_path),
        }
        browser_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
        return record

    console_messages: list[dict[str, str]] = []
    request_failures: list[dict[str, str]] = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.on("console", lambda msg: console_messages.append({"type": msg.type, "text": msg.text}))
            page.on(
                "requestfailed",
                lambda request: request_failures.append(
                    {
                        "url": request.url,
                        "method": request.method,
                        "failure": str(request.failure),
                    }
                ),
            )
            response = page.goto(url, wait_until="networkidle", timeout=15000)
            viewport_snapshots = capture_viewport_snapshots(page, paths, safe_name)
            browser.close()
        browser_data = viewport_snapshots[-1]["snapshot"] if viewport_snapshots else {}
        record = normalize_browser_dev_noise({
            "url": url,
            "route": route_key,
            "available": True,
            "status": response.status if response else None,
            "screenshot_path": viewport_snapshots[-1]["screenshot_path"] if viewport_snapshots else "",
            "viewports": viewport_snapshots,
            "viewport": browser_data.get("viewport", {}),
            "overflow": browser_data.get("overflow", {}),
            "title": browser_data.get("title", ""),
            "text_excerpt": browser_data.get("text", ""),
            "buttons": browser_data.get("buttons", []),
            "inputs": browser_data.get("inputs", []),
            "links": browser_data.get("links", []),
            "headings": browser_data.get("headings", []),
            "console": console_messages,
            "request_failures": request_failures,
            "artifact_path": str(browser_path),
        })
    except Exception as exc:
        record = {
            "url": url,
            "route": route_key,
            "available": False,
            "error": f"Browser evidence failed: {type(exc).__name__}: {exc}",
            "console": console_messages,
            "request_failures": request_failures,
            "artifact_path": str(browser_path),
        }
    browser_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return record


def collect_evidence(
    project_dir: Path,
    app_url: str,
    contract: SprintContract,
    paths: dict[str, Path],
    browser_collector: BrowserCollector | None = None,
) -> dict[str, Any]:
    app_dir = paths["app"]
    browser_collector = browser_collector or collect_browser_evidence
    evidence: dict[str, Any] = {
        "sprint": contract.sprint_number,
        "goal": contract.goal,
        "app_url": app_url,
        "commands": {},
        "navigation": {},
        "browser": {},
        "axe": {},
        "lighthouse": {},
        "api": {},
        "source_files": {},
        "notes": [],
    }

    commands = contract.evidence.get("commands", [])
    for index, command in enumerate(commands, start=1):
        if not isinstance(command, dict):
            evidence["commands"][f"command-{index}"] = {
                "rejected": True,
                "error": "Invalid command entry; expected object with name and cmd.",
            }
            continue
        name = command.get("name", "command")
        cmd = command.get("cmd")
        rejection_reason = _command_rejection_reason(cmd)
        if rejection_reason:
            evidence["commands"][name] = {"rejected": True, "error": rejection_reason}
            continue
        safe_name = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in name)
        evidence["commands"][name] = run_recorded(cmd, app_dir, paths["commands"], safe_name)

    routes = contract.evidence.get("routes", ["/"])
    base_url = app_url.rstrip("/") + "/"
    for index, route in enumerate(routes, start=1):
        rejection_reason = _app_relative_rejection_reason(route)
        if rejection_reason:
            route_key = str(route) if isinstance(route, str) else f"route-{index}"
            record = {"rejected": True, "error": rejection_reason}
            evidence["navigation"][route_key] = record
            evidence["browser"][route_key] = record
            evidence["axe"][route_key] = record
            evidence["lighthouse"][route_key] = record
            continue
        assert isinstance(route, str)
        route_key = route if route.startswith("/") else f"/{route}"
        route_url = urljoin(base_url, route.lstrip("/"))
        try:
            with urlopen(route_url, timeout=10) as response:
                body = response.read(20000).decode("utf-8", errors="replace")
                evidence["navigation"][route_key] = {
                    "url": route_url,
                    "status": response.status,
                    "title_present": "<title" in body.lower(),
                    "html_summary": summarize_html(body),
                    "body_excerpt": body[:2000],
                }
        except Exception as exc:
            evidence["navigation"][route_key] = {"url": route_url, "error": repr(exc)}
        evidence["browser"][route_key] = normalize_browser_dev_noise(browser_collector(route_url, paths, route_key))
        evidence["axe"][route_key] = collect_accessibility_smoke_evidence(
            route_key,
            route_url,
            evidence["navigation"][route_key],
            evidence["browser"][route_key],
            paths,
        )
        evidence["lighthouse"][route_key] = collect_performance_smoke_evidence(
            route_key,
            route_url,
            evidence["navigation"][route_key],
            evidence["browser"][route_key],
            paths,
        )

    for index, probe in enumerate(contract.evidence.get("api", []), start=1):
        if not isinstance(probe, dict):
            evidence["api"][f"api-{index}"] = {
                "rejected": True,
                "error": "Invalid API entry; expected object with method, path, and expected status.",
            }
            continue
        name = str(probe.get("name") or probe.get("path") or "api")
        method = str(probe.get("method", "GET")).upper()
        path = str(probe.get("path", "/"))
        rejection_reason = _api_probe_rejection_reason(probe)
        if rejection_reason:
            evidence["api"][name] = {"rejected": True, "error": rejection_reason}
            continue
        expected = int(probe.get("expectStatus", probe.get("expected_status", 200)))
        body = probe.get("body")
        data = None
        headers = {"accept": "application/json, text/plain, */*"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["content-type"] = "application/json"
        url = urljoin(base_url, path.lstrip("/"))
        safe_name = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in name)
        try:
            request = Request(url, data=data, headers=headers, method=method)
            with urlopen(request, timeout=10) as response:
                response_body = response.read(20000).decode("utf-8", errors="replace")
                record = {
                    "url": url,
                    "method": method,
                    "status": response.status,
                    "expected_status": expected,
                    "passed": response.status == expected,
                    "response_excerpt": response_body[:2000],
                }
        except HTTPError as exc:
            response_body = exc.read(20000).decode("utf-8", errors="replace")
            record = {
                "url": url,
                "method": method,
                "status": exc.code,
                "expected_status": expected,
                "passed": exc.code == expected,
                "response_excerpt": response_body[:2000],
            }
            if exc.code != expected:
                record["error"] = repr(exc)
        except Exception as exc:
            record = {
                "url": url,
                "method": method,
                "expected_status": expected,
                "passed": False,
                "error": repr(exc),
            }
        paths["api"].mkdir(parents=True, exist_ok=True)
        api_path = paths["api"] / f"{safe_name}.json"
        api_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
        record["artifact_path"] = str(api_path)
        evidence["api"][name] = record

    for source in contract.evidence.get("source_files", []):
        source_key = str(source)
        path, relative_source, error = _resolve_app_source_file(app_dir, source)
        if error:
            evidence["source_files"][source_key] = {"rejected": True, "error": error}
            continue
        assert path is not None
        assert relative_source is not None
        if path.exists() and path.is_file():
            target = paths["source"] / relative_source
            target.parent.mkdir(parents=True, exist_ok=True)
            text = path.read_text(errors="replace")[:5000]
            target.write_text(text)
            evidence["source_files"][source_key] = {"artifact_path": str(target), "missing": False}
        else:
            evidence["source_files"][source_key] = {"missing": True, "expected_path": str(path)}

    evidence_path = paths["sprint_evidence"] / "evidence.json"
    evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False))
    return evidence
