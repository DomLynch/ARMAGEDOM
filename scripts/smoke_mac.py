"""Launch the actual Mac build headlessly and reject startup/runtime exceptions."""

import hashlib
import json
import pathlib
import re
import subprocess
import time

root = pathlib.Path(__file__).resolve().parents[1]
app = root / "Builds/Ashvault.app/Contents"
executable = app / "MacOS/Ashvault"
log = root / "artifacts/player-smoke.log"
assert executable.is_file(), "Build the Mac demo before running its smoke check."
log.write_text("")
process = subprocess.Popen(
    [str(executable), "-batchmode", "-nographics", "-logFile", str(log)],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
try:
    deadline = time.monotonic() + 20
    ready_at = None
    while time.monotonic() < deadline:
        time.sleep(0.5)
        text = log.read_text(errors="replace")
        assert not re.search(r"Exception:|Could not load|Failed to load", text), text[
            -4000:
        ]
        assert process.poll() is None, "Mac player exited unexpectedly."
        if "ASHVAULT_READY" in text:
            ready_at = ready_at or time.monotonic()
            if time.monotonic() - ready_at >= 4:
                break
    else:
        raise RuntimeError("Mac player did not reach healthy gameplay startup.")
    assembly = app / "Resources/Data/Managed/Ashvault.dll"
    receipt = {
        "ready": True,
        "exceptions": False,
        "observed_seconds": 4,
        "assembly_sha256": hashlib.sha256(assembly.read_bytes()).hexdigest(),
    }
    (root / "artifacts/player-smoke.json").write_text(json.dumps(receipt, indent=2))
    print(
        "PASS: standalone Mac player starts, creates arena/player/camera, and runs without exceptions."
    )
finally:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
