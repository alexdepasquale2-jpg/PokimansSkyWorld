"""Turning what a phone actually produces into what the API actually accepts.

Three things go wrong between a technician's camera roll and a vision call, and
all three are quiet:

- **HEIC.** iPhones shoot HEIC by default. The API accepts JPEG, PNG, GIF and
  WebP — not HEIC. A suffix filter drops those files without a word, and the
  gate reads as "the model missed the deficiency" when the photo was never sent.
- **Orientation.** Phones record rotation in EXIF rather than rotating pixels.
  A sideways photo of a gauge is materially harder to read, and nothing errors.
- **Size.** A 12MP photo is ~4000px on the long edge. `claude-haiku-4-5` is not
  in the high-resolution tier, so the API scales it to 1568px anyway — but we
  would have base64'd the full file first (+33%) and sent eight of them per
  request. That is tens of megabytes of upload per call for pixels the model
  never sees, and it is how a batch call starts failing on request size.

So: transpose by EXIF, scale the long edge down to what the model will actually
use, and re-encode into an accepted format. Anything unreadable is reported by
name rather than skipped — see the warning path in `pipeline.classify_photos`.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

# What the API accepts. Anything else has to be converted before it is sent.
ACCEPTED_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

# claude-haiku-4-5 scales anything longer than this down before it is read, so
# sending more is paying upload for pixels the model discards. The reasoning
# models accept 2576 — raise this if the photo pass ever moves to one.
LONG_EDGE_MAX = 1568

JPEG_QUALITY = 88

# Files that live in every real camera-roll export and are not photos.
_IGNORED_NAMES = {".ds_store", "thumbs.db", "desktop.ini"}


class UnreadableImage(Exception):
    """Raised with a message a person can act on, not a stack trace."""


@dataclass
class Prepared:
    data: bytes
    media_type: str
    note: str | None = None  # what we changed, for the run log


def is_ignorable(path: Path) -> bool:
    """Junk that should not produce a warning when it appears in photos/."""
    return path.name.startswith(".") or path.name.lower() in _IGNORED_NAMES


def _load_pillow():
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise UnreadableImage(
            "pillow is required to read photos: pip install -r requirements.txt"
        ) from exc

    # HEIC support is a separate package. Register it if present; if it is not,
    # say so at the point of failure rather than reporting a corrupt file.
    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    return Image, ImageOps


def prepare(path: Path) -> Prepared:
    """Read one photo and return bytes the API will accept.

    A file that is already an accepted format, correctly oriented and small
    enough is returned untouched — no recompression, no generation loss.
    """
    Image, ImageOps = _load_pillow()

    suffix = path.suffix.lower()
    raw = path.read_bytes()

    try:
        with Image.open(io.BytesIO(raw)) as img:
            oriented = ImageOps.exif_transpose(img)
            rotated = oriented is not img and oriented.size != img.size
            width, height = oriented.size
            oversized = max(width, height) > LONG_EDGE_MAX

            if suffix in ACCEPTED_MEDIA_TYPES and not rotated and not oversized:
                return Prepared(raw, ACCEPTED_MEDIA_TYPES[suffix])

            notes = []
            if suffix not in ACCEPTED_MEDIA_TYPES:
                notes.append(f"converted from {suffix or 'unknown format'}")
            if rotated:
                notes.append("rotated per EXIF")

            if oversized:
                scale = LONG_EDGE_MAX / max(width, height)
                size = (max(1, round(width * scale)), max(1, round(height * scale)))
                oriented = oriented.resize(size, Image.LANCZOS)
                notes.append(f"{width}x{height} -> {size[0]}x{size[1]}")

            if oriented.mode not in ("RGB", "L"):
                oriented = oriented.convert("RGB")

            buffer = io.BytesIO()
            oriented.save(buffer, format="JPEG", quality=JPEG_QUALITY)
            return Prepared(buffer.getvalue(), "image/jpeg", ", ".join(notes))

    except UnreadableImage:
        raise
    except Exception as exc:
        if suffix in (".heic", ".heif"):
            raise UnreadableImage(
                f"{path.name}: HEIC needs pillow-heif — "
                "pip install -r requirements.txt, or ask the shop to set "
                "Camera > Formats > Most Compatible"
            ) from exc
        raise UnreadableImage(f"{path.name}: unreadable ({exc})") from exc
