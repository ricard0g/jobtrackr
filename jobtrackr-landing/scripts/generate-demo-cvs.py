"""Prepare public fictional assets through the app's real Gemini generation endpoint.

Run with cv-generation-service/.venv/bin/python; set CV_GENERATION_SERVICE_TOKEN
and optionally CV_GENERATION_SERVICE_BASE_URL (default http://localhost:8081).
Never run this as part of a landing build or browser request.
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
origin = os.environ.get("CV_GENERATION_SERVICE_BASE_URL", "http://localhost:8081")
token = os.environ["CV_GENERATION_SERVICE_TOKEN"]
jobs = json.loads((ROOT / "demo-inputs/jobs.json").read_text())
output = ROOT / "public/demo-cvs"
output.mkdir(parents=True, exist_ok=True)
manifest = []

with httpx.Client(timeout=330) as client:
    ready = client.get(f"{origin}/health/ready")
    ready.raise_for_status()
    if ready.json().get("provider") != "gemini":
        raise RuntimeError("Public samples require the real Gemini provider")
    for job in jobs:
        specification = {
            "output_format": "MARKDOWN",
            "job_description": job["job_description"],
            "additional_information": "language: en. This is fictional public-demo data. Preserve Alex Rivera's identity and use only evidence from the supplied fictional Base CV. Do not invent contact links or phone numbers.",
            "correlation_id": str(uuid4()),
        }
        response = client.post(
            f"{origin}/v1/generate",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("alex-rivera.md", (ROOT / "demo-inputs/alex-rivera.md").read_bytes(), "text/markdown")},
            data={"specification": json.dumps(specification)},
        )
        if response.is_error:
            raise RuntimeError(f"Generation failed for {job['filename']}: {response.text}")
        (output / job["filename"]).write_bytes(response.content)
        manifest.append({
            "filename": job["filename"],
            "byteSize": len(response.content),
            "sha256": hashlib.sha256(response.content).hexdigest(),
            "model": response.headers.get("X-Model-Id"),
            "workflow": response.headers.get("X-Workflow-Version"),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        })
        (ROOT / "demo-inputs/provenance.json").write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"Generated {job['filename']} ({len(response.content)} bytes)", flush=True)
