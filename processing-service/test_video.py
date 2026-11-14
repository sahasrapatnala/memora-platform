
from pathlib import Path
import json

from video_processing import process_video

video_files = list(Path("test-output").glob("*.mp4"))

if not video_files:
    raise FileNotFoundError("No MP4 video found in test-output")

video = video_files[0]
output = Path("test-output/results")

print("Using original video:", video.name)

print("Checking video:", video.resolve())

if not video.exists():
    print("Files currently inside test-output:")
    for item in Path("test-output").glob("*"):
        print(" -", item.name)

    raise FileNotFoundError(f"Video not found: {video.resolve()}")

print("Starting MEMORA video processing...")

result = process_video(video, output)

summary = {
    "language": result["transcript"]["language"],
    "segments": len(result["transcript_segments"]),
    "frames": len(result["frames"]),
    "duration": result["duration_seconds"],
}

print(json.dumps(summary, indent=2))

for segment in result["transcript_segments"][:10]:
    print(
        f"[{segment['start_seconds']}s - {segment['end_seconds']}s] "
        f"{segment['content']}"
    )

Path("test-output/results.json").write_text(
    json.dumps(result, indent=2),
    encoding="utf-8",
)

print("MEMORA VIDEO TEST COMPLETE")
