
import hashlib
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient
import main


# Local test configuration
BASE_DIR = Path(__file__).resolve().parent
VIDEO_PATH = BASE_DIR / "test-output" / "memora-api-test.mp4"

TEST_API_KEY = "memora-local-test-key"
os.environ["PROCESSING_API_KEY"] = TEST_API_KEY

if not VIDEO_PATH.is_file():
    raise FileNotFoundError(f"Test video not found: {VIDEO_PATH}")

video_size = VIDEO_PATH.stat().st_size
video_hash = hashlib.sha256(VIDEO_PATH.read_bytes()).hexdigest()


# Mock ONLY the cloud download.
# Authentication, validation, FastAPI and video processing remain real.
def mock_download_original(
    source_url,
    destination,
    expected_bytes,
    expected_hash,
    allowed_origin,
):
    destination.write_bytes(VIDEO_PATH.read_bytes())

    actual_hash = hashlib.sha256(destination.read_bytes()).hexdigest()

    if destination.stat().st_size != expected_bytes:
        raise ValueError("Test file size mismatch")

    if actual_hash != expected_hash:
        raise ValueError("Test file hash mismatch")

    yield {
        "stage": "Original verified",
        "received_bytes": expected_bytes,
        "total_bytes": expected_bytes,
        "sha256": actual_hash,
    }


main.validate_source = lambda url, origin: None
main.check_capacity = lambda directory, size: None
main.download_original = mock_download_original

client = TestClient(main.app)

payload = {
    "file_id": "14a2565c-d041-4f3d-be7d-bb3615961b32",
    "workspace_id": "79f96c4e-a917-4747-b38a-54c66368a82d",
    "name": "memora-api-test.mp4",
    "source_url": "https://local-test.invalid/test.mp4",
    "size_bytes": video_size,
    "sha256": video_hash,
}

print("Starting MEMORA API integration test...")
print(f"Test video: {VIDEO_PATH.name}")
print(f"Size: {video_size:,} bytes")

response = client.post(
    "/process",
    json=payload,
    headers={"Authorization": f"Bearer {TEST_API_KEY}"},
)

print("HTTP status:", response.status_code)

if response.status_code != 200:
    raise RuntimeError(response.text)

events = []

for line in response.text.splitlines():
    if line.strip():
        event = json.loads(line)
        events.append(event)
        print(json.dumps(event, indent=2))

final_event = next(
    (
        event for event in reversed(events)
        if event.get("status") in {"ProcessedLocally", "Failed"}
    ),
    None,
)

if not final_event:
    raise RuntimeError("No final processing event received")

if final_event["status"] != "ProcessedLocally":
    raise RuntimeError("Video processing failed")

if final_event.get("transcript_segments", 0) < 1:
    raise RuntimeError("No transcript segments returned")

if final_event.get("keyframe_count", 0) < 1:
    raise RuntimeError("No keyframes returned")

print("\nMEMORA LOCAL API TEST PASSED")
print("Transcript segments:", final_event["transcript_segments"])
print("Keyframes:", final_event["keyframe_count"])
print("Duration:", final_event["duration_seconds"])
