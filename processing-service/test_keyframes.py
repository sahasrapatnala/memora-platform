"""Real OpenCV extraction from a locally generated, explicitly synthetic video fixture."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from video_processing import extract_keyframes


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is required for a local video fixture")
class KeyframeExtraction(unittest.TestCase):
    def test_real_frames_and_thumbnails_have_valid_timestamps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "test-fixture.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                "testsrc2=size=320x180:rate=10", "-t", "2", "-c:v", "libx264",
                "-pix_fmt", "yuv420p", str(source)], check=True)
            result = extract_keyframes(source, root / "output")
            self.assertAlmostEqual(result["duration_seconds"], 2, places=1)
            self.assertGreater(len(result["frames"]), 0)
            self.assertLessEqual(len(result["frames"]), 60)
            for frame in result["frames"]:
                self.assertGreaterEqual(frame["timestamp_seconds"], 0)
                self.assertLessEqual(frame["timestamp_seconds"], 2)
                self.assertTrue(Path(frame["path"]).read_bytes().startswith(b"\xff\xd8"))
                self.assertTrue(Path(frame["thumbnail_local_path"]).read_bytes().startswith(b"\xff\xd8"))