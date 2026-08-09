#!/usr/bin/env python3
"""Generate a synthetic inspection so the harness runs before real files exist.

    python fixtures/make_fixtures.py

What this is for: proving the pipeline is wired correctly — schemas validate,
caching engages, costs are attributed, scoring aligns. Run it once, confirm the
plumbing, then throw the numbers away.

What this is NOT for: any claim about accuracy. The narration is clean, the
"photos" are captioned diagrams rather than photographs of a dark mechanical
room, and the reference list was written alongside the transcript rather than
independently by an inspector. Every one of those makes the task easier than
reality. Gate 2 passes on real inspections or it does not pass.

The fixture does contain two deliberate traps worth watching:

  - one deficiency visible only in a photo and never narrated, which fails if
    the photo stage is not contributing
  - one ambiguous remark that is not a deficiency, which should land in
    uncertain_items; reporting it is a fabrication
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent
INSPECTION = HERE / "inspections" / "demo-001"

META = {
    "id": "demo-001",
    "building": "Northgate Distribution Center, Building C",
    "address": "1400 Northgate Way",
    "jurisdiction": "SYNTHETIC County Fire Marshal",
    "inspection_date": "2026-08-04",
    "inspector": "SYNTHETIC — fixture data",
    "scope": [
        "Annual NFPA 25 wet system inspection",
        "Annual NFPA 72 fire alarm inspection",
    ],
    "systems": ["Wet pipe sprinkler, risers 1-2", "Addressable FACP, 1 panel"],
    "note": "SYNTHETIC FIXTURE — not a real inspection.",
}

TRANSCRIPT = """\
Okay, starting the annual at Northgate Building C, August fourth. Wet system,
two risers, plus the alarm panel.

Riser two first. Gauge on the riser two supply side, the face is completely
fogged over, I can't read the needle at all. Tag on it says calibrated 2017, so
that's well past due either way. Writing that up.

Ran the main drain on riser two. Static sixty-eight, residual forty-one. Pulled
last year's card, previous residual was fifty-two. That's a big drop, more than
ten percent, so something's changed on the supply side. Needs investigation
before I can sign this one off clean.

North stairwell control valve. It's open, it's chained, supervision looks fine,
no leakage. But there's no ID sign on it at all — nothing telling you what it
controls. Somebody took it off and never put it back.

Spare sprinkler cabinet by the riser room door is empty. No heads, no wrench.
Cabinet's there, it's just been cleaned out.

Over to the panel. FACP is showing a supervisory condition on the display. I
cleared the history and it came right back. I can't tell what's driving it from
the panel alone, needs a tech with the programming laptop.

Popped the panel batteries. Install date sticker says 2019. That's well past the
manufacturer interval, those want replacing regardless of how they test.

Last thing — the flow switch on riser one, something's odd about it. Didn't get
a clean signal when I bumped it but I didn't have the test kit with me and I
don't want to call it either way. I'll come back for that one.

