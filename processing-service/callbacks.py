"""Authenticated, bounded delivery of processing events and small JPEG artifacts."""
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import requests

MAX_ARTIFACT_BYTES = 2 * 1024**2


def validate_callback_url(url):
    parsed = urlsplit(url)
    allowed = urlsplit(os.environ.get("PROCESSING_CALLBACK_ORIGIN", ""))
    local = parsed.hostname in {"127.0.0.1", "localhost"} and parsed.scheme == "http"
    if (not allowed.netloc or parsed.path != "/api/public/processing" or
            parsed.query or parsed.fragment or parsed.username or parsed.password or
            (parsed.scheme != "https" and not local) or
            (parsed.scheme, parsed.netloc) != (allowed.scheme, allowed.netloc)):
        raise ValueError("Callback must use the configured application origin")


def _headers():
    key = os.environ.get("PROCESSING_API_KEY", "")
    if not key:
        raise RuntimeError("Worker authentication is not configured")
    return {"Authorization": f"Bearer {key}"}


def _post(url, **kwargs):
    response = requests.post(url, timeout=(10, 45), allow_redirects=False, **kwargs)
    if response.status_code != 200:
        raise RuntimeError(f"Application callback rejected with HTTP {response.status_code}")
    return response


def identity(request):
    return {
        "job_id": str(request.job_id),
        "workspace_id": str(request.workspace_id),
        "dispatch_token": str(request.dispatch_token),
        "worker_id": request.worker_id,
    }


def send_progress(request, stage, progress):
    payload = {"action": "progress", **identity(request), "stage": stage,
               "progress": max(0, min(99, int(progress))), "lease_seconds": 300}
    _post(request.callback_url, json=payload, headers=_headers())


def upload_artifact(request, path, kind):
    path = Path(path)
    size = path.stat().st_size
    if not 0 < size <= MAX_ARTIFACT_BYTES:
        raise ValueError("Generated JPEG exceeds the 2 MiB artifact limit")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024**2):
            digest.update(chunk)
    sha256 = digest.hexdigest()
    query = urlencode({**identity(request), "kind": kind, "sha256": sha256})
    url = request.callback_url.removesuffix("/processing") + "/processing-artifact?" + query
    with path.open("rb") as artifact:
        response = _post(url, data=artifact, headers={**_headers(), "Content-Type": "image/jpeg"})
    result = response.json()
    if result.get("sha256") != sha256 or result.get("size_bytes") != size:
        raise RuntimeError("Artifact receipt does not match the uploaded bytes")
    return result


def send_failure(request, error_code="ProcessorFailed"):
    try:
        _post(request.callback_url, json={"action": "failure", **identity(request),
              "error_code": error_code}, headers=_headers())
    except Exception as error:
        print(f"Failure callback was not accepted for {request.job_id}: {error!r}", flush=True)


def send_manifest(request, manifest):
    payload = {"action": "complete", **identity(request), "version": 1, **manifest}
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if len(encoded) > 8 * 1024**2:
        raise ValueError("Manifest exceeds the 8 MiB ingestion limit; no partial result submitted")
    _post(request.callback_url, data=encoded, headers={**_headers(), "Content-Type": "application/json"})
