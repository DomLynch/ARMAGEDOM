"""Run real Unity Play Mode checks, reusing the editor when available."""

import json
import pathlib
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME = ROOT / "Game"
UNITY = pathlib.Path.home() / ".unity/bin/unity"
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


def command(name, *args):
    result = subprocess.run(
        [
            str(UNITY),
            "command",
            name,
            *args,
            "--project-path",
            str(GAME),
            "--caller",
            "plugin",
            "--skill",
            "unity-cli",
            "--result-only",
        ],
        capture_output=True,
        text=True,
        timeout=45,
    )
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return json.loads(result.stdout)


try:
    state = command("editor_status")
except RuntimeError:
    state = None

if state:
    assert state["playMode"] == "stopped", "Stop Play Mode before running the gate."
    assert not state["compiling"], "Wait for compilation before running the gate."
    command(
        "run_tests",
        "--mode",
        "playmode",
        "--filter",
        "Ashvault",
        "--async_tests",
        "true",
    )
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        time.sleep(2)
        result = command("test_status")
        if result.get("status") == "completed":
            (ARTIFACTS / "playmode-results.json").write_text(
                json.dumps(result, indent=2)
            )
            summary = result["summary"]
            assert summary["total"] >= 13 and summary["passed"] == summary["total"], (
                result
            )
            print("PASS: real Unity Play Mode suite", summary)
            break
    else:
        raise RuntimeError("Play Mode tests did not finish within 120 seconds")
else:
    report = ARTIFACTS / "playmode-results.xml"
    subprocess.run(
        [
            str(UNITY),
            "test",
            str(GAME),
            "--mode",
            "PlayMode",
            "--filter",
            "Ashvault",
            "--output",
            str(report),
            "--timeout",
            "180",
        ],
        check=True,
        timeout=200,
    )
    result = ET.parse(report).getroot()
    assert (
        int(result.attrib.get("passed", "0")) >= 13
        and result.attrib["result"] == "Passed"
    )
    print("PASS: headless Unity Play Mode suite")
