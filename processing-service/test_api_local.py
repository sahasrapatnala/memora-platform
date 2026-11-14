"""Opt-in real-video worker smoke test; no application/database success is implied."""
import hashlib
import json
import os
from pathlib import Path
from fastapi.testclient import TestClient
import main

BASE_DIR = Path(__file__).resolve().parent
VIDEO_PATH = BASE_DIR / "test-output" / "memora-api-test.mp4"
TEST_API_KEY = "memora-local-test-key"
os.environ["PROCESSING_API_KEY"] = TEST_API_KEY
os.environ["PROCESSING_CALLBACK_ORIGIN"] = "http://127.0.0.1:8080"
if not VIDEO_PATH.is_file():
    raise FileNotFoundError(f"Test video not found: {VIDEO_PATH}")
video_size = VIDEO_PATH.stat().st_size
video_hash = hashlib.sha256(VIDEO_PATH.read_bytes()).hexdigest()


def mock_download_original(source_url, destination, expected_bytes, expected_hash, allowed_origin):
    destination.write_bytes(VIDEO_PATH.read_bytes())
    actual_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
    if destination.stat().st_size != expected_bytes or actual_hash != expected_hash:
        raise ValueError("Test file verification failed")
    yield {"stage": "Original verified", "received_bytes": expected_bytes,
           "total_bytes": expected_bytes, "sha256": actual_hash}


main.validate_source = lambda url, origin: None
main.check_capacity = lambda directory, size: None
main.download_original = mock_download_original
main.send_progress = lambda *args: None
manifests = []
main.send_manifest = lambda request, manifest: manifests.append(manifest)


def mock_upload(request, path, kind):
    data = Path(path).read_bytes()
    suffix = "thumbnail" if kind == "thumbnail" else "frame"
    digest = hashlib.sha256(data).hexdigest()
    return {"path": f"{request.workspace_id}/{request.job_id}/{request.dispatch_token}/{suffix}-{digest}.jpg",
            "size_bytes": len(data), "sha256": digest}


main.upload_artifact = mock_upload
client = TestClient(main.app)
payload = {
    "file_id": "14a2565c-d041-4f3d-be7d-bb3615961b32",
    "workspace_id": "79f96c4e-a917-4747-b38a-54c66368a82d",
    "job_id": "24a2565c-d041-4f3d-be7d-bb3615961b32",
    "dispatch_token": "34a2565c-d041-4f3d-be7d-bb3615961b32",
    "worker_id": "local-smoke-test",
    "callback_url": "http://127.0.0.1:8080/api/public/processing",
    "name": "memora-api-test.mp4",
    "source_url": "https://local-test.invalid/test.mp4",
    "size_bytes": video_size,
    "sha256": video_hash,
}
print("Starting real local worker extraction smoke test…")
response = client.post("/process", json=payload, headers={"Authorization": f"Bearer {TEST_API_KEY}"})
if response.status_code != 202:
    raise RuntimeError(response.text)
if len(manifests) != 1:
    raise RuntimeError("No actual processing manifest returned")
manifest = manifests[0]
if not manifest["transcript_segments"] or not manifest["frames"]:
    raise RuntimeError("No transcript segments or keyframes returned")
for frame in manifest["frames"]:
    if "path" in frame or "thumbnail_local_path" in frame:
        raise RuntimeError("Local filesystem paths leaked into the manifest")
print(json.dumps({"language": manifest["language"], "segments": len(manifest["transcript_segments"]),
                  "frames": len(manifest["frames"]), "duration": manifest["duration_seconds"]}, indent=2))
print("LOCAL EXTRACTION PASSED; application persistence was not tested")
