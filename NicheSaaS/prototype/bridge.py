#!/usr/bin/env python3
"""Serves the prototype and turns a capture into a draft.

    python bridge.py                 # demo drafts, no keys, no spend
    python bridge.py --live          # runs the real Gate 2 pipeline

Deliberately thin. Everything real happens in ../gate2-harness, which already
does transcription, photo grading, library-grounded extraction and the
reproduction guard. Re-implementing any of that here would give the prototype a
second copy to drift from.

There is no database, no auth and no queue: the device holds the state, and a
failure here is meant to leave the capture sitting safely in IndexedDB.
"""

from __future__ import annotations

import argparse
import email
import json
import os
import shutil
import sys
import tempfile
from email.policy import default as email_policy
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).parent
HARNESS = HERE.parent / "gate2-harness"

LIVE = False
LIBRARY = HARNESS / "fixtures" / "library"


# --- demo drafts -------------------------------------------------------------

def demo_draft(photo_names: list[str]) -> dict:
    """A canned draft, so the review screen can be exercised with no spend.

    This is fixture data, not model output. It exists to make the attest flow
    clickable — it says nothing about whether extraction works, which is
    precisely what Gate 2 is for.
    """
    fixture = HARNESS / "fixtures" / "inspections" / "demo-001"
    data = json.loads((fixture / "reference-deficiencies.json").read_text())

    # Point the evidence at photos that were actually uploaded, so the reviewer
    # sees their own images rather than dangling filenames.
    if photo_names:
        for i, d in enumerate(data.get("deficiencies", [])):
            if d.get("evidence_photo_ids"):
                d["evidence_photo_ids"] = [photo_names[i % len(photo_names)]]

    transcript = ""
    if (fixture / "transcript.txt").exists():
        transcript = (fixture / "transcript.txt").read_text()

    return {
        "deficiencies": data.get("deficiencies", []),
        "uncertain_items": data.get("uncertain_items", []),
        "transcript": transcript,
        "demo": True,
    }


# --- live drafts -------------------------------------------------------------

def live_draft(work: Path) -> dict:
    """Run the real pipeline over a captured inspection directory."""
    sys.path.insert(0, str(HARNESS))
    import anthropic

    from harness import pipeline
    from harness.cost import CostMeter
    from harness.llm import load_corpus

    client = anthropic.Anthropic()
    meter = CostMeter()
    corpus = load_corpus(LIBRARY)

    meta = json.loads((work / "meta.json").read_text())
    transcript = pipeline.transcribe(work, meter, api_key=os.environ.get("DEEPGRAM_API_KEY"))
    photos, photo_warnings = pipeline.classify_photos(client, work, meter)
    deficiencies, extract_warnings = pipeline.extract_deficiencies(
        client, meter, corpus=corpus, transcript=transcript, photos=photos, meta=meta
    )

    out = deficiencies.model_dump()
    out["transcript"] = transcript
    out["warnings"] = photo_warnings + extract_warnings
    out["cogs_usd"] = round(meter.cogs_usd, 4)
    out["demo"] = False
    return out


# --- request handling --------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def log_message(self, fmt, *args):  # quieter than the default
        if "api/draft" in (args[0] if args else ""):
            sys.stderr.write("  %s\n" % (fmt % args))

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/api/draft"):
            return self.send_error(404)

        try:
            payload = self._read_multipart()
        except Exception as exc:
            return self._json(400, {"error": f"could not read upload: {exc}"})

        work = Path(tempfile.mkdtemp(prefix="capture-"))
        try:
            draft = self._build(payload, work)
        except Exception as exc:
            sys.stderr.write(f"  draft failed: {exc}\n")
            return self._json(500, {"error": str(exc)})
        finally:
            shutil.rmtree(work, ignore_errors=True)

        self._json(200, draft)

    def _build(self, payload, work: Path) -> dict:
        meta = json.loads(payload["fields"].get("meta", "{}"))
        (work / "photos").mkdir(parents=True)
        (work / "audio").mkdir(parents=True)

        photo_names = []
        for name, blob, kind in payload["files"]:
            target = work / ("photos" if kind == "photo" else "audio") / name
            target.write_bytes(blob)
            if kind == "photo":
                photo_names.append(name)

        clips = len(list((work / "audio").glob("*")))
        sys.stderr.write(
            f"  capture: {meta.get('building', '?')} — "
            f"{clips} clip(s), {len(photo_names)} photo(s)\n")

        if not LIVE:
            return demo_draft(photo_names)

        (work / "meta.json").write_text(json.dumps({
            "id": meta.get("id", "capture"),
            "building": meta.get("building", ""),
            "address": meta.get("address", ""),
            "jurisdiction": meta.get("jurisdiction", ""),
            "inspection_date": meta.get("inspection_date", ""),
            "scope": ["Annual NFPA 25 / 72 inspection"],
            "systems": [],
        }, indent=2))
        return live_draft(work)

    def _read_multipart(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = (b"Content-Type: " + self.headers["Content-Type"].encode()
               + b"\r\nMIME-Version: 1.0\r\n\r\n" + self.rfile.read(length))
        msg = email.message_from_bytes(raw, policy=email_policy)

        fields, files = {}, []
        for part in msg.iter_parts():
            name = part.get_param("name", header="content-disposition")
            filename = part.get_filename()
            body = part.get_payload(decode=True) or b""
            if filename:
                files.append((Path(filename).name, body, name))
            else:
                fields[name] = body.decode("utf-8", "replace")
        return {"fields": fields, "files": files}

    def _json(self, code: int, obj) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # The service worker and getUserMedia both need a secure context;
        # localhost qualifies, so no TLS is needed for local testing.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> int:
    global LIVE, LIBRARY

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--live", action="store_true",
                    help="run the real Gate 2 pipeline (needs ANTHROPIC_API_KEY, "
                         "and DEEPGRAM_API_KEY to transcribe audio)")
    ap.add_argument("--library", type=Path, default=LIBRARY,
                    help="procedure library to ground findings in")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    LIVE, LIBRARY = args.live, args.library

    if LIVE:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("error: --live needs ANTHROPIC_API_KEY", file=sys.stderr)
            return 2
        if not os.environ.get("DEEPGRAM_API_KEY"):
            print("warning: DEEPGRAM_API_KEY unset — recorded audio cannot be "
                  "transcribed and the draft will be photo-only", file=sys.stderr)
        if not LIBRARY.is_dir():
            print(f"error: no library at {LIBRARY}", file=sys.stderr)
            return 2

    mode = "LIVE — real model spend" if LIVE else "demo — canned drafts, no spend"
    print(f"Attest prototype ({mode})")
    print(f"  http://localhost:{args.port}/")
    print("  Ctrl-C to stop\n")

    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
