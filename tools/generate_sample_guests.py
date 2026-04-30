#!/usr/bin/env python3
"""Generate sample guest CSV data for load testing.
Usage: python tools/generate_sample_guests.py 1200 data/samples/sample_guests_1200.csv
"""
import csv
import sys
from pathlib import Path

CATEGORIES = ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"]
FIRST_NAMES = ["Anna", "Max", "Julia", "Lukas", "Sarah", "Peter", "Nina", "Oliver", "Lea", "Martin", "Zoe", "Francois", "Claudia", "Thomas", "Simone", "Laura", "Sandro", "Emma", "Michael", "Joerg"]
LAST_NAMES = ["Mueller", "Meier", "Schneider", "Keller", "Huber", "Zuercher", "Graf", "Koenig", "Frei", "Baumann", "Dupont", "Rossi", "Gerber", "Weiss", "Baer", "Neumann", "Hoffmann", "Muster", "Beispiel", "Nord"]

count = int(sys.argv[1]) if len(sys.argv) > 1 else 1200
output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/samples/sample_guests_1200.csv")
output.parent.mkdir(parents=True, exist_ok=True)
with output.open("w", encoding="utf-8-sig", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["Guest ID", "Name", "Kategorie", "Support Kommentar", "Notiz"])
    writer.writeheader()
    for i in range(1, count + 1):
        cat = CATEGORIES[(i - 1) % len(CATEGORIES)]
        comment = {"Member VIP": "VIP-Band abgeben", "On Stage": "Stage-/Backstage-Zugang pruefen", "Mitarbeiter": "Staff-Badge abgeben"}.get(cat, "")
        note = "Load-Test Gast" if i % 100 == 0 else ""
        writer.writerow({
            "Guest ID": f"G-{i:04d}",
            "Name": f"{FIRST_NAMES[(i - 1) % len(FIRST_NAMES)]} {LAST_NAMES[((i - 1) // len(FIRST_NAMES)) % len(LAST_NAMES)]} {i:04d}",
            "Kategorie": cat,
            "Support Kommentar": comment,
            "Notiz": note,
        })
print(f"Wrote {count} guests to {output}")
