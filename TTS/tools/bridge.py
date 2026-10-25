#!/usr/bin/env python3
"""Aloud bridge — the live half of the connection.

    python3 tools/bridge.py                 serve on http://localhost:8765
    python3 tools/bridge.py --port 9000
    python3 tools/bridge.py --host 0.0.0.0  reachable from a phone on the LAN
    python3 tools/bridge.py --watch         regenerate when the session moves

Why this exists.

The page is the reader. It cannot do two things it would need to do to follow
a development session by itself: read a Claude Code transcript off disk (a
browser has no filesystem), and call the GitHub API from a file:// origin
(no cookies, no tokens, and an opaque origin). So the connection runs the
other way — this server watches the record and hands over beats, and the page
polls it.

Standard library only, so it runs on a desktop, on a server, or under Pydroid
on Android with nothing to install. Point the page's bridge field at whatever
address this prints.

Endpoints
    GET /                     the app itself
    GET /api/health           liveness, and what the bridge can see
    GET /api/narration        the current narration script
    GET /api/run-tests        run the suites, regenerate, return the tally
    GET /api/github?path=...  proxied GitHub API (token stays here, not in the page)

Every response carries permissive CORS headers, because the page is usually
opened from a file:// origin, which sends `Origin: null`.
"""

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # the TTS/ directory
NARRATION = os.path.join(ROOT, "narration.json")

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
}

_lock = threading.Lock()
_state = {"generating": False, "last_error": "", "last_run": 0.0}


# --- the generator -----------------------------------------------------------

def have_node():
    try:
        subprocess.run(["node", "--version"], capture_output=True, timeout=10, check=True)
        return True
    except Exception:
        return False


def generate(mode="all", timeout=300):
    """Run tools/monologue.mjs. Returns (ok, output)."""
    with _lock:
        if _state["generating"]:
            return False, "already generating"
        _state["generating"] = True
    try:
        proc = subprocess.run(
            ["node", os.path.join("tools", "monologue.mjs"), mode, "--pretty"],
            cwd=ROOT, capture_output=True, text=True, timeout=timeout,
        )
        ok = proc.returncode == 0
        out = (proc.stdout or "") + (proc.stderr or "")
        _state["last_error"] = "" if ok else out.strip()[-800:]
        _state["last_run"] = time.time()
        return ok, out
    except Exception as exc:                      # noqa: BLE001 - reported to the caller
        _state["last_error"] = str(exc)
        return False, str(exc)
    finally:
        with _lock:
            _state["generating"] = False


def latest_session_file():
    base = os.path.join(os.path.expanduser("~"), ".claude", "projects")
    newest, newest_at = None, -1.0
    for dirpath, _dirnames, filenames in os.walk(base):
        for name in filenames:
            if not name.endswith(".jsonl"):
                continue
            path = os.path.join(dirpath, name)
            try:
                stamp = os.path.getmtime(path)
            except OSError:
                continue
            if stamp > newest_at:
                newest, newest_at = path, stamp
    return newest, newest_at


def watcher(interval):
    """Regenerate whenever the newest transcript grows."""
    seen = -1.0
    while True:
        path, stamp = latest_session_file()
        if path and stamp > seen:
            seen = stamp
            ok, _out = generate("all")
            print("[watch] regenerated" if ok else "[watch] generation failed", flush=True)
        time.sleep(interval)


