"""Scratch QA only (never committed into the game): make a QA copy of the BUILT game start in area7 so the Rat King is on screen.
Run on a built COPY: python3 qa-initial-area.py <copy>/Web/dist/world/manifest.json"""
import json, sys

p = sys.argv[1]
d = json.load(open(p))
d["initialArea"] = sys.argv[2] if len(sys.argv) > 2 else "east-bridge"
json.dump(d, open(p, "w"), indent=2)
print("initialArea", d["initialArea"])
