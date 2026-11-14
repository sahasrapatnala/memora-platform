import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import fitz

from demo_extract import extract_local, file_hash


class LocalDemoEvidence(unittest.TestCase):
    def test_actual_pdf_extraction_and_exact_original_duplicate_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / "source.pdf"
            with fitz.open() as pdf:
                pdf.new_page().insert_text((72, 72), "Human approval is required. Do not delete originals.")
                pdf.save(original)
            duplicate = root / "duplicate.pdf"
            duplicate.write_bytes(original.read_bytes())
            evidence = extract_local(original, root / "evidence")
            self.assertEqual(file_hash(duplicate), evidence['original_sha256'])
            self.assertEqual(evidence['manifest']['pages'][0]['page_number'], 1)
            self.assertIn("Human approval", evidence['manifest']['pages'][0]['content'])
            self.assertIn("NOT tested", evidence['classification'])

    def test_existing_directory_or_original_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.pdf"
            path.write_bytes(b"original")
            with self.assertRaisesRegex(ValueError, "already exists"):
                extract_local(path, path)
            self.assertEqual(path.read_bytes(), b"original")

    def test_silent_video_cannot_pass_speech_demo_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.mp4"
            path.write_bytes(b"fixture")
            with patch('demo_extract.process_video', return_value={'transcript_segments': []}):
                with self.assertRaisesRegex(ValueError, "No speech detected"):
                    extract_local(path, Path(directory) / "evidence")


if __name__ == '__main__':
    unittest.main()