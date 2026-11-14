import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from main import AttemptRequest, execute_attempt


class AttemptExecution(unittest.TestCase):
    def test_video_manifest_contains_uploaded_receipts_not_local_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            scratch = Path(directory)
            source = AttemptRequest(file_id="11111111-1111-4111-8111-111111111111",
                workspace_id="22222222-2222-4222-8222-222222222222",
                job_id="33333333-3333-4333-8333-333333333333",
                dispatch_token="44444444-4444-4444-8444-444444444444",
                worker_id="worker-test", callback_url="https://app.example.test/api/public/processing",
                name="actual.mp4", source_url="https://cloud.example.test/storage/v1/object/sign/original-files/a",
                size_bytes=3, sha256=hashlib.sha256(b"abc").hexdigest())
            frame = scratch / "frame.jpg"
            thumb = scratch / "thumb.jpg"
            frame.write_bytes(b"frame")
            thumb.write_bytes(b"thumb")
            manifest = {"kind": "video", "format": "MP4", "language": "en", "duration_seconds": 2,
                "speakers": [], "speaker_turns": [], "transcript_segments": [{"start_seconds": 0,
                "end_seconds": 1, "content": "Actual", "content_sha256": hashlib.sha256(b"Actual").hexdigest(),
                "speaker_key": None}], "frames": [{"timestamp_seconds": 1, "path": str(frame),
                "thumbnail_local_path": str(thumb)}], "pages": [], "slides": [], "metadata": {}}

            def download(*args):
                args[1].write_bytes(b"abc")
                yield {"stage": "Original verified", "received_bytes": 3}

            def upload(request, path, kind):
                data = Path(path).read_bytes()
                digest = hashlib.sha256(data).hexdigest()
                return {"path": f"{request.workspace_id}/{request.job_id}/{request.dispatch_token}/{kind}-{digest}.jpg",
                        "size_bytes": len(data), "sha256": digest}

            with patch("main.download_original", side_effect=download), patch("main.process_video", return_value=manifest), \
                    patch("main.upload_artifact", side_effect=upload), patch("main.send_progress"), \
                    patch("main.send_manifest") as complete, patch("main.send_failure") as failure, \
                    patch.dict(os.environ, {"PROCESSING_CLOUD_ORIGIN": "https://cloud.example.test"}):
                execute_attempt(source, ".mp4", scratch)
            failure.assert_not_called()
            sent = complete.call_args.args[1]
            self.assertNotIn("path", sent["frames"][0])
            self.assertNotIn("thumbnail_local_path", sent["frames"][0])
            self.assertEqual(sent["frames"][0]["size_bytes"], 5)
            self.assertEqual(sent["frames"][0]["thumbnail_size_bytes"], 5)
            self.assertIn("/frame-", sent["frames"][0]["storage_path"])
            self.assertIn("/thumbnail-", sent["frames"][0]["thumbnail_path"])


if __name__ == "__main__":
    unittest.main()
