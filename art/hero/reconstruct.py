"""Use the free official TRELLIS.2 demo; never creates a paid HF Job."""

import json
import shutil
import time
from pathlib import Path

import httpx
from gradio_client import Client, handle_file
from huggingface_hub.utils import build_hf_headers

ROOT = Path(__file__).resolve().parent


def require_included_quota(seconds):
    response = httpx.get(
        "https://huggingface.co/api/spaces/zero-gpu/quota",
        headers=build_hf_headers(),
        timeout=20,
    )
    response.raise_for_status()
    quota = response.json()
    if quota.get("current", 0) < seconds:
        raise RuntimeError(
            "Insufficient included ZeroGPU quota; paid overage is not authorized."
        )
    return quota


before_quota = require_included_quota(240)
client = Client("https://microsoft-trellis-2.hf.space", verbose=False)
print("Session: free public Microsoft TRELLIS.2 Space", flush=True)
client.predict(api_name="/start_session")
image = client.predict(
    handle_file(str(ROOT / "warden-reference.png")), api_name="/preprocess_image"
)
print("Preprocess complete; reconstructing original image at 1536", flush=True)
start = time.monotonic()
client.predict(
    handle_file(image), seed=28419, resolution="1536", api_name="/image_to_3d"
)
print("Geometry generated; extracting 200K triangle, 4K PBR GLB", flush=True)
require_included_quota(120)
result = client.predict(
    decimation_target=200000, texture_size=4096, api_name="/extract_glb"
)
print("Extract complete", flush=True)
files = [x for x in result if isinstance(x, str) and Path(x).suffix == ".glb"]
assert files, result
shutil.copy2(files[0], ROOT / "warden-source.glb")
(ROOT / "generation.json").write_text(
    json.dumps(
        {
            "space": "microsoft/TRELLIS.2",
            "paid_job": False,
            "seed": 28419,
            "resolution": 1536,
            "triangles_target": 200000,
            "texture_size": 4096,
            "seconds": round(time.monotonic() - start, 1),
        },
        indent=2,
    )
    + "\n"
)
after_quota = require_included_quota(0)
(ROOT / "quota-receipt.json").write_text(
    json.dumps({"before": before_quota, "after": after_quota}, indent=2) + "\n"
)
assert after_quota.get("overquotaUsed", 0) == before_quota.get("overquotaUsed", 0), (
    "Overquota usage changed; inspect account billing."
)
client.predict(api_name="/end_session")
print("SAVED", ROOT / "warden-source.glb", flush=True)