That's the walk.
"""

# Rendered as captioned diagrams, not photographs. See the docstring.
PHOTOS = [
    ("riser-2-gauge.jpg", "PRESSURE GAUGE", [
        "riser 2 supply side",
        "gauge face fogged / opaque",
        "needle not readable",
        "cal tag: 2017",
    ]),
    ("north-stair-valve.jpg", "CONTROL VALVE (OS&Y)", [
        "north stairwell",
        "open, chained, supervised",
        "NO IDENTIFICATION SIGN",
        "no external leakage",
    ]),
    ("spare-cabinet.jpg", "SPARE SPRINKLER CABINET", [
        "riser room door",
        "cabinet present",
        "shelves EMPTY",
        "no wrench",
    ]),
    ("facp-display.jpg", "FIRE ALARM CONTROL PANEL", [
        "SUPERVISORY lamp lit",
        "display: SUPERVISORY - ZONE 4",
        "no alarm condition",
    ]),
    ("facp-batteries.jpg", "PANEL BATTERIES", [
        "2 x 12V sealed lead acid",
        "install sticker: 2019",
        "terminals clean",
    ]),
    # The photo-only trap: never mentioned in the narration.
    ("fdc-exterior.jpg", "FIRE DEPARTMENT CONNECTION", [
        "exterior, north elevation",
        "SHRUBS FULLY OBSCURING FDC",
        "caps in place",
        "ID sign not visible behind growth",
    ]),
]

PRICE_BOOK = {
    "currency": "USD",
    "labor_rate_per_hour": 128.00,
    "items": [
        {"sku": "GAUGE-300", "description": "0-300 psi water gauge, replace", "price": 42.00, "labor_hours": 0.5},
        {"sku": "SIGN-VALVE", "description": "Engraved valve ID sign, install", "price": 18.00, "labor_hours": 0.25},
        {"sku": "SPARE-KIT-6", "description": "Spare sprinkler kit, 6 head assortment + wrench", "price": 210.00, "labor_hours": 0.25},
        {"sku": "BATT-12V-7AH", "description": "12V 7Ah sealed battery, replace (each)", "price": 38.00, "labor_hours": 0.5},
        {"sku": "FDC-CLEAR", "description": "Clear vegetation from FDC, restore 3ft access", "price": 0.00, "labor_hours": 1.5},
        {"sku": "DIAG-ALARM", "description": "Alarm technician diagnostic visit, programming laptop", "price": 0.00, "labor_hours": 2.0},
    ],
    "note": "SYNTHETIC price book. Main drain supply investigation is deliberately absent.",
}

REFERENCE = {
    "deficiencies": [
        {
            "id": "R-01", "location": "Riser 2, supply side", "device": "Pressure gauge",
            "description": "Gauge face fogged and unreadable; calibration tag dated 2017, beyond the five-year interval.",
            "standard_clause": "SYN-25-08.2.2",
            "clause_quote": "Gauges shall be replaced or recalibrated at intervals not exceeding five years.",
            "severity": "major", "evidence_photo_ids": ["riser-2-gauge.jpg"],
            "source": "both", "confidence": "high",
        },
        {
            "id": "R-02", "location": "Riser 2", "device": "Water supply / main drain",
            "description": "Main drain residual pressure 41 psi against 52 psi on the previous test, a drop exceeding 10 percent; cause undetermined.",
            "standard_clause": "SYN-25-11.3.2",
            "clause_quote": "Where a main drain test produces a residual pressure that differs by more than 10 percent from the previous test on record, the cause shall be determined and corrected.",
            "severity": "major", "evidence_photo_ids": [],
            "source": "transcript", "confidence": "high",
        },
        {
            "id": "R-03", "location": "North stairwell", "device": "Control valve",
            "description": "Control valve has no identification sign indicating the portion of system it controls.",
            "standard_clause": "SYN-25-13.2.6",
            "clause_quote": "Each control valve shall be provided with a permanently marked, weatherproof identification sign indicating the portion of the system it controls.",
            "severity": "minor", "evidence_photo_ids": ["north-stair-valve.jpg"],
            "source": "both", "confidence": "high",
        },
        {
            "id": "R-04", "location": "Riser room", "device": "Spare sprinkler cabinet",
            "description": "Spare sprinkler cabinet empty; no spare heads and no sprinkler wrench on premises.",
            "standard_clause": "SYN-25-05.2.1",
            "clause_quote": "Spare sprinklers shall be maintained on the premises in a cabinet, in a quantity appropriate to the number of installed sprinklers, together with a wrench of the type required for each sprinkler present.",
            "severity": "minor", "evidence_photo_ids": ["spare-cabinet.jpg"],
            "source": "both", "confidence": "high",
        },
        {
            "id": "R-05", "location": "Fire alarm control panel", "device": "FACP",
            "description": "Panel showing a standing supervisory condition that recurs after clearing; cause not determined on site.",
            "standard_clause": "SYN-72-14.3.2",
            "clause_quote": "A trouble or supervisory condition present at the panel at the time of inspection shall be recorded, together with the cause where it can be determined.",
            "severity": "critical", "evidence_photo_ids": ["facp-display.jpg"],
            "source": "both", "confidence": "high",
        },
        {
            "id": "R-06", "location": "Fire alarm control panel", "device": "Secondary power batteries",
            "description": "Panel batteries carry a 2019 install date, beyond the manufacturer's replacement interval.",
            "standard_clause": "SYN-72-14.4.5",
            "clause_quote": "Batteries shall be marked with the date of installation and replaced within the interval recommended by the manufacturer.",
            "severity": "major", "evidence_photo_ids": ["facp-batteries.jpg"],
            "source": "both", "confidence": "high",
        },
        {
            "id": "R-07", "location": "North elevation, exterior", "device": "Fire department connection",
            "description": "FDC fully obscured by vegetation; not visible or accessible from the approach.",
            "standard_clause": "SYN-25-14.1.3",
            "clause_quote": "An obstructed fire department connection shall be recorded as a critical deficiency and corrected without delay.",
            "severity": "critical", "evidence_photo_ids": ["fdc-exterior.jpg"],
            "source": "photo", "confidence": "high",
        },
    ],
    "uncertain_items": [
        "Riser 1 waterflow switch did not produce a clean signal when bumped, but the "
        "inspector had no test kit and explicitly declined to call it either way. "
        "Reporting this as a deficiency is a fabrication."
    ],
}


def draw_photo(path: Path, title: str, lines: list[str]) -> bool:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False

    width, height = 1024, 768
    image = Image.new("RGB", (width, height), (46, 52, 58))
    draw = ImageDraw.Draw(image)

    draw.rectangle([40, 40, width - 40, 150], fill=(28, 32, 36))
    draw.text((70, 80), title, fill=(240, 240, 240))

    draw.rectangle([70, 210, 430, 640], outline=(150, 160, 170), width=4)
    draw.ellipse([120, 260, 380, 520], outline=(190, 200, 210), width=5)
    draw.line([250, 390, 340, 320], fill=(200, 90, 90), width=5)

    for i, line in enumerate(lines):
        draw.text((480, 240 + i * 46), f"- {line}", fill=(225, 228, 232))

    draw.text((70, 690), "SYNTHETIC FIXTURE IMAGE - NOT A PHOTOGRAPH",
              fill=(150, 150, 155))
    image.save(path, quality=85)
    return True


def main() -> int:
    (INSPECTION / "photos").mkdir(parents=True, exist_ok=True)

    (INSPECTION / "meta.json").write_text(json.dumps(META, indent=2) + "\n")
    (INSPECTION / "transcript.txt").write_text(TRANSCRIPT)
    (INSPECTION / "price-book.json").write_text(json.dumps(PRICE_BOOK, indent=2) + "\n")
    (INSPECTION / "reference-deficiencies.json").write_text(
        json.dumps(REFERENCE, indent=2) + "\n"
    )

    drawn = 0
    for filename, title, lines in PHOTOS:
        if draw_photo(INSPECTION / "photos" / filename, title, lines):
            drawn += 1

    print(f"wrote fixture to {INSPECTION}")
    print(f"  transcript, meta, price book, {len(REFERENCE['deficiencies'])} reference deficiencies")
    if drawn:
        print(f"  {drawn} synthetic images")
    else:
        print("  no images — install Pillow to generate them (pip install pillow)")
        print("  the photo-only trap (R-07, obstructed FDC) cannot be found without them")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