# --- the server --------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "AloudBridge/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    # CORS, on everything, because file:// pages send Origin: null.
    def _headers(self, code, ctype, length=None, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()

    def _json(self, payload, code=200):
        body = json.dumps(payload).encode("utf-8")
        self._headers(code, "application/json; charset=utf-8", len(body))
        self.wfile.write(body)

    def _text(self, message, code=200):
        body = message.encode("utf-8")
        self._headers(code, "text/plain; charset=utf-8", len(body))
        self.wfile.write(body)

    def do_OPTIONS(self):                          # noqa: N802 - BaseHTTPRequestHandler
        self._headers(204, "text/plain", 0)

    def do_HEAD(self):                             # noqa: N802 - BaseHTTPRequestHandler
        self._headers(200, "text/plain", 0)

    def do_GET(self):                              # noqa: N802 - BaseHTTPRequestHandler
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)

        if route == "/api/health":
            path, stamp = latest_session_file()
            return self._json({
                "ok": True,
                "node": have_node(),
                "narration": os.path.exists(NARRATION),
                "session": os.path.basename(path) if path else None,
                "sessionModified": stamp if path else None,
                "generating": _state["generating"],
                "lastError": _state["last_error"],
                "github": bool(os.environ.get("GITHUB_TOKEN")),
            })

        if route == "/api/narration":
            if not os.path.exists(NARRATION):
                ok, out = generate("all")
                if not ok:
                    return self._json({"error": "could not generate", "detail": out[-500:]}, 500)
            try:
                with open(NARRATION, "r", encoding="utf-8") as handle:
                    return self._json(json.load(handle))
            except Exception as exc:               # noqa: BLE001
                return self._json({"error": str(exc)}, 500)

        if route == "/api/regenerate":
            ok, out = generate(query.get("mode", ["all"])[0])
            return self._json({"ok": ok, "output": out[-1500:]}, 200 if ok else 500)

        if route == "/api/run-tests":
            ok, out = generate("test")
            return self._json({"ok": ok, "output": out[-1500:]}, 200 if ok else 500)

        if route == "/api/github":
            return self._github(query)

        return self._static(route)

    # --- GitHub, proxied so no token ever reaches the page -------------------

    def _github(self, query):
        path = (query.get("path") or [""])[0]
        if not path.startswith("/"):
            return self._json({"error": "path must start with /"}, 400)

        request = urllib.request.Request(
            "https://api.github.com" + path,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "aloud-bridge",
                **({"Authorization": "Bearer " + os.environ["GITHUB_TOKEN"]}
                   if os.environ.get("GITHUB_TOKEN") else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
            self._headers(200, "application/json; charset=utf-8", len(body))
            self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            return self._json({"error": "github " + str(exc.code), "detail": exc.reason}, exc.code)
        except Exception as exc:                   # noqa: BLE001
            return self._json({"error": str(exc)}, 502)

    # --- static --------------------------------------------------------------

    def _static(self, route):
        rel = "index.html" if route in ("/", "") else route.lstrip("/")
        target = os.path.normpath(os.path.join(ROOT, rel))
        if not target.startswith(ROOT):            # no climbing out of the folder
            return self._text("no", 403)
        if not os.path.isfile(target):
            return self._text("not found", 404)

        ext = os.path.splitext(target)[1].lower()
        with open(target, "rb") as handle:
            body = handle.read()
        self._headers(200, CONTENT_TYPES.get(ext, "application/octet-stream"), len(body))
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Serve Aloud and its narration.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1",
                        help="use 0.0.0.0 to reach it from a phone on the same network")
    parser.add_argument("--watch", action="store_true",
                        help="regenerate whenever the Claude Code session moves")
    parser.add_argument("--interval", type=float, default=10.0)
    args = parser.parse_args()

    if not have_node():
        print("! node was not found, so narration cannot be generated here.")
        print("  The bridge will still serve an existing narration.json and the app.")

    if not os.path.exists(NARRATION):
        print("no narration.json yet — generating one…")
        ok, out = generate("all")
        print(out.strip() if out.strip() else ("done" if ok else "failed"))

    if args.watch:
        threading.Thread(target=watcher, args=(args.interval,), daemon=True).start()
        print("watching the newest Claude Code transcript")

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    shown = "localhost" if args.host in ("127.0.0.1", "localhost") else args.host
    print("\nAloud bridge on http://%s:%d" % (shown, args.port))
    print("  the app:       http://%s:%d/" % (shown, args.port))
    print("  bridge field:  http://%s:%d" % (shown, args.port))
    if args.host == "0.0.0.0":
        print("  (on a phone, swap in this machine's LAN address)")
    print("\nctrl-c to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
