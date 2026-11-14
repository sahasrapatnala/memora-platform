import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from callbacks import send_progress, upload_artifact, validate_callback_url


class CallbackRules(unittest.TestCase):
    def request(self):
        return SimpleNamespace(job_id="11111111-1111-4111-8111-111111111111",
            workspace_id="22222222-2222-4222-8222-222222222222",
            dispatch_token="33333333-3333-4333-8333-333333333333",
            worker_id="worker-test", callback_url="https://app.example.test/api/public/processing")

    def test_callback_origin_is_fixed(self):
        with patch.dict(os.environ, {"PROCESSING_CALLBACK_ORIGIN": "https://app.example.test"}):
            validate_callback_url(self.request().callback_url)
            with self.assertRaises(ValueError):
                validate_callback_url("https://foreign.test/api/public/processing")
            with self.assertRaises(ValueError):
                validate_callback_url("https://app.example.test/api/public/other")

    @patch("callbacks._post")
    def test_progress_is_bounded_and_contains_no_source_url(self, post):
        with patch.dict(os.environ, {"PROCESSING_API_KEY": "private-test-key"}):
            send_progress(self.request(), "Transcribing audio", 130)
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["progress"], 99)
        self.assertNotIn("source_url", payload)
        self.assertNotIn("private-test-key", str(payload))

    @patch("callbacks._post")
    def test_artifact_receipt_must_match_size_and_hash(self, post):
        request = self.request()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "frame.jpg"
            path.write_bytes(b"actual-jpeg-bytes")
            post.return_value.json.return_value = {"path": "registered", "size_bytes": len(b"actual-jpeg-bytes"), "sha256": "wrong"}
            with patch.dict(os.environ, {"PROCESSING_API_KEY": "private-test-key"}):
                with self.assertRaisesRegex(RuntimeError, "receipt"):
                    upload_artifact(request, path, "frame")


if __name__ == "__main__":
    unittest.main()
